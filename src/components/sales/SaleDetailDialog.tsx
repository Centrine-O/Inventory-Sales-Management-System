import { useState } from "react";
import { CheckCircle2, Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog, SaleStatusBadge } from "@/components/common";
import { useSale, useSettings, useUpdateSaleStatus } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime, kshExact } from "@/lib/format";

export function SaleDetailDialog({ saleId, onOpenChange }: { saleId: number | null; onOpenChange: (o: boolean) => void }) {
  const { data: sale, isLoading } = useSale(saleId);
  const { data: settings } = useSettings();
  const { isAdmin } = useAuth();
  const update = useUpdateSaleStatus();
  const [confirmCancel, setConfirmCancel] = useState(false);

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
                    <SaleStatusBadge status={sale.status} />
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
                      <TableCell className="text-right">{kshExact(i.unitPrice)}</TableCell>
                      <TableCell className="text-right">{kshExact(i.lineTotal)}</TableCell>
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
              </div>

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
                <Button
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ id: sale.id, status: "paid" })}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark as paid
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

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={`Cancel ${sale?.invoiceNo}?`}
        description="The sale will be voided and every item returned to stock. This can't be undone."
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
