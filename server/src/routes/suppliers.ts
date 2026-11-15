import { Router } from "express";
import { z } from "zod";
import { fromCents, type DB } from "../db.js";
import { HttpError, idParam } from "../http.js";
import { iso, mapProduct, type ProductRow } from "../mappers.js";
import { PO_SELECT, mapPurchaseOrder, type PurchaseOrderRow } from "./purchaseOrders.js";

interface SupplierRow {
  id: number;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  active: number;
  created_at: string;
  product_count: number;
  open_orders: number;
  total_purchased_cents: number;
}

const mapSupplier = (s: SupplierRow) => ({
  id: s.id,
  name: s.name,
  contactName: s.contact_name,
  email: s.email,
  phone: s.phone,
  address: s.address,
  notes: s.notes,
  active: s.active === 1,
  productCount: s.product_count,
  openOrders: s.open_orders,
  totalPurchased: fromCents(s.total_purchased_cents),
  createdAt: iso(s.created_at),
});

const SELECT = `
  SELECT s.*,
    (SELECT COUNT(*) FROM products p WHERE p.supplier_id = s.id AND p.archived = 0) AS product_count,
    (SELECT COUNT(*) FROM purchase_orders o WHERE o.supplier_id = s.id AND o.status IN ('ordered', 'partially_received')) AS open_orders,
    (SELECT COALESCE(SUM(i.quantity_received * i.unit_cost_cents), 0)
       FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.po_id WHERE o.supplier_id = s.id) AS total_purchased_cents
  FROM suppliers s
`;

const optionalEmail = z.union([z.string().trim().email(), z.literal("")]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(200).default(""),
  email: optionalEmail.default(""),
  phone: z.string().trim().max(40).default(""),
  address: z.string().trim().max(300).default(""),
  notes: z.string().trim().max(1000).default(""),
  active: z.boolean().default(true),
});
const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    contactName: z.string().trim().max(200),
    email: optionalEmail,
    phone: z.string().trim().max(40),
    address: z.string().trim().max(300),
    notes: z.string().trim().max(1000),
    active: z.boolean(),
  })
  .partial();

export function suppliersRouter(db: DB) {
  const r = Router();

  const getSupplier = (id: number) => {
    const row = db.prepare(`${SELECT} WHERE s.id = ?`).get(id) as SupplierRow | undefined;
    if (!row) throw new HttpError(404, "Supplier not found");
    return row;
  };

  r.get("/", (req, res) => {
    const search = String(req.query.search ?? "").trim();
    const rows = search
      ? (db
          .prepare(`${SELECT} WHERE s.name LIKE ? OR s.contact_name LIKE ? OR s.phone LIKE ? ORDER BY s.name`)
          .all(`%${search}%`, `%${search}%`, `%${search}%`) as SupplierRow[])
      : (db.prepare(`${SELECT} ORDER BY s.name`).all() as SupplierRow[]);
    res.json(rows.map(mapSupplier));
  });

  r.get("/:id", (req, res) => {
    const s = getSupplier(idParam(req));
    const products = db
      .prepare("SELECT * FROM products WHERE supplier_id = ? AND archived = 0 ORDER BY name")
      .all(s.id) as ProductRow[];
    const orders = db
      .prepare(`${PO_SELECT} WHERE o.supplier_id = ? ORDER BY o.id DESC LIMIT 50`)
      .all(s.id) as PurchaseOrderRow[];
    res.json({ ...mapSupplier(s), products: products.map(mapProduct), orders: orders.map(mapPurchaseOrder) });
  });

  r.post("/", (req, res) => {
    const b = createSchema.parse(req.body);
    const info = db
      .prepare(
        "INSERT INTO suppliers (name, contact_name, email, phone, address, notes, active) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(b.name, b.contactName, b.email, b.phone, b.address, b.notes, b.active ? 1 : 0);
    res.status(201).json(mapSupplier(getSupplier(Number(info.lastInsertRowid))));
  });

  r.patch("/:id", (req, res) => {
    const id = idParam(req);
    const b = updateSchema.parse(req.body);
    const s = getSupplier(id);
    db.prepare(
      "UPDATE suppliers SET name = ?, contact_name = ?, email = ?, phone = ?, address = ?, notes = ?, active = ? WHERE id = ?",
    ).run(
      b.name ?? s.name,
      b.contactName ?? s.contact_name,
      b.email ?? s.email,
      b.phone ?? s.phone,
      b.address ?? s.address,
      b.notes ?? s.notes,
      b.active === undefined ? s.active : b.active ? 1 : 0,
      id,
    );
    res.json(mapSupplier(getSupplier(id)));
  });

  r.delete("/:id", (req, res) => {
    const id = idParam(req);
    getSupplier(id);
    if (db.prepare("SELECT 1 FROM purchase_orders WHERE supplier_id = ? LIMIT 1").get(id)) {
      throw new HttpError(409, "This supplier has purchase orders. Mark them inactive instead of deleting.");
    }
    db.transaction(() => {
      db.prepare("UPDATE products SET supplier_id = NULL WHERE supplier_id = ?").run(id);
      db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
    })();
    res.status(204).end();
  });

  return r;
}
