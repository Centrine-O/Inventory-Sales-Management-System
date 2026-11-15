import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Download, ShoppingCart, Wallet, Clock, Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { MetricCard, PageHeader, SaleStatusBadge, TableLoading, TableMessage } from "@/components/common";
import { NewSaleDialog } from "@/components/sales/NewSaleDialog";
import { SaleDetailDialog } from "@/components/sales/SaleDetailDialog";
import { useSales, useSettings } from "@/hooks/api";
import { Badge } from "@/components/ui/badge";
import { api, errorMessage, qs } from "@/lib/api";
import { formatDateTime, ksh, kshCompact } from "@/lib/format";

const Sales = () => {
  const [params, setParams] = useSearchParams();
  const viewing = params.get("view") ? Number(params.get("view")) : null;
  const setViewing = (id: number | null) => setParams(id ? { view: String(id) } : {}, { replace: true });

  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newOpen, setNewOpen] = useState(params.get("new") === "1");
  const [exporting, setExporting] = useState(false);

  const filters = { search: searchInput.trim() || undefined, status: status === "all" ? undefined : status, from, to };
  const { data: sales = [], isLoading } = useSales(filters);
  const { data: settings } = useSettings();
  const reviewThreshold = settings?.largeTransactionReview ? settings.largeTransactionThreshold : null;

  const active = sales.filter((s) => s.status !== "cancelled");
  const revenue = active.reduce((s, x) => s + x.total, 0);
  const pending = sales.filter((s) => s.status === "pending");

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.download(`/sales/export.csv${qs(filters)}`, `sales${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Sales"
          description="Record transactions, follow up on pending payments, and review invoice history."
          actions={
            <Button className="bg-gradient-primary hover:bg-primary-dark" onClick={() => setNewOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Sale
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Revenue (filtered)" value={kshCompact(revenue)} icon={<Wallet className="h-6 w-6" />} loading={isLoading} />
          <MetricCard label="Orders" value={active.length} icon={<ShoppingCart className="h-6 w-6" />} tone="accent" loading={isLoading} />
          <MetricCard
            label="Average order"
            value={ksh(active.length ? Math.round(revenue / active.length) : 0)}
            icon={<Receipt className="h-6 w-6" />}
            tone="accent"
            loading={isLoading}
          />
          <MetricCard
            label="Pending payment"
            value={pending.length}
            icon={<Clock className="h-6 w-6" />}
            tone="warning"
            loading={isLoading}
            hint={pending.length > 0 && `${ksh(pending.reduce((s, x) => s + x.total, 0))} outstanding`}
          />
        </div>

        <Card className="shadow-medium">
          <CardHeader>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <CardTitle>Sales history</CardTitle>
              <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Invoice or customer..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-10 sm:w-56"
                  />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="sm:w-40" aria-label="From date" />
                <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="sm:w-40" aria-label="To date" />
                <Button variant="outline" onClick={exportCsv} disabled={exporting}>
                  {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export CSV
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableLoading cols={7} />}
                {!isLoading && sales.length === 0 && <TableMessage cols={7}>No sales match these filters.</TableMessage>}
                {sales.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setViewing(s.id)}>
                    <TableCell className="font-mono font-medium">{s.invoiceNo}</TableCell>
                    <TableCell>{s.customerName}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(s.createdAt)}</TableCell>
                    <TableCell className="text-right">{s.itemCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">
                      {reviewThreshold !== null && s.status !== "cancelled" && s.total >= reviewThreshold && (
                        <Badge variant="outline" className="mr-2 border-warning text-warning">
                          Review
                        </Badge>
                      )}
                      {ksh(s.total)}
                    </TableCell>
                    <TableCell>{s.paymentMethod}</TableCell>
                    <TableCell>
                      <SaleStatusBadge status={s.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <NewSaleDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(sale) => setViewing(sale.id)} />
      <SaleDetailDialog saleId={viewing} onOpenChange={(o) => !o && setViewing(null)} />
    </Layout>
  );
};

export default Sales;
