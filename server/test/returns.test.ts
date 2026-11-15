import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
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

let chair: number;
let lamp: number;
let customerId: number;

beforeEach(async () => {
  db = openDb(":memory:");
  const add = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  add.run("Admin", "admin@test.local", bcrypt.hashSync("admin1234", 4), "admin");
  add.run("Cash", "cashier@test.local", bcrypt.hashSync("cashier1234", 4), "cashier");
  app = createApp(db);
  admin = await login("admin@test.local", "admin1234");
  cashier = await login("cashier@test.local", "cashier1234");
  chair = (await as(admin).post("/products", { name: "Chair", sku: "CH", category: "Furniture", price: 1000, cost: 600, stock: 20 })).body.id;
  lamp = (await as(admin).post("/products", { name: "Lamp", sku: "LM", category: "Lighting", price: 100, cost: 40, stock: 20 })).body.id;
  customerId = (await as(admin).post("/customers", { name: "Achieng" })).body.id;
});

const sell = async (items: [number, number][], extra: object = {}) =>
  (await as(cashier).post("/sales", { paymentMethod: "Cash", items: items.map(([productId, quantity]) => ({ productId, quantity })), ...extra })).body;
const stockOf = async (id: number) => (await as(admin).get(`/products/${id}`)).body.stock;
const giveBack = (saleId: number, body: object) => as(admin).post(`/sales/${saleId}/returns`, body);

