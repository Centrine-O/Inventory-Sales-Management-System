import { Router } from "express";
import { z } from "zod";
import { fromCents, toCents, type DB } from "../db.js";
import { HttpError, currentUser, idParam, requireRole } from "../http.js";
import { getSettings } from "./settings.js";
import { SALE_SELECT, iso, mapSale, toCsv, type ProductRow, type SaleRow } from "../mappers.js";

const PAYMENT_METHODS = ["Cash", "Card", "M-Pesa", "Bank Transfer"] as const;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const createSchema = z.object({
  customerId: z.coerce.number().int().positive().nullable().default(null),
  paymentMethod: z.enum(PAYMENT_METHODS),
  status: z.enum(["paid", "pending"]).default("paid"),
  /** Deposit taken now on a credit (pending) sale. Ignored for paid sales, which are paid in full. */
  amountPaid: z.coerce.number().min(0).default(0),
  discount: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(500).default(""),
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive().max(100_000),
      }),
    )
    .min(1, "A sale needs at least one item"),
});

const listSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(["paid", "pending", "cancelled"]).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  limit: z.coerce.number().int().positive().max(1000).default(500),
});

const statusSchema = z.object({ status: z.enum(["paid", "cancelled"]) });

const paymentSchema = z.object({
  amount: z.coerce.number().positive("must be greater than zero"),
  method: z.enum(PAYMENT_METHODS),
  reference: z.string().trim().max(100).default(""),
});

const returnSchema = z.object({
  items: z
    .array(
      z.object({
        saleItemId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive(),
        restock: z.boolean().default(true),
      }),
    )
    .min(1, "Choose at least one item to return"),
  reason: z.string().trim().min(1, "Give a reason for the return").max(300),
  refundMethod: z.enum(PAYMENT_METHODS).optional(),
  refundReference: z.string().trim().max(100).default(""),
});

/** Outstanding amount on a sale, from the payments ledger. */
export function saleBalanceCents(db: DB, saleId: number) {
  return (
    db
      .prepare(
        "SELECT balance_cents AS bal FROM sale_balances WHERE sale_id = ?",
      )
      .get(saleId) as { bal: number }
  ).bal;
}

/** Sum of balances on a customer's open credit sales. */
export function customerBalanceCents(db: DB, customerId: number) {
  return (
    db
      .prepare(
        `SELECT COALESCE(SUM(b.balance_cents), 0) AS bal
         FROM sales s JOIN sale_balances b ON b.sale_id = s.id WHERE s.customer_id = ? AND s.status = 'pending'`,
      )
      .get(customerId) as { bal: number }
  ).bal;
}

function buildFilter(q: z.infer<typeof listSchema>) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.search) {
    where.push("(s.invoice_no LIKE ? OR c.name LIKE ? OR c.phone LIKE ?)");
    const like = `%${q.search}%`;
    params.push(like, like, like);
  }
  if (q.status) {
    where.push("s.status = ?");
    params.push(q.status);
  }
  if (q.from) {
    where.push("date(s.created_at, 'localtime') >= ?");
    params.push(q.from);
  }
  if (q.to) {
    where.push("date(s.created_at, 'localtime') <= ?");
    params.push(q.to);
  }
  return { where: where.length ? "WHERE " + where.join(" AND ") : "", params };
}

