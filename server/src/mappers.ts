import { fromCents } from "./db.js";

/** SQLite datetime('now') is UTC without a zone marker; expose ISO-8601 to clients. */
export const iso = (sqliteDate: string) => sqliteDate.replace(" ", "T") + "Z";

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export function stockStatus(stock: number, reorderLevel: number): StockStatus {
  if (stock <= 0) return "out_of_stock";
  if (stock <= reorderLevel) return "low_stock";
  return "in_stock";
}

export interface ProductRow {
  id: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  price_cents: number;
  cost_cents: number;
  stock: number;
  reorder_level: number;
  supplier_id: number | null;
  archived: number;
  created_at: string;
  updated_at: string;
}

export const mapProduct = (r: ProductRow) => ({
  id: r.id,
  name: r.name,
  sku: r.sku,
  category: r.category,
  description: r.description,
  price: fromCents(r.price_cents),
  cost: fromCents(r.cost_cents),
  stock: r.stock,
  reorderLevel: r.reorder_level,
  supplierId: r.supplier_id ?? null,
  status: stockStatus(r.stock, r.reorder_level),
  archived: r.archived === 1,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});

export interface SaleRow {
  id: number;
  invoice_no: string;
  customer_id: number | null;
  customer_name: string | null;
  user_id: number;
  cashier_name: string | null;
  payment_method: string;
  status: string;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  returned_cents: number;
  refunded_cents: number;
  balance_cents: number;
  notes: string;
  item_count: number;
  created_at: string;
}

export const mapSale = (r: SaleRow) => ({
  id: r.id,
  invoiceNo: r.invoice_no,
  customerId: r.customer_id,
  customerName: r.customer_name ?? "Walk-in customer",
  cashierName: r.cashier_name ?? "",
  paymentMethod: r.payment_method,
  status: r.status,
  subtotal: fromCents(r.subtotal_cents),
  discount: fromCents(r.discount_cents),
  tax: fromCents(r.tax_cents),
  total: fromCents(r.total_cents),
  /** Paid by the customer, net of any refunds. */
  amountPaid: fromCents(r.paid_cents),
  returnedValue: fromCents(r.returned_cents),
  refunded: fromCents(r.refunded_cents),
  /** What the sale is worth after returns. */
  netTotal: fromCents(r.total_cents - r.returned_cents),
  balance: r.status === "cancelled" ? 0 : fromCents(r.balance_cents),
  notes: r.notes,
  itemCount: r.item_count,
  createdAt: iso(r.created_at),
});

export const SALE_SELECT = `
  SELECT s.*, c.name AS customer_name, u.name AS cashier_name,
    (SELECT COALESCE(SUM(quantity), 0) FROM sale_items WHERE sale_id = s.id) AS item_count,
    b.net_paid_cents AS paid_cents, b.returned_cents, b.refunded_cents, b.balance_cents
  FROM sales s
  JOIN sale_balances b ON b.sale_id = s.id
  LEFT JOIN customers c ON c.id = s.customer_id
  LEFT JOIN users u ON u.id = s.user_id
`;

export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // Neutralise spreadsheet formula injection, then quote if needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export const toCsv = (header: string[], rows: unknown[][]) =>
  [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