describe("returns", () => {
  it("returns part of a paid sale: restocks, refunds, and nets the sale down", async () => {
    const sale = await sell([[chair, 3]]);
    expect(await stockOf(chair)).toBe(17);

    const noMethod = await giveBack(sale.id, { reason: "Wrong colour", items: [{ saleItemId: sale.items[0].id, quantity: 1 }] });
    expect(noMethod.status).toBe(400);
    expect(noMethod.body.error).toMatch(/refund of KSh 1,000 is due/);

    const res = await giveBack(sale.id, {
      reason: "Wrong colour",
      refundMethod: "M-Pesa",
      refundReference: "QAB123",
      items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.lastReturn).toEqual({ returnNo: "RET-00001", refund: 1000 });
    expect(res.body).toMatchObject({ status: "paid", total: 3000, returnedValue: 1000, netTotal: 2000, refunded: 1000, amountPaid: 2000, balance: 0 });
    expect(res.body.items[0].returnedQuantity).toBe(1);
    expect(res.body.returns[0]).toMatchObject({ returnNo: "RET-00001", value: 1000, refund: 1000, refundMethod: "M-Pesa", reason: "Wrong colour" });
    expect(await stockOf(chair)).toBe(18);
    const mv = (await as(admin).get(`/products/${chair}`)).body.movements[0];
    expect(mv).toMatchObject({ change: 1, reason: "return", reference: `RET-00001 · ${sale.invoiceNo}` });
  });

  it("values returns at the discounted price", async () => {
    const sale = await sell([[lamp, 2]], { discount: 20 }); // 200 - 20 = 180
    const res = await giveBack(sale.id, { reason: "x", refundMethod: "Cash", items: [{ saleItemId: sale.items[0].id, quantity: 1 }] });
    expect(res.body.lastReturn.refund).toBe(90);
  });

  it("never returns more than was sold, across several returns", async () => {
    const sale = await sell([[lamp, 3]]);
    const line = sale.items[0].id;
    expect((await giveBack(sale.id, { reason: "x", refundMethod: "Cash", items: [{ saleItemId: line, quantity: 4 }] })).status).toBe(400);
    expect((await giveBack(sale.id, { reason: "x", refundMethod: "Cash", items: [{ saleItemId: line, quantity: 2 }] })).status).toBe(201);
    const over = await giveBack(sale.id, { reason: "x", refundMethod: "Cash", items: [{ saleItemId: line, quantity: 2 }] });
    expect(over.status).toBe(400);
    expect(over.body.error).toMatch(/Only 1 of Lamp/);
  });

  it("on a credit sale, reduces what's owed first and refunds only overpayment", async () => {
    const sale = await sell([[chair, 3]], { customerId, status: "pending", amountPaid: 500 });
    expect(sale.balance).toBe(2500);

    const r1 = (await giveBack(sale.id, { reason: "x", items: [{ saleItemId: sale.items[0].id, quantity: 1 }] })).body;
    expect(r1).toMatchObject({ status: "pending", netTotal: 2000, balance: 1500, refunded: 0 });
    expect(r1.lastReturn.refund).toBe(0);
    expect((await as(admin).get(`/customers/${customerId}`)).body.balance).toBe(1500);

    const r2 = await giveBack(sale.id, { reason: "x", items: [{ saleItemId: sale.items[0].id, quantity: 2 }] });
    expect(r2.status).toBe(400); // KSh 500 deposit must go back
    const r3 = (await giveBack(sale.id, { reason: "x", refundMethod: "Cash", items: [{ saleItemId: sale.items[0].id, quantity: 2 }] })).body;
    expect(r3).toMatchObject({ status: "paid", netTotal: 0, balance: 0, refunded: 500, amountPaid: 0 });
  });

  it("marks a credit sale paid when a return brings it down to what was paid", async () => {
    const sale = await sell([[chair, 3]], { customerId, status: "pending", amountPaid: 2000 });
    const res = (await giveBack(sale.id, { reason: "x", items: [{ saleItemId: sale.items[0].id, quantity: 1 }] })).body;
    expect(res).toMatchObject({ status: "paid", balance: 0, refunded: 0 });
  });

  it("writes off damaged items without restocking", async () => {
    const sale = await sell([[lamp, 2]]);
    await giveBack(sale.id, { reason: "Broken in box", refundMethod: "Cash", items: [{ saleItemId: sale.items[0].id, quantity: 1, restock: false }] });
    expect(await stockOf(lamp)).toBe(18);
    const rep = (await as(admin).get("/reports")).body.summary;
    // Revenue 200 - 100 = 100; cost stays 2 x 40 because the damaged lamp isn't back in stock.
    expect(rep).toMatchObject({ grossSales: 200, returns: 100, revenue: 100, grossProfit: 20, returnsCount: 1, refunds: 100 });
  });

  it("restocked returns take their cost back out of gross profit", async () => {
    const sale = await sell([[lamp, 2]]);
    await giveBack(sale.id, { reason: "x", refundMethod: "Cash", items: [{ saleItemId: sale.items[0].id, quantity: 1 }] });
    const r = (await as(admin).get("/reports")).body;
    expect(r.summary).toMatchObject({ revenue: 100, grossProfit: 60 });
    expect(r.byCategory.find((c: { name: string }) => c.name === "Lighting")).toMatchObject({ units: 1, revenue: 100 });
    expect(r.topProducts[0]).toMatchObject({ units: 1, revenue: 100 });
    expect((await as(cashier).get("/dashboard")).body.revenueToday).toBe(100);
  });

  it("refunds exactly what was paid when everything comes back, despite rounding", async () => {
    const sale = await sell([[lamp, 3], [chair, 1]], { discount: 33.33 }); // awkward proration
    const res = (
      await giveBack(sale.id, {
        reason: "Changed mind",
        refundMethod: "Cash",
        items: sale.items.map((i: { id: number; quantity: number }) => ({ saleItemId: i.id, quantity: i.quantity })),
      })
    ).body;
    expect(res.lastReturn.refund).toBe(sale.total);
    expect(res).toMatchObject({ netTotal: 0, amountPaid: 0, balance: 0 });
    const lines = res.returns[0].items.reduce((s: number, l: { value: number }) => s + l.value, 0);
    expect(Math.round(lines * 100)).toBe(Math.round(sale.total * 100));
  });

  it("blocks cancelling a sale that has returns, and returns on cancelled sales", async () => {
    const sale = await sell([[lamp, 2]]);
    await giveBack(sale.id, { reason: "x", refundMethod: "Cash", items: [{ saleItemId: sale.items[0].id, quantity: 1 }] });
    expect((await as(admin).patch(`/sales/${sale.id}/status`, { status: "cancelled" })).status).toBe(400);

    const other = await sell([[lamp, 1]]);
    await as(admin).patch(`/sales/${other.id}/status`, { status: "cancelled" });
    expect((await giveBack(other.id, { reason: "x", items: [{ saleItemId: other.items[0].id, quantity: 1 }] })).status).toBe(400);
  });

  it("is admin only, requires a reason, and lists returns", async () => {
    const sale = await sell([[lamp, 1]]);
    const body = { reason: "x", refundMethod: "Cash", items: [{ saleItemId: sale.items[0].id, quantity: 1 }] };
    expect((await as(cashier).post(`/sales/${sale.id}/returns`, body)).status).toBe(403);
    expect((await giveBack(sale.id, { ...body, reason: "" })).status).toBe(400);
    await giveBack(sale.id, body);
    const list = (await as(cashier).get("/returns")).body;
    expect(list).toEqual([expect.objectContaining({ returnNo: "RET-00001", invoiceNo: sale.invoiceNo, value: 100, units: 1, damagedUnits: 0 })]);
  });
});

describe("migration", () => {
  it("rebuilds stock_movements to allow returns, keeping existing rows", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stockflow-")), "old.db");
    const old = new Database(file);
    old.exec(`CREATE TABLE stock_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, change INTEGER NOT NULL,
        reason TEXT NOT NULL CHECK (reason IN ('initial', 'sale', 'restock', 'adjustment', 'sale_cancelled')),
        reference TEXT NOT NULL DEFAULT '', user_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO stock_movements (product_id, change, reason) VALUES (1, 5, 'initial'), (1, -2, 'sale');`);
    old.close();

    const db2 = openDb(file);
    expect(db2.prepare("SELECT change, reason FROM stock_movements ORDER BY id").all()).toEqual([
      { change: 5, reason: "initial" },
      { change: -2, reason: "sale" },
    ]);
    const sql = (db2.prepare("SELECT sql FROM sqlite_master WHERE name = 'stock_movements'").get() as { sql: string }).sql;
    expect(sql).toContain("'return'");
    db2.close();
    expect(() => openDb(file).close()).not.toThrow();
  });
});
