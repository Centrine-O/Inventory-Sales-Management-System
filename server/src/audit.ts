
import type { Request } from "express";
import type { DB } from "./db.js";
import type { AuthUser } from "./http.js";

export const AUDIT_ENTITIES = [
  "auth",
  "user",
  "product",
  "customer",
  "sale",
  "supplier",
  "purchase_order",
  "expense",
  "shift",
  "settings",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/** A field that changed: [before, after]. */
export type Changes = Record<string, [unknown, unknown]>;

export interface AuditEntry {
  action: string;
  entity: AuditEntity;
  entityId?: number | null;
  summary: string;
  details?: Record<string, unknown>;
  /** Defaults to the signed-in user; set explicitly where there is none (e.g. a failed login). */
  actor?: Pick<AuthUser, "id" | "name"> | null;
}

/** Record an event. Call inside the same transaction as the change so the two can't disagree. */
export function audit(db: DB, req: Request | null, e: AuditEntry) {
  const actor = e.actor !== undefined ? e.actor : (req?.user ?? null);
  const details = e.details && Object.keys(e.details).length ? JSON.stringify(e.details) : null;
  db.prepare(
    `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, summary, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(actor?.id ?? null, actor?.name ?? "", e.action, e.entity, e.entityId ?? null, e.summary, details, (req?.ip ?? "").replace(/^::ffff:/, ""));
}

/** Fields whose value differs between two plain objects, using display-ready values. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Changes {
  const out: Changes = {};
  for (const key of Object.keys(after)) {
    if (after[key] === undefined) continue;
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) out[key] = [before[key] ?? null, after[key] ?? null];
  }
  return out;
}

const LABELS: Record<string, string> = {
  price: "price",
  cost: "cost",
  reorderLevel: "reorder level",
  supplierId: "supplier",
  creditLimit: "credit limit",
  contactName: "contact",
  paymentMethod: "payment method",
  taxRate: "VAT rate",
  businessName: "business name",
  lowStockAlerts: "low stock alerts",
  dailySummary: "daily summary",
  largeTransactionReview: "large transaction review",
  largeTransactionThreshold: "large transaction threshold",
  requireShiftForSales: "require open till",
};
const MONEY = new Set(["price", "cost", "creditLimit", "amount", "largeTransactionThreshold"]);

const show = (key: string, v: unknown) => {
  if (v === null || v === "") return "none";
  if (typeof v === "boolean") return v ? "on" : "off";
  if (MONEY.has(key) && typeof v === "number") return `KSh ${v.toLocaleString("en-KE")}`;
  return String(v);
};

/** "price KSh 1,000 → KSh 1,200, name A → B" */
export function describeChanges(changes: Changes, skip: string[] = []) {
  return Object.entries(changes)
    .filter(([k]) => !skip.includes(k))
    .map(([k, [a, b]]) => `${LABELS[k] ?? k} ${show(k, a)} → ${show(k, b)}`)
    .join(", ");
}
