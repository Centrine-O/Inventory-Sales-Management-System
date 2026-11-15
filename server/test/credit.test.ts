import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let admin: string;
let cashier: string;

const login = async (email: string, password: string) =>
  `Bearer ${(await request(app).post("/api/auth/login").send({ email, password })).body.token}`;
const as = (token: string) => ({
  get: (p: string) => request(app).get(`/api${p}`).set("Authorization", token),
  post: (p: string, body: object = {}) => request(app).post(`/api${p}`).set("Authorization", token).send(body),
  patch: (p: string, body: object) => request(app).patch(`/api${p}`).set("Authorization", token).send(body),
});

let productId: number;
let customerId: number;

beforeEach(async () => {
  db = openDb(":memory:");
  const add = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  add.run("Admin", "admin@test.local", bcrypt.hashSync("admin1234", 4), "admin");
  add.run("Cash", "cashier@test.local", bcrypt.hashSync("cashier1234", 4), "cashier");
  app = createApp(db);
  admin = await login("admin@test.local", "admin1234");
  cashier = await login("cashier@test.local", "cashier1234");
  productId = (await as(admin).post("/products", { name: "Chair", sku: "CH-1", price: 1000, cost: 600, stock: 50 })).body.id;
  customerId = (await as(admin).post("/customers", { name: "Wanjiku", phone: "0712" })).body.id;
});

const creditSale = (qty: number, extra: object = {}, token = cashier) =>
  as(token).post("/sales", { customerId, paymentMethod: "M-Pesa", status: "pending", items: [{ productId, quantity: qty }], ...extra });

