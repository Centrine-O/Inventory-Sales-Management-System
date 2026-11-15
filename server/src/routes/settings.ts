import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { requireRole } from "../http.js";

const settingsSchema = z
  .object({
    businessName: z.string().trim().min(1).max(200),
    email: z.union([z.string().trim().email(), z.literal("")]),
    phone: z.string().trim().max(40),
    address: z.string().trim().max(300),
    currency: z.string().trim().min(1).max(10),
    taxRate: z.coerce.number().min(0).max(100),
    lowStockAlerts: z.boolean(),
    dailySummary: z.boolean(),
    largeTransactionReview: z.boolean(),
    largeTransactionThreshold: z.coerce.number().min(0),
  })
  .partial()
  .strict();

export function getSettings(db: DB): Record<string, unknown> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)]));
}

export function settingsRouter(db: DB) {
  const r = Router();

  r.get("/", (_req, res) => {
    res.json(getSettings(db));
  });

  r.put("/", requireRole("admin"), (req, res) => {
    const body = settingsSchema.parse(req.body);
    const upsert = db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    db.transaction(() => {
      for (const [k, v] of Object.entries(body)) upsert.run(k, JSON.stringify(v));
    })();
    res.json(getSettings(db));
  });

  return r;
}
