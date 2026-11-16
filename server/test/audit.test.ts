import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { openDb, type DB } from "../src/db.js";
import { createApp } from "../src/app.js";

let db: DB;
let app: ReturnType<typeof createApp>;
let admin: string;
let cashier: string;
let cashierId: number;

const login = async (email: string, password: string) =>
  `Bearer ${(await request(app).post("/api/auth/login").send({ email, password })).body.token}`;
const as = (token: string) => ({
  get: (p: string) => request(app).get(`/api${p}`).set("Authorization", token),
  post: (p: string, body: object = {}) => request(app).post(`/api${p}`).set("Authorization", token).send(body),
  put: (p: string, body: object) => request(app).put(`/api${p}`).set("Authorization", token).send(body),
  patch: (p: string, body: object) => request(app).patch(`/api${p}`).set("Authorization", token).send(body),
  delete: (p: string) => request(app).delete(`/api${p}`).set("Authorization", token),
});

interface Entry {
  id: number;
  userName: string;
  action: string;
  entity: string;
  entityId: number | null;
  summary: string;
  details: Record<string, unknown> | null;
}
const entries = async (query = "") => (await as(admin).get(`/audit${query}`)).body.entries as Entry[];
const latest = async (query = "") => (await entries(query))[0];

beforeEach(async () => {
  db = openDb(":memory:");
  const add = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  add.run("Admin", "admin@test.local", bcrypt.hashSync("admin1234", 4), "admin");
  cashierId = Number(add.run("Mary", "mary@test.local", bcrypt.hashSync("cashier1234", 4), "cashier").lastInsertRowid);
  app = createApp(db);
  admin = await login("admin@test.local", "admin1234");
  cashier = await login("mary@test.local", "cashier1234");
});

