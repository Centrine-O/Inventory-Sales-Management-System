import { Router } from "express";
import { z } from "zod";
import { fromCents, type DB } from "../db.js";
import { HttpError, idParam, requireRole } from "../http.js";
import { SALE_SELECT, iso, mapSale, type SaleRow } from "../mappers.js";

interface CustomerRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: "active" | "inactive";
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
  createdAt: iso(c.created_at),
});

const SELECT = `
  SELECT c.*,
    COUNT(s.id) AS total_orders,
    COALESCE(SUM(s.total_cents), 0) AS total_spent_cents,
    MAX(s.created_at) AS last_purchase_at
  FROM customers c
  LEFT JOIN sales s ON s.customer_id = c.id AND s.status != 'cancelled'
`;

const bodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.union([z.string().trim().email(), z.literal("")]).default(""),
  phone: z.string().trim().max(40).default(""),
  status: z.enum(["active", "inactive"]).default("active"),
});

const listSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["active", "inactive"]).optional(),
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
    const sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} GROUP BY c.id ORDER BY c.name`;
    res.json((db.prepare(sql).all(...params) as CustomerRow[]).map(mapCustomer));
  });

  r.get("/:id", (req, res) => {
    const customer = getCustomer(idParam(req));
    const sales = db
      .prepare(`${SALE_SELECT} WHERE s.customer_id = ? ORDER BY s.id DESC LIMIT 50`)
      .all(customer.id) as SaleRow[];
    res.json({ ...mapCustomer(customer), sales: sales.map(mapSale) });
  });

  r.post("/", (req, res) => {
    const b = bodySchema.parse(req.body);
    const info = db
      .prepare("INSERT INTO customers (name, email, phone, status) VALUES (?, ?, ?, ?)")
      .run(b.name, b.email, b.phone, b.status);
    res.status(201).json(mapCustomer(getCustomer(Number(info.lastInsertRowid))));
  });

  r.patch("/:id", (req, res) => {
    const id = idParam(req);
    const b = bodySchema.partial().parse(req.body);
    const c = getCustomer(id);
    db.prepare("UPDATE customers SET name = ?, email = ?, phone = ?, status = ? WHERE id = ?").run(
      b.name ?? c.name,
      b.email ?? c.email,
      b.phone ?? c.phone,
      b.status ?? c.status,
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
