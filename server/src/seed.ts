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
  `INSERT INTO products (name, sku, category, price_cents, cost_cents, stock, reorder_level, supplier_id, barcode, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
/** EAN-13 with a valid check digit; 616 is the GS1 prefix for Kenya. */
const ean13 = (n: number) => {
  const body = `616${String(1000 + n).padStart(4, "0")}${String(10000 + n * 37).slice(-5)}`;
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
  return body + ((10 - (sum % 10)) % 10);
};
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
for (const [idx, [name, sku, category, price, cost, reorder]] of products.entries()) {
  const stock = int(30, 90);
  // A couple of items have no printed barcode; they're scanned by SKU from a shelf label instead.
  const code = ["HC-020", "WM-004"].includes(sku) ? null : ean13(idx + 1);
  const id = Number(
    addProduct.run(name, sku, category, toCents(price), toCents(cost), stock, reorder, supplierByCategory[category], code, opened, opened)
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
db.prepare("UPDATE customers SET credit_limit_cents = ? WHERE name = ?").run(toCents(250000), "Nairobi Tech Hub Ltd");
db.prepare("UPDATE customers SET credit_limit_cents = ? WHERE name = ?").run(toCents(50000), "John Kamau");

const addSale = db.prepare(
  `INSERT INTO sales (invoice_no, customer_id, user_id, payment_method, status, subtotal_cents, discount_cents, tax_cents, total_cents, created_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const addItem = db.prepare(
  `INSERT INTO sale_items (sale_id, product_id, product_name, sku, category, quantity, unit_price_cents, unit_cost_cents, line_total_cents)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

const addPayment = db.prepare(
  "INSERT INTO payments (sale_id, amount_cents, method, reference, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const mpesaCode = () => "Q" + Array.from({ length: 9 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"[int(0, 33)]).join("");

const methods = ["Cash", "M-Pesa", "M-Pesa", "M-Pesa", "Card", "Bank Transfer"];
let invoice = 0;
let returnCount = 0;
let expenseCount = 0;
let shiftCount = 0;
let auditCount = 0;

// Activity log entries, collected as the data is generated and written in time order at the end.
interface AuditEvent {
  at: string;
  userId: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  summary: string;
  details?: Record<string, unknown>;
  ip?: string;
}
const events: AuditEvent[] = [];
const userNames: Record<number, string> = { [adminId]: "Admin User", [cashierId]: "Mary Achieng" };
const ipOf = (uid: number | null) => (uid === cashierId ? "192.168.1.20" : uid === adminId ? "192.168.1.35" : "192.168.1.77");
const ksh = (cents: number) => `KSh ${(cents / 100).toLocaleString("en-KE")}`;
const minutesLater = (at: string, mins: number) => sqlDate(new Date(new Date(at.replace(" ", "T") + "Z").getTime() + mins * 60_000));
/** The activity log covers the last two weeks of the demo. */
const auditFrom = sqlDate(daysAgo(14, 0));

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
      let customer = rand() < 0.3 ? null : pick(customerIds);
      // Credit sales: mostly recent, a few older ones left unpaid so the debtors ageing report has data.
      const credit = customer !== null && ((day <= 3 && rand() < 0.35) || (day > 30 && rand() < 0.09));
      const status = credit ? "pending" : rand() < 0.03 ? "cancelled" : "paid";
      if (status === "pending" && customer === null) customer = pick(customerIds);
      const no = `INV-${String(++invoice).padStart(5, "0")}`;
      const created = sqlDate(when);
      const method = pick(methods);
      const seller = rand() < 0.6 ? cashierId : adminId;
      const saleId = Number(
        addSale.run(no, customer, seller, method, status, subtotal, discount, tax, total, created).lastInsertRowid,
      );
      if (status === "paid") {
        addPayment.run(saleId, total, method, method === "M-Pesa" ? mpesaCode() : "Paid at sale", seller, created);
      } else if (status === "pending" && rand() < 0.5) {
        // Deposit now, sometimes an instalment later.
        const deposit = Math.round((total * int(20, 50)) / 100 / 100) * 100;
        if (deposit > 0 && deposit < total) {
          addPayment.run(saleId, deposit, method, "Deposit", seller, created);
          if (day > 30 && rand() < 0.6) {
            const later = Math.round(((total - deposit) * 0.4) / 100) * 100;
            if (later > 0) addPayment.run(saleId, later, "M-Pesa", mpesaCode(), adminId, sqlDate(daysAgo(day - 14, 12)));
          }
        }
      }
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
        const lines: string[] = [];
        let value = 0;
        for (const p of items) {
          const q = int(15, 40);
          addPoItem.run(poId, p.id, q, q, p.cost);
          p.stock += q;
          addMovement.run(p.id, q, "restock", no, adminId, received);
          lines.push(`${q} × ${p.name}`);
          value += q * p.cost;
        }
        if (received >= auditFrom) {
          events.push({
            at: received,
            userId: adminId,
            action: "received",
            entity: "purchase_order",
            entityId: poId,
            summary: `Received ${lines.join(", ")} on ${no} (${ksh(value)}), order complete`,
          });
        }
      }
    }
  }
  // A handful of customer returns on older paid sales.
  const candidates = db
    .prepare(
      `SELECT s.id, s.invoice_no, s.subtotal_cents, s.total_cents, s.created_at, i.id AS item_id, i.product_id, i.unit_price_cents
       FROM sales s JOIN sale_items i ON i.sale_id = s.id
       WHERE s.status = 'paid' AND s.created_at < datetime('now', '-5 days')
       GROUP BY s.id ORDER BY s.id`,
    )
    .all() as { id: number; invoice_no: string; subtotal_cents: number; total_cents: number; created_at: string; item_id: number; product_id: number; unit_price_cents: number }[];
  const reasons = ["Wrong size", "Faulty on arrival", "Customer changed mind", "Duplicate purchase", "Damaged packaging"];

  for (const c of candidates.filter((_, i) => i % 23 === 7).slice(0, 6)) {
    const no = `RET-${String(++returnCount).padStart(5, "0")}`;
    const value = Math.round((c.unit_price_cents * c.total_cents) / c.subtotal_cents);
    const damaged = returnCount === 2;
    const when = sqlDate(new Date(new Date(c.created_at.replace(" ", "T") + "Z").getTime() + 3 * 86_400_000));
    const retId = Number(
      db
        .prepare(
          `INSERT INTO returns (return_no, sale_id, reason, value_cents, refund_cents, refund_method, refund_reference, user_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(no, c.id, damaged ? "Faulty on arrival" : pick(reasons), value, value, "M-Pesa", mpesaCode(), adminId, when).lastInsertRowid,
    );
    db.prepare("INSERT INTO return_items (return_id, sale_item_id, quantity, value_cents, restocked) VALUES (?, ?, 1, ?, ?)").run(
      retId,
      c.item_id,
      value,
      damaged ? 0 : 1,
    );
    const productName = catalog.find((x) => x.id === c.product_id)!.name;
    if (when >= auditFrom) {
      const reason = (db.prepare("SELECT reason FROM returns WHERE id = ?").get(retId) as { reason: string }).reason;
      events.push({
        at: when,
        userId: adminId,
        action: "return_processed",
        entity: "sale",
        entityId: c.id,
        summary: `${no} on ${c.invoice_no}: 1 × ${productName} worth ${ksh(value)}, refunded ${ksh(value)} by M-Pesa${damaged ? ", 1 written off" : ""} · ${reason}`,
        details: { returnNo: no, value: value / 100, refund: value / 100, refundMethod: "M-Pesa", reason },
      });
    }
    if (!damaged) {
      const p = catalog.find((x) => x.id === c.product_id)!;
      p.stock += 1;
      addMovement.run(p.id, 1, "return", `${no} · ${c.invoice_no}`, adminId, when);
    }
  }

  // Operating expenses for the last ~2.5 months.
  const addExpense = db.prepare(
    `INSERT INTO expenses (expense_date, category, payee, description, amount_cents, payment_method, reference, user_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ymdLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const expense = (d: Date, category: string, payee: string, description: string, amount: number, method: string, ref = "") => {
    if (d > now) return;
    const id = Number(addExpense.run(ymdLocal(d), category, payee, description, toCents(amount), method, ref, adminId, sqlDate(d)).lastInsertRowid);
    expenseCount++;
    if (sqlDate(d) >= auditFrom) {
      events.push({
        at: sqlDate(d),
        userId: adminId,
        action: "created",
        entity: "expense",
        entityId: id,
        summary: `Recorded ${category} expense of KSh ${amount.toLocaleString("en-KE")}${payee ? ` to ${payee}` : ""} (${ymdLocal(d)})`,
      });
    }
  };
  for (let m = 2; m >= 0; m--) {
    const first = new Date(now.getFullYear(), now.getMonth() - m, 1, 10);
    const label = first.toLocaleString("en-KE", { month: "long" });
    expense(first, "Rent", "Westgate Properties Ltd", `${label} shop rent`, 45000, "Bank Transfer", `EFT-${int(100000, 999999)}`);
    expense(new Date(first.getFullYear(), first.getMonth(), 5, 11), "Utilities", "Kenya Power", `${label} electricity (prepaid tokens)`, int(60, 95) * 100, "M-Pesa", mpesaCode());
    expense(new Date(first.getFullYear(), first.getMonth(), 6, 11), "Utilities", "Nairobi Water", `${label} water bill`, int(12, 20) * 100, "M-Pesa", mpesaCode());
    expense(new Date(first.getFullYear(), first.getMonth(), 7, 11), "Utilities", "Safaricom Home Fibre", `${label} internet`, 3500, "M-Pesa", mpesaCode());
    const payday = new Date(first.getFullYear(), first.getMonth() + 1, 0, 16);
    expense(payday, "Salaries & wages", "Mary Achieng", `${label} salary — cashier`, 28000, "M-Pesa", mpesaCode());
    expense(payday, "Salaries & wages", "Joseph Mutiso", `${label} salary — store assistant`, 22000, "M-Pesa", mpesaCode());
    expense(new Date(first.getFullYear(), first.getMonth(), 15, 12), "Licences & fees", "Nairobi City County", "Monthly business permit instalment", 2500, "M-Pesa", mpesaCode());
  }
  for (let day = 70; day >= 0; day -= 7) {
    expense(daysAgo(day, 15), "Transport & delivery", "Boda boda deliveries", "Weekly customer deliveries", int(15, 40) * 100, "Cash");
    expense(daysAgo(day, 18), "Bank & M-Pesa charges", "Safaricom", "Till & transfer charges", int(4, 12) * 100, "M-Pesa");
  }
  expense(daysAgo(40, 13), "Marketing", "Mwananchi Prints", "Flyers and posters", 6500, "Cash");
  expense(daysAgo(18, 14), "Repairs & maintenance", "Fundi John", "Fix shop shutter", 3800, "Cash");
  expense(daysAgo(9, 10), "Office & cleaning supplies", "Naivas Supermarket", "Cleaning supplies and tea", 2150, "Card");

  // Till shifts for the last two weeks: each person who took money that day had a till from 07:30 to 19:30.
  // Today's cashier till is left open so the Till page has a live shift to show.
  const openShift = db.prepare("INSERT INTO shifts (user_id, opening_float_cents, opened_at) VALUES (?, ?, ?)");
  const attach = (table: string) =>
    db.prepare(`UPDATE ${table} SET shift_id = ? WHERE user_id = ? AND created_at >= ? AND created_at <= ?`);
  const attachSales = attach("sales");
  const attachPayments = attach("payments");
  const attachReturns = attach("returns");
  const addCashMove = db.prepare(
    "INSERT INTO cash_movements (shift_id, type, amount_cents, reason, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  for (let day = 13; day >= 0; day--) {
    for (const uid of [cashierId, adminId]) {
      // Today only the cashier's till is running (left open below); the admin hasn't opened one yet.
      if (day === 0 && uid === adminId) continue;
      const open = sqlDate(daysAgo(day, 7));
      const closeAt = daysAgo(day, 19);
      const close = sqlDate(closeAt > now ? now : closeAt); // never a closing time in the future
      const took = db.prepare("SELECT 1 FROM payments WHERE user_id = ? AND created_at BETWEEN ? AND ? LIMIT 1").get(uid, open, close);
      if (!took && day > 0) continue;
      const float = 500000;
      const shiftId = Number(openShift.run(uid, float, open).lastInsertRowid);
      events.push({ at: minutesLater(open, -3), userId: uid, action: "login", entity: "auth", entityId: uid, summary: `${userNames[uid]} signed in` });
      events.push({ at: open, userId: uid, action: "opened", entity: "shift", entityId: shiftId, summary: `Opened till with ${ksh(float)} float` });
      for (const st of [attachSales, attachPayments, attachReturns]) st.run(shiftId, uid, open, close);
      const cashIn = (
        db.prepare("SELECT COALESCE(SUM(amount_cents), 0) AS c FROM payments WHERE shift_id = ? AND method = 'Cash'").get(shiftId) as { c: number }
      ).c;
      const cashOut = (
        db.prepare("SELECT COALESCE(SUM(refund_cents), 0) AS c FROM returns WHERE shift_id = ? AND refund_method = 'Cash'").get(shiftId) as { c: number }
      ).c;
      let expected = float + cashIn - cashOut;
      // Bank most of the takings mid-afternoon on busy days.
      if (expected > 2_500_000) {
        const drop = Math.floor((expected - float) / 100_000) * 100_000;
        const at = sqlDate(daysAgo(day, 15));
        if (at <= sqlDate(now)) {
          addCashMove.run(shiftId, "out", drop, "Banked at Equity Bank", uid, at);
          events.push({ at, userId: uid, action: "cash_out", entity: "shift", entityId: shiftId, summary: `Paid out ${ksh(drop)} · Banked at Equity Bank` });
          expected -= drop;
        }
      }
      if (rand() < 0.2) {
        const at = sqlDate(daysAgo(day, 10));
        if (at <= sqlDate(now)) {
          addCashMove.run(shiftId, "out", 15000, "Petty cash: milk and sugar", uid, at);
          events.push({ at, userId: uid, action: "cash_out", entity: "shift", entityId: shiftId, summary: `Paid out ${ksh(15000)} · Petty cash: milk and sugar` });
          expected -= 15000;
        }
      }
      if (day === 0 && uid === cashierId) continue; // still open
      const variance = rand() < 0.75 ? 0 : pick([-5000, -2000, -10000, 1000, -50000]);
      db.prepare(
        "UPDATE shifts SET closed_at = ?, closed_by = ?, expected_cash_cents = ?, counted_cash_cents = ?, notes = ? WHERE id = ?",
      ).run(close, uid, expected, expected + variance, variance < -20000 ? "Short — checking against receipts" : "", shiftId);
      shiftCount++;
      const note = variance < -20000 ? " · Short — checking against receipts" : "";
      const result = variance === 0 ? "balanced" : `${variance < 0 ? "short" : "over"} ${ksh(Math.abs(variance))}`;
      events.push({
        at: close,
        userId: uid,
        action: "closed",
        entity: "shift",
        entityId: shiftId,
        summary: `Closed till: expected ${ksh(expected)}, counted ${ksh(expected + variance)}, ${result}${note}`,
        details: { expected: expected / 100, counted: (expected + variance) / 100, variance: variance / 100 },
      });
    }
  }

  // Leave a few items low or out of stock so alerts have something to show.
  const drain = (sku: string, left: number) => {
    const p = catalog.find((c) => c.sku === sku)!;
    if (p.stock > left) {
      const at = sqlDate(daysAgo(1, 17));
      addMovement.run(p.id, left - p.stock, "adjustment", "Stock count correction", adminId, at);
      events.push({
        at,
        userId: adminId,
        action: "stock_adjusted",
        entity: "product",
        entityId: p.id,
        summary: `Adjusted stock of ${p.name} by ${left - p.stock} (${p.stock} → ${left}) · Stock count correction`,
        details: { reason: "adjustment", change: left - p.stock, before: p.stock, after: left, note: "Stock count correction" },
      });
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
    const supplierName = (db.prepare("SELECT name FROM suppliers WHERE id = ?").get(sid) as { name: string }).name;
    const poTotal = sku.reduce((t, code) => t + Math.max(bySku(code).reorder * 2, 10) * bySku(code).cost, 0);
    events.push({ at: created, userId: adminId, action: "created", entity: "purchase_order", entityId: poId, summary: `Drafted ${no} to ${supplierName} for ${ksh(poTotal)}` });
    if (status !== "draft") {
      events.push({ at: minutesLater(created, 4), userId: adminId, action: "ordered", entity: "purchase_order", entityId: poId, summary: `Placed ${no} with ${supplierName} for ${ksh(poTotal)}` });
    }
    sku.forEach((code, i) => {
      const p = bySku(code);
      const qty = Math.max(p.reorder * 2, 10);
      const got = status === "partially_received" && i === 0 ? Math.floor(qty / 2) : 0;
      addPoItem.run(poId, p.id, qty, got, p.cost);
      if (got > 0) {
        p.stock += got;
        setStock.run(p.stock, p.id);
        const at = sqlDate(daysAgo(1, 9));
        addMovement.run(p.id, got, "restock", no, adminId, at);
        const left = qty - got + sku.slice(1).reduce((t, c) => t + Math.max(bySku(c).reorder * 2, 10), 0);
        events.push({
          at,
          userId: adminId,
          action: "received",
          entity: "purchase_order",
          entityId: poId,
          summary: `Received ${got} × ${p.name} on ${no} (${ksh(got * p.cost)}), ${left} still outstanding`,
        });
      }
    });
  };
  openPo(["UCH-003", "WM-204"], "ordered", 2, "Deliver to back store");
  openPo(["FC-310", "SD-004"], "partially_received", 5, "Desks back-ordered by supplier");
  openPo(["ST-090"], "draft", 0, "");

  // Events derived from the sales history.
  const salesSince = db
    .prepare("SELECT id, invoice_no, user_id, status, subtotal_cents, discount_cents, total_cents, created_at FROM sales WHERE created_at >= ?")
    .all(auditFrom) as { id: number; invoice_no: string; user_id: number; status: string; subtotal_cents: number; discount_cents: number; total_cents: number; created_at: string }[];
  for (const sale of salesSince) {
    if (sale.discount_cents > 0) {
      const pct = Math.round((sale.discount_cents / sale.subtotal_cents) * 1000) / 10;
      events.push({
        at: sale.created_at,
        userId: sale.user_id,
        action: "discount_given",
        entity: "sale",
        entityId: sale.id,
        summary: `${sale.invoice_no}: discount of ${ksh(sale.discount_cents)} (${pct}%) on ${ksh(sale.subtotal_cents)}`,
        details: { subtotal: sale.subtotal_cents / 100, discount: sale.discount_cents / 100, percent: pct, total: sale.total_cents / 100 },
      });
    }
    if (sale.status === "cancelled") {
      events.push({
        at: minutesLater(sale.created_at, 25),
        userId: adminId,
        action: "cancelled",
        entity: "sale",
        entityId: sale.id,
        summary: `Cancelled ${sale.invoice_no} (${ksh(sale.total_cents)}, was paid); stock put back`,
        details: { previousStatus: "paid", total: sale.total_cents / 100 },
      });
    }
  }

  // A few one-off events an owner would want to spot.
  const lamp = bySku("DL-140");
  const priceAt = sqlDate(daysAgo(4, 8));
  events.push({
    at: priceAt,
    userId: adminId,
    action: "price_changed",
    entity: "product",
    entityId: lamp.id,
    summary: `${lamp.name}: price ${ksh(lamp.price - 20000)} → ${ksh(lamp.price)}`,
    details: { changes: { price: [(lamp.price - 20000) / 100, lamp.price / 100] } },
  });
  const hub = customerIds[8];
  events.push({
    at: sqlDate(daysAgo(12, 11)),
    userId: adminId,
    action: "credit_limit_changed",
    entity: "customer",
    entityId: hub,
    summary: "Nairobi Tech Hub Ltd: credit limit KSh 150,000 → KSh 250,000",
    details: { changes: { creditLimit: [150000, 250000] } },
  });
  const typo = sqlDate(daysAgo(6, 7));
  events.push({ at: minutesLater(typo, -5), userId: cashierId, action: "login_failed", entity: "auth", entityId: cashierId, summary: "Failed sign-in for cashier@stockflow.local" });
  const night = sqlDate(daysAgo(2, 22));
  for (const [i, email] of ["admin@stockflow.local", "admin@stockflow.local", "manager@stockflow.local"].entries()) {
    const known = email === "admin@stockflow.local";
    events.push({
      at: minutesLater(night, i),
      userId: known ? adminId : null,
      action: "login_failed",
      entity: "auth",
      entityId: known ? adminId : null,
      summary: `Failed sign-in for ${email}${known ? "" : " (no such account)"}`,
      ip: "41.90.64.118",
    });
  }

  const addAudit = db.prepare(
    `INSERT INTO audit_log (created_at, user_id, user_name, action, entity, entity_id, summary, details, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  // Insert oldest first so ids follow time, as they do in real use.
  for (const e of events.filter((x) => x.at >= auditFrom && x.at <= sqlDate(now)).sort((a, b) => a.at.localeCompare(b.at))) {
    addAudit.run(
      e.at,
      e.userId,
      e.userId ? userNames[e.userId] : "",
      e.action,
      e.entity,
      e.entityId ?? null,
      e.summary,
      e.details ? JSON.stringify(e.details) : null,
      e.ip ?? ipOf(e.userId),
    );
    auditCount++;
  }
})();

console.log(
  `Seeded ${catalog.length} products, ${Object.keys(supplierByCategory).length} suppliers, ${poCount} purchase orders, ` +
    `${returnCount} returns, ${expenseCount} expenses, ${shiftCount} closed till shifts, ${auditCount} activity log entries, ` +
    `${customerIds.length} customers, ${invoice} sales into ${dbFile}`,
);
console.log("Sign in with admin@stockflow.local / admin1234 or cashier@stockflow.local / cashier1234");
