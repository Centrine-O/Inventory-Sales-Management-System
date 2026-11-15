import { Router } from "express";
import { z } from "zod";
import { fromCents, type DB } from "../db.js";
import { iso } from "../mappers.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const listSchema = z.object({ search: z.string().trim().optional(), from: dateStr.optional(), to: dateStr.optional() });

export function returnsRouter(db: DB) {
  const r = Router();

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const where: string[] = [];
    const params: unknown[] = [];
    if (q.search) {
      where.push("(r.return_no LIKE ? OR s.invoice_no LIKE ? OR c.name LIKE ?)");
      params.push(`%${q.search}%`, `%${q.search}%`, `%${q.search}%`);
    }
    if (q.from) {
      where.push("date(r.created_at, 'localtime') >= ?");
      params.push(q.from);
    }
    if (q.to) {
      where.push("date(r.created_at, 'localtime') <= ?");
      params.push(q.to);
    }
    const rows = db
      .prepare(
        `SELECT r.*, s.invoice_no, COALESCE(c.name, 'Walk-in customer') AS customer_name, u.name AS user_name,
           (SELECT SUM(quantity) FROM return_items WHERE return_id = r.id) AS units,
           (SELECT SUM(quantity) FROM return_items WHERE return_id = r.id AND restocked = 0) AS damaged_units
         FROM returns r
         JOIN sales s ON s.id = r.sale_id
         LEFT JOIN customers c ON c.id = s.customer_id
         LEFT JOIN users u ON u.id = r.user_id
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY r.id DESC LIMIT 500`,
      )
      .all(...params) as {
      id: number;
      return_no: string;
      sale_id: number;
      invoice_no: string;
      customer_name: string;
      reason: string;
      value_cents: number;
      refund_cents: number;
      refund_method: string | null;
      user_name: string | null;
      units: number;
      damaged_units: number | null;
      created_at: string;
    }[];
    res.json(
      rows.map((x) => ({
        id: x.id,
        returnNo: x.return_no,
        saleId: x.sale_id,
        invoiceNo: x.invoice_no,
        customerName: x.customer_name,
        reason: x.reason,
        value: fromCents(x.value_cents),
        refund: fromCents(x.refund_cents),
        refundMethod: x.refund_method,
        units: x.units,
        damagedUnits: x.damaged_units ?? 0,
        processedBy: x.user_name ?? "",
        createdAt: iso(x.created_at),
      })),
    );
  });

  return r;
}
