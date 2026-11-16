export type Role = "admin" | "cashier";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export interface ManagedUser extends User {
  active: boolean;
  createdAt: string;
}

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock";

export interface Product {
  id: number;
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  stock: number;
  reorderLevel: number;
  supplierId: number | null;
  barcode: string | null;
  status: StockStatus;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: number;
  change: number;
  reason: "initial" | "sale" | "restock" | "adjustment" | "sale_cancelled" | "return";
  reference: string;
  userName: string;
  createdAt: string;
}

export interface ProductDetail extends Product {
  movements: StockMovement[];
}

export interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  status: "active" | "inactive";
  totalOrders: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  creditLimit: number;
  balance: number;
  oldestUnpaidAt: string | null;
  createdAt: string;
}

export type PaymentMethod = "Cash" | "Card" | "M-Pesa" | "Bank Transfer";
export const PAYMENT_METHODS: PaymentMethod[] = ["Cash", "M-Pesa", "Card", "Bank Transfer"];
export type SaleStatus = "paid" | "pending" | "cancelled";

export interface Sale {
  id: number;
  invoiceNo: string;
  customerId: number | null;
  customerName: string;
  cashierName: string;
  paymentMethod: PaymentMethod;
  status: SaleStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  returnedValue: number;
  refunded: number;
  netTotal: number;
  balance: number;
  notes: string;
  itemCount: number;
  createdAt: string;
}

export interface SaleItem {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  returnedQuantity: number;
}

export interface SaleReturn {
  id: number;
  returnNo: string;
  reason: string;
  value: number;
  refund: number;
  refundMethod: PaymentMethod | null;
  refundReference: string;
  processedBy: string;
  createdAt: string;
  items: { productName: string; quantity: number; restocked: boolean; value: number }[];
}

export interface ReturnRecord {
  id: number;
  returnNo: string;
  saleId: number;
  invoiceNo: string;
  customerName: string;
  reason: string;
  value: number;
  refund: number;
  refundMethod: PaymentMethod | null;
  units: number;
  damagedUnits: number;
  processedBy: string;
  createdAt: string;
}

export interface Payment {
  id: number;
  amount: number;
  method: PaymentMethod;
  reference: string;
  receivedBy: string;
  createdAt: string;
}

export interface SaleDetail extends Sale {
  customer: { name: string; email: string; phone: string } | null;
  items: SaleItem[];
  payments: Payment[];
  returns: SaleReturn[];
}

export interface CustomerDetail extends Customer {
  sales: Sale[];
  payments: { id: number; saleId: number; invoiceNo: string; amount: number; method: PaymentMethod; reference: string; createdAt: string }[];
}

export interface AgingBuckets {
  current: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export interface Receivables {
  totals: AgingBuckets;
  customers: (AgingBuckets & { customerId: number | null; name: string; phone: string; invoices: number; oldestDays: number })[];
}

export interface DayPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface Dashboard {
  revenueThisMonth: number;
  revenueChangePct: number | null;
  ordersThisMonth: number;
  salesToday: number;
  revenueToday: number;
  pendingCount: number;
  pendingAmount: number;
  activeProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  activeCustomers: number;
  newCustomersThisMonth: number;
  last7Days: DayPoint[];
  recentSales: Sale[];
  lowStock: Product[];
}

export interface Expense {
  id: number;
  date: string;
  category: string;
  payee: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference: string;
  recordedBy: string;
  createdAt: string;
}

export interface ProfitAndLoss {
  revenue: number;
  costOfGoods: number;
  grossProfit: number;
  expenses: number;
  expensesChangePct: number | null;
  expensesByCategory: { category: string; count: number; amount: number }[];
  netProfit: number;
  netMarginPct: number | null;
}

export interface Report {
  from: string;
  to: string;
  profitAndLoss: ProfitAndLoss;
  summary: {
    grossSales: number;
    returns: number;
    returnsCount: number;
    refunds: number;
    revenue: number;
    revenueChangePct: number | null;
    orders: number;
    ordersChangePct: number | null;
    averageOrder: number;
    collected: number;
    outstanding: number;
    tax: number;
    discounts: number;
    grossProfit: number;
    grossMarginPct: number | null;
  };
  daily: DayPoint[];
  byCategory: { name: string; units: number; revenue: number }[];
  topProducts: { id: number; name: string; sku: string; units: number; revenue: number }[];
  byPaymentMethod: { method: string; orders: number; revenue: number }[];
  topCustomers: { id: number; name: string; orders: number; revenue: number }[];
  inventory: { units: number; costValue: number; retailValue: number };
}

export interface Settings {
  businessName: string;
  email: string;
  phone: string;
  address: string;
  currency: string;
  taxRate: number;
  lowStockAlerts: boolean;
  dailySummary: boolean;
  largeTransactionReview: boolean;
  largeTransactionThreshold: number;
  requireShiftForSales: boolean;
}

export interface SearchResults {
  products: { id: number; name: string; sku: string }[];
  customers: { id: number; name: string; email: string; phone: string }[];
  sales: { id: number; invoiceNo: string; customerName: string }[];
}

export interface Supplier {
  id: number;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  active: boolean;
  productCount: number;
  openOrders: number;
  totalPurchased: number;
  createdAt: string;
}

export type PurchaseOrderStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";

export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId: number;
  supplierName: string;
  status: PurchaseOrderStatus;
  expectedDate: string | null;
  notes: string;
  createdBy: string;
  lineCount: number;
  unitsOrdered: number;
  unitsReceived: number;
  total: number;
  receivedValue: number;
  createdAt: string;
  orderedAt: string | null;
  receivedAt: string | null;
}

export interface PurchaseOrderItem {
  id: number;
  productId: number;
  productName: string;
  sku: string;
  currentStock: number;
  quantityOrdered: number;
  quantityReceived: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseOrderDetail extends PurchaseOrder {
  supplier: { name: string; contactName: string; email: string; phone: string; address: string };
  items: PurchaseOrderItem[];
}

export interface SupplierDetail extends Supplier {
  products: Product[];
  orders: PurchaseOrder[];
}

export interface ReorderGroup {
  supplierId: number | null;
  supplierName: string | null;
  items: {
    productId: number;
    name: string;
    sku: string;
    stock: number;
    reorderLevel: number;
    onOrder: number;
    suggestedQuantity: number;
    unitCost: number;
  }[];
}

export interface Shift {
  id: number;
  userId: number;
  userName: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  closedBy: string | null;
  notes: string;
  openingFloat: number;
  sales: { count: number; total: number; onCredit: number };
  takings: { method: PaymentMethod; count: number; amount: number }[];
  totalTaken: number;
  refunds: { method: PaymentMethod; count: number; amount: number }[];
  cashTaken: number;
  cashRefunded: number;
  payIns: number;
  payOuts: number;
  movements: { id: number; type: "in" | "out"; amount: number; reason: string; userName: string; createdAt: string }[];
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
}
