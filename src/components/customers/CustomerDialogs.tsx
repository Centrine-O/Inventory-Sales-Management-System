import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldError, SaleStatusBadge } from "@/components/common";
import { useCustomer, useSaveCustomer } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, ksh } from "@/lib/format";
import type { Customer } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]),
  phone: z.string().trim().max(40),
  active: z.boolean(),
  creditLimit: z.coerce.number().min(0, "Can't be negative"),
});
type FormValues = z.infer<typeof schema>;

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customer: Customer | null;
  onCreated?: (c: Customer) => void;
}) {
  const save = useSaveCustomer();
  const { isAdmin } = useAuth();
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset(
        customer
          ? {
              name: customer.name,
              email: customer.email,
              phone: customer.phone,
              active: customer.status === "active",
              creditLimit: customer.creditLimit,
            }
          : { name: "", email: "", phone: "", active: true, creditLimit: 0 },
      );
    }
  }, [open, customer, reset]);

  const onSubmit = (v: FormValues) =>
    save.mutate(
      {
        id: customer?.id,
        name: v.name,
        email: v.email,
        phone: v.phone,
        status: v.active ? "active" : "inactive",
        // Only admins may set limits; leaving it out keeps the current value.
        ...(isAdmin ? { creditLimit: Number(v.creditLimit) || 0 } : {}),
      },
      {
        onSuccess: (c) => {
          onOpenChange(false);
          if (!customer) onCreated?.(c);
        },
      },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
          <DialogDescription>Contact details are used on invoices and for follow-ups.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="c-name">Name</Label>
            <Input id="c-name" {...register("name")} />
            <FieldError message={formState.errors.name?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-phone">Phone</Label>
            <Input id="c-phone" type="tel" placeholder="+254 7xx xxx xxx" {...register("phone")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-email">Email (optional)</Label>
            <Input id="c-email" type="email" {...register("email")} />
            <FieldError message={formState.errors.email?.message} />
          </div>
          {isAdmin && (
            <div className="space-y-2">
              <Label htmlFor="c-limit">Credit limit (KSh)</Label>
              <Input id="c-limit" type="number" min="0" step="100" {...register("creditLimit")} />
              <p className="text-xs text-muted-foreground">Most this customer may owe at once. 0 means no limit.</p>
              <FieldError message={formState.errors.creditLimit?.message} />
            </div>
          )}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active customer</p>
              <p className="text-xs text-muted-foreground">Inactive customers are hidden from the sale picker.</p>
            </div>
            <Switch checked={watch("active")} onCheckedChange={(v) => setValue("active", v)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="bg-gradient-primary hover:bg-primary-dark">
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {customer ? "Save changes" : "Add customer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomerDetailDialog({ customerId, onOpenChange }: { customerId: number | null; onOpenChange: (o: boolean) => void }) {
  const { data: c, isLoading } = useCustomer(customerId);
  return (
    <Dialog open={customerId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{c?.name ?? "Customer"}</DialogTitle>
          <DialogDescription>{c && [c.phone, c.email].filter(Boolean).join(" · ")}</DialogDescription>
        </DialogHeader>
        {isLoading || !c ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Orders", String(c.totalOrders), false],
                ["Total spent", ksh(c.totalSpent), false],
                ["Balance owed", ksh(c.balance), c.balance > 0],
                ["Credit limit", c.creditLimit > 0 ? ksh(c.creditLimit) : "No limit", false],
              ].map(([label, value, warn]) => (
                <div key={label as string} className={`rounded-xl border p-3 ${warn ? "border-warning/50 bg-warning/5" : ""}`}>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`font-semibold ${warn ? "text-warning" : ""}`}>{value}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-2 font-medium">Purchase history</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.sales.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No purchases yet
                      </TableCell>
                    </TableRow>
                  )}
                  {c.sales.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link to={`/app/sales?view=${s.id}`} className="font-mono text-primary hover:underline">
                          {s.invoiceNo}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(s.createdAt)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{ksh(s.total)}</TableCell>
                      <TableCell className={`whitespace-nowrap text-right ${s.balance > 0 ? "font-medium text-warning" : "text-muted-foreground"}`}>
                        {s.balance > 0 ? ksh(s.balance) : "—"}
                      </TableCell>
                      <TableCell>
                        <SaleStatusBadge status={s.status} amountPaid={s.amountPaid} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {c.payments.length > 0 && (
              <div>
                <h3 className="mb-2 font-medium">Payments received</h3>
                <div className="divide-y rounded-xl border text-sm">
                  {c.payments.slice(0, 15).map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p>
                          {p.method}
                          {p.reference && <span className="ml-2 font-mono text-xs text-muted-foreground">{p.reference}</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(p.createdAt)} ·{" "}
                          <Link to={`/app/sales?view=${p.saleId}`} className="text-primary hover:underline">
                            {p.invoiceNo}
                          </Link>
                        </p>
                      </div>
                      <span className="whitespace-nowrap font-medium">{ksh(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
