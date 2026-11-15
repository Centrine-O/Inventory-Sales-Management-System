import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { openDb, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let admin: string;
let cashier: string;

async function login(email: string, password: string) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return `Bearer ${res.body.token}`;
}

async function makeProduct(overrides: Record<string, unknown> = {}) {
  const res = await request(app)
    .post("/api/products")
    .set("Authorization", admin)
    .send({ name: "Widget", sku: `W-${Math.random()}`, category: "Tools", price: 100, cost: 60, stock: 10, reorderLevel: 2, ...overrides });
  expect(res.status).toBe(201);
  return res.body;
}

beforeEach(async () => {
  db = openDb(":memory:");
  const add = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  add.run("Admin", "admin@test.local", bcrypt.hashSync("admin1234", 4), "admin");
  add.run("Cash", "cashier@test.local", bcrypt.hashSync("cashier1234", 4), "cashier");
  app = createApp(db);
  admin = await login("admin@test.local", "admin1234");
  cashier = await login("cashier@test.local", "cashier1234");
});

describe("auth", () => {
  it("rejects bad credentials and unauthenticated requests", async () => {
    expect((await request(app).post("/api/auth/login").send({ email: "admin@test.local", password: "nope" })).status).toBe(401);
    expect((await request(app).get("/api/products")).status).toBe(401);
    expect((await request(app).get("/api/products").set("Authorization", "Bearer garbage")).status).toBe(401);
  });

  it("returns the current user", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", cashier);
    expect(res.body.user).toMatchObject({ email: "cashier@test.local", role: "cashier" });
  });

  it("blocks deactivated users", async () => {
    const users = (await request(app).get("/api/users").set("Authorization", admin)).body;
    const c = users.find((u: { role: string }) => u.role === "cashier");
    await request(app).patch(`/api/users/${c.id}`).set("Authorization", admin).send({ active: false });
    expect((await request(app).get("/api/auth/me").set("Authorization", cashier)).status).toBe(401);
    expect((await request(app).post("/api/auth/login").send({ email: "cashier@test.local", password: "cashier1234" })).status).toBe(403);
  });

  it("keeps at least one active admin", async () => {
    const users = (await request(app).get("/api/users").set("Authorization", admin)).body;
    const a = users.find((u: { role: string }) => u.role === "admin");
    const res = await request(app).patch(`/api/users/${a.id}`).set("Authorization", admin).send({ role: "cashier" });
    expect(res.status).toBe(400);
  });
});

describe("roles", () => {
  it("prevents cashiers from managing products, users and settings", async () => {
    expect((await request(app).post("/api/products").set("Authorization", cashier).send({ name: "x", sku: "x", price: 1 })).status).toBe(403);
    expect((await request(app).get("/api/users").set("Authorization", cashier)).status).toBe(403);
    expect((await request(app).put("/api/settings").set("Authorization", cashier).send({ taxRate: 0 })).status).toBe(403);
  });

  it("lets cashiers read products and add customers", async () => {
    expect((await request(app).get("/api/products").set("Authorization", cashier)).status).toBe(200);
    expect((await request(app).post("/api/customers").set("Authorization", cashier).send({ name: "Walk In" })).status).toBe(201);
  });
});

