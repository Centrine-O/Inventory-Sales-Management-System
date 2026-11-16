import { useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Lock, Printer, Unlock, Vault } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, TableLoading, TableMessage } from "@/components/common";
import { DateRangePicker, useDateRange } from "@/components/DateRangePicker";
import { useCashMovement, useCloseShift, useCurrentShift, useOpenShift, useSettings, useShift, useShifts } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, formatDateTime, kshExact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Shift } from "@/lib/types";

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });

const VarianceText = ({ value, className }: { value: number | null; className?: string }) => {
  if (value === null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  if (Math.abs(value) < 0.005) return <span className={cn("text-accent", className)}>Balanced</span>;
  return (
    <span className={cn(value < 0 ? "text-destructive" : "text-warning", className)}>
      {value < 0 ? "Short " : "Over "}
      {kshExact(Math.abs(value))}
    </span>
  );
};

function OpenTillCard() {
  const open = useOpenShift();
  const [float, setFloat] = useState("5000");
  return (
    <Card className="shadow-medium">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5 text-muted-foreground" />
          Your till is closed
        </CardTitle>
        <CardDescription>Count the starting cash (float) in the drawer and open the till to start your shift.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            open.mutate(Number(float) || 0);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="till-float">Opening float (KSh)</Label>
            <Input id="till-float" type="number" min="0" step="1" value={float} onChange={(e) => setFloat(e.target.value)} className="sm:w-48" />
          </div>
          <Button type="submit" disabled={open.isPending || !(Number(float) >= 0)} className="bg-gradient-primary hover:bg-primary-dark">
            {open.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
            Open till
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CashMoveDialog({ shift, type, onOpenChange }: { shift: Shift; type: "in" | "out" | null; onOpenChange: (o: boolean) => void }) {
  const move = useCashMovement();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (type) {
      setAmount("");
      setReason("");
    }
  }, [type]);
  const value = Number(amount) || 0;
  const tooMuch = type === "out" && value > shift.expectedCash;
  return (
    <Dialog open={type !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type === "in" ? "Pay cash in" : "Pay cash out"}</DialogTitle>
          <DialogDescription>
            {type === "in"
              ? "Cash added to the drawer that isn't a sale, e.g. extra change from the bank."
              : "Cash taken from the drawer that isn't a refund, e.g. banking takings or petty cash."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (type) move.mutate({ shiftId: shift.id, type, amount: value, reason }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="move-amount">Amount (KSh)</Label>
            <Input id="move-amount" type="number" min="1" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            {tooMuch && <p className="text-sm text-destructive">Only {kshExact(shift.expectedCash)} should be in the till.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="move-reason">Reason</Label>
            <Input
              id="move-reason"
              list="move-reasons"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={type === "in" ? "e.g. Change from bank" : "e.g. Banked at Equity Bank"}
            />
            <datalist id="move-reasons">
              {(type === "in" ? ["Change from bank", "Float top-up"] : ["Banked takings", "Petty cash", "Supplier paid in cash"]).map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!(value > 0) || !reason.trim() || tooMuch || move.isPending}>
              {move.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record {type === "in" ? "pay-in" : "pay-out"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseTillDialog({ shift, open, onOpenChange, onClosed }: { shift: Shift; open: boolean; onOpenChange: (o: boolean) => void; onClosed: (id: number) => void }) {
  const close = useCloseShift();
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [manual, setManual] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setCounts({});
      setManual("");
      setNotes("");
    }
  }, [open]);

  const counted = useMemo(
    () => (manual !== "" ? Number(manual) || 0 : DENOMINATIONS.reduce((s, d) => s + d * (parseInt(counts[d] ?? "", 10) || 0), 0)),
    [counts, manual],
  );
  const variance = Math.round((counted - shift.expectedCash) * 100) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Close till</DialogTitle>
          <DialogDescription>Count the cash in the drawer. Use the counter, or type the total if you've already counted.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {DENOMINATIONS.map((d) => (
            <label key={d} className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm">
              <span className="w-12 shrink-0 text-right font-medium">{d >= 50 ? d.toLocaleString() : `${d}`}</span>
              <span className="text-muted-foreground">×</span>
              <Input
                type="number"
                min="0"
                className="h-8"
                value={counts[d] ?? ""}
                disabled={manual !== ""}
                onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value }))}
                aria-label={`Number of KSh ${d} ${d >= 50 ? "notes" : "coins"}`}
              />
            </label>
          ))}
        </div>
        <div className="space-y-2">
          <Label htmlFor="close-manual">…or counted total (KSh)</Label>
          <Input id="close-manual" type="number" min="0" step="0.01" value={manual} onChange={(e) => setManual(e.target.value)} />
        </div>
        <div className="space-y-1.5 rounded-xl bg-muted/50 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Expected in drawer</span>
            <span>{kshExact(shift.expectedCash)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Counted</span>
            <span>{kshExact(counted)}</span>
          </div>
          <Separator className="my-2" />
          <div className="flex justify-between text-base font-bold">
            <span>Difference</span>
            <VarianceText value={variance} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="close-notes">Notes {variance !== 0 && "(explain the difference)"}</Label>
          <Textarea id="close-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={close.isPending}
            onClick={() =>
              close.mutate(
                { shiftId: shift.id, countedCash: counted, notes },
                {
                  onSuccess: (s) => {
                    onOpenChange(false);
                    onClosed(s.id);
                  },
                },
              )
            }
          >
            {close.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
            Close till
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Sales by method, refunds and cash movements, ending in the cash reconciliation. Used live and as the end-of-shift report. */
function ShiftBreakdown({ shift }: { shift: Shift }) {
  const row = (label: string, value: string, opts: { bold?: boolean; muted?: boolean } = {}) => (
    <div className={cn("flex justify-between gap-4 py-1", opts.bold && "font-semibold", opts.muted && "text-muted-foreground")}>
      <span>{label}</span>
      <span className="whitespace-nowrap tabular-nums">{value}</span>
    </div>
  );
  return (
    <div className="grid gap-6 text-sm md:grid-cols-2">
      <div>
        <p className="mb-1 font-medium">Takings</p>
        {shift.takings.length === 0 && <p className="text-muted-foreground">Nothing taken yet.</p>}
        {shift.takings.map((t) => row(`${t.method} (${t.count})`, kshExact(t.amount)))}
        {shift.takings.length > 0 && row("Total taken", kshExact(shift.totalTaken), { bold: true })}
        <p className="mt-3 text-xs text-muted-foreground">
          {shift.sales.count} sale{shift.sales.count === 1 ? "" : "s"} worth {kshExact(shift.sales.total)}
          {shift.sales.onCredit > 0 && ` · ${shift.sales.onCredit} on credit`}
        </p>
        {shift.refunds.length > 0 && (
          <>
            <p className="mb-1 mt-3 font-medium">Refunds</p>
            {shift.refunds.map((r) => row(`${r.method} (${r.count})`, `−${kshExact(r.amount)}`))}
          </>
        )}
      </div>
      <div>
        <p className="mb-1 font-medium">Cash drawer</p>
        {row("Opening float", kshExact(shift.openingFloat), { muted: true })}
        {row("Cash taken", `+${kshExact(shift.cashTaken)}`, { muted: true })}
        {shift.cashRefunded > 0 && row("Cash refunds", `−${kshExact(shift.cashRefunded)}`, { muted: true })}
        {shift.payIns > 0 && row("Pay-ins", `+${kshExact(shift.payIns)}`, { muted: true })}
        {shift.payOuts > 0 && row("Pay-outs", `−${kshExact(shift.payOuts)}`, { muted: true })}
        <Separator className="my-1" />
        {row("Expected in drawer", kshExact(shift.expectedCash), { bold: true })}
        {shift.countedCash !== null && (
          <>
            {row("Counted", kshExact(shift.countedCash))}
            <div className="flex justify-between gap-4 py-1 font-semibold">
              <span>Difference</span>
              <VarianceText value={shift.variance} />
            </div>
          </>
        )}
        {shift.movements.length > 0 && (
          <>
            <p className="mb-1 mt-3 font-medium">Pay-ins &amp; pay-outs</p>
            {shift.movements.map((m) => (
              <div key={m.id} className="flex justify-between gap-4 py-0.5 text-xs">
                <span className="text-muted-foreground">
                  {time(m.createdAt)} · {m.reason}
                </span>
                <span className="whitespace-nowrap">
                  {m.type === "in" ? "+" : "−"}
                  {kshExact(m.amount)}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function ShiftReportDialog({ shiftId, onOpenChange }: { shiftId: number | null; onOpenChange: (o: boolean) => void }) {
  const { data: shift } = useShift(shiftId);
  const { data: settings } = useSettings();
  return (
    <Dialog open={shiftId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="print:hidden">
          <DialogTitle>Shift report</DialogTitle>
          <DialogDescription>{shift && `${shift.userName} · ${formatDate(shift.openedAt)}`}</DialogDescription>
        </DialogHeader>
        {!shift ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="print-area space-y-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="text-lg font-bold">{settings?.businessName}</p>
                <p className="text-sm text-muted-foreground">End-of-shift report</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium">{shift.userName}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(shift.openedAt)} – {shift.closedAt ? time(shift.closedAt) : "still open"}
                </p>
                {shift.closedBy && shift.closedBy !== shift.userName && <p className="text-muted-foreground">Closed by {shift.closedBy}</p>}
              </div>
            </div>
            <Separator />
            <ShiftBreakdown shift={shift} />
            {shift.notes && (
              <p className="rounded-lg bg-muted/50 p-3 text-sm">
                <span className="font-medium">Notes:</span> {shift.notes}
              </p>
            )}
          </div>
        )}
        {shift && (
          <DialogFooter className="print:hidden">
            <Button onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print report
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Till = () => {
  const { isAdmin } = useAuth();
  const { data: current, isLoading } = useCurrentShift();
  const range = useDateRange("7d");
  const { data: history = [], isLoading: loadingHistory } = useShifts({ from: range.from, to: range.to });
  const [moveType, setMoveType] = useState<"in" | "out" | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reportId, setReportId] = useState<number | null>(null);

  const closed = history.filter((s) => s.status === "closed");
  const netVariance = closed.reduce((s, x) => s + (x.variance ?? 0), 0);
  const cols = isAdmin ? 8 : 7;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Till"
          description="Open your till with a float, track the cash drawer through the day, and balance it at close."
        />

        {isLoading ? (
          <Skeleton className="h-48 rounded-xl" />
        ) : !current ? (
          <OpenTillCard />
        ) : (
          <Card className="border-accent/40 shadow-medium">
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-accent" />
                  Till open
                </CardTitle>
                <CardDescription>
                  Since {formatDateTime(current.openedAt)} · float {kshExact(current.openingFloat)}
                </CardDescription>
              </div>
              <div className="sm:text-right">
                <p className="text-xs text-muted-foreground">Should be in the drawer</p>
                <p className="text-3xl font-bold tabular-nums">{kshExact(current.expectedCash)}</p>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <ShiftBreakdown shift={current} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setMoveType("in")}>
                  <ArrowDownToLine className="mr-2 h-4 w-4" />
                  Pay in
                </Button>
                <Button variant="outline" onClick={() => setMoveType("out")}>
                  <ArrowUpFromLine className="mr-2 h-4 w-4" />
                  Pay out
                </Button>
                <Button onClick={() => setCloseOpen(true)} className="sm:ml-auto">
                  <Lock className="mr-2 h-4 w-4" />
                  Close till
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-medium">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Vault className="h-5 w-5" />
                  {isAdmin ? "All shifts" : "Your shifts"}
                </CardTitle>
                {closed.length > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {closed.length} closed · net difference <VarianceText value={netVariance} className="font-medium" />
                  </p>
                )}
              </div>
              <DateRangePicker range={range} />
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  {isAdmin && <TableHead>Staff</TableHead>}
                  <TableHead>Hours</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Taken</TableHead>
                  <TableHead className="text-right">Expected cash</TableHead>
                  <TableHead className="text-right">Counted</TableHead>
                  <TableHead className="text-right">Difference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingHistory && <TableLoading cols={cols} />}
                {!loadingHistory && history.length === 0 && <TableMessage cols={cols}>No shifts in this period.</TableMessage>}
                {history.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setReportId(s.id)}>
                    <TableCell className="whitespace-nowrap">{formatDate(s.openedAt)}</TableCell>
                    {isAdmin && <TableCell>{s.userName}</TableCell>}
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {time(s.openedAt)} – {s.closedAt ? time(s.closedAt) : <span className="font-medium text-accent">open</span>}
                    </TableCell>
                    <TableCell className="text-right">{s.sales.count}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{kshExact(s.totalTaken)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{kshExact(s.expectedCash)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{s.countedCash === null ? "—" : kshExact(s.countedCash)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">
                      <VarianceText value={s.variance} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {current && (
        <>
          <CashMoveDialog shift={current} type={moveType} onOpenChange={(o) => !o && setMoveType(null)} />
          <CloseTillDialog shift={current} open={closeOpen} onOpenChange={setCloseOpen} onClosed={setReportId} />
        </>
      )}
      <ShiftReportDialog shiftId={reportId} onOpenChange={(o) => !o && setReportId(null)} />
    </Layout>
  );
};

export default Till;
