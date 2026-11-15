import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
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
  del: (p: string) => request(app).delete(`/api${p}`).set("Authorization", token),
});

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

beforeEach(async () => {
  db = openDb(":memory:");
  const add = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  add.run("Admin", "admin@test.local", bcrypt.hashSync("admin1234", 4), "admin");
  add.run("Cash", "cashier@test.local", bcrypt.hashSync("cashier1234", 4), "cashier");
  app = createApp(db);
  admin = await login("admin@test.local", "admin1234");
  cashier = await login("cashier@test.local", "cashier1234");
});

const expense = (body: object = {}) =>
  as(admin).post("/expenses", { date: today(), category: "Rent", amount: 25000, paymentMethod: "Bank Transfer", ...body });

describe("expenses", () => {
  it("is admin only", async () => {
    expect((await as(cashier).get("/expenses")).status).toBe(403);
    expect((await as(cashier).post("/expenses", { date: today(), category: "Rent", amount: 1, paymentMethod: "Cash" })).status).toBe(403);
  });

  it("creates, lists, filters, updates and deletes", async () => {
    const e = (await expense({ payee: "Landlord Ltd", description: "November rent", reference: "TRX-1" })).body;
    expect(e).toMatchObject({ category: "Rent", amount: 25000, payee: "Landlord Ltd", recordedBy: "Admin" });
    await expense({ category: "Utilities", amount: 3200.5, paymentMethod: "M-Pesa", date: "2026-01-15" });

    expect((await as(admin).get("/expenses")).body).toHaveLength(2);
    expect((await as(admin).get("/expenses?category=Utilities")).body).toHaveLength(1);
    expect((await as(admin).get("/expenses?from=2026-02-01")).body.map((x: { category: string }) => x.category)).toEqual(["Rent"]);
    expect((await as(admin).get("/expenses?search=landlord")).body).toHaveLength(1);

    const updated = (await as(admin).patch(`/expenses/${e.id}`, { amount: 26000 })).body;
    expect(updated).toMatchObject({ amount: 26000, payee: "Landlord Ltd", description: "November rent", reference: "TRX-1" });

    expect((await as(admin).del(`/expenses/${e.id}`)).status).toBe(204);
    expect((await as(admin).get(`/expenses`)).body).toHaveLength(1);
  });

  it("validates input", async () => {
    expect((await expense({ amount: 0 })).status).toBe(400);
    expect((await expense({ date: "2026-02-30" })).status).toBe(400);
    expect((await expense({ category: "" })).status).toBe(400);
    expect((await expense({ paymentMethod: "Cheque" })).status).toBe(400);
  });

  it("offers default and custom categories", async () => {
    await expense({ category: "Security guard" });
    const cats = (await as(admin).get("/expenses/categories")).body;
    expect(cats).toContain("Rent");
    expect(cats).toContain("Security guard");
  });

  it("feeds the profit & loss in reports", async () => {
    const p = (await as(admin).post("/products", { name: "Lamp", sku: "L", price: 1000, cost: 400, stock: 10 })).body;
    await as(admin).post("/sales", { paymentMethod: "Cash", items: [{ productId: p.id, quantity: 5 }] }); // revenue 5000, cost 2000
    await expense({ category: "Rent", amount: 1500 });
    await expense({ category: "Utilities", amount: 300 });
    await expense({ category: "Rent", amount: 999, date: "2020-01-01" }); // outside the period

    const pl = (await as(admin).get("/reports")).body.profitAndLoss;
    expect(pl).toMatchObject({ revenue: 5000, costOfGoods: 2000, grossProfit: 3000, expenses: 1800, netProfit: 1200 });
    expect(pl.netMarginPct).toBeCloseTo(24);
    expect(pl.expensesByCategory).toEqual([
      { category: "Rent", count: 1, amount: 1500 },
      { category: "Utilities", count: 1, amount: 300 },
    ]);

    const csv = (await as(admin).get("/reports/export.csv")).text;
    expect(csv).toContain("Operating expenses,1800.00");
    expect(csv).toContain("Net profit,1200.00");
  });

  it("exports expenses as CSV", async () => {
    await expense({ payee: "=cmd()" });
    const res = await as(admin).get("/expenses/export.csv");
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.text).toContain("'=cmd()");
  });
});