export function salesRouter(db: DB) {
  const r = Router();

  const getSale = (id: number) => {
    const row = db.prepare(`${SALE_SELECT} WHERE s.id = ?`).get(id) as SaleRow | undefined;
    if (!row) throw new HttpError(404, "Sale not found");
    const items = db
      .prepare(
        `SELECT i.*, COALESCE((SELECT SUM(quantity) FROM return_items WHERE sale_item_id = i.id), 0) AS returned_qty
         FROM sale_items i WHERE i.sale_id = ? ORDER BY i.id`,
      )
      .all(id) as {
      id: number;
      product_id: number;
      product_name: string;
      sku: string;
      quantity: number;
      unit_price_cents: number;
      line_total_cents: number;
      returned_qty: number;
    }[];
    const returns = db
      .prepare(
        `SELECT r.*, u.name AS user_name FROM returns r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.sale_id = ? ORDER BY r.id`,
      )
      .all(id) as {
      id: number;
      return_no: string;
      reason: string;
      value_cents: number;
      refund_cents: number;
      refund_method: string | null;
      refund_reference: string;
      user_name: string | null;
      created_at: string;
    }[];
    const returnLines = db
      .prepare(
        `SELECT ri.return_id, ri.quantity, ri.restocked, ri.value_cents, i.product_name
         FROM return_items ri JOIN sale_items i ON i.id = ri.sale_item_id
         WHERE i.sale_id = ? ORDER BY ri.id`,
      )
      .all(id) as { return_id: number; quantity: number; restocked: number; value_cents: number; product_name: string }[];
    const customer = row.customer_id
      ? (db.prepare("SELECT name, email, phone FROM customers WHERE id = ?").get(row.customer_id) as {
          name: string;
          email: string;
          phone: string;
        })
      : null;
    const payments = db
      .prepare(
        `SELECT p.id, p.amount_cents, p.method, p.reference, p.created_at, u.name AS user_name
         FROM payments p LEFT JOIN users u ON u.id = p.user_id WHERE p.sale_id = ? ORDER BY p.id`,
      )
      .all(id) as { id: number; amount_cents: number; method: string; reference: string; created_at: string; user_name: string | null }[];
    return {
      ...mapSale(row),
      customer,
      payments: payments.map((p) => ({
        id: p.id,
        amount: fromCents(p.amount_cents),
        method: p.method,
        reference: p.reference,
        receivedBy: p.user_name ?? "",
        createdAt: iso(p.created_at),
      })),
      items: items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        productName: i.product_name,
        sku: i.sku,
        quantity: i.quantity,
        unitPrice: fromCents(i.unit_price_cents),
        lineTotal: fromCents(i.line_total_cents),
        returnedQuantity: i.returned_qty,
      })),
      returns: returns.map((r) => ({
        id: r.id,
        returnNo: r.return_no,
        reason: r.reason,
        value: fromCents(r.value_cents),
        refund: fromCents(r.refund_cents),
        refundMethod: r.refund_method,
        refundReference: r.refund_reference,
        processedBy: r.user_name ?? "",
        createdAt: iso(r.created_at),
        items: returnLines
          .filter((l) => l.return_id === r.id)
          .map((l) => ({ productName: l.product_name, quantity: l.quantity, restocked: l.restocked === 1, value: fromCents(l.value_cents) })),
      })),
    };
  };

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const { where, params } = buildFilter(q);
    const rows = db
      .prepare(`${SALE_SELECT} ${where} ORDER BY s.id DESC LIMIT ?`)
      .all(...params, q.limit) as SaleRow[];
    res.json(rows.map(mapSale));
  });

  r.get("/export.csv", (req, res) => {
    const q = listSchema.parse(req.query);
    const { where, params } = buildFilter(q);
    const rows = db
      .prepare(`${SALE_SELECT} ${where} ORDER BY s.id DESC LIMIT 100000`)
      .all(...params) as SaleRow[];
    const csv = toCsv(
      ["Invoice", "Date", "Customer", "Cashier", "Items", "Subtotal", "Discount", "VAT", "Total", "Paid", "Balance", "Payment", "Status"],
      rows.map((row) => {
        const s = mapSale(row);
        return [
          s.invoiceNo,
          s.createdAt,
          s.customerName,
          s.cashierName,
          s.itemCount,
          s.subtotal.toFixed(2),
          s.discount.toFixed(2),
          s.tax.toFixed(2),
          s.total.toFixed(2),
          s.amountPaid.toFixed(2),
          s.balance.toFixed(2),
          s.paymentMethod,
          s.status,
        ];
      }),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="sales.csv"');
    res.send(csv);
  });

  r.get("/:id", (req, res) => {
    res.json(getSale(idParam(req)));
  });

  r.post("/", (req, res) => {
    const body = createSchema.parse(req.body);
    const me = currentUser(req);
    const { taxRate } = getSettings(db) as { taxRate: number };

    const saleId = db.transaction(() => {
      let customer: { name: string; credit_limit_cents: number } | undefined;
      if (body.customerId !== null) {
        customer = db.prepare("SELECT name, credit_limit_cents FROM customers WHERE id = ?").get(body.customerId) as
          | { name: string; credit_limit_cents: number }
          | undefined;
        if (!customer) throw new HttpError(400, "Customer not found");
      }

      // Merge duplicate lines so stock checks see the true requested quantity.
      const qty = new Map<number, number>();
      for (const it of body.items) qty.set(it.productId, (qty.get(it.productId) ?? 0) + it.quantity);

      const lines = [...qty.entries()].map(([productId, quantity]) => {
        const p = db.prepare("SELECT * FROM products WHERE id = ?").get(productId) as ProductRow | undefined;
        if (!p || p.archived) throw new HttpError(400, `Product #${productId} is not available`);
        if (p.stock < quantity) {
          throw new HttpError(409, `Insufficient stock for ${p.name}: ${p.stock} available, ${quantity} requested`);
        }
        return { p, quantity, lineTotal: p.price_cents * quantity };
      });

      const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
      const discount = toCents(body.discount);
      if (discount > subtotal) throw new HttpError(400, "Discount cannot exceed the subtotal");
      const total = subtotal - discount;
      // Prices are VAT-inclusive (standard for Kenyan retail); record the VAT portion of the total.
      const tax = taxRate > 0 ? Math.round((total * taxRate) / (100 + taxRate)) : 0;

      // A deposit that covers the whole total simply makes it a paid sale.
      let status = body.status;
      let paidNow = status === "paid" ? total : toCents(body.amountPaid);
      if (status === "pending" && paidNow >= total) {
        status = "paid";
        paidNow = total;
      }
      if (status === "pending") {
        if (!customer) throw new HttpError(400, "Choose a customer for sales on credit, so the balance can be followed up");
        const limit = customer.credit_limit_cents;
        const owed = customerBalanceCents(db, body.customerId!);
        if (limit > 0 && owed + (total - paidNow) > limit) {
          throw new HttpError(
            409,
            `This would take ${customer.name} over their credit limit of KSh ${fromCents(limit).toLocaleString()} ` +
              `(currently owes KSh ${fromCents(owed).toLocaleString()})`,
          );
        }
      }

      const next = (db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM sales").get() as { n: number }).n;
      const invoiceNo = `INV-${String(next).padStart(5, "0")}`;

      const info = db
        .prepare(
          `INSERT INTO sales (invoice_no, customer_id, user_id, payment_method, status,
             subtotal_cents, discount_cents, tax_cents, total_cents, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(invoiceNo, body.customerId, me.id, body.paymentMethod, status, subtotal, discount, tax, total, body.notes);
      const id = Number(info.lastInsertRowid);
      if (paidNow > 0) {
        db.prepare("INSERT INTO payments (sale_id, amount_cents, method, reference, user_id) VALUES (?, ?, ?, ?, ?)").run(
          id,
          paidNow,
          body.paymentMethod,
          status === "paid" ? "Paid at sale" : "Deposit",
          me.id,
        );
      }

      const insertItem = db.prepare(
        `INSERT INTO sale_items (sale_id, product_id, product_name, sku, category, quantity, unit_price_cents, unit_cost_cents, line_total_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const decStock = db.prepare("UPDATE products SET stock = stock - ?, updated_at = datetime('now') WHERE id = ?");
      const movement = db.prepare(
        "INSERT INTO stock_movements (product_id, change, reason, reference, user_id) VALUES (?, ?, 'sale', ?, ?)",
      );
      for (const l of lines) {
        insertItem.run(id, l.p.id, l.p.name, l.p.sku, l.p.category, l.quantity, l.p.price_cents, l.p.cost_cents, l.lineTotal);
        decStock.run(l.quantity, l.p.id);
        movement.run(l.p.id, -l.quantity, invoiceNo, me.id);
      }
      return id;
    })();

    res.status(201).json(getSale(saleId));
  });

  r.patch("/:id/status", (req, res) => {
    const id = idParam(req);
    const { status } = statusSchema.parse(req.body);
    const me = currentUser(req);

    db.transaction(() => {
      const sale = db.prepare("SELECT id, invoice_no, status, payment_method FROM sales WHERE id = ?").get(id) as
        | { id: number; invoice_no: string; status: string; payment_method: string }
        | undefined;
      if (!sale) throw new HttpError(404, "Sale not found");
      if (sale.status === "cancelled") throw new HttpError(400, "Cancelled sales cannot be changed");
      if (sale.status === status) return;

      if (status === "cancelled") {
        if (me.role !== "admin") throw new HttpError(403, "Only admins can cancel sales");
        if (db.prepare("SELECT 1 FROM returns WHERE sale_id = ? LIMIT 1").get(id)) {
          throw new HttpError(400, "This sale has returns. Return the remaining items instead of cancelling.");
        }
        const items = db.prepare("SELECT product_id, quantity FROM sale_items WHERE sale_id = ?").all(id) as {
          product_id: number;
          quantity: number;
        }[];
        for (const it of items) {
          db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(
            it.quantity,
            it.product_id,
          );
          db.prepare(
            "INSERT INTO stock_movements (product_id, change, reason, reference, user_id) VALUES (?, ?, 'sale_cancelled', ?, ?)",
          ).run(it.product_id, it.quantity, sale.invoice_no, me.id);
        }
      }
      if (status === "paid") {
        // Settle whatever is still owed in one payment.
        const balance = saleBalanceCents(db, id);
        if (balance > 0) {
          db.prepare("INSERT INTO payments (sale_id, amount_cents, method, reference, user_id) VALUES (?, ?, ?, 'Balance settled', ?)").run(
            id,
            balance,
            sale.payment_method,
            me.id,
          );
        }
      }
      db.prepare("UPDATE sales SET status = ? WHERE id = ?").run(status, id);
    })();

    res.json(getSale(id));
  });

  /**
   * Return some or all items from a sale. The return is valued at what the customer actually paid per unit
   * (the sale's discount spread pro rata). It first reduces any balance still owed; only money paid beyond
   * the sale's new worth is refunded. Restocked items go back into inventory; damaged ones are written off.
   */
  r.post("/:id/returns", requireRole("admin"), (req, res) => {
    const id = idParam(req);
    const body = returnSchema.parse(req.body);
    const me = currentUser(req);

    const result = db.transaction(() => {
      const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(id) as
        | { id: number; invoice_no: string; status: string; subtotal_cents: number; total_cents: number }
        | undefined;
      if (!sale) throw new HttpError(404, "Sale not found");
      if (sale.status === "cancelled") throw new HttpError(400, "Cancelled sales can't have returns");

      const saleItems = db
        .prepare(
          `SELECT i.*, COALESCE((SELECT SUM(quantity) FROM return_items WHERE sale_item_id = i.id), 0) AS returned_qty
           FROM sale_items i WHERE i.sale_id = ?`,
        )
        .all(id) as {
        id: number;
        product_id: number;
        product_name: string;
        quantity: number;
        unit_price_cents: number;
        returned_qty: number;
      }[];
      const byId = new Map(saleItems.map((i) => [i.id, i]));

      const seen = new Set<number>();
      const lines = body.items.map((it) => {
        const item = byId.get(it.saleItemId);
        if (!item) throw new HttpError(400, `Line #${it.saleItemId} is not on this sale`);
        if (seen.has(item.id)) throw new HttpError(400, "Each sale line can appear only once in a return");
        seen.add(item.id);
        const left = item.quantity - item.returned_qty;
        if (it.quantity > left) {
          throw new HttpError(400, `Only ${left} of ${item.product_name} can still be returned`);
        }
        // What the customer effectively paid per unit after the sale-level discount.
        const value = sale.subtotal_cents > 0 ? Math.round((item.unit_price_cents * it.quantity * sale.total_cents) / sale.subtotal_cents) : 0;
        return { item, quantity: it.quantity, restock: it.restock, value };
      });

      const before = db.prepare("SELECT * FROM sale_balances WHERE sale_id = ?").get(id) as {
        returned_cents: number;
        net_paid_cents: number;
      };
      let value = lines.reduce((s, l) => s + l.value, 0);
      // If this return empties the sale, make the totals tie out exactly (no stray rounding cents).
      const everythingBack = saleItems.every((i) => {
        const l = lines.find((x) => x.item.id === i.id);
        return i.returned_qty + (l?.quantity ?? 0) === i.quantity;
      });
      if (everythingBack) value = sale.total_cents - before.returned_cents;

      const newNetTotal = sale.total_cents - before.returned_cents - value;
      const refund = Math.max(0, before.net_paid_cents - newNetTotal);
      if (refund > 0 && !body.refundMethod) {
        throw new HttpError(400, `A refund of KSh ${fromCents(refund).toLocaleString()} is due — choose how it was paid back`);
      }

      const next = (db.prepare("SELECT COALESCE(MAX(id), 0) + 1 AS n FROM returns").get() as { n: number }).n;
      const returnNo = `RET-${String(next).padStart(5, "0")}`;
      const retId = Number(
        db
          .prepare(
            `INSERT INTO returns (return_no, sale_id, reason, value_cents, refund_cents, refund_method, refund_reference, user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(returnNo, id, body.reason, value, refund, refund > 0 ? body.refundMethod : null, refund > 0 ? body.refundReference : "", me.id)
          .lastInsertRowid,
      );

      // Spread any rounding adjustment onto the last line so line values sum to the return value.
      let allocated = 0;
      lines.forEach((l, idx) => {
        const lineValue = idx === lines.length - 1 ? value - allocated : l.value;
        allocated += lineValue;
        db.prepare("INSERT INTO return_items (return_id, sale_item_id, quantity, value_cents, restocked) VALUES (?, ?, ?, ?, ?)").run(
          retId,
          l.item.id,
          l.quantity,
          lineValue,
          l.restock ? 1 : 0,
        );
        if (l.restock) {
          db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?").run(l.quantity, l.item.product_id);
          db.prepare(
            "INSERT INTO stock_movements (product_id, change, reason, reference, user_id) VALUES (?, ?, 'return', ?, ?)",
          ).run(l.item.product_id, l.quantity, `${returnNo} · ${sale.invoice_no}`, me.id);
        }
      });

      // A credit sale whose remaining worth is now covered becomes paid.
      if (sale.status === "pending" && saleBalanceCents(db, id) === 0) {
        db.prepare("UPDATE sales SET status = 'paid' WHERE id = ?").run(id);
      }
      return { returnNo, refund };
    })();

    res.status(201).json({ ...getSale(id), lastReturn: { returnNo: result.returnNo, refund: fromCents(result.refund) } });
  });

  /** Record a (partial) payment against a credit sale. Fully paid sales flip to "paid". */
  r.post("/:id/payments", (req, res) => {
    const id = idParam(req);
    const body = paymentSchema.parse(req.body);
    const me = currentUser(req);
    db.transaction(() => {
      const sale = db.prepare("SELECT status FROM sales WHERE id = ?").get(id) as { status: string } | undefined;
      if (!sale) throw new HttpError(404, "Sale not found");
      if (sale.status !== "pending") throw new HttpError(400, `This sale is ${sale.status}; nothing is owed`);
      const balance = saleBalanceCents(db, id);
      const amount = toCents(body.amount);
      if (amount > balance) {
        throw new HttpError(400, `Payment is more than the balance of KSh ${fromCents(balance).toLocaleString()}`);
      }
      db.prepare("INSERT INTO payments (sale_id, amount_cents, method, reference, user_id) VALUES (?, ?, ?, ?, ?)").run(
        id,
        amount,
        body.method,
        body.reference,
        me.id,
      );
      if (amount === balance) db.prepare("UPDATE sales SET status = 'paid' WHERE id = ?").run(id);
    })();
    res.status(201).json(getSale(id));
  });

  return r;
}
