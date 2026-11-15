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
});

beforeEach(async () => {
  db = openDb(":memory:");
  const add = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
  add.run("Admin", "admin@test.local", bcrypt.hashSync("admin1234", 4), "admin");
  add.run("Cash", "cashier@test.local", bcrypt.hashSync("cashier1234", 4), "cashier");
  app = createApp(db);
  admin = await login("admin@test.local", "admin1234");
  cashier = await login("cashier@test.local", "cashier1234");
});

const product = (body: object) => as(admin).post("/products", { name: "Item", price: 100, stock: 5, ...body });

describe("barcodes", () => {
  it("stores optional barcodes; blank means none", async () => {
    const a = (await product({ sku: "A-1", barcode: "6161234567890" })).body;
    const b = (await product({ sku: "B-1", barcode: "  " })).body;
    const c = (await product({ sku: "C-1" })).body;
    expect(a.barcode).toBe("6161234567890");
    expect(b.barcode).toBeNull();
    expect(c.barcode).toBeNull();
  });

  it("rejects duplicate barcodes with a clear message, but allows many products without one", async () => {
    await product({ sku: "A-1", barcode: "111" });
    const dup = await product({ sku: "A-2", barcode: "111" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe("That barcode is already used by another product");
    expect((await product({ sku: "A-3" })).status).toBe(201);
    expect((await product({ sku: "A-4" })).status).toBe(201);
    expect((await product({ sku: "A-1" })).body.error).toBe("That SKU is already used by another product");
  });

  it("rejects barcodes with spaces or control characters", async () => {
    expect((await product({ sku: "X", barcode: "12 34" })).status).toBe(400);
  });

  it("looks up by barcode first, then SKU (case-insensitive), for any signed-in user", async () => {
    const a = (await product({ sku: "LAMP-01", name: "Lamp", barcode: "5012345678900" })).body;
    expect((await as(cashier).get("/products/lookup?code=5012345678900")).body.id).toBe(a.id);
    expect((await as(cashier).get("/products/lookup?code=lamp-01")).body.id).toBe(a.id);
    const missing = await as(cashier).get("/products/lookup?code=999");
    expect(missing.status).toBe(404);
    expect(missing.body.error).toMatch(/No product with barcode or SKU "999"/);
    expect((await as(cashier).get("/products/lookup?code=")).status).toBe(400);
  });

  it("does not find archived products", async () => {
    const a = (await product({ sku: "OLD", barcode: "777" })).body;
    await as(admin).post("/sales", { paymentMethod: "Cash", items: [{ productId: a.id, quantity: 1 }] });
    await request(app).delete(`/api/products/${a.id}`).set("Authorization", admin); // archived (has sales)
    expect((await as(cashier).get("/products/lookup?code=777")).status).toBe(404);
  });

  it("can change or clear a barcode without touching other fields", async () => {
    const a = (await product({ sku: "S", barcode: "123", category: "Tools" })).body;
    expect((await as(admin).patch(`/products/${a.id}`, { barcode: "456" })).body).toMatchObject({ barcode: "456", category: "Tools" });
    expect((await as(admin).patch(`/products/${a.id}`, { barcode: "" })).body.barcode).toBeNull();
    expect((await as(admin).patch(`/products/${a.id}`, { name: "Renamed" })).body.barcode).toBeNull();
  });

  it("finds products by exact barcode in search", async () => {
    await product({ sku: "S1", name: "Stapler", barcode: "6160000000017" });
    expect((await as(cashier).get("/products?search=6160000000017")).body).toHaveLength(1);
    expect((await as(cashier).get("/search?q=6160000000017")).body.products).toHaveLength(1);
  });
});