describe("audit log", () => {
  it("is admin only and has no write endpoints", async () => {
    expect((await as(cashier).get("/audit")).status).toBe(403);
    expect((await as(admin).post("/audit", { summary: "x" })).status).toBe(404);
    expect((await as(admin).delete("/audit/1")).status).toBe(404);
  });

  it("can't be edited or deleted, even directly in the database", () => {
    db.prepare("INSERT INTO audit_log (action, entity, summary) VALUES ('x', 'auth', 'test')").run();
    expect(() => db.prepare("UPDATE audit_log SET summary = 'changed'").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_log").run()).toThrow(/append-only/);
  });

  it("records sign-ins, failed sign-ins and password changes", async () => {
    await request(app).post("/api/auth/login").send({ email: "mary@test.local", password: "wrong" });
    await request(app).post("/api/auth/login").send({ email: "ghost@test.local", password: "wrong" });
    const auth = await entries("?entity=auth");
    expect(auth[0]).toMatchObject({ action: "login_failed", summary: "Failed sign-in for ghost@test.local (no such account)", userName: "" });
    expect(auth[1]).toMatchObject({ action: "login_failed", userName: "Mary", entityId: cashierId });
    expect(auth.filter((e) => e.action === "login")).toHaveLength(2);

    await as(cashier).post("/auth/password", { currentPassword: "cashier1234", newPassword: "newpass1234" });
    const e = await latest("?action=password_changed");
    expect(e.summary).toBe("Mary changed their password");
    expect(JSON.stringify(await entries())).not.toMatch(/newpass1234/);
  });

  it("records price changes with before and after", async () => {
    const p = (await as(admin).post("/products", { name: "Lamp", sku: "L1", price: 1000, cost: 400, stock: 5 })).body;
    expect((await latest()).summary).toBe("Added product Lamp (L1) at KSh 1,000, opening stock 5");

    await as(admin).patch(`/products/${p.id}`, { price: 1200, name: "Lamp", category: "General" });
    const e = await latest();
    expect(e).toMatchObject({ action: "price_changed", entity: "product", entityId: p.id, userName: "Admin" });
    expect(e.summary).toBe("Lamp: price KSh 1,000 → KSh 1,200");
    expect(e.details).toEqual({ changes: { price: [1000, 1200] } });

    // Saving without changes logs nothing.
    const before = (await entries()).length;
    await as(admin).patch(`/products/${p.id}`, { price: 1200 });
    expect(await entries()).toHaveLength(before);
  });

  it("records stock adjustments, archiving and restoring", async () => {
    const p = (await as(admin).post("/products", { name: "Lamp", sku: "L1", price: 1000, stock: 10 })).body;
    await as(admin).post(`/products/${p.id}/stock`, { change: -3, reason: "adjustment", note: "Broken in store" });
    expect((await latest()).summary).toBe("Adjusted stock of Lamp by -3 (10 → 7) · Broken in store");

    await as(cashier).post("/sales", { paymentMethod: "Cash", items: [{ productId: p.id, quantity: 1 }] });
    await as(admin).delete(`/products/${p.id}`);
    expect((await latest()).summary).toBe("Archived Lamp (L1), 6 in stock");
    await as(admin).post(`/products/${p.id}/restore`);
    expect((await latest()).action).toBe("restored");
  });

  it("records discounts, cancellations and returns, but not routine sales", async () => {
    const p = (await as(admin).post("/products", { name: "Lamp", sku: "L1", price: 1000, stock: 10 })).body;
    const count = (await entries()).length;
    await as(cashier).post("/sales", { paymentMethod: "Cash", items: [{ productId: p.id, quantity: 1 }] });
    expect(await entries()).toHaveLength(count);

    const sale = (await as(cashier).post("/sales", { paymentMethod: "Cash", discount: 250, items: [{ productId: p.id, quantity: 2 }] })).body;
    const d = await latest();
    expect(d).toMatchObject({ action: "discount_given", entity: "sale", entityId: sale.id, userName: "Mary" });
    expect(d.summary).toBe(`${sale.invoiceNo}: discount of KSh 250 (12.5%) on KSh 2,000`);

    await as(admin).post(`/sales/${sale.id}/returns`, {
      items: [{ saleItemId: sale.items[0].id, quantity: 1, restock: false }],
      reason: "Faulty",
      refundMethod: "Cash",
    });
    expect((await latest()).summary).toBe(
      `RET-00001 on ${sale.invoiceNo}: 1 × Lamp worth KSh 875, refunded KSh 875 by Cash, 1 written off · Faulty`,
    );

    const other = (await as(cashier).post("/sales", { paymentMethod: "Card", items: [{ productId: p.id, quantity: 1 }] })).body;
    await as(admin).patch(`/sales/${other.id}/status`, { status: "cancelled" });
    expect((await latest()).summary).toBe(`Cancelled ${other.invoiceNo} (KSh 1,000, was paid); stock put back`);
  });

  it("records user role changes, deactivation and password resets without the password", async () => {
    await as(admin).patch(`/users/${cashierId}`, { role: "admin" });
    expect(await latest()).toMatchObject({ action: "role_changed", summary: "Mary: role cashier → admin" });
    await as(admin).patch(`/users/${cashierId}`, { role: "cashier", active: false });
    expect(await latest()).toMatchObject({ action: "role_changed", summary: "Mary: deactivated, role admin → cashier" });
    await as(admin).patch(`/users/${cashierId}`, { password: "secret-pass-99" });
    expect(await latest()).toMatchObject({ action: "password_reset", summary: "Mary: password reset" });
    expect(JSON.stringify(await entries())).not.toContain("secret-pass-99");
  });

  it("records credit limits, settings and till closes", async () => {
    const c = (await as(admin).post("/customers", { name: "Otieno" })).body;
    await as(admin).patch(`/customers/${c.id}`, { creditLimit: 5000 });
    expect(await latest()).toMatchObject({ action: "credit_limit_changed", summary: "Otieno: credit limit KSh 0 → KSh 5,000" });

    await as(admin).put("/settings", { taxRate: 16, requireShiftForSales: true });
    expect((await latest()).summary).toBe("Settings: require open till off → on");

    const shift = (await as(cashier).post("/shifts/open", { openingFloat: 2000 })).body;
    await as(cashier).post(`/shifts/${shift.id}/cash`, { type: "out", amount: 300, reason: "Fuel" });
    await as(admin).post(`/shifts/${shift.id}/close`, { countedCash: 1650, notes: "Coins missing" });
    const close = await latest();
    expect(close.userName).toBe("Admin");
    expect(close.summary).toBe("Closed Mary's till: expected KSh 1,700, counted KSh 1,650, short KSh 50 · Coins missing");
    expect((await entries("?entity=shift")).map((e) => e.action)).toEqual(["closed", "cash_out", "opened"]);
  });

  it("filters, searches, paginates and exports", async () => {
    for (let i = 1; i <= 5; i++) await as(admin).post("/customers", { name: `Customer ${i}` });
    const page1 = (await as(admin).get("/audit?entity=customer&limit=2")).body;
    expect(page1.entries.map((e: Entry) => e.summary)).toEqual(["Added customer Customer 5", "Added customer Customer 4"]);
    const page2 = (await as(admin).get(`/audit?entity=customer&limit=2&before=${page1.nextBefore}`)).body;
    expect(page2.entries.map((e: Entry) => e.summary)).toEqual(["Added customer Customer 3", "Added customer Customer 2"]);
    const page3 = (await as(admin).get(`/audit?entity=customer&limit=2&before=${page2.nextBefore}`)).body;
    expect(page3.entries).toHaveLength(1);
    expect(page3.nextBefore).toBeNull();

    expect((await entries("?search=Customer%203")).map((e) => e.summary)).toEqual(["Added customer Customer 3"]);
    expect((await entries(`?userId=${cashierId}`)).every((e) => e.userName === "Mary")).toBe(true);

    const facets = (await as(admin).get("/audit/facets")).body;
    expect(facets.actions).toContainEqual({ entity: "customer", action: "created", n: 5 });
    expect(facets.users.map((u: { name: string }) => u.name)).toEqual(["Admin", "Mary"]);

    const csv = await as(admin).get("/audit/export.csv?entity=customer");
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.text.replace(/^\uFEFF/, "").split(/\r?\n/)[0]).toBe("Time,User,Area,Action,Record,Summary,Needs attention,IP");
    expect(csv.text).toContain("Added customer Customer 1");
  });

  it("flags events that need attention and counts them", async () => {
    const p = (await as(admin).post("/products", { name: "Lamp", sku: "L1", price: 1000, stock: 10 })).body;
    await as(admin).post(`/products/${p.id}/stock`, { change: 5, reason: "restock" });
    await as(admin).post(`/products/${p.id}/stock`, { change: -1, reason: "adjustment", note: "Missing" });
    await request(app).post("/api/auth/login").send({ email: "mary@test.local", password: "nope" });
    const balanced = (await as(cashier).post("/shifts/open", { openingFloat: 1000 })).body;
    await as(cashier).post(`/shifts/${balanced.id}/close`, { countedCash: 1000 });
    const short = (await as(cashier).post("/shifts/open", { openingFloat: 1000 })).body;
    await as(cashier).post(`/shifts/${short.id}/close`, { countedCash: 900 });

    const flagged = (await as(admin).get("/audit?attention=true")).body.entries as (Entry & { attention: boolean })[];
    expect(flagged.map((e) => e.summary)).toEqual([
      "Closed till: expected KSh 1,000, counted KSh 900, short KSh 100",
      "Failed sign-in for mary@test.local",
      "Adjusted stock of Lamp by -1 (15 → 14) · Missing",
    ]);
    expect(flagged.every((e) => e.attention)).toBe(true);
    const all = (await as(admin).get("/audit")).body.entries as (Entry & { attention: boolean })[];
    expect(all.find((e) => e.summary.startsWith("Restocked"))?.attention).toBe(false);

    const summary = (await as(admin).get("/audit/summary")).body;
    expect(summary).toMatchObject({ attention: 3, failedLogins: 1, people: 2 });
    expect(summary.total).toBe(all.length);
  });
});
