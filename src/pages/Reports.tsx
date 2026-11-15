import { useState } from "react";
import { endOfMonth, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, TrendingUp, Wallet, Receipt, PiggyBank, Clock, Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MetricCard, PageHeader } from "@/components/common";
import { DailyRevenueArea, RankedBars } from "@/components/charts";
import { useReport } from "@/hooks/api";
import { api, errorMessage, qs } from "@/lib/api";
import { ksh, kshCompact, pct, ymd } from "@/lib/format";

const PRESETS: Record<string, () => [Date, Date]> = {
  "7d": () => [subDays(new Date(), 6), new Date()],
  "30d": () => [subDays(new Date(), 29), new Date()],
  "90d": () => [subDays(new Date(), 89), new Date()],
  month: () => [startOfMonth(new Date()), new Date()],
  lastMonth: () => [startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1))],
  ytd: () => [startOfYear(new Date()), new Date()],
};

const ChangeHint = ({ value }: { value: number | null }) => {
  const label = pct(value);
  if (!label) return <span>No data for previous period</span>;
  return (
    <span className={value! >= 0 ? "text-accent" : "text-destructive"}>
      {label} <span className="text-muted-foreground">vs previous period</span>
    </span>
  );
};

const Reports = () => {
  const [preset, setPreset] = useState("30d");
  const [from, setFrom] = useState(() => ymd(PRESETS["30d"]()[0]));
  const [to, setTo] = useState(() => ymd(new Date()));
  const [exporting, setExporting] = useState(false);
  const { data, isLoading, isFetching, error } = useReport(from, to);

  const applyPreset = (key: string) => {
    setPreset(key);
    if (PRESETS[key]) {
      const [f, t] = PRESETS[key]();
      setFrom(ymd(f));
      setTo(ymd(t));
    }
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.download(`/reports/export.csv${qs({ from, to })}`, `report-${from}-to-${to}.csv`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const s = data?.summary;
  const loading = isLoading || !data;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Reports"
          description="Review business performance, margins, and stock value for any period."
          actions={
            <Button className="bg-gradient-primary hover:bg-primary-dark" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export CSV
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select value={preset} onValueChange={applyPreset}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="month">This month</SelectItem>
              <SelectItem value="lastMonth">Last month</SelectItem>
              <SelectItem value="ytd">Year to date</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="w-40"
            value={from}
            max={to}
            aria-label="From date"
            onChange={(e) => {
              if (!e.target.value) return;
              setFrom(e.target.value);
              setPreset("custom");
            }}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            className="w-40"
            value={to}
            min={from}
            aria-label="To date"
            onChange={(e) => {
              if (!e.target.value) return;
              setTo(e.target.value);
              setPreset("custom");
            }}
          />
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {error && <p className="text-sm text-destructive">{error.message}</p>}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Revenue"
            value={s && kshCompact(s.revenue)}
            icon={<TrendingUp className="h-5 w-5" />}
            loading={loading}
            hint={s && <ChangeHint value={s.revenueChangePct} />}
          />
          <MetricCard
            label="Orders"
            value={s?.orders}
            icon={<Receipt className="h-5 w-5" />}
            tone="accent"
            loading={loading}
            hint={s && <>Average order {ksh(s.averageOrder)}</>}
          />
          <MetricCard
            label="Gross profit"
            value={s && kshCompact(s.grossProfit)}
            icon={<PiggyBank className="h-5 w-5" />}
            tone="accent"
            loading={loading}
            hint={s && (s.grossMarginPct === null ? "No sales in period" : `${s.grossMarginPct.toFixed(1)}% margin`)}
          />
          <MetricCard
            label="Collected"
            value={s && kshCompact(s.collected)}
            icon={<Wallet className="h-5 w-5" />}
            tone={s && s.outstanding > 0 ? "warning" : "primary"}
            loading={loading}
            hint={
              s &&
              (s.outstanding > 0 ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {ksh(s.outstanding)} still pending
                </span>
              ) : (
                "Nothing outstanding"
              ))
            }
          />
        </div>

        <Card className="shadow-medium">
          <CardHeader>
            <CardTitle>Daily revenue</CardTitle>
          </CardHeader>
          <CardContent>{loading ? <Skeleton className="h-[280px] w-full" /> : <DailyRevenueArea data={data.daily} />}</CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Revenue by category</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : data.byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales in this period.</p>
              ) : (
                <RankedBars data={data.byCategory} />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Payment methods</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : data.byPaymentMethod.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sales in this period.</p>
              ) : (
                <RankedBars data={data.byPaymentMethod.map((p) => ({ ...p, name: p.method }))} />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Top products</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.topProducts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        No sales in this period.
                      </TableCell>
                    </TableRow>
                  )}
                  {data?.topProducts.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                      </TableCell>
                      <TableCell className="text-right">{p.units}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{ksh(p.revenue)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle>Top customers</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data?.topCustomers.length === 0 && <p className="text-sm text-muted-foreground">No named customers in this period.</p>}
                {data?.topCustomers.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-4 py-3">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground">{c.orders} orders</p>
                    </div>
                    <p className="font-semibold">{ksh(c.revenue)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="h-5 w-5" /> Inventory on hand
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Units in stock</span>
                  <span className="font-medium">{data?.inventory.units.toLocaleString() ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Value at cost</span>
                  <span className="font-medium">{data ? ksh(data.inventory.costValue) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Value at retail</span>
                  <span className="font-medium">{data ? ksh(data.inventory.retailValue) : "—"}</span>
                </div>
                {s && (
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-muted-foreground">VAT collected in period</span>
                    <span className="font-medium">{ksh(s.tax)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
