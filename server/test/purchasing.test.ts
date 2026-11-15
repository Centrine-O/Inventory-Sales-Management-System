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

const post = (path: string, body: object = {}) => request(app).post(`/api${path}`).set("Authorization", admin).send(body);
const get = (path: string) => request(app).get(`/api${path}`).set("Authorization", admin);

async function supplier(name = "Acme Supplies") {
  const res = await post("/suppliers", { name, phone: "+254 700 000000" });
  expect(res.status).toBe(201);
  return res.body;
}

async function product(overrides: Record<string, unknown> = {}) {
  const res = await post("/products", { name: "Widget", sku: `W-${Math.random()}`, price: 200, cost: 100, stock: 10, reorderLevel: 5, ...overrides });
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

describe("products partial update (regression)", () => {
  it("leaves omitted fields untouched", async () => {
    const p = await product({ category: "Tools", description: "Sturdy", cost: 120, reorderLevel: 9 });
    const res = await request(app).patch(`/api/products/${p.id}`).set("Authorization", admin).send({ name: "Renamed" });
    expect(res.body).toMatchObject({ name: "Renamed", category: "Tools", description: "Sturdy", cost: 120, reorderLevel: 9 });
  });
});

describe("suppliers", () => {
  it("is admin only", async () => {
    expect((await request(app).get("/api/suppliers").set("Authorization", cashier)).status).toBe(403);
    expect((await request(app).get("/api/purchase-orders").set("Authorization", cashier)).status).toBe(403);
  });

  it("links products and reports counts", async () => {
    const s = await supplier();
    await product({ supplierId: s.id });
    const res = await get(`/suppliers/${s.id}`);
    expect(res.body).toMatchObject({ name: "Acme Supplies", productCount: 1 });
    expect(res.body.products).toHaveLength(1);
    expect((await post("/products", { name: "x", sku: "x", price: 1, supplierId: 999 })).status).toBe(400);
  });

  it("refuses to delete suppliers with orders", async () => {
    const s = await supplier();
    const p = await product();
    await post("/purchase-orders", { supplierId: s.id, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] });
    expect((await request(app).delete(`/api/suppliers/${s.id}`).set("Authorization", admin)).status).toBe(409);
  });
});

