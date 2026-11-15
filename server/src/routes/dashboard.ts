import { Router } from "express";
import { fromCents, type DB } from "../db.js";
import { addDays, daysBetween, ymd } from "../dates.js";
import { SALE_SELECT, mapProduct, mapSale, type ProductRow, type SaleRow } from "../mappers.js";

const LOCAL_DATE = "date(s.created_at, 'localtime')";

export function dashboardRouter(db: DB) {
  const r = Router();

  r.get("/", (_req, res) => {
    const today = ymd(new Date());
    const monthStart = today.slice(0, 8) + "01";
    const lastMonthStart = ymd(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
    const lastMonthSameDay = addDays(lastMonthStart, Number(today.slice(8)) - 1);

    const revenue = (from: string, to: string) =>
      db
        .prepare(
          `SELECT COALESCE(SUM(total_cents), 0) AS cents, COUNT(*) AS orders FROM sales s
           WHERE s.status != 'cancelled' AND ${LOCAL_DATE} BETWEEN ? AND ?`,
        )
        .get(from, to) as { cents: number; orders: number };

    const thisMonth = revenue(monthStart, today);
    // Compare month-to-date against the same span of last month, not the full month.
    const lastMonth = revenue(lastMonthStart, lastMonthSameDay < monthStart ? lastMonthSameDay : addDays(monthStart, -1));
    const todayStats = revenue(today, today);

    const pending = db
      .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents FROM sales WHERE status = 'pending'")
      .get() as { n: number; cents: number };

    const inv = db
      .prepare(
        `SELECT COUNT(*) AS active,
           SUM(CASE WHEN stock > 0 AND stock <= reorder_level THEN 1 ELSE 0 END) AS low,
           SUM(CASE WHEN stock <= 0 THEN 1 ELSE 0 END) AS out
         FROM products WHERE archived = 0`,
      )
      .get() as { active: number; low: number | null; out: number | null };

    const customers = db
      .prepare(
        `SELECT SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
           SUM(CASE WHEN date(created_at, 'localtime') >= ? THEN 1 ELSE 0 END) AS new_this_month
         FROM customers`,
      )
      .get(monthStart) as { active: number | null; new_this_month: number | null };

    const weekStart = addDays(today, -6);
    const daily = db
      .prepare(
        `SELECT ${LOCAL_DATE} AS day, SUM(total_cents) AS cents, COUNT(*) AS orders FROM sales s
         WHERE s.status != 'cancelled' AND ${LOCAL_DATE} BETWEEN ? AND ? GROUP BY day`,
      )
      .all(weekStart, today) as { day: string; cents: number; orders: number }[];
    const byDay = new Map(daily.map((d) => [d.day, d]));

    const recentSales = (db.prepare(`${SALE_SELECT} ORDER BY s.id DESC LIMIT 6`).all() as SaleRow[]).map(mapSale);
    const lowStock = (
      db
        .prepare(
          `SELECT * FROM products WHERE archived = 0 AND stock <= reorder_level
           ORDER BY stock ASC, name LIMIT 8`,
        )
        .all() as ProductRow[]
    ).map(mapProduct);

    const pct = (now: number, before: number) => (before > 0 ? ((now - before) / before) * 100 : null);

    res.json({
      revenueThisMonth: fromCents(thisMonth.cents),
      revenueChangePct: pct(thisMonth.cents, lastMonth.cents),
      ordersThisMonth: thisMonth.orders,
      salesToday: todayStats.orders,
      revenueToday: fromCents(todayStats.cents),
      pendingCount: pending.n,
      pendingAmount: fromCents(pending.cents),
      activeProducts: inv.active,
      lowStockCount: inv.low ?? 0,
      outOfStockCount: inv.out ?? 0,
      activeCustomers: customers.active ?? 0,
      newCustomersThisMonth: customers.new_this_month ?? 0,
      last7Days: daysBetween(weekStart, today).map((day) => ({
        date: day,
        revenue: fromCents(byDay.get(day)?.cents ?? 0),
        orders: byDay.get(day)?.orders ?? 0,
      })),
      recentSales,
      lowStock,
    });
  });

  return r;
}
