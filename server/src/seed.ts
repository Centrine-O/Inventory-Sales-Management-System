/**
 * Resets the database and fills it with realistic demo data.
 * Usage: npm run seed   (DB_PATH overrides the target file)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { openDb, toCents } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DB_PATH ?? path.join(here, "..", "data", "stockflow.db");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(dbFile + suffix, { force: true });
const db = openDb(dbFile);

// Deterministic PRNG so every seed produces the same dataset.
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const sqlDate = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");

const addUser = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)");
const adminId = Number(addUser.run("Admin User", "admin@stockflow.local", bcrypt.hashSync("admin1234", 10), "admin").lastInsertRowid);
const cashierId = Number(addUser.run("Mary Achieng", "cashier@stockflow.local", bcrypt.hashSync("cashier1234", 10), "cashier").lastInsertRowid);

const products: [string, string, string, number, number, number][] = [
  // name, sku, category, price, cost, reorder level
  ["Wireless Barcode Scanner", "WBS-001", "Electronics", 18500, 12800, 5],
  ["USB-C Hub", "UCH-003", "Electronics", 6500, 4100, 8],
  ["Wireless Mouse", "WM-204", "Electronics", 2200, 1300, 10],
  ["Receipt Printer", "RP-110", "Electronics", 24500, 17900, 3],
  ["27\" Monitor", "MN-270", "Electronics", 32000, 24500, 4],
  ["Ergonomic Office Chair", "EOC-002", "Furniture", 42000, 29000, 4],
  ["Standing Desk", "SD-004", "Furniture", 68000, 49000, 2],
  ["Filing Cabinet", "FC-310", "Furniture", 21500, 14200, 3],
  ["Laptop Stand", "LS-115", "Accessories", 3800, 2100, 10],
  ["Mechanical Keyboard", "KB-220", "Accessories", 7900, 5200, 6],
  ["Desk Lamp", "DL-140", "Accessories", 2900, 1650, 8],
  ["HDMI Cable 2m", "HC-020", "Accessories", 850, 380, 20],
  ["Thermal Receipt Rolls (10 pack)", "TR-180", "Office Supplies", 1450, 820, 15],
  ["A4 Printing Paper (ream)", "PP-500", "Office Supplies", 650, 470, 25],
  ["Stapler Heavy Duty", "ST-090", "Office Supplies", 1200, 690, 10],
  ["Whiteboard Markers (4 pack)", "WM-004", "Office Supplies", 480, 260, 20],
];

const now = new Date();
const daysAgo = (n: number, hour = 9) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, hour, int(0, 59), int(0, 59));
  return d;
};

const addSupplier = db.prepare(
  "INSERT INTO suppliers (name, contact_name, email, phone, address, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const supplierByCategory: Record<string, number> = {};
for (const [category, name, contact, email, phone, address] of [
  ["Electronics", "Westlands Tech Distributors", "Kevin Odhiambo", "orders@westlandstech.example", "+254 722 410 220", "Westlands, Nairobi"],
  ["Furniture", "Mombasa Road Office Furniture", "Janet Mutua", "sales@mrfurniture.example", "+254 733 551 090", "Mombasa Road, Nairobi"],
  ["Accessories", "Accessories Hub EA", "Ali Abdi", "ali@accessorieshub.example", "+254 711 302 455", "Eastleigh, Nairobi"],
  ["Office Supplies", "Industrial Area Stationers", "Rose Wambui", "rose@iastationers.example", "+254 720 880 133", "Industrial Area, Nairobi"],
]) {
  supplierByCategory[category] = Number(addSupplier.run(name, contact, email, phone, address, sqlDate(daysAgo(80))).lastInsertRowid);
}

const addProduct = db.prepare(
  `INSERT INTO products (name, sku, category, price_cents, cost_cents, stock, reorder_level, supplier_id, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const addPo = db.prepare(
  `INSERT INTO purchase_orders (po_number, supplier_id, status, expected_date, notes, user_id, created_at, ordered_at, received_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const addPoItem = db.prepare(
  "INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, quantity_received, unit_cost_cents) VALUES (?, ?, ?, ?, ?)",
);
let poCount = 0;
const nextPo = () => `PO-${String(++poCount).padStart(5, "0")}`;
const addMovement = db.prepare(
  "INSERT INTO stock_movements (product_id, change, reason, reference, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);

interface P { id: number; name: string; sku: string; category: string; price: number; cost: number; stock: number; reorder: number }
const catalog: P[] = [];
const opened = sqlDate(daysAgo(75));
for (const [name, sku, category, price, cost, reorder] of products) {
  const stock = int(30, 90);
  const id = Number(
    addProduct.run(name, sku, category, toCents(price), toCents(cost), stock, reorder, supplierByCategory[category], opened, opened)
      .lastInsertRowid,
  );
  addMovement.run(id, stock, "initial", "Opening stock", adminId, opened);
  catalog.push({ id, name, sku, category, price: toCents(price), cost: toCents(cost), stock, reorder });
}

const customerData: [string, string, string, string][] = [
  ["John Kamau", "john.kamau@example.com", "+254 712 123456", "active"],
  ["Amina Yusuf", "amina.yusuf@example.com", "+254 733 987654", "active"],
  ["Grace Wanjiru", "grace.wanjiru@example.com", "+254 701 456789", "inactive"],
  ["David Otieno", "david.otieno@example.com", "+254 722 334455", "active"],
  ["Faith Njeri", "faith.njeri@example.com", "+254 711 220033", "active"],
  ["Brian Mwangi", "brian.mwangi@example.com", "+254 745 667788", "active"],
  ["Zawadi Hassan", "zawadi.hassan@example.com", "+254 798 101202", "active"],
  ["Peter Kiprotich", "peter.kiprotich@example.com", "+254 720 556677", "active"],
  ["Nairobi Tech Hub Ltd", "procurement@example.com", "+254 20 4455667", "active"],
  ["Lucy Chebet", "lucy.chebet@example.com", "+254 703 889900", "inactive"],
];
const addCustomer = db.prepare("INSERT INTO customers (name, email, phone, status, created_at) VALUES (?, ?, ?, ?, ?)");
const customerIds = customerData.map(([n, e, p, s], i) =>
  Number(addCustomer.run(n, e, p, s, sqlDate(daysAgo(70 - i * 5))).lastInsertRowid),
);

const addSale = db.prepare(
  `INSERT INTO sales (invoice_no, customer_id, user_id, payment_method, status, subtotal_cents, discount_cents, tax_cents, total_cents, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const addItem = db.prepare(
  `INSERT INTO sale_items (sale_id, product_id, product_name, sku, category, quantity, unit_price_cents, unit_cost_cents, line_total_cents)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const methods = ["Cash", "M-Pesa", "M-Pesa", "M-Pesa", "Card", "Bank Transfer"];
let invoice = 0;

db.transaction(() => {
  for (let day = 60; day >= 0; day--) {
    const weekend = [0, 6].includes(daysAgo(day).getDay());
    const count = int(2, weekend ? 6 : 4);
    const hours = Array.from({ length: count }, () => int(8, 18)).sort((a, b) => a - b);
    for (const hour of hours) {
      const when = daysAgo(day, hour);
      if (when > now) continue;
      const lines = new Map<P, number>();
      for (let k = int(1, 3); k > 0; k--) {
        const p = pick(catalog);
        const q = int(1, p.price > 20000 ? 1 : 3);
        if (p.stock - (lines.get(p) ?? 0) - q >= 0) lines.set(p, (lines.get(p) ?? 0) + q);
      }
      if (lines.size === 0) continue;

      const subtotal = [...lines].reduce((s, [p, q]) => s + p.price * q, 0);
      const discount = rand() < 0.15 ? Math.round(subtotal * 0.05 / 100) * 100 : 0;
      const total = subtotal - discount;
      const tax = Math.round((total * 16) / 116);
      const status = day <= 3 && rand() < 0.3 ? "pending" : rand() < 0.03 ? "cancelled" : "paid";
      const customer = rand() < 0.3 ? null : pick(customerIds);
      const no = `INV-${String(++invoice).padStart(5, "0")}`;
      const created = sqlDate(when);
      const saleId = Number(
        addSale.run(no, customer, rand() < 0.6 ? cashierId : adminId, pick(methods), status, subtotal, discount, tax, total, created)
          .lastInsertRowid,
      );
      for (const [p, q] of lines) {
        addItem.run(saleId, p.id, p.name, p.sku, p.category, q, p.price, p.cost, p.price * q);
        if (status !== "cancelled") {
          p.stock -= q;
          addMovement.run(p.id, -q, "sale", no, cashierId, created);
        }
      }
    }
    // Weekly supplier deliveries keep popular items available, recorded as received purchase orders.
    if (day % 7 === 0) {
      const bySupplier = new Map<number, P[]>();
      for (const p of catalog) {
        if (p.stock < 15) {
          const sid = supplierByCategory[p.category];
          bySupplier.set(sid, [...(bySupplier.get(sid) ?? []), p]);
        }
      }
      for (const [sid, items] of bySupplier) {
        const ordered = sqlDate(daysAgo(day + 3, 10));
        const received = sqlDate(daysAgo(day, 7));
        const no = nextPo();
        const poId = Number(addPo.run(no, sid, "received", null, "", adminId, ordered, ordered, received).lastInsertRowid);
        for (const p of items) {
          const q = int(15, 40);
          addPoItem.run(poId, p.id, q, q, p.cost);
          p.stock += q;
          addMovement.run(p.id, q, "restock", no, adminId, received);
        }
      }
    }
  }
  // Leave a few items low or out of stock so alerts have something to show.
  const drain = (sku: string, left: number) => {
    const p = catalog.find((c) => c.sku === sku)!;
    if (p.stock > left) {
      addMovement.run(p.id, left - p.stock, "adjustment", "Stock count correction", adminId, sqlDate(daysAgo(1)));
      p.stock = left;
    }
  };
  drain("UCH-003", 3);
  drain("TR-180", 7);
  drain("SD-004", 0);
  drain("WM-204", 4);

  const setStock = db.prepare("UPDATE products SET stock = ? WHERE id = ?");
  for (const p of catalog) setStock.run(p.stock, p.id);

  // Open orders in different states so the purchasing screens have something to show.
  const bySku = (sku: string) => catalog.find((c) => c.sku === sku)!;
  const openPo = (sku: string[], status: "ordered" | "partially_received" | "draft", daysBack: number, notes: string) => {
    const sid = supplierByCategory[bySku(sku[0]).category];
    const created = sqlDate(daysAgo(daysBack, 11));
    const expected = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4);
    const expectedStr = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`;
    const no = nextPo();
    const poId = Number(
      addPo.run(no, sid, status, status === "draft" ? null : expectedStr, notes, adminId, created, status === "draft" ? null : created, null)
        .lastInsertRowid,
    );
    sku.forEach((code, i) => {
      const p = bySku(code);
      const qty = Math.max(p.reorder * 2, 10);
      const got = status === "partially_received" && i === 0 ? Math.floor(qty / 2) : 0;
      addPoItem.run(poId, p.id, qty, got, p.cost);
      if (got > 0) {
        p.stock += got;
        setStock.run(p.stock, p.id);
        addMovement.run(p.id, got, "restock", no, adminId, sqlDate(daysAgo(1, 9)));
      }
    });
  };
  openPo(["UCH-003", "WM-204"], "ordered", 2, "Deliver to back store");
  openPo(["FC-310", "SD-004"], "partially_received", 5, "Desks back-ordered by supplier");
  openPo(["ST-090"], "draft", 0, "");
})();

console.log(
  `Seeded ${catalog.length} products, ${Object.keys(supplierByCategory).length} suppliers, ${poCount} purchase orders, ` +
    `${customerIds.length} customers, ${invoice} sales into ${dbFile}`,
);
console.log("Sign in with admin@stockflow.local / admin1234 or cashier@stockflow.local / cashier1234");
