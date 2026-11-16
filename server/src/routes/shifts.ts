import { Router } from "express";
import { z } from "zod";
import { fromCents, toCents, type DB } from "../db.js";
import { HttpError, currentUser, idParam, type AuthUser } from "../http.js";
import { iso } from "../mappers.js";

interface ShiftRow {
  id: number;
  user_id: number;
  user_name: string;
  opening_float_cents: number;
  opened_at: string;
  closed_at: string | null;
  closed_by_name: string | null;
  expected_cash_cents: number | null;
  counted_cash_cents: number | null;
  notes: string;
}

const SELECT = `
  SELECT s.*, u.name AS user_name, cb.name AS closed_by_name
  FROM shifts s JOIN users u ON u.id = s.user_id LEFT JOIN users cb ON cb.id = s.closed_by
`;

const money = z.coerce.number().min(0).max(100_000_000);
const openSchema = z.object({ openingFloat: money });
const cashSchema = z.object({
  type: z.enum(["in", "out"]),
  amount: z.coerce.number().positive("must be greater than zero").max(100_000_000),
  reason: z.string().trim().min(1, "Give a reason").max(200),
});
const closeSchema = z.object({ countedCash: money, notes: z.string().trim().max(500).default("") });
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const listSchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  userId: z.coerce.number().int().positive().optional(),
});

/** Throws unless the user has an open till — used to enforce "require an open till to record sales". */
export function openShiftFor(db: DB, userId: number) {
  return db.prepare("SELECT id FROM shifts WHERE user_id = ? AND closed_at IS NULL").get(userId) as { id: number } | undefined;
}

/**
 * Everything that happened in a till during a shift, and the cash that should be in it.
 * Sales, payments and refunds are linked to the till that was open when they happened (see the triggers in db.ts),
 * so activity is attributed to whoever handled the money.
 * Expected cash = float + cash taken (sales & credit payments) − cash refunds + pay-ins − pay-outs.
 */
