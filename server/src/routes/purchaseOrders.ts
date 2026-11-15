import { Router } from "express";
import { z } from "zod";
import { fromCents, toCents, type DB } from "../db.js";
import { HttpError, currentUser, idParam } from "../http.js";
import { iso, type ProductRow } from "../mappers.js";

export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  expected_date: string | null;
  notes: string;
  created_by: string | null;
  created_at: string;
  ordered_at: string | null;
  received_at: string | null;
  line_count: number;
  units_ordered: number;
  units_received: number;
  total_cents: number;
  received_cents: number;
}

export const PO_SELECT = `
  SELECT o.*, s.name AS supplier_name, u.name AS created_by,
    (SELECT COUNT(*) FROM purchase_order_items WHERE po_id = o.id) AS line_count,
    (SELECT COALESCE(SUM(quantity_ordered), 0) FROM purchase_order_items WHERE po_id = o.id) AS units_ordered,
    (SELECT COALESCE(SUM(quantity_received), 0) FROM purchase_order_items WHERE po_id = o.id) AS units_received,
    (SELECT COALESCE(SUM(quantity_ordered * unit_cost_cents), 0) FROM purchase_order_items WHERE po_id = o.id) AS total_cents,
    (SELECT COALESCE(SUM(quantity_received * unit_cost_cents), 0) FROM purchase_order_items WHERE po_id = o.id) AS received_cents
  FROM purchase_orders o
  JOIN suppliers s ON s.id = o.supplier_id
  LEFT JOIN users u ON u.id = o.user_id
`;