describe("purchase orders", () => {
  it("runs draft -> ordered -> partially received -> received, updating stock and weighted cost", async () => {
    const s = await supplier();
    const p = await product({ stock: 10, cost: 100 });
    const created = await post("/purchase-orders", { supplierId: s.id, items: [{ productId: p.id, quantity: 20, unitCost: 130 }] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ poNumber: "PO-00001", status: "draft", total: 2600 });

    expect((await post(`/purchase-orders/${created.body.id}/receive`, { items: [{ itemId: created.body.items[0].id, quantity: 1 }] })).status).toBe(400);
    const ordered = await post(`/purchase-orders/${created.body.id}/order`);
    expect(ordered.body.status).toBe("ordered");

    const itemId = ordered.body.items[0].id;
    const partial = await post(`/purchase-orders/${created.body.id}/receive`, { items: [{ itemId, quantity: 10 }] });
    expect(partial.body).toMatchObject({ status: "partially_received", unitsReceived: 10 });
    let prod = (await get(`/products/${p.id}`)).body;
    // (10 * 100 + 10 * 130) / 20 = 115
    expect(prod).toMatchObject({ stock: 20, cost: 115 });
    expect(prod.movements[0]).toMatchObject({ change: 10, reason: "restock", reference: "PO-00001" });

    expect((await post(`/purchase-orders/${created.body.id}/receive`, { items: [{ itemId, quantity: 11 }] })).status).toBe(400);
    const done = await post(`/purchase-orders/${created.body.id}/receive`, { items: [{ itemId, quantity: 10 }] });
    expect(done.body.status).toBe("received");
    expect(done.body.receivedAt).not.toBeNull();
    prod = (await get(`/products/${p.id}`)).body;
    expect(prod.stock).toBe(30);

    expect((await post(`/purchase-orders/${created.body.id}/cancel`)).status).toBe(400);
  });

  it("validates items and supplier", async () => {
    const s = await supplier();
    const p = await product();
    expect((await post("/purchase-orders", { supplierId: s.id, items: [] })).status).toBe(400);
    expect((await post("/purchase-orders", { supplierId: 999, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] })).status).toBe(400);
    const dup = await post("/purchase-orders", {
      supplierId: s.id,
      items: [{ productId: p.id, quantity: 1, unitCost: 1 }, { productId: p.id, quantity: 2, unitCost: 1 }],
    });
    expect(dup.status).toBe(400);
  });

  it("allows editing drafts only, deletes drafts, cancels open orders", async () => {
    const s = await supplier();
    const p = await product();
    const po = (await post("/purchase-orders", { supplierId: s.id, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] })).body;
    const edited = await request(app)
      .patch(`/api/purchase-orders/${po.id}`)
      .set("Authorization", admin)
      .send({ items: [{ productId: p.id, quantity: 5, unitCost: 2 }] });
    expect(edited.body).toMatchObject({ unitsOrdered: 5, total: 10 });

    await post(`/purchase-orders/${po.id}/order`);
    const blocked = await request(app).patch(`/api/purchase-orders/${po.id}`).set("Authorization", admin).send({ items: [{ productId: p.id, quantity: 1, unitCost: 1 }] });
    expect(blocked.status).toBe(400);
    const notes = await request(app).patch(`/api/purchase-orders/${po.id}`).set("Authorization", admin).send({ notes: "Call before delivery" });
    expect(notes.body.notes).toBe("Call before delivery");
    expect((await request(app).delete(`/api/purchase-orders/${po.id}`).set("Authorization", admin)).status).toBe(400);
    expect((await post(`/purchase-orders/${po.id}/cancel`)).body.status).toBe("cancelled");

    const draft = (await post("/purchase-orders", { supplierId: s.id, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] })).body;
    expect((await request(app).delete(`/api/purchase-orders/${draft.id}`).set("Authorization", admin)).status).toBe(204);
  });

  it("suggests reorders grouped by supplier, net of stock already on order", async () => {
    const s = await supplier();
    const low = await product({ stock: 2, reorderLevel: 5, supplierId: s.id, cost: 50 });
    await product({ stock: 50, reorderLevel: 5, supplierId: s.id });
    await product({ stock: 0, reorderLevel: 3 });

    let groups = (await get("/purchase-orders/suggestions")).body;
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ supplierId: s.id, supplierName: "Acme Supplies" });
    expect(groups[0].items).toEqual([expect.objectContaining({ productId: low.id, suggestedQuantity: 8, unitCost: 50 })]);
    expect(groups[1]).toMatchObject({ supplierId: null });

    await post("/purchase-orders", { supplierId: s.id, items: [{ productId: low.id, quantity: 8, unitCost: 50 }] });
    groups = (await get("/purchase-orders/suggestions")).body;
    expect(groups.find((g: { supplierId: number | null }) => g.supplierId === s.id)).toBeUndefined();
  });

  it("archives rather than deletes products referenced only by purchase orders", async () => {
    const s = await supplier();
    const p = await product();
    await post("/purchase-orders", { supplierId: s.id, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] });
    expect((await request(app).delete(`/api/products/${p.id}`).set("Authorization", admin)).body).toEqual({ archived: true });
  });
});

describe("migration", () => {
  it("adds supplier_id to a products table created before suppliers existed", () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "stockflow-")), "legacy.db");
    const legacy = new Database(file);
    legacy.exec(`CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT 'General', description TEXT NOT NULL DEFAULT '', price_cents INTEGER NOT NULL,
      cost_cents INTEGER NOT NULL DEFAULT 0, stock INTEGER NOT NULL DEFAULT 0, reorder_level INTEGER NOT NULL DEFAULT 5,
      archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')));
      INSERT INTO products (name, sku, price_cents) VALUES ('Old item', 'OLD-1', 500);`);
    legacy.close();

    const migrated = openDb(file);
    const cols = (migrated.prepare("PRAGMA table_info(products)").all() as { name: string }[]).map((c) => c.name);
    expect(cols).toContain("supplier_id");
    expect(migrated.prepare("SELECT name, supplier_id FROM products").get()).toEqual({ name: "Old item", supplier_id: null });
    migrated.close();
    // Re-opening is a no-op.
    expect(() => openDb(file).close()).not.toThrow();
  });
});
