import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api";
import type {
  Customer,
  CustomerDetail,
  Dashboard,
  Expense,
  ManagedUser,
  PaymentMethod,
  Product,
  ProductDetail,
  PurchaseOrder,
  PurchaseOrderDetail,
  Receivables,
  ReorderGroup,
  ReturnRecord,
  Report,
  Sale,
  SaleDetail,
  SearchResults,
  Settings,
  StockStatus,
  Supplier,
  SupplierDetail,
} from "@/lib/types";

/** Everything that changes when stock or sales change. */
const INVENTORY_KEYS = [
  ["products"],
  ["product"],
  ["sales"],
  ["sale"],
  ["customers"],
  ["customer"],
  ["dashboard"],
  ["reports"],
  ["purchase-orders"],
  ["purchase-order"],
  ["suppliers"],
  ["supplier"],
];

function useInvalidate() {
  const qc = useQueryClient();
  return (keys: string[][] = INVENTORY_KEYS) => keys.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
}

const onError = (e: unknown) => toast.error(errorMessage(e));

// ---------- Products ----------

export const useProducts = (filters: { search?: string; status?: StockStatus | ""; category?: string } = {}) =>
  useQuery({
    queryKey: ["products", filters],
    queryFn: () => api.get<Product[]>(`/products${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useProduct = (id: number | null) =>
  useQuery({
    queryKey: ["product", id],
    queryFn: () => api.get<ProductDetail>(`/products/${id}`),
    enabled: id !== null,
  });

export const useCategories = () =>
  useQuery({ queryKey: ["products", "categories"], queryFn: () => api.get<string[]>("/products/categories") });

export interface ProductInput {
  name: string;
  sku: string;
  category: string;
  description: string;
  price: number;
  cost: number;
  stock?: number;
  reorderLevel: number;
  supplierId: number | null;
  barcode: string;
}

export function useSaveProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: ProductInput & { id?: number }) =>
      id ? api.patch<Product>(`/products/${id}`, body) : api.post<Product>("/products", body),
    onSuccess: (p, vars) => {
      invalidate();
      toast.success(vars.id ? `${p.name} updated` : `${p.name} added`);
    },
    onError,
  });
}

export function useAdjustStock() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; change: number; reason: "restock" | "adjustment"; note: string }) =>
      api.post<Product>(`/products/${id}/stock`, body),
    onSuccess: (p) => {
      invalidate();
      toast.success(`${p.name} stock is now ${p.stock}`);
    },
    onError,
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (p: Product) => api.delete<{ archived: boolean }>(`/products/${p.id}`),
    onSuccess: (res, p) => {
      invalidate();
      toast.success(res.archived ? `${p.name} archived (it has sales history)` : `${p.name} deleted`);
    },
    onError,
  });
}

// ---------- Customers ----------

export const useCustomers = (filters: { search?: string; status?: string; withBalance?: string } = {}) =>
  useQuery({
    queryKey: ["customers", filters],
    queryFn: () => api.get<Customer[]>(`/customers${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useCustomer = (id: number | null) =>
  useQuery({
    queryKey: ["customer", id],
    queryFn: () => api.get<CustomerDetail>(`/customers/${id}`),
    enabled: id !== null,
  });

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
  status: "active" | "inactive";
  creditLimit?: number;
}

export function useSaveCustomer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: CustomerInput & { id?: number }) =>
      id ? api.patch<Customer>(`/customers/${id}`, body) : api.post<Customer>("/customers", body),
    onSuccess: (c, vars) => {
      invalidate([["customers"], ["customer"], ["dashboard"]]);
      toast.success(vars.id ? `${c.name} updated` : `${c.name} added`);
    },
    onError,
  });
}

export function useDeleteCustomer() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (c: Customer) => api.delete(`/customers/${c.id}`),
    onSuccess: (_r, c) => {
      invalidate([["customers"], ["dashboard"]]);
      toast.success(`${c.name} deleted`);
    },
    onError,
  });
}

// ---------- Sales ----------

