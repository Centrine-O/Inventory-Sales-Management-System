import { Router } from "express";
import { z } from "zod";
import { fromCents, toCents, type DB } from "../db.js";
import { HttpError, currentUser, idParam } from "../http.js";
import { iso, toCsv } from "../mappers.js";
import { audit, describeChanges, diff } from "../audit.js";

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salaries & wages",
  "Utilities",
  "Transport & delivery",
  "Marketing",
  "Repairs & maintenance",
  "Licences & fees",
  "Bank & M-Pesa charges",
  "Office & cleaning supplies",
  "Other",
];

const PAYMENT_METHODS = ["Cash", "Card", "M-Pesa", "Bank Transfer"] as const;
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
  .refine((d) => {
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, day));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
  }, "is not a real date");

const fields = {
  date: dateStr,
  category: z.string().trim().min(1, "Choose a category").max(60),
  payee: z.string().trim().max(120),
  description: z.string().trim().max(500),
  amount: z.coerce.number().positive("must be greater than zero").max(100_000_000),
  paymentMethod: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(100),
};
const createSchema = z.object({
  ...fields,
  payee: fields.payee.default(""),
  description: fields.description.default(""),
  reference: fields.reference.default(""),
});
// No defaults on update, so omitted fields stay as they are.
const updateSchema = z.object(fields).partial();

const listSchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  category: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

interface ExpenseRow {
  id: number;
  expense_date: string;
  category: string;
  payee: string;
  description: string;
  amount_cents: number;
  payment_method: string;
  reference: string;
  user_name: string | null;
  created_at: string;
}

const mapExpense = (e: ExpenseRow) => ({
  id: e.id,
  date: e.expense_date,
  category: e.category,
  payee: e.payee,
  description: e.description,
  amount: fromCents(e.amount_cents),
  paymentMethod: e.payment_method,
  reference: e.reference,
  recordedBy: e.user_name ?? "",
  createdAt: iso(e.created_at),
});

const SELECT = "SELECT e.*, u.name AS user_name FROM expenses e LEFT JOIN users u ON u.id = e.user_id";

function filter(q: z.infer<typeof listSchema>) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.from) {
    where.push("e.expense_date >= ?");
    params.push(q.from);
  }
  if (q.to) {
    where.push("e.expense_date <= ?");
    params.push(q.to);
  }
  if (q.category) {
    where.push("e.category = ?");
    params.push(q.category);
  }
  if (q.search) {
    where.push("(e.payee LIKE ? OR e.description LIKE ? OR e.reference LIKE ?)");
    params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`);
  }
  return { where: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

/** Expenses in a date range, total and by category, for the P&L. */
export function expensesInRange(db: DB, from: string, to: string) {
  const rows = db
    .prepare(
      `SELECT category, SUM(amount_cents) AS cents, COUNT(*) AS n FROM expenses
       WHERE expense_date BETWEEN ? AND ? GROUP BY category ORDER BY cents DESC`,
    )
    .all(from, to) as { category: string; cents: number; n: number }[];
  return { total: rows.reduce((s, r) => s + r.cents, 0), byCategory: rows };
}

export function expensesRouter(db: DB) {
  const r = Router();

  const getExpense = (id: number) => {
    const row = db.prepare(`${SELECT} WHERE e.id = ?`).get(id) as ExpenseRow | undefined;
    if (!row) throw new HttpError(404, "Expense not found");
    return row;
  };

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const { where, params } = filter(q);
    const rows = db.prepare(`${SELECT} ${where} ORDER BY e.expense_date DESC, e.id DESC LIMIT 2000`).all(...params) as ExpenseRow[];
    res.json(rows.map(mapExpense));
  });

  r.get("/categories", (_req, res) => {
    const used = (db.prepare("SELECT DISTINCT category FROM expenses ORDER BY category").all() as { category: string }[]).map(
      (c) => c.category,
    );
    res.json([...new Set([...DEFAULT_EXPENSE_CATEGORIES, ...used])]);
  });

  r.get("/export.csv", (req, res) => {
    const q = listSchema.parse(req.query);
    const { where, params } = filter(q);
    const rows = db.prepare(`${SELECT} ${where} ORDER BY e.expense_date, e.id`).all(...params) as ExpenseRow[];
    const csv = toCsv(
      ["Date", "Category", "Payee", "Description", "Amount", "Paid by", "Reference", "Recorded by"],
      rows.map((e) => [e.expense_date, e.category, e.payee, e.description, fromCents(e.amount_cents).toFixed(2), e.payment_method, e.reference, e.user_name ?? ""]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="expenses.csv"');
    res.send(csv);
  });

  r.post("/", (req, res) => {
    const b = createSchema.parse(req.body);
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO expenses (expense_date, category, payee, description, amount_cents, payment_method, reference, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(b.date, b.category, b.payee, b.description, toCents(b.amount), b.paymentMethod, b.reference, currentUser(req).id);
      const newId = Number(info.lastInsertRowid);
      audit(db, req, {
        action: "created",
        entity: "expense",
        entityId: newId,
        summary: `Recorded ${b.category} expense of KSh ${b.amount.toLocaleString("en-KE")}${b.payee ? ` to ${b.payee}` : ""} (${b.date})`,
      });
      return newId;
    })();
    res.status(201).json(mapExpense(getExpense(id)));
  });

  r.patch("/:id", (req, res) => {
    const id = idParam(req);
    const b = updateSchema.parse(req.body);
    const e = getExpense(id);
    const changes = diff(mapExpense(e), b);
    const update = db.prepare(
      `UPDATE expenses SET expense_date = ?, category = ?, payee = ?, description = ?, amount_cents = ?, payment_method = ?, reference = ?
       WHERE id = ?`,
    );
    db.transaction(() => {
      update.run(
      b.date ?? e.expense_date,
      b.category ?? e.category,
      b.payee ?? e.payee,
      b.description ?? e.description,
      b.amount !== undefined ? toCents(b.amount) : e.amount_cents,
      b.paymentMethod ?? e.payment_method,
      b.reference ?? e.reference,
      id,
      );
      if (Object.keys(changes).length) {
        audit(db, req, {
          action: "updated",
          entity: "expense",
          entityId: id,
          summary: `${e.category} expense of ${e.expense_date}: ${describeChanges(changes)}`,
          details: { changes },
        });
      }
    })();
    res.json(mapExpense(getExpense(id)));
  });

  r.delete("/:id", (req, res) => {
    const id = idParam(req);
    const e = getExpense(id);
    db.transaction(() => {
      db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
      audit(db, req, {
        action: "deleted",
        entity: "expense",
        entityId: id,
        summary: `Deleted ${e.category} expense of KSh ${fromCents(e.amount_cents).toLocaleString("en-KE")}${e.payee ? ` to ${e.payee}` : ""} (${e.expense_date})`,
        details: { expense: mapExpense(e) },
      });
    })();
    res.status(204).end();
  });

  return r;
}
