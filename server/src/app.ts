import express, { Router } from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type { DB } from "./db.js";
import { errorHandler, HttpError, requireAuth, requireRole } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { productsRouter } from "./routes/products.js";
import { customersRouter } from "./routes/customers.js";
import { salesRouter } from "./routes/sales.js";
import { settingsRouter } from "./routes/settings.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { reportsRouter } from "./routes/reports.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { purchaseOrdersRouter } from "./routes/purchaseOrders.js";

function searchRouter(db: DB) {
  const r = Router();
  r.get("/", (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ products: [], customers: [], sales: [] });
      return;
    }
    const like = `%${q}%`;
    res.json({
      products: db
        .prepare("SELECT id, name, sku FROM products WHERE archived = 0 AND (name LIKE ? OR sku LIKE ?) LIMIT 5")
        .all(like, like),
      customers: db
        .prepare("SELECT id, name, email, phone FROM customers WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? LIMIT 5")
        .all(like, like, like),
      sales: db
        .prepare(
          `SELECT s.id, s.invoice_no AS invoiceNo, COALESCE(c.name, 'Walk-in customer') AS customerName
           FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
           WHERE s.invoice_no LIKE ? OR c.name LIKE ? ORDER BY s.id DESC LIMIT 5`,
        )
        .all(like, like),
    });
  });
  return r;
}

export function createApp(db: DB, opts: { staticDir?: string } = {}) {
  const app = express();
  app.disable("x-powered-by");
  if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(",") }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  app.use("/api/auth", authRouter(db));

  const api = Router();
  api.use(requireAuth);
  api.use("/users", usersRouter(db));
  api.use("/products", productsRouter(db));
  api.use("/customers", customersRouter(db));
  api.use("/sales", salesRouter(db));
  api.use("/settings", settingsRouter(db));
  api.use("/dashboard", dashboardRouter(db));
  api.use("/reports", reportsRouter(db));
  api.use("/search", searchRouter(db));
  api.use("/suppliers", requireRole("admin"), suppliersRouter(db));
  api.use("/purchase-orders", requireRole("admin"), purchaseOrdersRouter(db));
  app.use("/api", api);

  app.use("/api", () => {
    throw new HttpError(404, "Not found");
  });

  // In production, serve the built frontend and let the SPA handle client routes.
  if (opts.staticDir && fs.existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(opts.staticDir!, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}
