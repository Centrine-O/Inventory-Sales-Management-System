import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { StatsCard } from "@/components/StatsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Package, Users, ShoppingCart, DollarSign, TrendingUp, Plus, FileText, ArrowRight } from "lucide-react";
import { PageHeader, SaleStatusBadge } from "@/components/common";
import { DailyRevenueBars } from "@/components/charts";
import { NewSaleDialog } from "@/components/sales/NewSaleDialog";
import { SaleDetailDialog } from "@/components/sales/SaleDetailDialog";
import { ProductFormDialog } from "@/components/products/ProductDialogs";
import { CustomerFormDialog } from "@/components/customers/CustomerDialogs";
import { useDashboard } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { ksh, kshCompact, pct, timeAgo } from "@/lib/format";

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, error } = useDashboard();
  const [saleOpen, setSaleOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [viewSale, setViewSale] = useState<number | null>(null);

  const change = pct(data?.revenueChangePct);
  const weekTotal = data?.last7Days.reduce((s, d) => s + d.revenue, 0) ?? 0;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title={`Welcome back, ${user?.name.split(" ")[0] ?? ""}`}
          description="Monitor sales momentum, stock pressure, and customer activity from one control view."
          actions={
            <Button className="bg-gradient-primary hover:bg-primary-dark" onClick={() => setSaleOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Record Sale
            </Button>
          }
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isLoading || !data ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-[118px] rounded-xl" />)
          ) : (
            <>
              <StatsCard
                title="Revenue this month"
                value={kshCompact(data.revenueThisMonth)}
                change={change ? `${change} vs same period last month` : `${data.ordersThisMonth} orders so far`}
                changeType={data.revenueChangePct === null ? "neutral" : data.revenueChangePct >= 0 ? "positive" : "negative"}
                icon={<DollarSign className="h-4 w-4" />}
              />
              <StatsCard
                title="Active products"
                value={data.activeProducts.toLocaleString()}
                change={
                  data.lowStockCount + data.outOfStockCount > 0
                    ? `${data.lowStockCount} low, ${data.outOfStockCount} out of stock`
                    : "All items above reorder level"
                }
                changeType={data.lowStockCount + data.outOfStockCount > 0 ? "negative" : "positive"}
                icon={<Package className="h-4 w-4" />}
              />
              <StatsCard
                title="Active customers"
                value={data.activeCustomers.toLocaleString()}
                change={`${data.newCustomersThisMonth} new this month`}
                changeType="neutral"
                icon={<Users className="h-4 w-4" />}
              />
              <StatsCard
                title="Sales today"
                value={data.salesToday}
                change={
                  data.pendingCount > 0
                    ? `${ksh(data.revenueToday)} · ${data.pendingCount} pending payment`
                    : `${ksh(data.revenueToday)} taken today`
                }
                changeType={data.pendingCount > 0 ? "negative" : "neutral"}
                icon={<ShoppingCart className="h-4 w-4" />}
              />
            </>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Revenue, last 7 days
              </CardTitle>
              <span className="text-sm text-muted-foreground">{ksh(weekTotal)} total</span>
            </CardHeader>
            <CardContent>
              {isLoading || !data ? <Skeleton className="h-[360px] w-full" /> : <DailyRevenueBars data={data.last7Days} height={360} />}
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Recent sales</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/app/sales">
                  View all <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
              {data?.recentSales.length === 0 && <p className="text-sm text-muted-foreground">No sales recorded yet.</p>}
              {data?.recentSales.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setViewSale(s.id)}
                  className="flex w-full items-center justify-between rounded-2xl border border-border/80 bg-muted/40 p-3 text-left transition-colors hover:bg-muted"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.customerName}</p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-mono">{s.invoiceNo}</span> · {timeAgo(s.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <p className="font-semibold">{ksh(s.total)}</p>
                    <SaleStatusBadge status={s.status} />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card className="shadow-medium">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle>Low stock watchlist</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/app/products">
                  Products <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}
              {data?.lowStock.length === 0 && (
                <p className="text-sm text-muted-foreground">Nothing to reorder — every product is above its reorder level.</p>
              )}
              {data?.lowStock.map((p) => (
                <Link
                  key={p.id}
                  to={`/app/products?search=${encodeURIComponent(p.sku)}`}
                  className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-xl p-2 ${p.stock === 0 ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                      <AlertTriangle className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium">{p.name}</p>
                      <p className="font-mono text-sm text-muted-foreground">{p.sku}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{p.stock === 0 ? "Out of stock" : `${p.stock} left`}</p>
                    <p className="text-sm text-muted-foreground">Reorder at {p.reorderLevel}</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <Button variant="outline" className="h-20 flex-col" onClick={() => setSaleOpen(true)}>
                  <ShoppingCart className="mb-2 h-6 w-6" />
                  New Sale
                </Button>
                <Button variant="outline" className="h-20 flex-col" onClick={() => setCustomerOpen(true)}>
                  <Users className="mb-2 h-6 w-6" />
                  Add Customer
                </Button>
                {isAdmin && (
                  <>
                    <Button variant="outline" className="h-20 flex-col" onClick={() => setProductOpen(true)}>
                      <Package className="mb-2 h-6 w-6" />
                      Add Product
                    </Button>
                    <Button variant="outline" className="h-20 flex-col" onClick={() => navigate("/app/reports")}>
                      <FileText className="mb-2 h-6 w-6" />
                      View Reports
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <NewSaleDialog open={saleOpen} onOpenChange={setSaleOpen} onCreated={(s) => setViewSale(s.id)} />
      <SaleDetailDialog saleId={viewSale} onOpenChange={(o) => !o && setViewSale(null)} />
      <ProductFormDialog open={productOpen} onOpenChange={setProductOpen} product={null} />
      <CustomerFormDialog open={customerOpen} onOpenChange={setCustomerOpen} customer={null} />
    </Layout>
  );
};

export default Dashboard;
