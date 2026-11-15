import { Router } from "express";
import { z } from "zod";
import { fromCents, toCents, type DB } from "../db.js";
import { HttpError, currentUser, idParam, requireRole } from "../http.js";
import { SALE_SELECT, iso, mapSale, type SaleRow } from "../mappers.js";

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: "active" | "inactive";
  credit_limit_cents: number;
  balance_cents: number;
  oldest_unpaid_at: string | null;
  created_at: string;
  total_orders: number;
  total_spent_cents: number;
  last_purchase_at: string | null;
}

const mapCustomer = (c: CustomerRow) => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone,
  status: c.status,
  totalOrders: c.total_orders,
  totalSpent: fromCents(c.total_spent_cents),
  lastPurchaseAt: c.last_purchase_at ? iso(c.last_purchase_at) : null,
  creditLimit: fromCents(c.credit_limit_cents),
  balance: fromCents(c.balance_cents),
  oldestUnpaidAt: c.oldest_unpaid_at ? iso(c.oldest_unpaid_at) : null,
  createdAt: iso(c.created_at),
});

const SELECT = `
  SELECT c.*,
    COUNT(s.id) AS total_orders,
    COALESCE(SUM(b.net_total_cents), 0) AS total_spent_cents,
    MAX(s.created_at) AS last_purchase_at,
    COALESCE(SUM(CASE WHEN s.status = 'pending' THEN b.balance_cents END), 0) AS balance_cents,
    MIN(CASE WHEN s.status = 'pending' THEN s.created_at END) AS oldest_unpaid_at
  FROM customers c
  LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'cancelled'
  LEFT JOIN sale_balances b ON b.sale_id = s.id
`;

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  phone: z.string().trim().max(40).default(""),
  status: z.enum(["active", "inactive"]).default("active"),
  /** 0 means no limit. */
  creditLimit: z.coerce.number().min(0).max(100_000_000).default(0),
});

// Defaults stripped so omitted fields stay untouched on update (zod 4 applies defaults inside .partial()).
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.union([z.string().trim().email(), z.literal("")]),
    phone: z.string().trim().max(40),
    status: z.enum(["active", "inactive"]),
    creditLimit: z.coerce.number().min(0).max(100_000_000),
  })
  .partial();

const listSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
  withBalance: z.enum(["true", "false"]).optional(),
});

export function customersRouter(db: DB) {
  const r = Router();

  const getCustomer = (id: number) => {
    const row = db.prepare(`${SELECT} WHERE c.id = ? GROUP BY c.id`).get(id) as CustomerRow | undefined;
    if (!row) throw new HttpError(404, "Customer not found");
    return row;
  };

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.search) {
      where.push("(c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)");
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    if (q.status) {
      where.push("c.status = ?");
      params.push(q.status);
    }
    const having = q.withBalance === "true" ? "HAVING balance_cents > 0" : "";
    const sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} GROUP BY c.id ${having} ORDER BY c.name`;
    res.json((db.prepare(sql).all(...params) as CustomerRow[]).map(mapCustomer));
  });

  r.get("/:id", (req, res) => {
    const customer = getCustomer(idParam(req));
    const sales = db
      .prepare(`${SALE_SELECT} WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 50`)
      .all(customer.id) as SaleRow[];
    const payments = db
      .prepare(
        `SELECT p.id, p.amount_cents, p.method, p.reference, p.created_at, s.id AS sale_id, s.invoice_no
         FROM payments p JOIN sales s ON s.id = p.sale_id
         WHERE s.customer_id = ? ORDER BY p.id DESC LIMIT 100`,
      )
      .all(customer.id) as {
      id: number;
      amount_cents: number;
      method: string;
      reference: string;
      created_at: string;
      sale_id: number;
      invoice_no: string;
    }[];
    res.json({
      ...mapCustomer(customer),
      sales: sales.map(mapSale),
      payments: payments.map((p) => ({
        id: p.id,
        saleId: p.sale_id,
        invoiceNo: p.invoice_no,
        amount: fromCents(p.amount_cents),
        method: p.method,
        reference: p.reference,
        createdAt: iso(p.created_at),
      })),
    });
  });

  r.post("/", (req, res) => {
    const b = bodySchema.parse(req.body);
    if (b.creditLimit > 0 && currentUser(req).role !== "admin") {
      throw new HttpError(403, "Only admins can set credit limits");
    }
    const info = db
      .prepare("INSERT INTO customers (name, email, phone, status, credit_limit_cents) VALUES (?, ?, ?, ?, ?)")
      .run(b.name, b.email, b.phone, b.status, toCents(b.creditLimit));
    res.status(201).json(mapCustomer(getCustomer(Number(info.lastInsertRowid))));
  });

  r.patch("/:id", (req, res) => {
    const id = idParam(req);
    const b = updateSchema.parse(req.body);
    const c = getCustomer(id);
    if (b.creditLimit !== undefined && toCents(b.creditLimit) !== c.credit_limit_cents && currentUser(req).role !== "admin") {
      throw new HttpError(403, "Only admins can change credit limits");
    }
    db.prepare("UPDATE customers SET name = ?, email = ?, phone = ?, status = ?, credit_limit_cents = ? WHERE id = ?").run(
      b.name ?? c.name,
      b.email ?? c.email,
      b.phone ?? c.phone,
      b.status ?? c.status,
      b.creditLimit === undefined ? c.credit_limit_cents : toCents(b.creditLimit),
      id,
    );
    res.json(mapCustomer(getCustomer(id)));
  });

  r.delete("/:id", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    getCustomer(id);
    const hasSales = db.prepare("SELECT 1 FROM sales WHERE customer_id = ? LIMIT 1").get(id);
    if (hasSales) {
      throw new HttpError(409, "This customer has sales history. Mark them inactive instead of deleting.");
    }
    db.prepare("DELETE FROM customers WHERE id = ?").run(id);
    res.status(204).end();
  });

  return r;
}
