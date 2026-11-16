import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { openDb, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let admin: string;
let cashier: string;
let cashier2: string;

const login = async (email: string, password: string) =>
  `Bearer ${(await request(app).post("/api/auth/login").send({ email, password })).body.token}`;
const as = (token: string) => ({
  get: (p: string) => request(app).get(`/api${p}`).set("Authorization", token),
  post: (p: string, body: object = {}) => request(app).post(`/api${p}`).set("Authorization", token).send(body),
  put: (p: string, body: object) => request(app).put(`/api${p}`).set("Authorization", token).send(body),
  patch: (p: string, body: object) => request(app).patch(`/api${p}`).set("Authorization", token).send(body),
});

let lamp: number;
let customerId: number;

beforeEach(async () => {
  db = openDb(":memory:");
  const add = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  add.run("Admin", "admin@test.local", bcrypt.hashSync("admin1234", 4), "admin");
  add.run("Cash One", "c1@test.local", bcrypt.hashSync("cashier1234", 4), "cashier");
  add.run("Cash Two", "c2@test.local", bcrypt.hashSync("cashier1234", 4), "cashier");
  app = createApp(db);
  admin = await login("admin@test.local", "admin1234");
  cashier = await login("c1@test.local", "cashier1234");
  cashier2 = await login("c2@test.local", "cashier1234");
  lamp = (await as(admin).post("/products", { name: "Lamp", sku: "L", price: 1000, cost: 400, stock: 50 })).body.id;
  customerId = (await as(admin).post("/customers", { name: "Otieno" })).body.id;
});

const sell = (token: string, qty: number, extra: object = {}) =>
  as(token).post("/sales", { paymentMethod: "Cash", items: [{ productId: lamp, quantity: qty }], ...extra });

describe("till shifts", () => {
  it("opens one till per person", async () => {
    expect((await as(cashier).get("/shifts/current")).body.shift).toBeNull();
    const s = (await as(cashier).post("/shifts/open", { openingFloat: 5000 })).body;
    expect(s).toMatchObject({ status: "open", openingFloat: 5000, expectedCash: 5000, userName: "Cash One" });
    expect((await as(cashier).post("/shifts/open", { openingFloat: 1 })).status).toBe(409);
    expect((await as(cashier2).post("/shifts/open", { openingFloat: 0 })).status).toBe(201);
  });

  it("works out expected cash from cash sales, payments, refunds and pay-ins/outs", async () => {
    const shift = (await as(cashier).post("/shifts/open", { openingFloat: 2000 })).body;
    await sell(cashier, 3); // +3000 cash
    await sell(cashier, 1, { paymentMethod: "M-Pesa" }); // not cash
    const credit = (await sell(cashier, 2, { customerId, status: "pending", amountPaid: 500 })).body; // +500 cash deposit
    await as(cashier).post(`/sales/${credit.id}/payments`, { amount: 700, method: "Cash" }); // +700
    await sell(cashier2, 4); // someone else's till — ignored

    await as(cashier).post(`/shifts/${shift.id}/cash`, { type: "out", amount: 300, reason: "Bought milk" });
    await as(cashier).post(`/shifts/${shift.id}/cash`, { type: "in", amount: 100, reason: "Change from bank" });

    const now = (await as(cashier).get("/shifts/current")).body.shift;
    // 2000 + 3000 + 500 + 700 - 300 + 100
    expect(now).toMatchObject({ cashTaken: 4200, payIns: 100, payOuts: 300, expectedCash: 6000, totalTaken: 5200 });
    expect(now.sales).toMatchObject({ count: 3, total: 6000, onCredit: 1 });
    expect(now.takings).toEqual(
      expect.arrayContaining([
        { method: "Cash", count: 3, amount: 4200 },
        { method: "M-Pesa", count: 1, amount: 1000 },
      ]),
    );
    expect(now.movements.map((m: { reason: string }) => m.reason)).toEqual(["Bought milk", "Change from bank"]);
  });

  it("counts cash refunds by the person who handed them out", async () => {
    const adminShift = (await as(admin).post("/shifts/open", { openingFloat: 5000 })).body;
    const sale = (await sell(cashier, 2)).body;
    await as(admin).post(`/sales/${sale.id}/returns`, {
      reason: "Faulty",
      refundMethod: "Cash",
      items: [{ saleItemId: sale.items[0].id, quantity: 1 }],
    });
    const s = (await as(admin).get(`/shifts/${adminShift.id}`)).body;
    expect(s).toMatchObject({ cashRefunded: 1000, expectedCash: 4000 });
  });

  it("won't pay out more than the till holds, and needs a reason", async () => {
    const shift = (await as(cashier).post("/shifts/open", { openingFloat: 500 })).body;
    expect((await as(cashier).post(`/shifts/${shift.id}/cash`, { type: "out", amount: 600, reason: "x" })).status).toBe(400);
    expect((await as(cashier).post(`/shifts/${shift.id}/cash`, { type: "in", amount: 10, reason: "" })).status).toBe(400);
  });

  it("closes with a count and records the variance, freezing the figures", async () => {
    const shift = (await as(cashier).post("/shifts/open", { openingFloat: 1000 })).body;
    await sell(cashier, 2); // expected 3000
    const closed = (await as(cashier).post(`/shifts/${shift.id}/close`, { countedCash: 2950, notes: "Short 50" })).body;
    expect(closed).toMatchObject({ status: "closed", expectedCash: 3000, countedCash: 2950, variance: -50, notes: "Short 50", closedBy: "Cash One" });

    // Later activity doesn't change a closed shift.
    await as(cashier).post("/shifts/open", { openingFloat: 0 });
    await sell(cashier, 1);
    expect((await as(cashier).get(`/shifts/${shift.id}`)).body).toMatchObject({ expectedCash: 3000, variance: -50, sales: { count: 1 } });
    expect((await as(cashier).post(`/shifts/${shift.id}/close`, { countedCash: 0 })).status).toBe(400);
    expect((await as(cashier).post(`/shifts/${shift.id}/cash`, { type: "in", amount: 1, reason: "x" })).status).toBe(400);
  });

  it("keeps tills private between cashiers; admins can see and close any", async () => {
    const shift = (await as(cashier).post("/shifts/open", { openingFloat: 100 })).body;
    await as(cashier2).post("/shifts/open", { openingFloat: 100 });
    expect((await as(cashier2).get(`/shifts/${shift.id}`)).status).toBe(403);
    expect((await as(cashier2).post(`/shifts/${shift.id}/close`, { countedCash: 0 })).status).toBe(403);
    expect((await as(cashier2).get("/shifts")).body).toHaveLength(1);
    expect((await as(admin).get("/shifts")).body).toHaveLength(2);
    expect((await as(admin).post(`/shifts/${shift.id}/close`, { countedCash: 100 })).body).toMatchObject({ closedBy: "Admin", variance: 0 });
  });

  it("can require an open till before selling or taking payments", async () => {
    const credit = (await sell(cashier, 1, { customerId, status: "pending" })).body;
    await as(admin).put("/settings", { requireShiftForSales: true });

    const blocked = await sell(cashier, 1);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe("Open your till before recording sales");
    expect((await as(cashier).post(`/sales/${credit.id}/payments`, { amount: 100, method: "Cash" })).status).toBe(409);
    expect((await as(cashier).patch(`/sales/${credit.id}/status`, { status: "paid" })).status).toBe(409);

    await as(cashier).post("/shifts/open", { openingFloat: 0 });
    expect((await sell(cashier, 1)).status).toBe(201);
    expect((await as(cashier).post(`/sales/${credit.id}/payments`, { amount: 100, method: "Cash" })).status).toBe(201);
  });
});

describe("till attribution", () => {
  it("never attaches backdated rows to an open till", async () => {
    const shift = (await as(cashier).post("/shifts/open", { openingFloat: 0 })).body;
    const uid = (db.prepare("SELECT id FROM users WHERE email = 'c1@test.local'").get() as { id: number }).id;
    db.prepare(
      `INSERT INTO sales (invoice_no, user_id, payment_method, status, subtotal_cents, total_cents, created_at)
       VALUES ('OLD-9', ?, 'Cash', 'paid', 900, 900, datetime('now', '-3 days'))`,
    ).run(uid);
    const saleId = (db.prepare("SELECT id FROM sales WHERE invoice_no = 'OLD-9'").get() as { id: number }).id;
    db.prepare(
      "INSERT INTO payments (sale_id, amount_cents, method, user_id, created_at) VALUES (?, 900, 'Cash', ?, datetime('now', '-3 days'))",
    ).run(saleId, uid);
    expect((await as(cashier).get(`/shifts/${shift.id}`)).body).toMatchObject({ cashTaken: 0, sales: { count: 0 } });
  });

  it("puts a sale made right after closing into the next till, not the closed one", async () => {
    const first = (await as(cashier).post("/shifts/open", { openingFloat: 0 })).body;
    await sell(cashier, 1);
    await as(cashier).post(`/shifts/${first.id}/close`, { countedCash: 1000 });
    const second = (await as(cashier).post("/shifts/open", { openingFloat: 0 })).body;
    await sell(cashier, 2); // likely the same second as the close
    expect((await as(cashier).get(`/shifts/${first.id}`)).body).toMatchObject({ sales: { count: 1 }, cashTaken: 1000 });
    expect((await as(cashier).get(`/shifts/${second.id}`)).body).toMatchObject({ sales: { count: 1 }, cashTaken: 2000 });
  });
});
