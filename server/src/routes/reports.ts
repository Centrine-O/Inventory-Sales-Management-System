import { Router, type Request } from "express";
import { z } from "zod";
import { fromCents, type DB } from "../db.js";
import { addDays, daysBetween, spanDays, ymd } from "../dates.js";
import { HttpError } from "../http.js";
import { toCsv } from "../mappers.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const rangeSchema = z.object({ from: dateStr.optional(), to: dateStr.optional() });

const LOCAL_DATE = "date(s.created_at, 'localtime')";
const VALID = `s.status != 'cancelled' AND ${LOCAL_DATE} BETWEEN ? AND ?`;

function parseRange(req: Request) {
  const q = rangeSchema.parse(req.query);
  const to = q.to ?? ymd(new Date());
  const from = q.from ?? addDays(to, -29);
  if (from > to) throw new HttpError(400, "'from' must be on or before 'to'");
  if (spanDays(from, to) > 731) throw new HttpError(400, "Range cannot exceed two years");
  return { from, to };
}

export function buildReport(db: DB, from: string, to: string) {
  const totals = (f: string, t: string) =>
    db
      .prepare(
        `SELECT COUNT(*) AS orders,
           COALESCE(SUM(total_cents), 0) AS revenue,
           COALESCE(SUM((SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE sale_id = s.id)), 0) AS collected,
           COALESCE(SUM(CASE WHEN status = 'pending'
             THEN total_cents - (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE sale_id = s.id) ELSE 0 END), 0) AS outstanding,
           COALESCE(SUM(tax_cents), 0) AS tax,
           COALESCE(SUM(discount_cents), 0) AS discounts
         FROM sales s WHERE ${VALID}`,
      )
      .get(f, t) as {
      orders: number;
      revenue: number;
      collected: number;
      outstanding: number;
      tax: number;
      discounts: number;
    };

  const cur = totals(from, to);
  const span = spanDays(from, to);
  const prev = totals(addDays(from, -span), addDays(from, -1));

  // Gross profit = net revenue (after discounts) minus cost snapshots taken at sale time.
  const cogs = (
    db
      .prepare(
        `SELECT COALESCE(SUM(i.unit_cost_cents * i.quantity), 0) AS cents
         FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${VALID}`,
      )
      .get(from, to) as { cents: number }
  ).cents;

  const daily = db
    .prepare(
      `SELECT ${LOCAL_DATE} AS day, SUM(total_cents) AS cents, COUNT(*) AS orders
       FROM sales s WHERE ${VALID} GROUP BY day`,
    )
    .all(from, to) as { day: string; cents: number; orders: number }[];
  const byDay = new Map(daily.map((d) => [d.day, d]));

  // Line totals are pre-discount; allocate each sale's discount across its lines pro rata.
  const LINE_NET = "i.line_total_cents * (1.0 - CAST(s.discount_cents AS REAL) / NULLIF(s.subtotal_cents, 0))";

  const byCategory = db
    .prepare(
      `SELECT i.category AS name, SUM(i.quantity) AS units, ROUND(SUM(${LINE_NET})) AS cents
       FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${VALID}
       GROUP BY i.category ORDER BY cents DESC`,
    )
    .all(from, to) as { name: string; units: number; cents: number }[];

  const topProducts = db
    .prepare(
      `SELECT i.product_id AS id, i.product_name AS name, i.sku, SUM(i.quantity) AS units, ROUND(SUM(${LINE_NET})) AS cents
       FROM sale_items i JOIN sales s ON s.id = i.sale_id WHERE ${VALID}
       GROUP BY i.product_id ORDER BY cents DESC LIMIT 10`,
    )
    .all(from, to) as { id: number; name: string; sku: string; units: number; cents: number }[];

  const byPayment = db
    .prepare(
      `SELECT payment_method AS method, COUNT(*) AS orders, SUM(total_cents) AS cents
       FROM sales s WHERE ${VALID} GROUP BY payment_method ORDER BY cents DESC`,
    )
    .all(from, to) as { method: string; orders: number; cents: number }[];

  const topCustomers = db
    .prepare(
      `SELECT c.id, c.name, COUNT(s.id) AS orders, SUM(s.total_cents) AS cents
       FROM sales s JOIN customers c ON c.id = s.customer_id WHERE ${VALID}
       GROUP BY c.id ORDER BY cents DESC LIMIT 5`,
    )
    .all(from, to) as { id: number; name: string; orders: number; cents: number }[];

  const inventory = db
    .prepare(
      `SELECT COALESCE(SUM(stock * cost_cents), 0) AS cost, COALESCE(SUM(stock * price_cents), 0) AS retail,
         COALESCE(SUM(stock), 0) AS units
       FROM products WHERE archived = 0`,
    )
    .get() as { cost: number; retail: number; units: number };

  const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

  return {
    from,
    to,
    summary: {
      revenue: fromCents(cur.revenue),
      revenueChangePct: pct(cur.revenue, prev.revenue),
      orders: cur.orders,
      ordersChangePct: pct(cur.orders, prev.orders),
      averageOrder: cur.orders ? fromCents(Math.round(cur.revenue / cur.orders)) : 0,
      collected: fromCents(cur.collected),
      outstanding: fromCents(cur.outstanding),
      tax: fromCents(cur.tax),
      discounts: fromCents(cur.discounts),
      grossProfit: fromCents(cur.revenue - cogs),
      grossMarginPct: cur.revenue > 0 ? ((cur.revenue - cogs) / cur.revenue) * 100 : null,
    },
    daily: daysBetween(from, to).map((day) => ({
      date: day,
      revenue: fromCents(byDay.get(day)?.cents ?? 0),
      orders: byDay.get(day)?.orders ?? 0,
    })),
    byCategory: byCategory.map((c) => ({ name: c.name, units: c.units, revenue: fromCents(c.cents) })),
    topProducts: topProducts.map((p) => ({ id: p.id, name: p.name, sku: p.sku, units: p.units, revenue: fromCents(p.cents) })),
    byPaymentMethod: byPayment.map((p) => ({ method: p.method, orders: p.orders, revenue: fromCents(p.cents) })),
    topCustomers: topCustomers.map((c) => ({ id: c.id, name: c.name, orders: c.orders, revenue: fromCents(c.cents) })),
    inventory: {
      units: inventory.units,
      costValue: fromCents(inventory.cost),
      retailValue: fromCents(inventory.retail),
    },
  };
}

