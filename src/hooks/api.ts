import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage, qs } from "@/lib/api";
import type {
  Customer,
  CustomerDetail,
  Dashboard,
  ManagedUser,
  PaymentMethod,
  Product,
  ProductDetail,
  Report,
  Sale,
  SaleDetail,
  SearchResults,
  Settings,
  StockStatus,
} from "@/lib/types";

/** Everything that changes when stock or sales change. */
const INVENTORY_KEYS = [["products"], ["product"], ["sales"], ["sale"], ["customers"], ["customer"], ["dashboard"], ["reports"]];

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

export const useCustomers = (filters: { search?: string; status?: string } = {}) =>
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
