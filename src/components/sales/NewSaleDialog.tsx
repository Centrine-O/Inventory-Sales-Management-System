import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Loader2, Minus, Plus, ScanBarcode, Trash2, UserPlus } from "lucide-react";
import { CameraScanButton } from "./CameraScanner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { CustomerFormDialog } from "@/components/customers/CustomerDialogs";
import { useCreateSale, useCurrentShift, useCustomers, useProducts, useSettings } from "@/hooks/api";
import { Link } from "react-router-dom";
import { ksh, kshExact } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PAYMENT_METHODS, type PaymentMethod, type Product, type SaleDetail } from "@/lib/types";

interface Line {
  product: Product;
  quantity: number;
}

const WALK_IN = "walk-in";

export function NewSaleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated?: (sale: SaleDetail) => void;
}) {
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: customers = [] } = useCustomers({ status: "active" });
  const { data: settings } = useSettings();
  const { data: shift, isLoading: shiftLoading } = useCurrentShift();
  const tillRequired = Boolean(settings?.requireShiftForSales) && !shiftLoading && !shift;
  const create = useCreateSale();

  const [lines, setLines] = useState<Line[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>(WALK_IN);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("M-Pesa");
  const [status, setStatus] = useState<"paid" | "pending">("paid");
  const [discount, setDiscount] = useState("");
  const [deposit, setDeposit] = useState("");
  const [notes, setNotes] = useState("");
  const [scan, setScan] = useState("");
  const [scanMsg, setScanMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLines([]);
      setCustomerId(WALK_IN);
      setPayment("M-Pesa");
      setStatus("paid");
      setDiscount("");
      setDeposit("");
      setNotes("");
      setScan("");
      setScanMsg(null);
    }
  }, [open]);

  useEffect(() => {
    if (flashId === null) return;
    const t = setTimeout(() => setFlashId(null), 900);
    return () => clearTimeout(t);
  }, [flashId]);

  // Keep cart lines in sync with the latest stock figures.
  const stockById = useMemo(() => new Map(products.map((p) => [p.id, p.stock])), [products]);

  const addProduct = (p: Product) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.product.id === p.id);
      if (existing) {
        return prev.map((l) => (l.product.id === p.id ? { ...l, quantity: Math.min(l.quantity + 1, p.stock) } : l));
      }
      return [...prev, { product: p, quantity: 1 }];
    });
    setPickerOpen(false);
  };

  /**
   * Handle a scanned or typed code. USB/Bluetooth scanners "type" the code and press Enter.
   * Matches a barcode exactly, then a SKU (case-insensitive), and adds one unit per scan.
   */
  const handleCode = (raw: string) => {
    const code = raw.trim();
    setScan("");
    scanRef.current?.focus();
    if (!code) return;
    if (productsLoading) {
      setScanMsg({ ok: false, text: "Products are still loading — scan again in a moment." });
      return;
    }
    const p = products.find((x) => x.barcode === code) ?? products.find((x) => x.sku.toLowerCase() === code.toLowerCase());
    if (!p) {
      setScanMsg({ ok: false, text: `No product with barcode or SKU “${code}”.` });
      return;
    }
    const inCart = lines.find((l) => l.product.id === p.id)?.quantity ?? 0;
    if (p.stock <= inCart) {
      setScanMsg({ ok: false, text: p.stock <= 0 ? `${p.name} is out of stock.` : `Only ${p.stock} ${p.name} in stock — all in the cart.` });
      return;
    }
    addProduct(p);
    setFlashId(p.id);
    setScanMsg({ ok: true, text: `Added ${p.name}${inCart > 0 ? ` (now ${inCart + 1})` : ""}` });
  };

  const setQty = (id: number, qty: number) =>
    setLines((prev) => prev.map((l) => (l.product.id === id ? { ...l, quantity: Math.max(1, qty || 1) } : l)));

  const subtotal = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  const discountNum = Math.max(0, Number(discount) || 0);
  const total = Math.max(0, subtotal - discountNum);
  const taxRate = settings?.taxRate ?? 16;
  const vat = taxRate > 0 ? (total * taxRate) / (100 + taxRate) : 0;

  const customer = customers.find((c) => String(c.id) === customerId) ?? null;
  const onCredit = status === "pending";
  const depositNum = onCredit ? Math.max(0, Number(deposit) || 0) : total;
  const owedAfter = (customer?.balance ?? 0) + Math.max(0, total - depositNum);
  const overLimit = onCredit && customer !== null && customer.creditLimit > 0 && owedAfter > customer.creditLimit;

  const overStock = lines.filter((l) => l.quantity > (stockById.get(l.product.id) ?? 0));
  const problems = [
    lines.length === 0 && "Add at least one product",
    overStock.length > 0 && `Not enough stock for ${overStock.map((l) => l.product.name).join(", ")}`,
    discountNum > subtotal && "Discount is larger than the subtotal",
    onCredit && customer === null && "Choose a customer to sell on credit",
    overLimit && `Over ${customer!.name}'s credit limit of ${ksh(customer!.creditLimit)}`,
    tillRequired && "Open your till before recording sales",
  ].filter(Boolean) as string[];

  const submit = () =>
    create.mutate(
      {
        customerId: customerId === WALK_IN ? null : Number(customerId),
        paymentMethod: payment,
        status,
        amountPaid: onCredit ? depositNum : 0,
        discount: discountNum,
        notes,
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
      },
      {
        onSuccess: (sale) => {
          onOpenChange(false);
          onCreated?.(sale);
        },
      },
    );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
          onOpenAutoFocus={(e) => {
            // Ready for the scanner the moment the dialog opens.
            e.preventDefault();
            scanRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>New sale</DialogTitle>
            <DialogDescription>Add products, choose the customer and payment, then record the sale.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {tillRequired && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
                <span>Your till is closed. Open it with your starting float before recording sales.</span>
                <Button size="sm" variant="outline" asChild onClick={() => onOpenChange(false)}>
                  <Link to="/app/till">Open till</Link>
                </Button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCode(scan);
              }}
              className="space-y-1.5"
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <ScanBarcode className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    ref={scanRef}
                    id="scan-code"
                    value={scan}
                    onChange={(e) => {
                      setScan(e.target.value);
                      if (scanMsg) setScanMsg(null);
                    }}
                    placeholder="Scan a barcode, or type a barcode / SKU and press Enter"
                    className="pl-10"
                    autoComplete="off"
                    aria-label="Scan barcode"
                  />
                </div>
                <CameraScanButton onDetected={handleCode} />
              </div>
              {scanMsg && (
                <p role="status" className={cn("text-sm", scanMsg.ok ? "text-accent" : "text-destructive")}>
                  {scanMsg.text}
                </p>
              )}
            </form>

            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal text-muted-foreground">
                  Or search products by name...
                  <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Type to search..." />
                  <CommandList>
                    <CommandEmpty>No products found.</CommandEmpty>
                    <CommandGroup>
                      {products.map((p) => (
                        <CommandItem
                          key={p.id}
                          value={`${p.name} ${p.sku} ${p.barcode ?? ""}`}
                          disabled={p.stock <= 0}
                          onSelect={() => addProduct(p)}
                          className="flex justify-between gap-4"
                        >
                          <span className="truncate">
                            {p.name} <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-3 text-xs">
                            <span className={cn(p.stock <= 0 ? "text-destructive" : "text-muted-foreground")}>
                              {p.stock <= 0 ? "Out of stock" : `${p.stock} left`}
                            </span>
                            <span className="font-medium">{ksh(p.price)}</span>
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <div className="rounded-xl border">
              {lines.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">The cart is empty.</p>
              ) : (
                <ul className="divide-y">
                  {lines.map((l) => {
                    const available = stockById.get(l.product.id) ?? 0;
                    const over = l.quantity > available;
                    return (
                      <li
                        key={l.product.id}
                        className={cn("flex flex-wrap items-center gap-3 p-3 transition-colors duration-700", flashId === l.product.id && "bg-accent/15")}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{l.product.name}</p>
                          <p className={cn("text-xs", over ? "text-destructive" : "text-muted-foreground")}>
                            {ksh(l.product.price)} each · {available} available
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setQty(l.product.id, l.quantity - 1)}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            max={available}
                            value={l.quantity}
                            onChange={(e) => setQty(l.product.id, parseInt(e.target.value, 10))}
                            className={cn("h-8 w-16 text-center", over && "border-destructive")}
                            aria-label={`Quantity of ${l.product.name}`}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setQty(l.product.id, l.quantity + 1)}
                            disabled={l.quantity >= available}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="w-28 text-right font-semibold">{ksh(l.product.price * l.quantity)}</p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                          aria-label={`Remove ${l.product.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Customer</Label>
                  <div className="flex gap-2">
                    <Select value={customerId} onValueChange={setCustomerId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={WALK_IN}>Walk-in customer</SelectItem>
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={String(c.id)}>
                            {c.name}
                            {c.phone && <span className="ml-2 text-muted-foreground">{c.phone}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" onClick={() => setAddCustomerOpen(true)} aria-label="Add new customer">
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Payment method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map((m) => (
                      <Button
                        key={m}
                        type="button"
                        variant={payment === m ? "default" : "outline"}
                        onClick={() => setPayment(m)}
                        className="justify-start"
                      >
                        {payment === m && <Check className="mr-2 h-4 w-4" />}
                        {m}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Payment status</Label>
                  <RadioGroup value={status} onValueChange={(v) => setStatus(v as "paid" | "pending")} className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="paid" /> Paid in full
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <RadioGroupItem value="pending" /> On credit
                    </label>
                  </RadioGroup>
                </div>
                {onCredit && (
                  <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
                    <Label htmlFor="sale-deposit">Deposit paid now (KSh, optional)</Label>
                    <Input
                      id="sale-deposit"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                    />
                    {customer ? (
                      <p className={cn("text-xs", overLimit ? "text-destructive" : "text-muted-foreground")}>
                        {customer.name} owes {ksh(customer.balance)} now, {ksh(owedAfter)} after this sale
                        {customer.creditLimit > 0 ? ` · limit ${ksh(customer.creditLimit)}` : " · no credit limit"}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Pick the customer above so the balance can be followed up.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sale-discount">Discount (KSh)</Label>
                  <Input id="sale-discount" type="number" min="0" step="0.01" placeholder="0" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sale-notes">Notes (optional)</Label>
                  <Textarea id="sale-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="M-Pesa code, delivery details..." />
                </div>
                <div className="space-y-1.5 rounded-xl bg-muted/50 p-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>{kshExact(subtotal)}</span>
                  </div>
                  {discountNum > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Discount</span>
                      <span>−{kshExact(discountNum)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Includes VAT ({taxRate}%)</span>
                    <span>{kshExact(vat)}</span>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span>{kshExact(total)}</span>
                  </div>
                  {onCredit && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Paid now</span>
                        <span>{kshExact(Math.min(depositNum, total))}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-warning">
                        <span>Balance on credit</span>
                        <span>{kshExact(Math.max(0, total - depositNum))}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
            {problems.length > 0 && lines.length > 0 && <p className="mr-auto text-sm text-destructive">{problems[0]}</p>}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={problems.length > 0 || create.isPending} className="bg-gradient-primary hover:bg-primary-dark">
              {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {onCredit ? `Record credit sale · ${ksh(Math.max(0, total - depositNum))} owed` : `Record sale · ${ksh(total)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerFormDialog
        open={addCustomerOpen}
        onOpenChange={setAddCustomerOpen}
        customer={null}
        onCreated={(c) => setCustomerId(String(c.id))}
      />
    </>
  );
}