export const useSales = (filters: { search?: string; status?: string; from?: string; to?: string } = {}) =>
  useQuery({
    queryKey: ["sales", filters],
    queryFn: () => api.get<Sale[]>(`/sales${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useSale = (id: number | null) =>
  useQuery({
    queryKey: ["sale", id],
    queryFn: () => api.get<SaleDetail>(`/sales/${id}`),
    enabled: id !== null,
  });

export interface SaleInput {
  customerId: number | null;
  paymentMethod: PaymentMethod;
  status: "paid" | "pending";
  amountPaid: number;
  discount: number;
  notes: string;
  items: { productId: number; quantity: number }[];
}

export function useCreateSale() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: SaleInput) => api.post<SaleDetail>("/sales", body),
    onSuccess: (s) => {
      invalidate();
      toast.success(`Sale ${s.invoiceNo} recorded`);
    },
    onError,
  });
}

export function useRecordPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ saleId, ...body }: { saleId: number; amount: number; method: PaymentMethod; reference: string }) =>
      api.post<SaleDetail>(`/sales/${saleId}/payments`, body),
    onSuccess: (s, vars) => {
      invalidate([["sales"], ["sale"], ["customers"], ["customer"], ["dashboard"], ["reports"]]);
      toast.success(s.status === "paid" ? `${s.invoiceNo} is now fully paid` : `Payment of KSh ${vars.amount.toLocaleString()} recorded`);
    },
    onError,
  });
}

export interface ReturnInput {
  saleId: number;
  reason: string;
  refundMethod?: PaymentMethod;
  refundReference: string;
  items: { saleItemId: number; quantity: number; restock: boolean }[];
}

export function useCreateReturn() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ saleId, ...body }: ReturnInput) =>
      api.post<SaleDetail & { lastReturn: { returnNo: string; refund: number } }>(`/sales/${saleId}/returns`, body),
    onSuccess: (s) => {
      invalidate([...INVENTORY_KEYS, ["returns"]]);
      toast.success(
        s.lastReturn.refund > 0
          ? `${s.lastReturn.returnNo} processed · refund KSh ${s.lastReturn.refund.toLocaleString()}`
          : `${s.lastReturn.returnNo} processed`,
      );
    },
    onError,
  });
}

export const useReturns = (filters: { search?: string; from?: string; to?: string } = {}, enabled = true) =>
  useQuery({
    queryKey: ["returns", filters],
    queryFn: () => api.get<ReturnRecord[]>(`/returns${qs(filters)}`),
    placeholderData: keepPreviousData,
    enabled,
  });

export const useReceivables = (enabled = true) =>
  useQuery({ queryKey: ["reports", "receivables"], queryFn: () => api.get<Receivables>("/reports/receivables"), enabled });

export function useUpdateSaleStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "paid" | "cancelled" }) =>
      api.patch<SaleDetail>(`/sales/${id}/status`, { status }),
    onSuccess: (s) => {
      invalidate();
      toast.success(s.status === "cancelled" ? `${s.invoiceNo} cancelled and stock restored` : `${s.invoiceNo} marked paid`);
    },
    onError,
  });
}

// ---------- Dashboard, reports, search ----------

export const useDashboard = () =>
  useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<Dashboard>("/dashboard"), refetchInterval: 60_000 });

export const useReport = (from: string, to: string) =>
  useQuery({
    queryKey: ["reports", from, to],
    queryFn: () => api.get<Report>(`/reports${qs({ from, to })}`),
    placeholderData: keepPreviousData,
  });

export const useSearch = (q: string) =>
  useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<SearchResults>(`/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
    staleTime: 10_000,
  });

// ---------- Settings & users ----------

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<Settings>("/settings") });

export function useSaveSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Partial<Settings>) => api.put<Settings>("/settings", body),
    onSuccess: () => {
      invalidate([["settings"]]);
      toast.success("Settings saved");
    },
    onError,
  });
}

export const useUsers = (enabled = true) =>
  useQuery({ queryKey: ["users"], queryFn: () => api.get<ManagedUser[]>("/users"), enabled });

export function useSaveUser() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ManagedUser> & { id?: number; password?: string }) =>
      id ? api.patch<ManagedUser>(`/users/${id}`, body) : api.post<ManagedUser>("/users", body),
    onSuccess: (u, vars) => {
      invalidate([["users"]]);
      toast.success(vars.id ? `${u.name} updated` : `${u.name} added`);
    },
    onError,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) => api.post("/auth/password", body),
    onSuccess: () => toast.success("Password changed"),
    onError,
  });
}

// ---------- Suppliers ----------

export const useSuppliers = (enabled = true) =>
  useQuery({ queryKey: ["suppliers"], queryFn: () => api.get<Supplier[]>("/suppliers"), enabled });

export const useSupplier = (id: number | null) =>
  useQuery({
    queryKey: ["supplier", id],
    queryFn: () => api.get<SupplierDetail>(`/suppliers/${id}`),
    enabled: id !== null,
  });

export interface SupplierInput {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
  active: boolean;
}

