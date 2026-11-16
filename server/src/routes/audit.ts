import { Router } from "express";
import { z } from "zod";
import type { DB } from "../db.js";
import { AUDIT_ENTITIES } from "../audit.js";
import { iso, toCsv } from "../mappers.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");
const filterSchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  userId: z.coerce.number().int().positive().optional(),
  entity: z.enum(AUDIT_ENTITIES).optional(),
  entityId: z.coerce.number().int().positive().optional(),
  action: z.string().trim().max(50).optional(),
  search: z.string().trim().max(100).optional(),
  attention: z.enum(["true", "false"]).optional(),
});
const listSchema = filterSchema.extend({
  /** Keyset pagination: return entries older than this id. */
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(500).default(100),
});

/**
 * Events an owner should look at: failed sign-ins, discounts, refunds, cancellations, price and permission
 * changes, manual stock corrections and tills that didn't balance. Defined once, in SQL, so the filter,
 * the row highlight and the counts always agree.
 */
const ATTENTION_SQL = `(
  action IN ('login_failed', 'login_blocked', 'discount_given', 'return_processed', 'price_changed',
             'role_changed', 'deactivated', 'password_reset', 'credit_limit_changed', 'deleted')
  OR (entity = 'sale' AND action = 'cancelled')
  OR (action = 'stock_adjusted' AND json_extract(details, '$.reason') = 'adjustment')
  OR (entity = 'shift' AND action = 'closed' AND json_extract(details, '$.variance') != 0)
)`;
const SELECT = `SELECT *, ${ATTENTION_SQL} AS attention FROM audit_log`;

interface AuditRow {
  id: number;
  created_at: string;
  user_id: number | null;
  user_name: string;
  action: string;
  entity: string;
  entity_id: number | null;
  summary: string;
  details: string | null;
  ip: string;
  attention: number;
}

const mapEntry = (r: AuditRow) => ({
  id: r.id,
  createdAt: iso(r.created_at),
  userId: r.user_id,
  userName: r.user_name,
  action: r.action,
  entity: r.entity,
  entityId: r.entity_id,
  summary: r.summary,
  details: r.details ? (JSON.parse(r.details) as Record<string, unknown>) : null,
  ip: r.ip,
  attention: r.attention === 1,
});

function buildFilter(q: z.infer<typeof filterSchema>) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.from) {
    where.push("date(created_at, 'localtime') >= ?");
    params.push(q.from);
  }
  if (q.to) {
    where.push("date(created_at, 'localtime') <= ?");
    params.push(q.to);
  }
  if (q.userId) {
    where.push("user_id = ?");
    params.push(q.userId);
  }
  if (q.entity) {
    where.push("entity = ?");
    params.push(q.entity);
  }
  if (q.entityId) {
    where.push("entity_id = ?");
    params.push(q.entityId);
  }
  if (q.action) {
    where.push("action = ?");
    params.push(q.action);
  }
  if (q.search) {
    where.push("(summary LIKE ? OR user_name LIKE ?)");
    params.push(`%${q.search}%`, `%${q.search}%`);
  }
  if (q.attention === "true") where.push(ATTENTION_SQL);
  return { where, params };
}

/** Admin-only, read-only view of the audit trail. There are deliberately no write endpoints. */
export function auditRouter(db: DB) {
  const r = Router();

  r.get("/", (req, res) => {
    const q = listSchema.parse(req.query);
    const { where, params } = buildFilter(q);
    if (q.before) {
      where.push("id < ?");
      params.push(q.before);
    }
    // Fetch one extra row to know whether there is another page.
    const rows = db
      .prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`)
      .all(...params, q.limit + 1) as AuditRow[];
    const hasMore = rows.length > q.limit;
    const entries = rows.slice(0, q.limit).map(mapEntry);
    res.json({ entries, nextBefore: hasMore ? entries[entries.length - 1].id : null });
  });

  /** Headline counts for the filtered period. */
  r.get("/summary", (req, res) => {
    const { where, params } = buildFilter(filterSchema.parse(req.query));
    const row = db
      .prepare(
        `SELECT COUNT(*) AS total,
           COALESCE(SUM(${ATTENTION_SQL}), 0) AS attention,
           COALESCE(SUM(action = 'login_failed'), 0) AS failed_logins,
           COUNT(DISTINCT user_id) AS people
         FROM audit_log ${where.length ? "WHERE " + where.join(" AND ") : ""}`,
      )
      .get(...params) as { total: number; attention: number; failed_logins: number; people: number };
    res.json({ total: row.total, attention: row.attention, failedLogins: row.failed_logins, people: row.people });
  });

  /** Values to offer in the filters. */
  r.get("/facets", (_req, res) => {
    const actions = db.prepare("SELECT entity, action, COUNT(*) AS n FROM audit_log GROUP BY entity, action ORDER BY entity, action").all() as {
      entity: string;
      action: string;
      n: number;
    }[];
    const users = db
      .prepare(
        `SELECT DISTINCT a.user_id AS id, COALESCE(u.name, a.user_name) AS name
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.user_id IS NOT NULL ORDER BY name`,
      )
      .all() as { id: number; name: string }[];
    res.json({ actions, users });
  });

  r.get("/export.csv", (req, res) => {
    const q = filterSchema.parse(req.query);
    const { where, params } = buildFilter(q);
    const rows = db
      .prepare(`${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id DESC LIMIT 100000`)
      .all(...params) as AuditRow[];
    const csv = toCsv(
      ["Time", "User", "Area", "Action", "Record", "Summary", "Needs attention", "IP"],
      rows.map((row) => [iso(row.created_at), row.user_name, row.entity, row.action, row.entity_id ?? "", row.summary, row.attention ? "yes" : "", row.ip]),
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="audit-log.csv"');
    res.send(csv);
  });

  return r;
}