describe("products", () => {
  it("derives stock status and filters by it", async () => {
    await makeProduct({ sku: "A", stock: 10, reorderLevel: 2 });
    await makeProduct({ sku: "B", stock: 2, reorderLevel: 2 });
    await makeProduct({ sku: "C", stock: 0 });
    const all = (await request(app).get("/api/products").set("Authorization", admin)).body;
    expect(all.map((p: { sku: string; status: string }) => [p.sku, p.status]).sort()).toEqual([
      ["A", "in_stock"],
      ["B", "low_stock"],
      ["C", "out_of_stock"],
    ]);
    const low = (await request(app).get("/api/products?status=low_stock").set("Authorization", admin)).body;
    expect(low).toHaveLength(1);
  });

  it("rejects duplicate SKUs", async () => {
    await makeProduct({ sku: "DUP" });
    const res = await request(app).post("/api/products").set("Authorization", admin).send({ name: "x", sku: "dup", price: 1 });
    expect(res.status).toBe(409);
  });

  it("adjusts stock but never below zero", async () => {
    const p = await makeProduct({ stock: 5 });
    const ok = await request(app).post(`/api/products/${p.id}/stock`).set("Authorization", admin).send({ change: 7, reason: "restock" });
    expect(ok.body.stock).toBe(12);
    const bad = await request(app).post(`/api/products/${p.id}/stock`).set("Authorization", admin).send({ change: -13, reason: "adjustment" });
    expect(bad.status).toBe(400);
  });

  it("archives products with sales history instead of deleting them", async () => {
    const used = await makeProduct();
    const unused = await makeProduct();
    await request(app).post("/api/sales").set("Authorization", cashier).send({ paymentMethod: "Cash", items: [{ productId: used.id, quantity: 1 }] });
    expect((await request(app).delete(`/api/products/${used.id}`).set("Authorization", admin)).body).toEqual({ archived: true });
    expect((await request(app).delete(`/api/products/${unused.id}`).set("Authorization", admin)).body).toEqual({ archived: false });
    const list = (await request(app).get("/api/products").set("Authorization", admin)).body;
    expect(list).toHaveLength(0);
  });
});

