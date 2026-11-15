import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { parseISO, isBefore, startOfToday } from "date-fns";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, ClipboardList, Plus, Search, Truck, Wallet } from "lucide-react";
import { MetricCard, PageHeader, TableLoading, TableMessage } from "@/components/common";
import {
  PoStatusBadge,
  PurchaseOrderDetailDialog,
  PurchaseOrderFormDialog,
  type PurchaseOrderPrefill,
} from "@/components/purchasing/PurchaseOrderDialogs";
import { usePurchaseOrders, useReorderSuggestions } from "@/hooks/api";
import { formatDate, ksh, kshCompact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PurchaseOrder, ReorderGroup } from "@/lib/types";

const isOverdue = (po: PurchaseOrder) =>
  (po.status === "ordered" || po.status === "partially_received") &&
  po.expectedDate !== null &&
  isBefore(parseISO(po.expectedDate), startOfToday());

function ReorderSuggestions({ onCreate }: { onCreate: (prefill: PurchaseOrderPrefill) => void }) {
  const { data: groups, isLoading } = useReorderSuggestions();
  if (isLoading) return <Skeleton className="h-40 rounded-xl" />;
  if (!groups || groups.length === 0) return null;

  const prefill = (g: ReorderGroup): PurchaseOrderPrefill => ({
    supplierId: g.supplierId,
    items: g.items.map((i) => ({ productId: i.productId, name: i.name, sku: i.sku, quantity: i.suggestedQuantity, unitCost: i.unitCost })),
  });

  return (
    <Card className="border-warning/40 shadow-medium">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-warning" />
          Reorder suggestions
        </CardTitle>
        <CardDescription>
          Items at or below their reorder level that aren't already on order. Quantities top stock up to twice the reorder level.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => {
          const value = g.items.reduce((s, i) => s + i.suggestedQuantity * i.unitCost, 0);
          return (
            <div key={g.supplierId ?? "none"} className="flex flex-col rounded-2xl border p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{g.supplierName ?? "No preferred supplier"}</p>
                  <p className="text-sm text-muted-foreground">
                    {g.items.length} item{g.items.length === 1 ? "" : "s"} · about {ksh(value)}
                  </p>
                </div>
                {g.supplierId ? (
                  <Button size="sm" onClick={() => onCreate(prefill(g))}>
                    <Plus className="mr-1 h-4 w-4" />
                    Draft PO
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/products">Assign suppliers</Link>
                  </Button>
                )}
              </div>
              <ul className="space-y-1.5 text-sm">
                {g.items.map((i) => (
                  <li key={i.productId} className="flex justify-between gap-3">
                    <span className="truncate">
                      {i.name}{" "}
                      <span className={cn("text-xs", i.stock === 0 ? "text-destructive" : "text-muted-foreground")}>
                        ({i.stock} left{i.onOrder > 0 ? `, ${i.onOrder} on order` : ""})
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">order {i.suggestedQuantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

const PurchaseOrders = () => {
  const [params, setParams] = useSearchParams();
  const viewing = params.get("view") ? Number(params.get("view")) : null;
  const setViewing = (id: number | null) => setParams(id ? { view: String(id) } : {}, { replace: true });

  const [tab, setTab] = useState("open");
  const [search, setSearch] = useState("");
  const { data: orders = [], isLoading } = usePurchaseOrders({
    status: tab === "all" ? undefined : tab,
    search: search.trim() || undefined,
  });
  const { data: openOrders = [], isLoading: loadingOpen } = usePurchaseOrders({ status: "open" });
  const { data: drafts = [] } = usePurchaseOrders({ status: "draft" });

  const [formOpen, setFormOpen] = useState(false);
  const [prefill, setPrefill] = useState<PurchaseOrderPrefill | null>(null);

  const onOrderValue = openOrders.reduce((s, o) => s + (o.total - o.receivedValue), 0);
  const overdue = openOrders.filter(isOverdue).length;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Purchasing"
          description="Order stock from suppliers, track deliveries, and receive goods into inventory."
          actions={
            <Button
              className="bg-gradient-primary hover:bg-primary-dark"
              onClick={() => {
                setPrefill(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              New Purchase Order
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Awaiting delivery" value={openOrders.length} icon={<Truck className="h-6 w-6" />} loading={loadingOpen} />
          <MetricCard
            label="Value on order"
            value={kshCompact(onOrderValue)}
            icon={<Wallet className="h-6 w-6" />}
            tone="accent"
            loading={loadingOpen}
          />
          <MetricCard
            label="Overdue deliveries"
            value={overdue}
            icon={<AlertTriangle className="h-6 w-6" />}
            tone={overdue > 0 ? "destructive" : "primary"}
            loading={loadingOpen}
          />
          <MetricCard label="Drafts" value={drafts.length} icon={<ClipboardList className="h-6 w-6" />} tone="warning" />
        </div>

        <ReorderSuggestions
          onCreate={(p) => {
            setPrefill(p);
            setFormOpen(true);
          }}
        />

        <Card className="shadow-medium">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList className="flex-wrap">
                  <TabsTrigger value="open">Open</TabsTrigger>
                  <TabsTrigger value="draft">Drafts</TabsTrigger>
                  <TabsTrigger value="received">Received</TabsTrigger>
                  <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="PO number or supplier..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 sm:w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableLoading cols={7} />}
                {!isLoading && orders.length === 0 && (
                  <TableMessage cols={7}>
                    {tab === "open" ? "Nothing awaiting delivery." : "No purchase orders here."}
                  </TableMessage>
                )}
                {orders.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => setViewing(o.id)}>
                    <TableCell className="font-mono font-medium">{o.poNumber}</TableCell>
                    <TableCell>{o.supplierName}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(o.createdAt)}</TableCell>
                    <TableCell className={cn("whitespace-nowrap", isOverdue(o) && "font-medium text-destructive")}>
                      {o.expectedDate ? formatDate(o.expectedDate) : "—"}
                      {isOverdue(o) && " · overdue"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {o.unitsReceived} / {o.unitsOrdered}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">{ksh(o.total)}</TableCell>
                    <TableCell>
                      <PoStatusBadge status={o.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <PurchaseOrderFormDialog open={formOpen} onOpenChange={setFormOpen} prefill={prefill} onSaved={(po) => setViewing(po.id)} />
      <PurchaseOrderDetailDialog poId={viewing} onOpenChange={(o) => !o && setViewing(null)} />
    </Layout>
  );
};

export default PurchaseOrders;