export const mapPurchaseOrder = (o: PurchaseOrderRow) => ({
  id: o.id,
  poNumber: o.po_number,
  supplierId: o.supplier_id,
  supplierName: o.supplier_name,
  status: o.status,
  expectedDate: o.expected_date,
  notes: o.notes,
  createdBy: o.created_by ?? "",
  lineCount: o.line_count,
  unitsOrdered: o.units_ordered,
  unitsReceived: o.units_received,
  total: fromCents(o.total_cents),
  receivedValue: fromCents(o.received_cents),
  createdAt: iso(o.created_at),
  orderedAt: o.ordered_at ? iso(o.ordered_at) : null,
  receivedAt: o.received_at ? iso(o.received_at) : null,
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const itemsSchema = z
  .array(
    z.object({
      productId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().positive().max(1_000_000),
      unitCost: z.coerce.number().min(0).max(100_000_000),
    }),
  )
  .min(1, "A purchase order needs at least one item")
  .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, "Each product can appear only once");

const createSchema = z.object({
  supplierId: z.coerce.number().int().positive(),
  expectedDate: dateStr.nullable().default(null),
  notes: z.string().trim().max(1000).default(""),
  items: itemsSchema,
});

const updateSchema = z
  .object({
    supplierId: z.coerce.number().int().positive(),
    expectedDate: dateStr.nullable(),
    notes: z.string().trim().max(1000),
    items: itemsSchema,
  })
  .partial();

const receiveSchema = z.object({
  items: z
    .array(z.object({ itemId: z.coerce.number().int().positive(), quantity: z.coerce.number().int().min(0) }))
    .min(1),
  note: z.string().trim().max(200).default(""),
});

const listSchema = z.object({
  status: z.enum(["draft", "ordered", "partially_received", "received", "cancelled", "open"]).optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
});

export function purchaseOrdersRouter(db: DB) {
  const r = Router();

  const getRow = (id: number) => {
    const row = db.prepare(`${PO_SELECT} WHERE o.id = ?`).get(id) as PurchaseOrderRow | undefined;
    if (!row) throw new HttpError(404, "Purchase order not found");
    return row;
  };

  const getDetail = (id: number) => {
    const po = getRow(id);
    const items = db
      .prepare(
        `SELECT i.*, p.name AS product_name, p.sku, p.stock
         FROM purchase_order_items i JOIN products p ON p.id = i.product_id
         WHERE i.po_id = ? ORDER BY i.id`,
      )
      .all(id) as {
      id: number;
      product_id: number;
      product_name: string;
      sku: string;
      stock: number;
      quantity_ordered: number;
      quantity_received: number;
      unit_cost_cents: number;
    }[];
    const supplier = db.prepare("SELECT name, contact_name, email, phone, address FROM suppliers WHERE id = ?").get(po.supplier_id) as {
      name: string;
      contact_name: string;
      email: string;
      phone: string;
      address: string;
    };
    return {
      ...mapPurchaseOrder(po),
      supplier: {
        name: supplier.name,
        contactName: supplier.contact_name,
        email: supplier.email,
        phone: supplier.phone,
        address: supplier.address,
      },
      items: items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        sku: i.sku,
        currentStock: i.stock,
        quantityOrdered: i.quantity_ordered,
        quantityReceived: i.quantity_received,
        unitCost: fromCents(i.unit_cost_cents),
        lineTotal: fromCents(i.quantity_ordered * i.unit_cost_cents),
      })),
    };
  };

  const assertSupplier = (id: number) => {
    const s = db.prepare("SELECT active FROM suppliers WHERE id = ?").get(id) as { active: number } | undefined;
    if (!s) throw new HttpError(400, "Supplier not found");
    if (!s.active) throw new HttpError(400, "Supplier is inactive");
  };

  const writeItems = (poId: number, items: z.infer<typeof itemsSchema>) => {
    const insert = db.prepare(
      "INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, unit_cost_cents) VALUES (?, ?, ?, ?)",
    );
    for (const it of items) {
      const p = db.prepare("SELECT archived FROM products WHERE id = ?").get(it.productId) as { archived: number } | undefined;
      if (!p || p.archived) throw new HttpError(400, `Product #${it.productId} is not available`);
      insert.run(poId, it.productId, it.quantity, toCents(it.unitCost));
    }
  };

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.status === "open") where.push("o.status IN ('ordered', 'partially_received')");
    else if (q.status) {
      where.push("o.status = ?");
      params.push(q.status);
    }
    if (q.supplierId) {
      where.push("o.supplier_id = ?");
      params.push(q.supplierId);
    }
    if (q.search) {
      where.push("(o.po_number LIKE ? OR s.name LIKE ?)");
      params.push(`%${q.search}%`, `%${q.search}%`);
    }
    const rows = db
      .prepare(`${PO_SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY o.id DESC LIMIT 500`)
      .all(...params) as PurchaseOrderRow[];
    res.json(rows.map(mapPurchaseOrder));
  });

  /**
   * Products at or below their reorder level, grouped by preferred supplier.
   * Suggested quantity tops stock back up to twice the reorder level, minus anything already on order.
   */
  r.get("/suggestions", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.*, s.name AS supplier_name,
           COALESCE((SELECT SUM(i.quantity_ordered - i.quantity_received)
                     FROM purchase_order_items i JOIN purchase_orders o ON o.id = i.po_id
                     WHERE i.product_id = p.id AND o.status IN ('draft', 'ordered', 'partially_received')), 0) AS on_order
         FROM products p LEFT JOIN suppliers s ON s.id = p.supplier_id
         WHERE p.archived = 0 AND p.stock <= p.reorder_level
         ORDER BY s.name IS NULL, s.name, p.stock`,
      )
      .all() as (ProductRow & { supplier_name: string | null; on_order: number })[];

    const groups = new Map<string, { supplierId: number | null; supplierName: string | null; items: unknown[] }>();
    for (const p of rows) {
      const suggested = Math.max(p.reorder_level * 2, 1) - p.stock - p.on_order;
      if (suggested <= 0) continue;
      const key = String(p.supplier_id ?? "none");
      if (!groups.has(key)) groups.set(key, { supplierId: p.supplier_id, supplierName: p.supplier_name, items: [] });
      groups.get(key)!.items.push({
        productId: p.id,
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        reorderLevel: p.reorder_level,
        onOrder: p.on_order,
        suggestedQuantity: suggested,
        unitCost: fromCents(p.cost_cents),
      });
    }
    res.json([...groups.values()]);
  });

  r.get("/:id", (req, res) => {
    res.json(getDetail(idParam(req)));
  });

  r.post("/", (req, res) => {
    const b = createSchema.parse(req.body);
    const me = currentUser(req);
    assertSupplier(b.supplierId);
    const id = db.transaction(() => {
      const next = (db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM purchase_orders").get() as { n: number }).n;
      const info = db
        .prepare(
          "INSERT INTO purchase_orders (po_number, supplier_id, status, expected_date, notes, user_id) VALUES (?, ?, 'draft', ?, ?, ?)",
        )
        .run(`PO-${String(next).padStart(5, "0")}`, b.supplierId, b.expectedDate, b.notes, me.id);
      const poId = Number(info.lastInsertRowid);
      writeItems(poId, b.items);
      return poId;
    })();
    res.status(201).json(getDetail(id));
  });

  r.patch("/:id", (req, res) => {
    const id = idParam(req);
    const b = updateSchema.parse(req.body);
    db.transaction(() => {
      const po = getRow(id);
      const isDraft = po.status === "draft";
      const isOpen = po.status === "ordered" || po.status === "partially_received";
      if (!isDraft && !(isOpen && b.items === undefined && b.supplierId === undefined)) {
        throw new HttpError(400, isOpen ? "Only the expected date and notes can change once ordered" : "This purchase order can no longer be edited");
      }
      if (b.supplierId !== undefined) assertSupplier(b.supplierId);
      db.prepare("UPDATE purchase_orders SET supplier_id = ?, expected_date = ?, notes = ? WHERE id = ?").run(
        b.supplierId ?? po.supplier_id,
        b.expectedDate === undefined ? po.expected_date : b.expectedDate,
        b.notes ?? po.notes,
        id,
      );
      if (b.items) {
        db.prepare("DELETE FROM purchase_order_items WHERE po_id = ?").run(id);
        writeItems(id, b.items);
      }
    })();
    res.json(getDetail(id));
  });

  r.post("/:id/order", (req, res) => {
    const id = idParam(req);
    const po = getRow(id);
    if (po.status !== "draft") throw new HttpError(400, "Only draft purchase orders can be placed");
    assertSupplier(po.supplier_id);
    db.prepare("UPDATE purchase_orders SET status = 'ordered', ordered_at = datetime('now') WHERE id = ?").run(id);
    res.json(getDetail(id));
  });

  /**
   * Receive goods against an order. Stock increases, a restock movement is logged, and the product's
   * unit cost becomes the weighted average of existing stock and the newly received units.
   */
  r.post("/:id/receive", (req, res) => {
    const id = idParam(req);
    const b = receiveSchema.parse(req.body);
    const me = currentUser(req);

    db.transaction(() => {
      const po = getRow(id);
      if (po.status !== "ordered" && po.status !== "partially_received") {
        throw new HttpError(400, po.status === "draft" ? "Place the order before receiving goods" : "This purchase order is closed");
      }
      let receivedAny = false;
      for (const line of b.items) {
        if (line.quantity === 0) continue;
        const item = db
          .prepare("SELECT * FROM purchase_order_items WHERE id = ? AND po_id = ?")
          .get(line.itemId, id) as
          | { id: number; product_id: number; quantity_ordered: number; quantity_received: number; unit_cost_cents: number }
          | undefined;
        if (!item) throw new HttpError(400, `Line #${line.itemId} is not on this purchase order`);
        const remaining = item.quantity_ordered - item.quantity_received;
        if (line.quantity > remaining) {
          throw new HttpError(400, `Cannot receive ${line.quantity}: only ${remaining} outstanding on that line`);
        }
        const p = db.prepare("SELECT stock, cost_cents FROM products WHERE id = ?").get(item.product_id) as {
          stock: number;
          cost_cents: number;
        };
        const newStock = p.stock + line.quantity;
        const newCost = Math.round((p.stock * p.cost_cents + line.quantity * item.unit_cost_cents) / newStock);
        db.prepare("UPDATE products SET stock = ?, cost_cents = ?, updated_at = datetime('now') WHERE id = ?").run(
          newStock,
          newCost,
          item.product_id,
        );
        db.prepare("UPDATE purchase_order_items SET quantity_received = quantity_received + ? WHERE id = ?").run(
          line.quantity,
          item.id,
        );
        db.prepare(
          "INSERT INTO stock_movements (product_id, change, reason, reference, user_id) VALUES (?, ?, 'restock', ?, ?)",
        ).run(item.product_id, line.quantity, b.note ? `${po.po_number} · ${b.note}` : po.po_number, me.id);
        receivedAny = true;
      }
      if (!receivedAny) throw new HttpError(400, "Enter a quantity for at least one line");

      const outstanding = (
        db
          .prepare("SELECT COALESCE(SUM(quantity_ordered - quantity_received), 0) AS n FROM purchase_order_items WHERE po_id = ?")
          .get(id) as { n: number }
      ).n;
      if (outstanding === 0) {
        db.prepare("UPDATE purchase_orders SET status = 'received', received_at = datetime('now') WHERE id = ?").run(id);
      } else {
        db.prepare("UPDATE purchase_orders SET status = 'partially_received' WHERE id = ?").run(id);
      }
    })();

    res.json(getDetail(id));
  });

  /** Cancels whatever is still outstanding. Goods already received stay in stock. */
  r.post("/:id/cancel", (req, res) => {
    const id = idParam(req);
    const po = getRow(id);
    if (po.status === "received" || po.status === "cancelled") throw new HttpError(400, "This purchase order is already closed");
    db.prepare("UPDATE purchase_orders SET status = 'cancelled' WHERE id = ?").run(id);
    res.json(getDetail(id));
  });

  r.delete("/:id", (req, res) => {
    const id = idParam(req);
    const po = getRow(id);
    if (po.status !== "draft") throw new HttpError(400, "Only drafts can be deleted; cancel placed orders instead");
    db.prepare("DELETE FROM purchase_orders WHERE id = ?").run(id);
    res.status(204).end();
  });

  return r;
}