describe("sales", () => {
  it("creates a sale, deducts stock, computes VAT-inclusive totals", async () => {
    const p = await makeProduct({ price: 116, stock: 10 });
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", cashier)
      .send({ paymentMethod: "M-Pesa", items: [{ productId: p.id, quantity: 2 }, { productId: p.id, quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ invoiceNo: "INV-00001", subtotal: 348, total: 348, tax: 48, status: "paid", itemCount: 3 });
    const after = (await request(app).get(`/api/products/${p.id}`).set("Authorization", admin)).body;
    expect(after.stock).toBe(7);
    expect(after.movements[0]).toMatchObject({ change: -3, reason: "sale", reference: "INV-00001" });
  });

  it("refuses to oversell, including across duplicate lines, and leaves stock untouched", async () => {
    const p = await makeProduct({ stock: 3 });
    const res = await request(app)
      .post("/api/sales")
      .set("Authorization", cashier)
      .send({ paymentMethod: "Cash", items: [{ productId: p.id, quantity: 2 }, { productId: p.id, quantity: 2 }] });
    expect(res.status).toBe(409);
    expect((await request(app).get(`/api/products/${p.id}`).set("Authorization", admin)).body.stock).toBe(3);
    expect((await request(app).get("/api/sales").set("Authorization", admin)).body).toHaveLength(0);
  });

  it("applies discounts and rejects discounts above the subtotal", async () => {
    const p = await makeProduct({ price: 100 });
    const ok = await request(app).post("/api/sales").set("Authorization", cashier).send({ paymentMethod: "Cash", discount: 20, items: [{ productId: p.id, quantity: 1 }] });
    expect(ok.body.total).toBe(80);
    const bad = await request(app).post("/api/sales").set("Authorization", cashier).send({ paymentMethod: "Cash", discount: 500, items: [{ productId: p.id, quantity: 1 }] });
    expect(bad.status).toBe(400);
  });

  it("marks pending sales paid; only admins cancel, and cancelling restores stock once", async () => {
    const p = await makeProduct({ stock: 5 });
    const sale = (await request(app).post("/api/sales").set("Authorization", cashier).send({ paymentMethod: "Card", status: "pending", items: [{ productId: p.id, quantity: 2 }] })).body;
    expect((await request(app).patch(`/api/sales/${sale.id}/status`).set("Authorization", cashier).send({ status: "cancelled" })).status).toBe(403);
    const cancelled = await request(app).patch(`/api/sales/${sale.id}/status`).set("Authorization", admin).send({ status: "cancelled" });
    expect(cancelled.body.status).toBe("cancelled");
    expect((await request(app).patch(`/api/sales/${sale.id}/status`).set("Authorization", admin).send({ status: "cancelled" })).status).toBe(400);
    expect((await request(app).get(`/api/products/${p.id}`).set("Authorization", admin)).body.stock).toBe(5);

    const sale2 = (await request(app).post("/api/sales").set("Authorization", cashier).send({ paymentMethod: "Card", status: "pending", items: [{ productId: p.id, quantity: 1 }] })).body;
    const paid = await request(app).patch(`/api/sales/${sale2.id}/status`).set("Authorization", cashier).send({ status: "paid" });
    expect(paid.body.status).toBe("paid");
  });

  it("exports CSV with formula-injection protection", async () => {
    const c = (await request(app).post("/api/customers").set("Authorization", admin).send({ name: "=HYPERLINK(evil)" })).body;
    const p = await makeProduct();
    await request(app).post("/api/sales").set("Authorization", cashier).send({ customerId: c.id, paymentMethod: "Cash", items: [{ productId: p.id, quantity: 1 }] });
    const res = await request(app).get("/api/sales/export.csv").set("Authorization", admin);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("'=HYPERLINK(evil)");
  });
});

describe("customers", () => {
  it("aggregates orders and spend excluding cancelled sales, and blocks deleting customers with history", async () => {
    const c = (await request(app).post("/api/customers").set("Authorization", admin).send({ name: "Jane", email: "jane@example.com" })).body;
    const p = await makeProduct({ price: 50 });
    await request(app).post("/api/sales").set("Authorization", cashier).send({ customerId: c.id, paymentMethod: "Cash", items: [{ productId: p.id, quantity: 2 }] });
    const s2 = (await request(app).post("/api/sales").set("Authorization", cashier).send({ customerId: c.id, paymentMethod: "Cash", items: [{ productId: p.id, quantity: 1 }] })).body;
    await request(app).patch(`/api/sales/${s2.id}/status`).set("Authorization", admin).send({ status: "cancelled" });

    const got = (await request(app).get(`/api/customers/${c.id}`).set("Authorization", admin)).body;
    expect(got).toMatchObject({ totalOrders: 1, totalSpent: 100 });
    expect(got.sales).toHaveLength(2);
    expect((await request(app).delete(`/api/customers/${c.id}`).set("Authorization", admin)).status).toBe(409);
  });

  it("validates email format", async () => {
    const res = await request(app).post("/api/customers").set("Authorization", admin).send({ name: "X", email: "not-an-email" });
    expect(res.status).toBe(400);
  });
});

describe("dashboard and reports", () => {
  it("summarises today's activity", async () => {
    const p = await makeProduct({ price: 200, cost: 120, stock: 3, reorderLevel: 5 });
    await request(app).post("/api/sales").set("Authorization", cashier).send({ paymentMethod: "Cash", items: [{ productId: p.id, quantity: 1 }] });
    const d = (await request(app).get("/api/dashboard").set("Authorization", cashier)).body;
    expect(d).toMatchObject({ salesToday: 1, revenueToday: 200, revenueThisMonth: 200, lowStockCount: 1 });
    expect(d.last7Days).toHaveLength(7);
    expect(d.last7Days[6].revenue).toBe(200);

    const r = (await request(app).get("/api/reports").set("Authorization", admin)).body;
    expect(r.summary).toMatchObject({ revenue: 200, orders: 1, grossProfit: 80 });
    expect(r.daily).toHaveLength(30);
    expect(r.byCategory[0]).toMatchObject({ name: "Tools", units: 1, revenue: 200 });
  });

  it("validates report ranges", async () => {
    expect((await request(app).get("/api/reports?from=2025-02-01&to=2025-01-01").set("Authorization", admin)).status).toBe(400);
    expect((await request(app).get("/api/reports?from=bad").set("Authorization", admin)).status).toBe(400);
  });
});

describe("settings", () => {
  it("updates settings and uses the tax rate for new sales", async () => {
    const res = await request(app).put("/api/settings").set("Authorization", admin).send({ taxRate: 0, businessName: "Shop" });
    expect(res.body).toMatchObject({ taxRate: 0, businessName: "Shop" });
    const p = await makeProduct({ price: 100 });
    const sale = (await request(app).post("/api/sales").set("Authorization", cashier).send({ paymentMethod: "Cash", items: [{ productId: p.id, quantity: 1 }] })).body;
    expect(sale.tax).toBe(0);
    expect((await request(app).put("/api/settings").set("Authorization", admin).send({ unknownKey: 1 })).status).toBe(400);
  });
});