export function useSaveSupplier() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: SupplierInput & { id?: number }) =>
      id ? api.patch<Supplier>(`/suppliers/${id}`, body) : api.post<Supplier>("/suppliers", body),
    onSuccess: (s, vars) => {
      invalidate([["suppliers"], ["supplier"]]);
      toast.success(vars.id ? `${s.name} updated` : `${s.name} added`);
    },
    onError,
  });
}

export function useDeleteSupplier() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (s: Supplier) => api.delete(`/suppliers/${s.id}`),
    onSuccess: (_r, s) => {
      invalidate([["suppliers"], ["products"]]);
      toast.success(`${s.name} deleted`);
    },
    onError,
  });
}

// ---------- Purchase orders ----------

export const usePurchaseOrders = (filters: { status?: string; supplierId?: number; search?: string } = {}) =>
  useQuery({
    queryKey: ["purchase-orders", filters],
    queryFn: () => api.get<PurchaseOrder[]>(`/purchase-orders${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const usePurchaseOrder = (id: number | null) =>
  useQuery({
    queryKey: ["purchase-order", id],
    queryFn: () => api.get<PurchaseOrderDetail>(`/purchase-orders/${id}`),
    enabled: id !== null,
  });

export const useReorderSuggestions = () =>
  useQuery({ queryKey: ["purchase-orders", "suggestions"], queryFn: () => api.get<ReorderGroup[]>("/purchase-orders/suggestions") });

export interface PurchaseOrderInput {
  supplierId: number;
  expectedDate: string | null;
  notes: string;
  items: { productId: number; quantity: number; unitCost: number }[];
}

export function useSavePurchaseOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<PurchaseOrderInput> & { id?: number }) =>
      id ? api.patch<PurchaseOrderDetail>(`/purchase-orders/${id}`, body) : api.post<PurchaseOrderDetail>("/purchase-orders", body),
    onSuccess: (po, vars) => {
      invalidate([["purchase-orders"], ["purchase-order"], ["suppliers"], ["supplier"]]);
      toast.success(vars.id ? `${po.poNumber} saved` : `${po.poNumber} created as a draft`);
    },
    onError,
  });
}

export function usePurchaseOrderAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, action }: { id: number; action: "order" | "cancel" }) =>
      api.post<PurchaseOrderDetail>(`/purchase-orders/${id}/${action}`),
    onSuccess: (po, { action }) => {
      invalidate([["purchase-orders"], ["purchase-order"], ["suppliers"], ["supplier"]]);
      toast.success(action === "order" ? `${po.poNumber} placed with ${po.supplierName}` : `${po.poNumber} cancelled`);
    },
    onError,
  });
}

export function useReceivePurchaseOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; items: { itemId: number; quantity: number }[]; note: string }) =>
      api.post<PurchaseOrderDetail>(`/purchase-orders/${id}/receive`, body),
    onSuccess: (po) => {
      invalidate();
      toast.success(po.status === "received" ? `${po.poNumber} fully received` : `Goods received against ${po.poNumber}`);
    },
    onError,
  });
}

export function useDeletePurchaseOrder() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (po: PurchaseOrder) => api.delete(`/purchase-orders/${po.id}`),
    onSuccess: (_r, po) => {
      invalidate([["purchase-orders"]]);
      toast.success(`${po.poNumber} deleted`);
    },
    onError,
  });
}

// ---------- Expenses ----------

export const useExpenses = (filters: { from?: string; to?: string; category?: string; search?: string } = {}) =>
  useQuery({
    queryKey: ["expenses", filters],
    queryFn: () => api.get<Expense[]>(`/expenses${qs(filters)}`),
    placeholderData: keepPreviousData,
  });

export const useExpenseCategories = (enabled = true) =>
  useQuery({ queryKey: ["expenses", "categories"], queryFn: () => api.get<string[]>("/expenses/categories"), enabled });

export interface ExpenseInput {
  date: string;
  category: string;
  payee: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  reference: string;
}

export function useSaveExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: ExpenseInput & { id?: number }) =>
      id ? api.patch<Expense>(`/expenses/${id}`, body) : api.post<Expense>("/expenses", body),
    onSuccess: (e, vars) => {
      invalidate([["expenses"], ["reports"]]);
      toast.success(vars.id ? "Expense updated" : `${e.category} expense of KSh ${e.amount.toLocaleString()} recorded`);
    },
    onError,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (e: Expense) => api.delete(`/expenses/${e.id}`),
    onSuccess: () => {
      invalidate([["expenses"], ["reports"]]);
      toast.success("Expense deleted");
    },
    onError,
  });
}
