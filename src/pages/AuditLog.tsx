import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { format, isToday, isYesterday, parseISO } from "date-fns";
import { AlertTriangle, ChevronRight, Download, History, Loader2, Search, ShieldAlert, UserX } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCard, PageHeader, TableLoading, TableMessage } from "@/components/common";
import { DateRangePicker, useDateRange } from "@/components/DateRangePicker";
import { auditQuery, useAuditFacets, useAuditLog, useAuditSummary, type AuditFilters } from "@/hooks/api";
import { api, errorMessage, qs } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AuditEntity, AuditEntry } from "@/lib/types";

const AREA_LABEL: Record<AuditEntity, string> = {
  auth: "Sign-in",
  user: "Staff",
  product: "Products",
  customer: "Customers",
  sale: "Sales",
  supplier: "Suppliers",
  purchase_order: "Purchasing",
  expense: "Expenses",
  shift: "Till",
  settings: "Settings",
};

const ACTION_LABEL: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign-in",
  login_blocked: "Blocked sign-in",
  password_changed: "Password changed",
  password_reset: "Password reset",
  created: "Added",
  updated: "Edited",
  deleted: "Deleted",
  archived: "Archived",
  restored: "Restored",
  price_changed: "Price changed",
  stock_adjusted: "Stock adjusted",
  discount_given: "Discount",
  cancelled: "Cancelled",
  return_processed: "Return",
  credit_limit_changed: "Credit limit",
  role_changed: "Role changed",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  ordered: "Ordered",
  received: "Goods received",
  opened: "Till opened",
  closed: "Till closed",
  cash_in: "Pay-in",
  cash_out: "Pay-out",
};

const FIELD_LABEL: Record<string, string> = {
  reorderLevel: "Reorder level",
  supplierId: "Supplier",
  creditLimit: "Credit limit",
  contactName: "Contact",
  paymentMethod: "Payment method",
  taxRate: "VAT rate (%)",
  businessName: "Business name",
  lowStockAlerts: "Low stock alerts",
  dailySummary: "Daily summary",
  largeTransactionReview: "Large transaction review",
  largeTransactionThreshold: "Large transaction threshold",
  requireShiftForSales: "Require open till",
  returnNo: "Return no.",
  refundMethod: "Refund method",
  previousStatus: "Previous status",
  passwordReset: "Password reset",
};
const MONEY = new Set([
  "price",
  "cost",
  "creditLimit",
  "amount",
  "largeTransactionThreshold",
  "subtotal",
  "discount",
  "total",
  "value",
  "refund",
  "expected",
  "counted",
  "variance",
]);

const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, " $1").toLowerCase();
const showValue = (k: string, v: unknown) => {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "boolean") return v ? "On" : "Off";
  if (MONEY.has(k) && typeof v === "number") return `KSh ${v.toLocaleString("en-KE", { maximumFractionDigits: 2 })}`;
  if (k === "percent" && typeof v === "number") return `${v}%`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

/** Where an entry's record can be opened, when the app has a page for it. */
const recordLink = (e: AuditEntry) => {
  if (!e.entityId) return null;
  if (e.entity === "sale") return `/app/sales?view=${e.entityId}`;
  if (e.entity === "customer") return `/app/customers?view=${e.entityId}`;
  if (e.entity === "purchase_order") return `/app/purchase-orders?view=${e.entityId}`;
  return null;
};