/**
 * Who owes what, aged by the date of each unpaid sale. Not date-filtered: a balance is owed until it's paid.
 */
export function buildReceivables(db: DB) {
  const rows = db
    .prepare(
      `SELECT s.id, s.invoice_no, s.customer_id, COALESCE(c.name, 'Walk-in customer') AS customer_name, c.phone,
         s.total_cents - (SELECT COALESCE(SUM(amount_cents), 0) FROM payments WHERE sale_id = s.id) AS balance,
         CAST(julianday('now', 'localtime') - julianday(s.created_at, 'localtime') AS INTEGER) AS age_days,
         s.created_at
       FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.status = 'pending'`,
    )
    .all() as {
    id: number;
    invoice_no: string;
    customer_id: number | null;
    customer_name: string;
    phone: string | null;
    balance: number;
    age_days: number;
    created_at: string;
  }[];

  const bucketOf = (age: number) => (age <= 30 ? "current" : age <= 60 ? "days31to60" : age <= 90 ? "days61to90" : "over90");
  const empty = () => ({ current: 0, days31to60: 0, days61to90: 0, over90: 0 });
  const totals = empty();
  const byCustomer = new Map<
    string,
    { customerId: number | null; name: string; phone: string; invoices: number; oldestDays: number; buckets: ReturnType<typeof empty> }
  >();

  for (const r of rows) {
    if (r.balance <= 0) continue;
    const b = bucketOf(r.age_days);
    totals[b] += r.balance;
    const key = String(r.customer_id ?? "walk-in");
    if (!byCustomer.has(key)) {
      byCustomer.set(key, { customerId: r.customer_id, name: r.customer_name, phone: r.phone ?? "", invoices: 0, oldestDays: 0, buckets: empty() });
    }
    const c = byCustomer.get(key)!;
    c.invoices += 1;
    c.oldestDays = Math.max(c.oldestDays, r.age_days);
    c.buckets[b] += r.balance;
  }

  const money = (b: ReturnType<typeof empty>) => ({
    current: fromCents(b.current),
    days31to60: fromCents(b.days31to60),
    days61to90: fromCents(b.days61to90),
    over90: fromCents(b.over90),
    total: fromCents(b.current + b.days31to60 + b.days61to90 + b.over90),
  });

  return {
    totals: money(totals),
    customers: [...byCustomer.values()]
      .map((c) => ({ customerId: c.customerId, name: c.name, phone: c.phone, invoices: c.invoices, oldestDays: c.oldestDays, ...money(c.buckets) }))
      .sort((a, b) => b.total - a.total),
  };
}

export function reportsRouter(db: DB) {
  const r = Router();

  r.get("/receivables", (_req, res) => {
    res.json(buildReceivables(db));
  });

  r.get("/", (req, res) => {
    const { from, to } = parseRange(req);
    res.json(buildReport(db, from, to));
  });

  r.get("/export.csv", (req, res) => {
    const { from, to } = parseRange(req);
    const rep = buildReport(db, from, to);
    const s = rep.summary;
    const lines: unknown[][] = [
      ["Report period", `${from} to ${to}`],
      ["Revenue", s.revenue.toFixed(2)],
      ["Orders", s.orders],
      ["Average order", s.averageOrder.toFixed(2)],
      ["Collected", s.collected.toFixed(2)],
      ["Outstanding", s.outstanding.toFixed(2)],
      ["VAT included", s.tax.toFixed(2)],
      ["Discounts", s.discounts.toFixed(2)],
      ["Gross profit", s.grossProfit.toFixed(2)],
      [],
      ["Date", "Orders", "Revenue"],
      ...rep.daily.map((d) => [d.date, d.orders, d.revenue.toFixed(2)]),
      [],
      ["Category", "Units", "Revenue"],
      ...rep.byCategory.map((c) => [c.name, c.units, c.revenue.toFixed(2)]),
      [],
      ["Top product", "SKU", "Units", "Revenue"],
      ...rep.topProducts.map((p) => [p.name, p.sku, p.units, p.revenue.toFixed(2)]),
    ];
    const [header, ...rest] = lines as unknown[][];
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="report-${from}-to-${to}.csv"`);
    res.send(toCsv(header as string[], rest));
  });

  return r;
}
