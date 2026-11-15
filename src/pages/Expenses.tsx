import { useEffect, useMemo, useState } from "react";
import { Banknote, Download, Edit, Loader2, MoreVertical, Plus, Search, Tags, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog, FieldError, MetricCard, PageHeader, TableLoading, TableMessage } from "@/components/common";
import { RankedBars } from "@/components/charts";
import { DateRangePicker, useDateRange } from "@/components/DateRangePicker";
import { useDeleteExpense, useExpenseCategories, useExpenses, useSaveExpense } from "@/hooks/api";
import { api, errorMessage, qs } from "@/lib/api";
import { formatDate, ksh, kshCompact, ymd } from "@/lib/format";
import { PAYMENT_METHODS, type Expense, type PaymentMethod } from "@/lib/types";

function ExpenseDialog({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (o: boolean) => void; expense: Expense | null }) {
  const save = useSaveExpense();
  const { data: categories = [] } = useExpenseCategories(open);
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("M-Pesa");
  const [reference, setReference] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(expense?.date ?? ymd(new Date()));
    setCategory(expense?.category ?? "");
    setPayee(expense?.payee ?? "");
    setDescription(expense?.description ?? "");
    setAmount(expense ? String(expense.amount) : "");
    setMethod(expense?.paymentMethod ?? "M-Pesa");
    setReference(expense?.reference ?? "");
    setTouched(false);
  }, [open, expense]);

  const value = Number(amount);
  const errors = {
    category: !category.trim() ? "Choose or type a category" : undefined,
    amount: !(value > 0) ? "Enter an amount above zero" : undefined,
    date: !date ? "Pick a date" : undefined,
  };
  const valid = !errors.category && !errors.amount && !errors.date;

  const submit = () => {
    setTouched(true);
    if (!valid) return;
    save.mutate(
      { id: expense?.id, date, category: category.trim(), payee, description, amount: value, paymentMethod: method, reference },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Edit expense" : "Record expense"}</DialogTitle>
          <DialogDescription>Running costs like rent, wages, power and transport. Stock purchases go through Purchasing instead.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ex-amount">Amount (KSh)</Label>
              <Input id="ex-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
              {touched && <FieldError message={errors.amount} />}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ex-date">Date</Label>
              <Input id="ex-date" type="date" max={ymd(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
              {touched && <FieldError message={errors.date} />}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-category">Category</Label>
            <Input id="ex-category" list="expense-categories" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Rent" />
            <datalist id="expense-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {touched && <FieldError message={errors.category} />}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-payee">Paid to</Label>
            <Input id="ex-payee" value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. Kenya Power" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-desc">Description (optional)</Label>
            <Textarea id="ex-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Paid by</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PAYMENT_METHODS.map((m) => (
                <Button key={m} type="button" variant={method === m ? "default" : "outline"} onClick={() => setMethod(m)}>
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ex-ref">{method === "M-Pesa" ? "M-Pesa transaction code" : "Reference (optional)"}</Label>
            <Input
              id="ex-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className={method === "M-Pesa" ? "font-mono uppercase" : undefined}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="bg-gradient-primary hover:bg-primary-dark">
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {expense ? "Save changes" : "Record expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const ALL = "all";

const Expenses = () => {
  const range = useDateRange("month");
  const [category, setCategory] = useState(ALL);
  const [search, setSearch] = useState("");
  const { data: expenses = [], isLoading } = useExpenses({ from: range.from, to: range.to });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [exporting, setExporting] = useState(false);
  const del = useDeleteExpense();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter(
      (e) =>
        (category === ALL || e.category === category) &&
        (!q || e.payee.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.reference.toLowerCase().includes(q)),
    );
  }, [expenses, category, search]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
    return [...m.entries()].map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue);
  }, [expenses]);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const shown = filtered.reduce((s, e) => s + e.amount, 0);
  const days = Math.max(1, Math.round((new Date(range.to).getTime() - new Date(range.from).getTime()) / 86_400_000) + 1);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await api.download(
        `/expenses/export.csv${qs({ from: range.from, to: range.to, category: category === ALL ? undefined : category })}`,
        `expenses-${range.from}-to-${range.to}.csv`,
      );
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
          title="Expenses"
          description="Track running costs so reports show what the business actually makes."
          actions={
            <>
              <Button variant="outline" onClick={exportCsv} disabled={exporting}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export CSV
              </Button>
              <Button
                className="bg-gradient-primary hover:bg-primary-dark"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Record Expense
              </Button>
            </>
          }
        />

        <DateRangePicker range={range} />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard label="Spent in period" value={kshCompact(total)} icon={<Banknote className="h-6 w-6" />} loading={isLoading} />
          <MetricCard
            label="Biggest cost"
            value={byCategory[0]?.name ?? "—"}
            icon={<Tags className="h-6 w-6" />}
            tone="warning"
            loading={isLoading}
            hint={byCategory[0] && `${ksh(byCategory[0].revenue)} · ${Math.round((byCategory[0].revenue / total) * 100)}% of spend`}
          />
          <MetricCard
            label="Average per day"
            value={ksh(Math.round(total / days))}
            icon={<TrendingDown className="h-6 w-6" />}
            tone="accent"
            loading={isLoading}
            hint={`${expenses.length} entr${expenses.length === 1 ? "y" : "ies"} over ${days} day${days === 1 ? "" : "s"}`}
          />
        </div>

        <div className="space-y-6">
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>By category</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No expenses in this period.</p>
              ) : (
                <div className="max-w-3xl">
                  <RankedBars data={byCategory} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle>
                  Entries
                  {filtered.length !== expenses.length && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      {filtered.length} shown · {ksh(shown)}
                    </span>
                  )}
                </CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Payee, note, reference..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 sm:w-52" />
                  </div>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="sm:w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>All categories</SelectItem>
                      {byCategory.map((c) => (
                        <SelectItem key={c.name} value={c.name}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Paid to</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableLoading cols={6} />}
                  {!isLoading && filtered.length === 0 && (
                    <TableMessage cols={6}>{expenses.length === 0 ? "No expenses recorded in this period." : "No expenses match these filters."}</TableMessage>
                  )}
                  {filtered.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{e.category}</TableCell>
                      <TableCell>
                        <p>{e.payee || "—"}</p>
                        {e.description && <p className="max-w-[260px] truncate text-xs text-muted-foreground">{e.description}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {e.paymentMethod}
                        {e.reference && <p className="font-mono text-xs text-muted-foreground">{e.reference}</p>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium">{ksh(e.amount)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${e.category} expense`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(e);
                                setFormOpen(true);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(e)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <ExpenseDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this expense?"
        description={deleting && `${deleting.category} · ${ksh(deleting.amount)} on ${formatDate(deleting.date)}. This can't be undone.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </Layout>
  );
};

export default Expenses;
