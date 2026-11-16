import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE COLLATE NOCASE,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (cost_cents >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  credit_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_cents >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Card', 'M-Pesa', 'Bank Transfer')),
  status TEXT NOT NULL CHECK (status IN ('paid', 'pending', 'cancelled')),
  subtotal_cents INTEGER NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);

CREATE TABLE IF NOT EXISTS sale_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  line_total_cents INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('Cash', 'Card', 'M-Pesa', 'Bank Transfer')),
  reference TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_sale ON payments(sale_id);

CREATE TABLE IF NOT EXISTS returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_no TEXT NOT NULL UNIQUE,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  reason TEXT NOT NULL DEFAULT '',
  value_cents INTEGER NOT NULL CHECK (value_cents >= 0),
  refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (refund_cents >= 0),
  refund_method TEXT CHECK (refund_method IS NULL OR refund_method IN ('Cash', 'Card', 'M-Pesa', 'Bank Transfer')),
  refund_reference TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_returns_sale ON returns(sale_id);

CREATE TABLE IF NOT EXISTS return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_id INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  sale_item_id INTEGER NOT NULL REFERENCES sale_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  value_cents INTEGER NOT NULL CHECK (value_cents >= 0),
  restocked INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_return_items_sale_item ON return_items(sale_item_id);

CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  change INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('initial', 'sale', 'restock', 'adjustment', 'sale_cancelled', 'return')),
  reference TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_number TEXT NOT NULL UNIQUE,
  supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
  status TEXT NOT NULL CHECK (status IN ('draft', 'ordered', 'partially_received', 'received', 'cancelled')),
  expected_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  ordered_at TEXT,
  received_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity_ordered INTEGER NOT NULL CHECK (quantity_ordered > 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  unit_cost_cents INTEGER NOT NULL CHECK (unit_cost_cents >= 0),
  CHECK (quantity_received <= quantity_ordered)
);
CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  payee TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Card', 'M-Pesa', 'Bank Transfer')),
  reference TEXT NOT NULL DEFAULT '',
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  opening_float_cents INTEGER NOT NULL CHECK (opening_float_cents >= 0),
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  closed_by INTEGER REFERENCES users(id),
  expected_cash_cents INTEGER,
  counted_cash_cents INTEGER,
  notes TEXT NOT NULL DEFAULT ''
);
-- One open till per person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_shifts_one_open ON shifts(user_id) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  reason TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_shift ON cash_movements(shift_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Who did what, for accountability. The actor's name is copied so entries still read correctly if the
-- account is later renamed. No foreign keys: the log must outlive anything it describes.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  details TEXT,
  ip TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
-- Append-only: entries can't be edited or removed through the database connection the app uses.
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'The audit log is append-only'); END;
`;

export const DEFAULT_SETTINGS: Record<string, string | number | boolean> = {
  businessName: "StockFlow Main Branch",
  email: "ops@stockflow.local",
  phone: "",
  address: "",
  currency: "KES",
  taxRate: 16,
  lowStockAlerts: true,
  dailySummary: true,
  largeTransactionReview: false,
  largeTransactionThreshold: 100000,
  requireShiftForSales: false,
};

export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, JSON.stringify(v));
  return db;
}

/**
 * One place that defines what a sale is worth and what's still owed, after payments, returns and refunds.
 * Every balance in the app reads from here so the numbers can't drift apart.
 */
const SALE_BALANCES_VIEW = `
DROP VIEW IF EXISTS sale_balances;
CREATE VIEW sale_balances AS
SELECT
  x.sale_id,
  x.paid_cents,
  x.refunded_cents,
  x.returned_cents,
  x.total_cents - x.returned_cents AS net_total_cents,
  x.paid_cents - x.refunded_cents AS net_paid_cents,
  MAX(0, (x.total_cents - x.returned_cents) - (x.paid_cents - x.refunded_cents)) AS balance_cents
