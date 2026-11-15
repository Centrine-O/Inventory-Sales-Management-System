import { Router } from "express";
import { z } from "zod";
import { toCents, type DB } from "../db.js";
import { HttpError, currentUser, idParam, requireRole } from "../http.js";
import { iso, mapProduct, type ProductRow } from "../mappers.js";

const money = z.coerce.number().min(0).max(100_000_000);

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(50),
  category: z.string().trim().min(1).max(100).default("General"),
  description: z.string().trim().max(2000).default(""),
  price: money,
  cost: money.default(0),
  stock: z.coerce.number().int().min(0).default(0),
  reorderLevel: z.coerce.number().int().min(0).default(5),
});

const updateSchema = createSchema.omit({ stock: true }).partial();

const stockSchema = z.object({
  change: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "must not be zero"),
  reason: z.enum(["restock", "adjustment"]),
  note: z.string().trim().max(200).default(""),
});

const listSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
  category: z.string().trim().optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
});

export function productsRouter(db: DB) {
  const r = Router();

  const getProduct = (id: number) => {
    const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
    if (!row) throw new HttpError(404, "Product not found");
    return row;
  };

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.includeArchived !== "true") where.push("archived = 0");
    if (q.search) {
      where.push("(name LIKE ? OR sku LIKE ? OR category LIKE ?)");
      const like = `%${q.search}%`;
      params.push(like, like, like);
    }
    if (q.category) {
      where.push("category = ?");
      params.push(q.category);
    }
    if (q.status === "out_of_stock") where.push("stock <= 0");
    if (q.status === "low_stock") where.push("stock > 0 AND stock <= reorder_level");
    if (q.status === "in_stock") where.push("stock > reorder_level");

    const sql = `SELECT * FROM products ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name`;
    res.json((db.prepare(sql).all(...params) as ProductRow[]).map(mapProduct));
  });

  r.get("/categories", (_req, res) => {
    const rows = db
      .prepare("SELECT DISTINCT category FROM products WHERE archived = 0 ORDER BY category")
      .all() as { category: string }[];
    res.json(rows.map((c) => c.category));
  });

  r.get("/:id", (req, res) => {
    const product = getProduct(idParam(req));
    const movements = db
      .prepare(
        `SELECT m.id, m.change, m.reason, m.reference, m.created_at, u.name AS user_name
         FROM stock_movements m LEFT JOIN users u ON u.id = m.user_id
         WHERE m.product_id = ? ORDER BY m.id DESC LIMIT 50`,
      )
      .all(product.id) as {
      id: number;
      change: number;
      reason: string;
      reference: string;
      created_at: string;
      user_name: string | null;
    }[];
    res.json({
      ...mapProduct(product),
      movements: movements.map((m) => ({
        id: m.id,
        change: m.change,
        reason: m.reason,
        reference: m.reference,
        userName: m.user_name ?? "",
        createdAt: iso(m.created_at),
      })),
    });
  });

  r.post("/", requireRole("admin"), (req, res) => {
    const body = createSchema.parse(req.body);
    const me = currentUser(req);
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO products (name, sku, category, description, price_cents, cost_cents, stock, reorder_level)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          body.name,
          body.sku,
          body.category,
          body.description,
          toCents(body.price),
          toCents(body.cost),
          body.stock,
          body.reorderLevel,
        );
      const productId = Number(info.lastInsertRowid);
      if (body.stock > 0) {
        db.prepare(
          "INSERT INTO stock_movements (product_id, change, reason, reference, user_id) VALUES (?, ?, 'initial', 'Opening stock', ?)",
        ).run(productId, body.stock, me.id);
      }
      return productId;
    })();
    res.status(201).json(mapProduct(getProduct(id)));
  });

  r.patch("/:id", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    const body = updateSchema.parse(req.body);
    const p = getProduct(id);
    db.prepare(
      `UPDATE products SET name = ?, sku = ?, category = ?, description = ?, price_cents = ?, cost_cents = ?,
         reorder_level = ?, updated_at = datetime('now') WHERE id = ?`,
    ).run(
      body.name ?? p.name,
      body.sku ?? p.sku,
      body.category ?? p.category,
      body.description ?? p.description,
      body.price !== undefined ? toCents(body.price) : p.price_cents,
      body.cost !== undefined ? toCents(body.cost) : p.cost_cents,
      body.reorderLevel ?? p.reorder_level,
      id,
    );
    res.json(mapProduct(getProduct(id)));
  });

  r.post("/:id/stock", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    const body = stockSchema.parse(req.body);
    const me = currentUser(req);
    db.transaction(() => {
      const p = getProduct(id);
      if (p.archived) throw new HttpError(400, "Cannot adjust stock of an archived product");
      if (p.stock + body.change < 0) {
        throw new HttpError(400, `Adjustment would make stock negative (current stock: ${p.stock})`);
      }
      db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(
        body.change,
        id,
      );
      db.prepare(
        "INSERT INTO stock_movements (product_id, change, reason, reference, user_id) VALUES (?, ?, ?, ?, ?)",
      ).run(id, body.change, body.reason, body.note, me.id);
    })();
    res.json(mapProduct(getProduct(id)));
  });

  /** Products referenced by past sales are archived (kept for history); unused ones are removed. */
  r.delete("/:id", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    getProduct(id);
    const used = db.prepare("SELECT 1 FROM sale_items WHERE product_id = ? LIMIT 1").get(id);
    if (used) {
      db.prepare("UPDATE products SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(id);
      res.json({ archived: true });
      return;
    }
    db.transaction(() => {
      db.prepare("DELETE FROM stock_movements WHERE product_id = ?").run(id);
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
    })();
    res.json({ archived: false });
  });

  r.post("/:id/restore", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    getProduct(id);
    db.prepare("UPDATE products SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(id);
    res.json(mapProduct(getProduct(id)));
  });

  return r;
}
