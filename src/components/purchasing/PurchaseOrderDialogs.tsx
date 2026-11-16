import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronsUpDown, Loader2, PackageCheck, Pencil, Printer, Send, Tag, Trash2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/common";
import {
  useDeletePurchaseOrder,
  useProducts,
  usePurchaseOrder,
  usePurchaseOrderAction,
  useReceivePurchaseOrder,
  useSavePurchaseOrder,
  useSettings,
  useSuppliers,
} from "@/hooks/api";
import { PO_STATUS_LABEL, formatDate, formatDateTime, ksh, kshExact } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PurchaseOrderDetail, PurchaseOrderStatus } from "@/lib/types";

export const PoStatusBadge = ({ status }: { status: PurchaseOrderStatus }) => (
  <Badge
    variant="outline"
    className={cn(
      "whitespace-nowrap border-transparent",
      status === "draft" && "bg-muted text-muted-foreground",
      status === "ordered" && "bg-primary/10 text-primary",
      status === "partially_received" && "bg-warning/15 text-warning",
      status === "received" && "bg-accent/10 text-accent",
      status === "cancelled" && "bg-muted text-muted-foreground line-through",
    )}
  >
    {PO_STATUS_LABEL[status]}
  </Badge>
);

interface Line {
  productId: number;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrderPrefill {
  supplierId: number | null;
  items: Line[];
}

/** Create a new draft (optionally prefilled from reorder suggestions) or edit an existing draft. */
export function PurchaseOrderFormDialog({
  open,
  onOpenChange,
  editing,
  prefill,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing?: PurchaseOrderDetail | null;
  prefill?: PurchaseOrderPrefill | null;
  onSaved?: (po: PurchaseOrderDetail) => void;
}) {
  // Mount the supplier Select only once options exist, or Radix resets a prefilled value.
  const { data: suppliers = [], isSuccess: suppliersReady } = useSuppliers(open);
  const { data: products = [] } = useProducts();
  const save = useSavePurchaseOrder();

  const [supplierId, setSupplierId] = useState<string>("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setSupplierId(String(editing.supplierId));
      setExpectedDate(editing.expectedDate ?? "");
      setNotes(editing.notes);
      setLines(
        editing.items.map((i) => ({
          productId: i.productId,
          name: i.productName,
          sku: i.sku,
          quantity: i.quantityOrdered,
          unitCost: i.unitCost,
        })),
      );
    } else {
      setSupplierId(prefill?.supplierId ? String(prefill.supplierId) : "");
      setExpectedDate("");
      setNotes("");
      setLines(prefill?.items ?? []);
    }
  }, [open, editing, prefill]);

  // Show the chosen supplier's own products first in the picker.
  const sortedProducts = useMemo(() => {
    const sid = Number(supplierId) || null;
    return [...products].sort((a, b) => Number(b.supplierId === sid) - Number(a.supplierId === sid) || a.name.localeCompare(b.name));
  }, [products, supplierId]);

  const addProduct = (id: number) => {
    const p = products.find((x) => x.id === id);
    if (!p) return;
    setLines((prev) =>
      prev.some((l) => l.productId === id)
        ? prev.map((l) => (l.productId === id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { productId: p.id, name: p.name, sku: p.sku, quantity: Math.max(p.reorderLevel * 2 - p.stock, 1), unitCost: p.cost }],
    );
    setPickerOpen(false);
  };

  const update = (id: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l) => (l.productId === id ? { ...l, ...patch } : l)));

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const invalid = !supplierId || lines.length === 0 || lines.some((l) => !(l.quantity > 0) || !(l.unitCost >= 0));

  const submit = () => {
    const body = {
      supplierId: Number(supplierId),
      expectedDate: expectedDate || null,
      notes,
      items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })),
    };
    save.mutate(editing ? { id: editing.id, ...body } : body, {
      onSuccess: (po) => {
        onOpenChange(false);
        onSaved?.(po);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.poNumber}` : "New purchase order"}</DialogTitle>
          <DialogDescription>Saved as a draft. Place the order when it's ready to go to the supplier.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
            <div className="space-y-2">
              <Label>Supplier</Label>
              {!suppliersReady ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers
                      .filter((s) => s.active || String(s.id) === supplierId)
                      .map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              {suppliersReady && suppliers.length === 0 && <p className="text-xs text-muted-foreground">Add a supplier first on the Suppliers page.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="po-expected">Expected delivery</Label>
              <Input id="po-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-between font-normal text-muted-foreground">
                Add a product to this order...
                <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search by name or SKU..." />
                <CommandList>
                  <CommandEmpty>No products found.</CommandEmpty>
                  <CommandGroup>
                    {sortedProducts.map((p) => (
                      <CommandItem key={p.id} value={`${p.name} ${p.sku}`} onSelect={() => addProduct(p.id)} className="flex justify-between gap-4">
                        <span className="truncate">
                          {p.name} <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                        </span>
                        <span className={cn("shrink-0 text-xs", p.stock <= p.reorderLevel ? "text-warning" : "text-muted-foreground")}>
                          {p.stock} in stock
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <div className="overflow-x-auto rounded-xl border">
            {lines.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">No items yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-24">Qty</TableHead>
                    <TableHead className="w-32">Unit cost</TableHead>
                    <TableHead className="text-right">Line total</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.productId}>
                      <TableCell>
                        <p className="font-medium">{l.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{l.sku}</p>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          value={l.quantity}
                          onChange={(e) => update(l.productId, { quantity: parseInt(e.target.value, 10) || 0 })}
                          aria-label={`Quantity of ${l.name}`}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          value={l.unitCost}
                          onChange={(e) => update(l.productId, { unitCost: parseFloat(e.target.value) || 0 })}
                          aria-label={`Unit cost of ${l.name}`}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">{ksh(l.quantity * l.unitCost)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                          aria-label={`Remove ${l.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_220px] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="po-notes">Notes for the supplier (optional)</Label>
              <Textarea id="po-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="rounded-xl bg-muted/50 p-4 text-right">
              <p className="text-xs text-muted-foreground">Order total</p>
              <p className="text-xl font-bold">{kshExact(total)}</p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={invalid || save.isPending} className="bg-gradient-primary hover:bg-primary-dark">
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "Save draft" : "Create draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReceiveDialog({ po, open, onOpenChange }: { po: PurchaseOrderDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const receive = useReceivePurchaseOrder();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const outstanding = (i: PurchaseOrderDetail["items"][number]) => i.quantityOrdered - i.quantityReceived;

  const fillAll = () => setQty(Object.fromEntries(po.items.map((i) => [i.id, String(outstanding(i))])));
  useEffect(() => {
    if (open) {
      fillAll();
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, po.id]);

  const parsed = po.items.map((i) => ({ item: i, value: parseInt(qty[i.id] ?? "0", 10) || 0 }));
  const over = parsed.some(({ item, value }) => value > outstanding(item) || value < 0);
  const totalUnits = parsed.reduce((s, p) => s + p.value, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Receive goods · {po.poNumber}</DialogTitle>
          <DialogDescription>
            Enter what actually arrived. Stock and average unit cost update immediately; anything short stays open on the order.
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-28">Receiving now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {po.items.map((i) => {
                const left = outstanding(i);
                const v = parseInt(qty[i.id] ?? "0", 10) || 0;
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <p className="font-medium">{i.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.quantityReceived} of {i.quantityOrdered} received · {kshExact(i.unitCost)} each
                      </p>
                    </TableCell>
                    <TableCell className="text-right">{left}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={left}
                        disabled={left === 0}
                        value={qty[i.id] ?? ""}
                        onChange={(e) => setQty((q) => ({ ...q, [i.id]: e.target.value }))}
                        className={cn("h-8", v > left && "border-destructive")}
                        aria-label={`Quantity received of ${i.productName}`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={fillAll}>
            Everything arrived
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setQty({})}>
            Clear
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="recv-note">Delivery note / invoice number (optional)</Label>
          <Input id="recv-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {over && <p className="text-sm text-destructive">You can't receive more than is outstanding on a line.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={over || totalUnits === 0 || receive.isPending}
            onClick={() =>
              receive.mutate(
                {
                  id: po.id,
                  note,
                  items: parsed.filter((p) => p.value > 0).map((p) => ({ itemId: p.item.id, quantity: p.value })),
                },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            {receive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Receive {totalUnits} units
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseOrderDetailDialog({ poId, onOpenChange }: { poId: number | null; onOpenChange: (o: boolean) => void }) {
  const { data: po, isLoading } = usePurchaseOrder(poId);
  const { data: settings } = useSettings();
  const action = usePurchaseOrderAction();
  const del = useDeletePurchaseOrder();
  const [editOpen, setEditOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);

  const open = po && (po.status === "ordered" || po.status === "partially_received");

  return (
    <>
      <Dialog open={poId !== null} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader className="print:hidden">
            <DialogTitle>Purchase order {po?.poNumber}</DialogTitle>
            <DialogDescription>{po && `Created ${formatDateTime(po.createdAt)}${po.createdBy ? ` by ${po.createdBy}` : ""}`}</DialogDescription>
          </DialogHeader>

          {isLoading || !po ? (
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
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Purchase order</p>
                  <p className="font-mono text-lg font-semibold">{po.poNumber}</p>
                  <div className="mt-1">
                    <PoStatusBadge status={po.status} />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Supplier</p>
                  <p className="font-medium">{po.supplier.name}</p>
                  {po.supplier.contactName && <p className="text-muted-foreground">Attn: {po.supplier.contactName}</p>}
                  <p className="text-muted-foreground">{[po.supplier.phone, po.supplier.email].filter(Boolean).join(" · ")}</p>
                  {po.supplier.address && <p className="text-muted-foreground">{po.supplier.address}</p>}
                </div>
                <div className="space-y-1 sm:text-right">
                  {po.orderedAt && <p>Ordered {formatDate(po.orderedAt)}</p>}
                  {po.expectedDate && <p>Expected {formatDate(po.expectedDate)}</p>}
                  {po.receivedAt && <p>Received {formatDate(po.receivedAt)}</p>}
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Ordered</TableHead>
                    <TableHead className="text-right print:hidden">Received</TableHead>
                    <TableHead className="text-right">Unit cost</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {po.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        {i.productName}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{i.sku}</span>
                      </TableCell>
                      <TableCell className="text-right">{i.quantityOrdered}</TableCell>
                      <TableCell
                        className={cn(
                          "text-right print:hidden",
                          i.quantityReceived === i.quantityOrdered ? "text-accent" : i.quantityReceived > 0 && "text-warning",
                        )}
                      >
                        {i.quantityReceived}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">{kshExact(i.unitCost)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">{kshExact(i.lineTotal)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="ml-auto max-w-xs space-y-1.5">
                <div className="flex justify-between text-base font-bold">
                  <span>Order total</span>
                  <span>{kshExact(po.total)}</span>
                </div>
                {po.unitsReceived > 0 && po.status !== "received" && (
                  <div className="flex justify-between text-muted-foreground print:hidden">
                    <span>Received so far</span>
                    <span>{kshExact(po.receivedValue)}</span>
                  </div>
                )}
              </div>

              {po.notes && (
                <p className="rounded-lg bg-muted/50 p-3 text-muted-foreground">
                  <span className="font-medium text-foreground">Notes:</span> {po.notes}
                </p>
              )}
            </div>
          )}

          {po && (
            <DialogFooter className="flex-wrap gap-2 print:hidden">
              {po.status === "draft" && (
                <>
                  <Button variant="outline" className="text-destructive" onClick={() => setConfirm("delete")}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete draft
                  </Button>
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>
                </>
              )}
              {open && (
                <Button variant="outline" className="text-destructive" onClick={() => setConfirm("cancel")}>
                  <XCircle className="mr-2 h-4 w-4" />
                  Cancel order
                </Button>
              )}
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" />
                Print
              </Button>
              {po.items.some((i) => i.quantityReceived > 0) && (
                // One label per unit received, ready to stick on the new stock.
                <Button variant="outline" asChild>
                  <Link
                    to={`/app/labels?items=${po.items
                      .filter((i) => i.quantityReceived > 0)
                      .map((i) => `${i.productId}:${i.quantityReceived}`)
                      .join(",")}`}
                  >
                    <Tag className="mr-2 h-4 w-4" />
                    Labels for received stock
                  </Link>
                </Button>
              )}
              {po.status === "draft" && (
                <Button disabled={action.isPending} onClick={() => action.mutate({ id: po.id, action: "order" })}>
                  {action.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  Place order
                </Button>
              )}
              {open && (
                <Button onClick={() => setReceiveOpen(true)}>
                  <PackageCheck className="mr-2 h-4 w-4" />
                  Receive goods
                </Button>
              )}
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {po && (
        <>
          <PurchaseOrderFormDialog open={editOpen} onOpenChange={setEditOpen} editing={po} />
          <ReceiveDialog po={po} open={receiveOpen} onOpenChange={setReceiveOpen} />
          <ConfirmDialog
            open={confirm !== null}
            onOpenChange={(o) => !o && setConfirm(null)}
            title={confirm === "delete" ? `Delete ${po.poNumber}?` : `Cancel ${po.poNumber}?`}
            description={
              confirm === "delete"
                ? "This draft will be removed permanently."
                : po.unitsReceived > 0
                  ? "Outstanding items will no longer be expected. Goods already received stay in stock."
                  : "The order will be closed and nothing further will be expected from the supplier."
            }
            confirmLabel={confirm === "delete" ? "Delete" : "Cancel order"}
            destructive
            pending={action.isPending || del.isPending}
            onConfirm={() => {
              if (confirm === "delete") {
                del.mutate(po, {
                  onSuccess: () => {
                    setConfirm(null);
                    onOpenChange(false);
                  },
                });
              } else {
                action.mutate({ id: po.id, action: "cancel" }, { onSuccess: () => setConfirm(null) });
              }
            }}
          />
        </>
      )}
    </>
  );
}