FROM (
  SELECT s.id AS sale_id, s.total_cents,
    COALESCE((SELECT SUM(amount_cents) FROM payments WHERE sale_id = s.id), 0) AS paid_cents,
    COALESCE((SELECT SUM(refund_cents) FROM returns WHERE sale_id = s.id), 0) AS refunded_cents,
    COALESCE((SELECT SUM(value_cents) FROM returns WHERE sale_id = s.id), 0) AS returned_cents
  FROM sales s
) x;
`;

/** Additive migrations for databases created by earlier versions. */
function migrate(db: DB) {
  // SQLite can't alter a CHECK constraint, so rebuild stock_movements to allow the 'return' reason.
  const movementsSql = (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'stock_movements'").get() as { sql: string }).sql;
  if (!movementsSql.includes("'return'")) {
    // SQLite's documented table-rebuild procedure: foreign keys off (only possible outside a transaction).
    db.pragma("foreign_keys = OFF");
    db.transaction(() => {
      db.exec(`
        CREATE TABLE stock_movements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL REFERENCES products(id),
          change INTEGER NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('initial', 'sale', 'restock', 'adjustment', 'sale_cancelled', 'return')),
          reference TEXT NOT NULL DEFAULT '',
          user_id INTEGER REFERENCES users(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO stock_movements_new (id, product_id, change, reason, reference, user_id, created_at)
          SELECT id, product_id, change, reason, reference, user_id, created_at FROM stock_movements;
        DROP TABLE stock_movements;
        ALTER TABLE stock_movements_new RENAME TO stock_movements;
        CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
      `);
    })();
    db.pragma("foreign_keys = ON");
  }

  const productCols = (db.prepare("PRAGMA table_info(products)").all() as { name: string }[]).map((c) => c.name);
  if (!productCols.includes("supplier_id")) {
    db.exec("ALTER TABLE products ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id)");
  }
  if (!productCols.includes("barcode")) {
    db.exec("ALTER TABLE products ADD COLUMN barcode TEXT");
  }
  // Barcodes are optional but must be unique when present.
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL");
  const customerCols = (db.prepare("PRAGMA table_info(customers)").all() as { name: string }[]).map((c) => c.name);
  if (!customerCols.includes("credit_limit_cents")) {
    db.exec("ALTER TABLE customers ADD COLUMN credit_limit_cents INTEGER NOT NULL DEFAULT 0 CHECK (credit_limit_cents >= 0)");
  }
  // Sales paid in full before the payments ledger existed get one payment for their total.
  db.exec(`
    INSERT INTO payments (sale_id, amount_cents, method, reference, user_id, created_at)
    SELECT s.id, s.total_cents, s.payment_method, 'Recorded at sale', s.user_id, s.created_at
    FROM sales s
    WHERE s.status = 'paid' AND s.total_cents > 0
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.sale_id = s.id)
  `);
  db.exec(SALE_BALANCES_VIEW);

  // Link money movements to the till that was open when they happened. Triggers make this automatic for
  // every insert path, and avoid matching by timestamp (second resolution makes open/close boundaries ambiguous).
  for (const table of ["sales", "payments", "returns"]) {
    const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
    if (!cols.includes("shift_id")) db.exec(`ALTER TABLE ${table} ADD COLUMN shift_id INTEGER REFERENCES shifts(id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_shift ON ${table}(shift_id)`);
    // Only rows created while the till was open are attached, so backfilled or imported historical rows
    // (e.g. the payments backfill above) never land in someone's current till.
    db.exec(`DROP TRIGGER IF EXISTS trg_${table}_shift`);
    db.exec(`
      CREATE TRIGGER trg_${table}_shift AFTER INSERT ON ${table}
      WHEN NEW.shift_id IS NULL
        AND NEW.created_at >= (SELECT opened_at FROM shifts WHERE user_id = NEW.user_id AND closed_at IS NULL)
      BEGIN
        UPDATE ${table} SET shift_id = (SELECT id FROM shifts WHERE user_id = NEW.user_id AND closed_at IS NULL)
        WHERE id = NEW.id;
      END`);
  }
}

export const toCents = (amount: number) => Math.round(amount * 100);
export const fromCents = (cents: number | null | undefined) => (cents ?? 0) / 100;
