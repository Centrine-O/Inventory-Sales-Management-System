import { Router } from "express";
import { z } from "zod";
import { toCents, type DB } from "../db.js";
import { HttpError, currentUser, idParam, requireRole } from "../http.js";
import { iso, mapProduct, type ProductRow } from "../mappers.js";
import { audit, describeChanges, diff } from "../audit.js";

const money = z.coerce.number().min(0).max(100_000_000);
/** Printable barcode characters only; blank means "no barcode". */
const barcode = z
  .string()
  .trim()
  .max(64)
  .regex(/^[\x21-\x7E]*$/, "can only contain letters, digits and symbols, no spaces")
  .transform((v) => (v === "" ? null : v))
  .nullable();

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(50),
  category: z.string().trim().min(1).max(100).default("General"),
  description: z.string().trim().max(2000).default(""),
  price: money,
  cost: money.default(0),
  stock: z.coerce.number().int().min(0).default(0),
  reorderLevel: z.coerce.number().int().min(0).default(5),
  supplierId: z.coerce.number().int().positive().nullable().default(null),
  barcode: barcode.default(null),
});

// Defaults are stripped so omitted fields stay untouched on update.
const updateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(50),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000),
  price: money,
  cost: money,
  reorderLevel: z.coerce.number().int().min(0),
  supplierId: z.coerce.number().int().positive().nullable(),
  barcode,
}).partial();

const stockSchema = z.object({
  change: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "must not be zero"),
  reason: z.enum(["restock", "adjustment"]),
  note: z.string().trim().max(200).default(""),
});

const assignSchema = z.object({
  productIds: z.array(z.coerce.number().int().positive()).min(1, "Choose at least one product").max(1000),
});

/** EAN-13 check digit for a 12-digit body. */
export function ean13CheckDigit(body: string) {
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return String((10 - (sum % 10)) % 10);
}

/**
 * An in-store EAN-13 for a product. GS1 reserves prefixes 20–29 for restricted (in-store) circulation,
 * so these never clash with manufacturers' barcodes. Prefix 200 + the product id keeps them readable.
 */
export function inStoreBarcode(n: number) {
  const body = `200${String(n).padStart(9, "0")}`;
  return body + ean13CheckDigit(body);
}

const listSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["in_stock", "low_stock", "out_of_stock"]).optional(),
  category: z.string().trim().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  includeArchived: z.enum(["true", "false"]).optional(),
});

