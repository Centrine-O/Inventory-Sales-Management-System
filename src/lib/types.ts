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
  status: StockStatus;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovement {
  id: number;
  change: number;
  reason: "initial" | "sale" | "restock" | "adjustment" | "sale_cancelled";
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
}

export interface SaleDetail extends Sale {
  customer: { name: string; email: string; phone: string } | null;
  items: SaleItem[];
}

export interface CustomerDetail extends Customer {
  sales: Sale[];
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

export interface Report {
  from: string;
  to: string;
  summary: {
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
}

export interface SearchResults {
  products: { id: number; name: string; sku: string }[];
  customers: { id: number; name: string; email: string; phone: string }[];
  sales: { id: number; invoiceNo: string; customerName: string }[];
}
