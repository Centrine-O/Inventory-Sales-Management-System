import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

// App pages load on demand so the landing and login pages stay light.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Customers = lazy(() => import("./pages/Customers"));
const Sales = lazy(() => import("./pages/Sales"));
const Reports = lazy(() => import("./pages/Reports"));
const Settings = lazy(() => import("./pages/Settings"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const PurchaseOrders = lazy(() => import("./pages/PurchaseOrders"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Till = lazy(() => import("./pages/Till"));
const AuditLog = lazy(() => import("./pages/AuditLog"));

const PageFallback = () => (
  <div className="flex min-h-screen items-center justify-center">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Don't hammer the API on auth/permission/validation errors.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner richColors position="top-right" />
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/app" element={<Dashboard />} />
                <Route path="/app/products" element={<Products />} />
                <Route path="/app/customers" element={<Customers />} />
                <Route path="/app/sales" element={<Sales />} />
                <Route path="/app/till" element={<Till />} />
                <Route path="/app/settings" element={<Settings />} />
              </Route>
              <Route element={<ProtectedRoute adminOnly />}>
                <Route path="/app/reports" element={<Reports />} />
                <Route path="/app/suppliers" element={<Suppliers />} />
                <Route path="/app/purchase-orders" element={<PurchaseOrders />} />
                <Route path="/app/expenses" element={<Expenses />} />
                <Route path="/app/activity" element={<AuditLog />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