export function productsRouter(db: DB) {
  const r = Router();

  const checkSupplier = (id: number | null | undefined) => {
    if (id && !db.prepare("SELECT 1 FROM suppliers WHERE id = ?").get(id)) {
      throw new HttpError(400, "Supplier not found");
    }
  };

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
      where.push("(name LIKE ? OR sku LIKE ? OR category LIKE ? OR barcode = ?)");
      const like = `%${q.search}%`;
      params.push(like, like, like, q.search);
    }
    if (q.category) {
      where.push("category = ?");
      params.push(q.category);
    }
    if (q.supplierId) {
      where.push("supplier_id = ?");
      params.push(q.supplierId);
    }
    if (q.status === "out_of_stock") where.push("stock <= 0");
    if (q.status === "low_stock") where.push("stock > 0 AND stock <= reorder_level");
    if (q.status === "in_stock") where.push("stock > reorder_level");

    const sql = `SELECT * FROM products ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY name`;
    res.json((db.prepare(sql).all(...params) as ProductRow[]).map(mapProduct));
  });

  /** Exact match on barcode, then SKU — what a scanner or a typed code resolves to. */
  r.get("/lookup", (req, res) => {
    const code = String(req.query.code ?? "").trim();
    if (!code) throw new HttpError(400, "Enter a code");
    const row = (db.prepare("SELECT * FROM products WHERE barcode = ? AND archived = 0").get(code) ??
      db.prepare("SELECT * FROM products WHERE sku = ? COLLATE NOCASE AND archived = 0").get(code)) as ProductRow | undefined;
    if (!row) throw new HttpError(404, `No product with barcode or SKU "${code}"`);
    res.json(mapProduct(row));
  });

  /** Give products without a barcode an in-store EAN-13 so they can be labelled and scanned. */
  r.post("/assign-barcodes", requireRole("admin"), (req, res) => {
    const { productIds } = assignSchema.parse(req.body);
    const taken = db.prepare("SELECT 1 FROM products WHERE barcode = ?");
    const updated = db.transaction(() =>
      productIds.map((id) => {
        const p = getProduct(id);
        if (p.barcode) return p;
        // Derived from the id; step past any code someone has already typed in by hand.
        let n = p.id;
        while (taken.get(inStoreBarcode(n))) n += 1_000_000;
        const code = inStoreBarcode(n);
        db.prepare("UPDATE products SET barcode = ?, updated_at = datetime('now') WHERE id = ?").run(code, p.id);
        audit(db, req, {
          action: "barcode_assigned",
          entity: "product",
          entityId: p.id,
          summary: `Assigned in-store barcode ${code} to ${p.name} (${p.sku})`,
        });
        return getProduct(p.id);
      }),
    )();
    res.json(updated.map(mapProduct));
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
    checkSupplier(body.supplierId);
    const id = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO products (name, sku, category, description, price_cents, cost_cents, stock, reorder_level, supplier_id, barcode)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          body.supplierId,
          body.barcode,
        );
      const productId = Number(info.lastInsertRowid);
      if (body.stock > 0) {
        db.prepare(
          "INSERT INTO stock_movements (product_id, change, reason, reference, user_id) VALUES (?, ?, 'initial', 'Opening stock', ?)",
        ).run(productId, body.stock, me.id);
      }
      audit(db, req, {
        action: "created",
        entity: "product",
        entityId: productId,
        summary: `Added product ${body.name} (${body.sku}) at KSh ${body.price.toLocaleString("en-KE")}, opening stock ${body.stock}`,
      });
      return productId;
    })();
    res.status(201).json(mapProduct(getProduct(id)));
  });

  r.patch("/:id", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    const body = updateSchema.parse(req.body);
    const p = getProduct(id);
    checkSupplier(body.supplierId);
    const supplierName = (sid: number | null) =>
      sid ? ((db.prepare("SELECT name FROM suppliers WHERE id = ?").get(sid) as { name: string } | undefined)?.name ?? `#${sid}`) : null;
    const before = mapProduct(p);
    const changes = diff(
      { ...before, supplierId: supplierName(p.supplier_id) },
      { ...body, supplierId: body.supplierId === undefined ? undefined : supplierName(body.supplierId) },
    );
    const update = db.prepare(
      `UPDATE products SET name = ?, sku = ?, category = ?, description = ?, price_cents = ?, cost_cents = ?,
         reorder_level = ?, supplier_id = ?, barcode = ?, updated_at = datetime('now') WHERE id = ?`,
    );
    db.transaction(() => {
      update.run(
      body.name ?? p.name,
      body.sku ?? p.sku,
      body.category ?? p.category,
      body.description ?? p.description,
      body.price !== undefined ? toCents(body.price) : p.price_cents,
      body.cost !== undefined ? toCents(body.cost) : p.cost_cents,
      body.reorderLevel ?? p.reorder_level,
      body.supplierId === undefined ? p.supplier_id : body.supplierId,
      body.barcode === undefined ? p.barcode : body.barcode,
      id,
      );
      if (Object.keys(changes).length) {
        const priceChange = "price" in changes || "cost" in changes;
        audit(db, req, {
          action: priceChange ? "price_changed" : "updated",
          entity: "product",
          entityId: id,
          summary: `${p.name}: ${describeChanges(changes, ["description"])}${"description" in changes ? (Object.keys(changes).length > 1 ? ", description edited" : "description edited") : ""}`,
          details: { changes },
        });
      }
    })();
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
      const verb = body.reason === "restock" ? "Restocked" : "Adjusted stock of";
      audit(db, req, {
        action: "stock_adjusted",
        entity: "product",
        entityId: id,
        summary: `${verb} ${p.name} by ${body.change > 0 ? "+" : ""}${body.change} (${p.stock} → ${p.stock + body.change})${body.note ? ` · ${body.note}` : ""}`,
        details: { reason: body.reason, change: body.change, before: p.stock, after: p.stock + body.change, note: body.note },
      });
    })();
    res.json(mapProduct(getProduct(id)));
  });

  /** Products referenced by past sales or purchase orders are archived (kept for history); unused ones are removed. */
  r.delete("/:id", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    const p = getProduct(id);
    const used =
      db.prepare("SELECT 1 FROM sale_items WHERE product_id = ? LIMIT 1").get(id) ??
      db.prepare("SELECT 1 FROM purchase_order_items WHERE product_id = ? LIMIT 1").get(id);
    if (used) {
      db.transaction(() => {
        db.prepare("UPDATE products SET archived = 1, updated_at = datetime('now') WHERE id = ?").run(id);
        audit(db, req, { action: "archived", entity: "product", entityId: id, summary: `Archived ${p.name} (${p.sku}), ${p.stock} in stock` });
      })();
      res.json({ archived: true });
      return;
    }
    db.transaction(() => {
      db.prepare("DELETE FROM stock_movements WHERE product_id = ?").run(id);
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
      audit(db, req, { action: "deleted", entity: "product", entityId: id, summary: `Deleted ${p.name} (${p.sku})` });
    })();
    res.json({ archived: false });
  });

  r.post("/:id/restore", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    const p = getProduct(id);
    db.transaction(() => {
      db.prepare("UPDATE products SET archived = 0, updated_at = datetime('now') WHERE id = ?").run(id);
      audit(db, req, { action: "restored", entity: "product", entityId: id, summary: `Restored ${p.name} (${p.sku})` });
    })();
    res.json(mapProduct(getProduct(id)));
  });

  return r;
}