describe("credit sales and payments", () => {
  it("records a full payment for paid sales", async () => {
    const s = (await as(cashier).post("/sales", { paymentMethod: "Cash", items: [{ productId, quantity: 2 }] })).body;
    expect(s).toMatchObject({ status: "paid", total: 2000, amountPaid: 2000, balance: 0 });
    expect(s.payments).toEqual([expect.objectContaining({ amount: 2000, method: "Cash", reference: "Paid at sale" })]);
  });

  it("requires a named customer for credit", async () => {
    const res = await as(cashier).post("/sales", { paymentMethod: "Cash", status: "pending", items: [{ productId, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/customer/i);
  });

  it("takes a deposit, then instalments, and flips to paid when settled", async () => {
    const s = (await creditSale(3, { amountPaid: 500 })).body;
    expect(s).toMatchObject({ status: "pending", total: 3000, amountPaid: 500, balance: 2500 });

    const p1 = await as(cashier).post(`/sales/${s.id}/payments`, { amount: 1000, method: "M-Pesa", reference: "QJK12AB" });
    expect(p1.status).toBe(201);
    expect(p1.body).toMatchObject({ status: "pending", amountPaid: 1500, balance: 1500 });

    expect((await as(cashier).post(`/sales/${s.id}/payments`, { amount: 1500.01, method: "Cash" })).status).toBe(400);
    expect((await as(cashier).post(`/sales/${s.id}/payments`, { amount: 0, method: "Cash" })).status).toBe(400);

    const p2 = await as(cashier).post(`/sales/${s.id}/payments`, { amount: 1500, method: "Cash" });
    expect(p2.body).toMatchObject({ status: "paid", balance: 0 });
    expect(p2.body.payments.map((p: { amount: number }) => p.amount)).toEqual([500, 1000, 1500]);
    expect((await as(cashier).post(`/sales/${s.id}/payments`, { amount: 1, method: "Cash" })).status).toBe(400);
  });

  it("treats a deposit covering the total as a paid sale", async () => {
    const s = (await creditSale(1, { amountPaid: 5000 })).body;
    expect(s).toMatchObject({ status: "paid", amountPaid: 1000, balance: 0 });
  });

  it("'mark as paid' settles the remaining balance in one payment", async () => {
    const s = (await creditSale(2, { amountPaid: 300 })).body;
    const paid = (await as(cashier).patch(`/sales/${s.id}/status`, { status: "paid" })).body;
    expect(paid).toMatchObject({ status: "paid", amountPaid: 2000, balance: 0 });
    expect(paid.payments.at(-1)).toMatchObject({ amount: 1700, reference: "Balance settled" });
  });

  it("enforces credit limits, counting existing balances", async () => {
    await as(admin).patch(`/customers/${customerId}`, { creditLimit: 2500 });
    expect((await creditSale(2)).status).toBe(201); // owes 2000
    const over = await creditSale(1); // would owe 3000
    expect(over.status).toBe(409);
    expect(over.body.error).toMatch(/credit limit/);
    expect((await creditSale(1, { amountPaid: 500 })).status).toBe(201); // owes 2500 exactly
  });

  it("only lets admins set credit limits", async () => {
    expect((await as(cashier).patch(`/customers/${customerId}`, { creditLimit: 9999 })).status).toBe(403);
    expect((await as(cashier).post("/customers", { name: "X", creditLimit: 100 })).status).toBe(403);
    expect((await as(cashier).patch(`/customers/${customerId}`, { phone: "0799" })).status).toBe(200);
  });

  it("customer partial update leaves other fields alone (regression)", async () => {
    await as(admin).patch(`/customers/${customerId}`, { email: "w@example.com" });
    const res = await as(admin).patch(`/customers/${customerId}`, { status: "inactive" });
    expect(res.body).toMatchObject({ status: "inactive", email: "w@example.com", phone: "0712" });
  });

  it("shows balances on customers, dashboard, reports and receivables", async () => {
    const s = (await creditSale(3, { amountPaid: 1000 })).body;
    await as(cashier).post("/sales", { paymentMethod: "Cash", items: [{ productId, quantity: 1 }] });

    const c = (await as(admin).get(`/customers/${customerId}`)).body;
    expect(c).toMatchObject({ balance: 2000, totalSpent: 3000 });
    expect(c.payments).toHaveLength(1);
    expect((await as(admin).get("/customers?withBalance=true")).body).toHaveLength(1);

    expect((await as(cashier).get("/dashboard")).body).toMatchObject({ pendingCount: 1, pendingAmount: 2000 });
    expect((await as(admin).get("/reports")).body.summary).toMatchObject({ revenue: 4000, collected: 2000, outstanding: 2000 });

    const rec = (await as(admin).get("/reports/receivables")).body;
    expect(rec.totals).toMatchObject({ current: 2000, total: 2000 });
    expect(rec.customers[0]).toMatchObject({ customerId, name: "Wanjiku", invoices: 1, total: 2000 });

    // Ageing: backdate the sale 45 days.
    db.prepare("UPDATE sales SET created_at = datetime('now', '-45 days') WHERE id = ?").run(s.id);
    expect((await as(admin).get("/reports/receivables")).body.totals).toMatchObject({ current: 0, days31to60: 2000 });
  });

  it("keeps reports admin-only at the API", async () => {
    expect((await as(cashier).get("/reports")).status).toBe(403);
    expect((await as(cashier).get("/reports/receivables")).status).toBe(403);
  });

  it("backfills payments for sales paid before the ledger existed, once", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stockflow-")), "old.db");
    const first = openDb(file);
    first.prepare("INSERT INTO users (name, email, password_hash, role) VALUES ('A', 'a@x', 'x', 'admin')").run();
    // A paid sale with no payment row, as an older version would have written it.
    first.prepare(
      "INSERT INTO sales (invoice_no, user_id, payment_method, status, subtotal_cents, total_cents) VALUES ('OLD-1', 1, 'Cash', 'paid', 5000, 5000)",
    ).run();
    first.prepare("DELETE FROM payments").run();
    first.close();

    for (let i = 0; i < 2; i++) openDb(file).close(); // startup migrations run twice
    const check = openDb(file);
    expect(check.prepare("SELECT amount_cents, method, reference FROM payments").all()).toEqual([
      { amount_cents: 5000, method: "Cash", reference: "Recorded at sale" },
    ]);
    check.close();
  });
});
