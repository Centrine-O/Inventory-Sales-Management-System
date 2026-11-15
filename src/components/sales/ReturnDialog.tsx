import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCreateReturn } from "@/hooks/api";
import { kshExact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, type PaymentMethod, type SaleDetail } from "@/lib/types";

const REASONS = ["Faulty / not working", "Wrong item or size", "Customer changed mind", "Damaged in transit", "Duplicate purchase"];

export function ReturnDialog({ sale, open, onOpenChange }: { sale: SaleDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateReturn();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Cash");
  const [reference, setReference] = useState("");

  useEffect(() => {
    if (open) {
      setQty({});
      setRestock(Object.fromEntries(sale.items.map((i) => [i.id, true])));
      setReason("");
      setMethod("Cash");
      setReference("");
    }
  }, [open, sale.items]);

  const lines = sale.items.map((i) => {
    const left = i.quantity - i.returnedQuantity;
    const n = parseInt(qty[i.id] ?? "", 10) || 0;
    // Same valuation as the server: the unit price after the sale's discount, spread pro rata.
    const value = sale.subtotal > 0 ? Math.round((i.unitPrice * n * sale.total * 100) / sale.subtotal) / 100 : 0;
    return { item: i, left, n, value };
  });
  const chosen = lines.filter((l) => l.n > 0);
  const invalid = lines.some((l) => l.n < 0 || l.n > l.left);
  const value = chosen.reduce((s, l) => s + l.value, 0);
  const newNetTotal = sale.netTotal - value;
  const refund = Math.max(0, Math.round((sale.amountPaid - newNetTotal) * 100) / 100);
  const reducesBalance = Math.min(value, sale.balance);

  const submit = () =>
    create.mutate(
      {
        saleId: sale.id,
        reason: reason.trim(),
        refundMethod: refund > 0 ? method : undefined,
        refundReference: refund > 0 ? reference : "",
        items: chosen.map((l) => ({ saleItemId: l.item.id, quantity: l.n, restock: restock[l.item.id] ?? true })),
      },
      { onSuccess: () => onOpenChange(false) },
    );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Return items · {sale.invoiceNo}</DialogTitle>
          <DialogDescription>
            Choose what's coming back. Untick “Back to stock” for faulty or damaged items so they're written off instead.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Returnable</TableHead>
                <TableHead className="w-24">Qty</TableHead>
                <TableHead className="text-center">Back to stock</TableHead>
                <TableHead className="text-right">Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map(({ item, left, n, value: v }) => (
                <TableRow key={item.id} className={left === 0 ? "opacity-50" : undefined}>
                  <TableCell>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} sold{item.returnedQuantity > 0 && ` · ${item.returnedQuantity} already returned`}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">{left}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={0}
                      max={left}
                      disabled={left === 0}
                      value={qty[item.id] ?? ""}
                      placeholder="0"
                      onChange={(e) => setQty((q) => ({ ...q, [item.id]: e.target.value }))}
                      className={cn("h-8", n > left && "border-destructive")}
                      aria-label={`Quantity of ${item.productName} to return`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Checkbox
                      checked={restock[item.id] ?? true}
                      disabled={left === 0}
                      onCheckedChange={(c) => setRestock((r) => ({ ...r, [item.id]: c === true }))}
                      aria-label={`Put ${item.productName} back in stock`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">{n > 0 ? kshExact(v) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {invalid && <p className="text-sm text-destructive">You can't return more than was sold.</p>}

        <div className="space-y-2">
          <Label htmlFor="ret-reason">Reason</Label>
          <Input id="ret-reason" list="return-reasons" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is it coming back?" />
          <datalist id="return-reasons">
            {REASONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </div>

        {chosen.length > 0 && (
          <div className="space-y-1.5 rounded-xl bg-muted/50 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Value of items returned</span>
              <span>{kshExact(value)}</span>
            </div>
            {reducesBalance > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taken off what {sale.customerName} owes</span>
                <span>−{kshExact(reducesBalance)}</span>
              </div>
            )}
            <Separator className="my-2" />
            <div className="flex justify-between text-base font-bold">
              <span>Refund to customer</span>
              <span>{kshExact(refund)}</span>
            </div>
          </div>
        )}

        {refund > 0 && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Refund paid by</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PAYMENT_METHODS.map((m) => (
                  <Button key={m} type="button" variant={method === m ? "default" : "outline"} onClick={() => setMethod(m)}>
                    {m}
                  </Button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ret-ref">{method === "M-Pesa" ? "M-Pesa transaction code" : "Reference (optional)"}</Label>
              <Input
                id="ret-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={method === "M-Pesa" ? "font-mono uppercase" : undefined}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={chosen.length === 0 || invalid || !reason.trim() || create.isPending}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {refund > 0 ? `Process return · refund ${kshExact(refund)}` : "Process return"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