const dayLabel = (iso: string) => {
  const d = parseISO(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE d MMMM yyyy");
};

function EntryDetails({ entry }: { entry: AuditEntry }) {
  const { changes, ...rest } = entry.details ?? {};
  const facts = Object.entries(rest).filter(([k, v]) => !(k === "passwordReset" && v === false) && typeof v !== "object");
  const link = recordLink(entry);
  return (
    <div className="space-y-4 py-1">
      {changes && Object.keys(changes).length > 0 && (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Field</th>
                <th className="px-3 py-2 font-medium">Before</th>
                <th className="px-3 py-2 font-medium">After</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(changes).map(([k, [before, after]]) => (
                <tr key={k} className="border-b last:border-0">
                  <td className="px-3 py-2 font-medium">{fieldLabel(k)}</td>
                  <td className="px-3 py-2 text-muted-foreground line-through decoration-muted-foreground/40">{showValue(k, before)}</td>
                  <td className="px-3 py-2">{showValue(k, after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {facts.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{fieldLabel(k)}</dt>
            <dd className={cn(k === "variance" && typeof v === "number" && v !== 0 && "font-medium text-destructive")}>{showValue(k, v)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-muted-foreground">Exact time</dt>
          <dd className="tabular-nums">{format(parseISO(entry.createdAt), "d MMM yyyy, HH:mm:ss")}</dd>
        </div>
        {entry.ip && (
          <div>
            <dt className="text-xs text-muted-foreground">IP address</dt>
            <dd className="font-mono text-xs leading-5">{entry.ip}</dd>
          </div>
        )}
        {link && (
          <div>
            <dt className="text-xs text-muted-foreground">Record</dt>
            <dd>
              <Link to={link} className="text-primary underline-offset-4 hover:underline">
                Open {AREA_LABEL[entry.entity].toLowerCase().replace(/s$/, "")}
              </Link>
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

const ALL = "all";

const AuditLog = () => {
  const range = useDateRange("7d");
  const [area, setArea] = useState<string>(ALL);
  const [userId, setUserId] = useState<string>(ALL);
  const [attention, setAttention] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const filters: AuditFilters = {
    from: range.from,
    to: range.to,
    entity: area === ALL ? undefined : (area as AuditEntity),
    userId: userId === ALL ? undefined : Number(userId),
    search: search || undefined,
    attention: attention || undefined,
  };
  const log = useAuditLog(filters);
  const summary = useAuditSummary(filters);
  const { data: facets } = useAuditFacets();

  const entries = useMemo(() => log.data?.pages.flatMap((p) => p.entries) ?? [], [log.data]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.download(`/audit/export.csv${qs(auditQuery(filters))}`, `activity-log-${range.from}-to-${range.to}.csv`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const filtered = area !== ALL || userId !== ALL || attention || Boolean(search);
  const s = summary.data;
  let lastDay = "";

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Activity log"
          description="Who changed what, and when. Entries can't be edited or deleted."
          actions={
            <Button variant="outline" onClick={exportCsv} disabled={exporting}>
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Export CSV
            </Button>
          }
        />

        <DateRangePicker range={range} />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Events"
            value={s?.total.toLocaleString() ?? "—"}
            icon={<History className="h-6 w-6" />}
            loading={summary.isLoading}
            hint={s && `${s.people} ${s.people === 1 ? "person" : "people"} active`}
          />
          <MetricCard
            label="Need attention"
            value={s?.attention.toLocaleString() ?? "—"}
            icon={<AlertTriangle className="h-6 w-6" />}
            tone="warning"
            loading={summary.isLoading}
            hint={
              s && s.attention > 0 && !attention ? (
                <button className="text-primary underline-offset-4 hover:underline" onClick={() => setAttention(true)}>
                  Show only these
                </button>
              ) : (
                "Discounts, refunds, cancellations, price changes, till variances…"
              )
            }
          />
          <MetricCard
            label="Failed sign-ins"
            value={s?.failedLogins.toLocaleString() ?? "—"}
            icon={<UserX className="h-6 w-6" />}
            tone={s && s.failedLogins > 0 ? "destructive" : "accent"}
            loading={summary.isLoading}
            hint="Wrong passwords and blocked accounts"
          />
        </div>

        <Card className="shadow-medium">
          <CardHeader className="space-y-4">
            <CardTitle>Events</CardTitle>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Search descriptions, invoice numbers, names…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  aria-label="Search activity"
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={area} onValueChange={setArea}>
                  <SelectTrigger className="w-40" aria-label="Area">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All areas</SelectItem>
                    {Object.entries(AREA_LABEL).map(([k, label]) => (
                      <SelectItem key={k} value={k}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Mounted once people have loaded, so the selected value isn't reset before its option exists. */}
                {facets ? (
                  <Select value={userId} onValueChange={setUserId}>
                    <SelectTrigger className="w-44" aria-label="Person">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Everyone</SelectItem>
                      {facets.users.map((u) => (
                        <SelectItem key={u.id} value={String(u.id)}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-10 w-44 rounded-md border bg-muted/40" />
                )}
                <div className="flex items-center gap-2">
                  <Switch id="attention-only" checked={attention} onCheckedChange={setAttention} />
                  <Label htmlFor="attention-only" className="cursor-pointer whitespace-nowrap">
                    Needs attention only
                  </Label>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-20">Time</TableHead>
                  <TableHead className="w-40">Who</TableHead>
                  <TableHead className="w-44">What</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {log.isLoading && <TableLoading cols={5} rows={8} />}
                {!log.isLoading && entries.length === 0 && (
                  <TableMessage cols={5}>
                    {filtered ? "No activity matches these filters." : "No activity in this period."}
                  </TableMessage>
                )}
                {entries.map((e) => {
                  const day = dayLabel(e.createdAt);
                  const header = day !== lastDay;
                  lastDay = day;
                  const open = expanded.has(e.id);
                  return (
                    <Fragment key={e.id}>
                      {header && (
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={5} className="py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {day}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow
                        className={cn("cursor-pointer", e.attention && "bg-warning/5 hover:bg-warning/10")}
                        onClick={() => toggle(e.id)}
                        aria-expanded={open}
                      >
                        <TableCell className={cn("pr-0", e.attention && "border-l-2 border-l-warning")}>
                          <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")} />
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">{format(parseISO(e.createdAt), "HH:mm")}</TableCell>
                        <TableCell className="font-medium">
                          {e.userName || <span className="font-normal italic text-muted-foreground">Unknown</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col items-start gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "whitespace-nowrap border-transparent",
                                e.attention ? "bg-warning/15 text-warning" : "bg-muted text-foreground/80",
                              )}
                            >
                              {e.attention && <ShieldAlert className="mr-1 h-3 w-3" />}
                              {ACTION_LABEL[e.action] ?? e.action}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{AREA_LABEL[e.entity] ?? e.entity}</span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xl">
                          <p className={cn(!open && "line-clamp-2")}>{e.summary}</p>
                        </TableCell>
                      </TableRow>
                      {open && (
                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                          <TableCell />
                          <TableCell colSpan={4}>
                            <EntryDetails entry={e} />
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
            {entries.length > 0 && (
              <div className="flex items-center justify-between gap-4 pt-4 text-sm text-muted-foreground">
                <span>
                  Showing {entries.length.toLocaleString()}
                  {s ? ` of ${s.total.toLocaleString()}` : ""} event{(s?.total ?? entries.length) === 1 ? "" : "s"}
                </span>
                {log.hasNextPage && (
                  <Button variant="outline" size="sm" onClick={() => log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                    {log.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Load older
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AuditLog;
