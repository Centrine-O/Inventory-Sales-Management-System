import { useEffect, useState } from "react";
import { Loader2, Printer, Wallet, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog, SaleStatusBadge } from "@/components/common";
import { useRecordPayment, useSale, useSettings, useUpdateSaleStatus } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime, kshExact } from "@/lib/format";
import { PAYMENT_METHODS, type PaymentMethod, type SaleDetail } from "@/lib/types";

function RecordPaymentDialog({ sale, open, onOpenChange }: { sale: SaleDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const record = useRecordPayment();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("M-Pesa");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (open) {
      setAmount(String(sale.balance));
      setMethod("M-Pesa");
      setReference("");
    }
  }, [open, sale.balance]);

  const value = Number(amount) || 0;
  const tooMuch = value > sale.balance + 1e-9;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record payment · {sale.invoiceNo}</DialogTitle>
          <DialogDescription>
            {sale.customerName} owes {kshExact(sale.balance)} on this invoice.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            record.mutate({ saleId: sale.id, amount: value, method, reference }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount (KSh)</Label>
            <Input id="pay-amount" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
            {tooMuch && <p className="text-sm text-destructive">That's more than the balance.</p>}
          </div>
          <div className="space-y-2">
            <Label>Method</Label>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_METHODS.map((m) => (
                <Button key={m} type="button" variant={method === m ? "default" : "outline"} onClick={() => setMethod(m)}>
                  {m}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-ref">{method === "M-Pesa" ? "M-Pesa transaction code" : "Reference (optional)"}</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "M-Pesa" ? "e.g. QJK3XY12AB" : ""}
              className={method === "M-Pesa" ? "font-mono uppercase" : undefined}
            />
          </div>
          {value > 0 && !tooMuch && (
            <p className="text-sm text-muted-foreground">
              {value >= sale.balance ? "This settles the invoice in full." : `${kshExact(sale.balance - value)} will still be owed.`}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!(value > 0) || tooMuch || record.isPending}>
              {record.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Record {kshExact(value)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SaleDetailDialog({ saleId, onOpenChange }: { saleId: number | null; onOpenChange: (o: boolean) => void }) {
  const { data: sale, isLoading } = useSale(saleId);
  const { data: settings } = useSettings();
  const { isAdmin } = useAuth();
  const update = useUpdateSaleStatus();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  return (
    <>
      <Dialog open={saleId !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="print:hidden">
            <DialogTitle>Invoice {sale?.invoiceNo}</DialogTitle>
            <DialogDescription>{sale && formatDateTime(sale.createdAt)}</DialogDescription>
          </DialogHeader>

          {isLoading || !sale ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="print-area space-y-5 text-sm">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <p className="text-lg font-bold">{settings?.businessName}</p>
                  {settings?.address && <p className="text-muted-foreground">{settings.address}</p>}
                  <p className="text-muted-foreground">{[settings?.phone, settings?.email].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-lg font-semibold">{sale.invoiceNo}</p>
                  <p className="text-muted-foreground">{formatDateTime(sale.createdAt)}</p>
                  <div className="mt-1">
                    <SaleStatusBadge status={sale.status} amountPaid={sale.amountPaid} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Billed to</p>
                  <p className="font-medium">{sale.customerName}</p>
                  {sale.customer && (
                    <p className="text-muted-foreground">{[sale.customer.phone, sale.customer.email].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Payment</p>
                  <p className="font-medium">{sale.paymentMethod}</p>
                  <p className="text-muted-foreground">Served by {sale.cashierName}</p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit price</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        {i.productName}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{i.sku}</span>
                      </TableCell>
                      <TableCell className="text-right">{i.quantity}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{kshExact(i.unitPrice)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{kshExact(i.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="ml-auto max-w-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{kshExact(sale.subtotal)}</span>
                </div>
                {sale.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span>−{kshExact(sale.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>VAT included</span>
                  <span>{kshExact(sale.tax)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-bold">
                  <span>Total</span>
                  <span>{kshExact(sale.total)}</span>
                </div>
                {sale.status !== "cancelled" && sale.amountPaid < sale.total && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span>{kshExact(sale.amountPaid)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-warning">
                      <span>Balance due</span>
                      <span>{kshExact(sale.balance)}</span>
                    </div>
                  </>
                )}
              </div>

              {sale.payments.length > 0 && (
                <div>
                  <p className="mb-2 font-medium">Payments</p>
                  <div className="divide-y rounded-xl border">
                    {sale.payments.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="min-w-0">
                          <p>
                            {p.method}
                            {p.reference && <span className="ml-2 font-mono text-xs text-muted-foreground">{p.reference}</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(p.createdAt)}
                            {p.receivedBy && ` · ${p.receivedBy}`}
                          </p>
                        </div>
                        <span className="whitespace-nowrap font-medium">{kshExact(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {sale.notes && (
                <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">
                  <span className="font-medium text-foreground">Notes:</span> {sale.notes}
                </p>
              )}
              <p className="hidden pt-6 text-center text-xs text-muted-foreground print:block">Thank you for your business.</p>
            </div>
          )}

          {sale && (
            <DialogFooter className="gap-2 print:hidden">
              {isAdmin && sale.status !== "cancelled" && (
                <Button variant="outline" className="text-destructive" onClick={() => setConfirmCancel(true)}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel sale
                </Button>
              )}
              {sale.status === "pending" && (
                <Button variant="outline" onClick={() => setPayOpen(true)}>
                  <Wallet className="mr-2 h-4 w-4" />
                  Record payment
                </Button>
              )}
              <Button onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print invoice
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {sale && <RecordPaymentDialog sale={sale} open={payOpen} onOpenChange={setPayOpen} />}
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${sale?.invoiceNo}?`}
        description={
          sale && sale.amountPaid > 0
            ? `The sale will be voided and every item returned to stock. ${kshExact(sale.amountPaid)} was paid on it — refund the customer separately. This can't be undone.`
            : "The sale will be voided and every item returned to stock. This can't be undone."
        }
        confirmLabel="Cancel sale"
        destructive
        pending={update.isPending}
        onConfirm={() =>
          sale && update.mutate({ id: sale.id, status: "cancelled" }, { onSuccess: () => setConfirmCancel(false) })
        }
      />
    </>
  );
}