export function shiftSummary(db: DB, shift: ShiftRow) {
  const byMethod = db
    .prepare(
      `SELECT method, COUNT(*) AS n, SUM(amount_cents) AS cents FROM payments
       WHERE shift_id = ? GROUP BY method ORDER BY cents DESC`,
    )
    .all(shift.id) as { method: string; n: number; cents: number }[];

  const refunds = db
    .prepare(
      `SELECT refund_method AS method, COUNT(*) AS n, SUM(refund_cents) AS cents FROM returns
       WHERE shift_id = ? AND refund_cents > 0 GROUP BY refund_method`,
    )
    .all(shift.id) as { method: string; n: number; cents: number }[];

  const sales = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS on_credit
       FROM sales WHERE shift_id = ? AND status != 'cancelled'`,
    )
    .get(shift.id) as { n: number; cents: number; on_credit: number };

  const movements = db
    .prepare(
      `SELECT m.id, m.type, m.amount_cents, m.reason, m.created_at, u.name AS user_name
       FROM cash_movements m LEFT JOIN users u ON u.id = m.user_id WHERE m.shift_id = ? ORDER BY m.id`,
    )
    .all(shift.id) as { id: number; type: "in" | "out"; amount_cents: number; reason: string; created_at: string; user_name: string | null }[];

  const cashTaken = byMethod.find((m) => m.method === "Cash")?.cents ?? 0;
  const cashRefunded = refunds.find((r) => r.method === "Cash")?.cents ?? 0;
  const payIns = movements.filter((m) => m.type === "in").reduce((s, m) => s + m.amount_cents, 0);
  const payOuts = movements.filter((m) => m.type === "out").reduce((s, m) => s + m.amount_cents, 0);
  const expected = shift.opening_float_cents + cashTaken - cashRefunded + payIns - payOuts;
  const closed = shift.closed_at !== null;

  return {
    id: shift.id,
    userId: shift.user_id,
    userName: shift.user_name,
    status: closed ? ("closed" as const) : ("open" as const),
    openedAt: iso(shift.opened_at),
    closedAt: shift.closed_at ? iso(shift.closed_at) : null,
    closedBy: shift.closed_by_name ?? null,
    notes: shift.notes,
    openingFloat: fromCents(shift.opening_float_cents),
    sales: { count: sales.n, total: fromCents(sales.cents), onCredit: sales.on_credit },
    takings: byMethod.map((m) => ({ method: m.method, count: m.n, amount: fromCents(m.cents) })),
    totalTaken: fromCents(byMethod.reduce((s, m) => s + m.cents, 0)),
    refunds: refunds.map((r) => ({ method: r.method, count: r.n, amount: fromCents(r.cents) })),
    cashTaken: fromCents(cashTaken),
    cashRefunded: fromCents(cashRefunded),
    payIns: fromCents(payIns),
    payOuts: fromCents(payOuts),
    movements: movements.map((m) => ({
      id: m.id,
      type: m.type,
      amount: fromCents(m.amount_cents),
      reason: m.reason,
      userName: m.user_name ?? "",
      createdAt: iso(m.created_at),
    })),
    // Once closed, report the figures frozen at close time.
    expectedCash: fromCents(closed ? (shift.expected_cash_cents ?? expected) : expected),
    countedCash: shift.counted_cash_cents === null ? null : fromCents(shift.counted_cash_cents),
    variance:
      shift.counted_cash_cents === null ? null : fromCents(shift.counted_cash_cents - (shift.expected_cash_cents ?? expected)),
  };
}

export function shiftsRouter(db: DB) {
  const r = Router();

  const getShift = (id: number) => {
    const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as ShiftRow | undefined;
    if (!row) throw new HttpError(404, "Shift not found");
    return row;
  };
  const assertCanManage = (shift: ShiftRow, me: AuthUser) => {
    if (shift.user_id !== me.id && me.role !== "admin") throw new HttpError(403, "That isn't your till");
  };

  /** The signed-in user's open till, if any. */
  r.get("/current", (req, res) => {
    const me = currentUser(req);
    const row = db.prepare(`${SELECT} WHERE s.user_id = ? AND s.closed_at IS NULL`).get(me.id) as ShiftRow | undefined;
    res.json({ shift: row ? shiftSummary(db, row) : null });
  });

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const me = currentUser(req);
    const where: string[] = [];
    const params: unknown[] = [];
    // Cashiers only see their own shifts.
    const userId = me.role === "admin" ? q.userId : me.id;
    if (userId) {
      where.push("s.user_id = ?");
      params.push(userId);
    }
    if (q.from) {
      where.push("date(s.opened_at, 'localtime') >= ?");
      params.push(q.from);
    }
    if (q.to) {
      where.push("date(s.opened_at, 'localtime') <= ?");
      params.push(q.to);
    }
    const rows = db
      .prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.id DESC LIMIT 200`)
      .all(...params) as ShiftRow[];
    res.json(rows.map((row) => shiftSummary(db, row)));
  });

  r.get("/:id", (req, res) => {
    const shift = getShift(idParam(req));
    assertCanManage(shift, currentUser(req));
    res.json(shiftSummary(db, shift));
  });

  r.post("/open", (req, res) => {
    const { openingFloat } = openSchema.parse(req.body);
    const me = currentUser(req);
    if (openShiftFor(db, me.id)) throw new HttpError(409, "Your till is already open");
    const info = db.prepare("INSERT INTO shifts (user_id, opening_float_cents) VALUES (?, ?)").run(me.id, toCents(openingFloat));
    res.status(201).json(shiftSummary(db, getShift(Number(info.lastInsertRowid))));
  });

  r.post("/:id/cash", (req, res) => {
    const id = idParam(req);
    const body = cashSchema.parse(req.body);
    const me = currentUser(req);
    const shift = getShift(id);
    assertCanManage(shift, me);
    if (shift.closed_at) throw new HttpError(400, "This till is closed");
    if (body.type === "out") {
      const available = toCents(shiftSummary(db, shift).expectedCash);
      if (toCents(body.amount) > available) {
        throw new HttpError(400, `Only KSh ${fromCents(available).toLocaleString()} should be in the till`);
      }
    }
    db.prepare("INSERT INTO cash_movements (shift_id, type, amount_cents, reason, user_id) VALUES (?, ?, ?, ?, ?)").run(
      id,
      body.type,
      toCents(body.amount),
      body.reason,
      me.id,
    );
    res.status(201).json(shiftSummary(db, getShift(id)));
  });

  r.post("/:id/close", (req, res) => {
    const id = idParam(req);
    const body = closeSchema.parse(req.body);
    const me = currentUser(req);
    db.transaction(() => {
      const shift = getShift(id);
      assertCanManage(shift, me);
      if (shift.closed_at) throw new HttpError(400, "This till is already closed");
      // Close first: anything recorded after this belongs to the person's next till, not this one.
      db.prepare("UPDATE shifts SET closed_at = datetime('now') WHERE id = ?").run(id);
      const expected = toCents(shiftSummary(db, getShift(id)).expectedCash);
      db.prepare("UPDATE shifts SET closed_by = ?, expected_cash_cents = ?, counted_cash_cents = ?, notes = ? WHERE id = ?").run(
        me.id,
        expected,
        toCents(body.countedCash),
        body.notes,
        id,
      );
    })();
    res.json(shiftSummary(db, getShift(id)));
  });

  return r;
}
