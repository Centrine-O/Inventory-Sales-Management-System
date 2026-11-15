import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldError, StockBadge } from "@/components/common";
import { useAdjustStock, useCategories, useProduct, useSaveProduct } from "@/hooks/api";
import { formatDateTime, ksh } from "@/lib/format";
import type { Product, StockMovement } from "@/lib/types";

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  sku: z.string().trim().min(1, "SKU is required").max(50),
  category: z.string().trim().min(1, "Category is required"),
  description: z.string().trim().max(2000),
  price: z.coerce.number({ invalid_type_error: "Enter a price" }).min(0, "Price cannot be negative"),
  cost: z.coerce.number({ invalid_type_error: "Enter a cost" }).min(0, "Cost cannot be negative"),
  stock: z.coerce.number().int("Whole numbers only").min(0, "Stock cannot be negative"),
  reorderLevel: z.coerce.number().int("Whole numbers only").min(0),
});
type ProductForm = z.infer<typeof productSchema>;

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  product: Product | null;
}) {
  const save = useSaveProduct();
  const { data: categories = [] } = useCategories();
  const form = useForm<ProductForm>({ resolver: zodResolver(productSchema) });
  const { register, handleSubmit, reset, watch, formState } = form;
  const errors = formState.errors;

  useEffect(() => {
    if (open) {
      reset(
        product
          ? { ...product }
          : { name: "", sku: "", category: "", description: "", price: 0, cost: 0, stock: 0, reorderLevel: 5 },
      );
    }
  }, [open, product, reset]);

  const price = Number(watch("price")) || 0;
  const cost = Number(watch("cost")) || 0;
  const margin = price > 0 ? ((price - cost) / price) * 100 : null;

  const onSubmit = (values: ProductForm) => {
    const { stock, ...rest } = values as Required<ProductForm>;
    save.mutate(product ? { id: product.id, ...rest } : { ...rest, stock }, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{product ? "Edit product" : "Add product"}</DialogTitle>
          <DialogDescription>
            {product ? "Update catalog details. Use “Adjust stock” to change quantities." : "Add an item to the catalog."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" {...register("name")} />
            <FieldError message={errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-sku">SKU</Label>
              <Input id="p-sku" className="font-mono uppercase" {...register("sku")} />
              <FieldError message={errors.sku?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-category">Category</Label>
              <Input id="p-category" list="category-options" {...register("category")} />
              <datalist id="category-options">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <FieldError message={errors.category?.message} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="p-price">Selling price (KSh, VAT incl.)</Label>
              <Input id="p-price" type="number" step="0.01" min="0" {...register("price")} />
              <FieldError message={errors.price?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="p-cost">Unit cost (KSh)</Label>
              <Input id="p-cost" type="number" step="0.01" min="0" {...register("cost")} />
              <FieldError message={errors.cost?.message} />
            </div>
          </div>
          {margin !== null && (
            <p className={margin < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
              Margin: {margin.toFixed(1)}% ({ksh(price - cost)} per unit)
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {!product && (
              <div className="space-y-2">
                <Label htmlFor="p-stock">Opening stock</Label>
                <Input id="p-stock" type="number" min="0" step="1" {...register("stock")} />
                <FieldError message={errors.stock?.message} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="p-reorder">Reorder level</Label>
              <Input id="p-reorder" type="number" min="0" step="1" {...register("reorderLevel")} />
              <FieldError message={errors.reorderLevel?.message} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-desc">Description (optional)</Label>
            <Textarea id="p-desc" rows={2} {...register("description")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="bg-gradient-primary hover:bg-primary-dark">
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {product ? "Save changes" : "Add product"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const stockSchema = z.object({
  direction: z.enum(["in", "out"]),
  quantity: z.coerce.number().int("Whole numbers only").positive("Enter a quantity above zero"),
  reason: z.enum(["restock", "adjustment"]),
  note: z.string().trim().max(200),
});
type StockForm = z.infer<typeof stockSchema>;

export function StockAdjustDialog({
  product,
  onOpenChange,
}: {
  product: Product | null;
  onOpenChange: (o: boolean) => void;
}) {
  const adjust = useAdjustStock();
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<StockForm>({
    resolver: zodResolver(stockSchema),
  });

  useEffect(() => {
    if (product) reset({ direction: "in", quantity: 1, reason: "restock", note: "" });
  }, [product, reset]);

  const direction = watch("direction");
  const reason = watch("reason");
  const qty = Number(watch("quantity")) || 0;
  const resulting = product ? product.stock + (direction === "out" ? -qty : qty) : 0;

  const onSubmit = (v: StockForm) => {
    if (!product) return;
    adjust.mutate(
      { id: product.id, change: v.direction === "out" ? -v.quantity : v.quantity, reason: v.reason, note: v.note },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={product !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {product?.name} · currently <strong>{product?.stock}</strong> in stock
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={reason}
                onValueChange={(v: "restock" | "adjustment") => {
                  setValue("reason", v);
                  if (v === "restock") setValue("direction", "in");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restock">Restock (delivery)</SelectItem>
                  <SelectItem value="adjustment">Adjustment (count, damage, loss)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <Select
                value={direction}
                onValueChange={(v: "in" | "out") => setValue("direction", v)}
                disabled={reason === "restock"}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Add to stock</SelectItem>
                  <SelectItem value="out">Remove from stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-qty">Quantity</Label>
            <Input id="s-qty" type="number" min="1" step="1" {...register("quantity")} />
            <FieldError message={formState.errors.quantity?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-note">Note (optional)</Label>
            <Input id="s-note" placeholder="e.g. Supplier invoice #, reason for loss" {...register("note")} />
          </div>
          <p className={resulting < 0 ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            Stock after adjustment: <strong>{resulting}</strong>
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjust.isPending || resulting < 0}>
              {adjust.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save adjustment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const MOVEMENT_LABEL: Record<StockMovement["reason"], string> = {
  initial: "Opening stock",
  sale: "Sale",
  restock: "Restock",
  adjustment: "Adjustment",
  sale_cancelled: "Sale cancelled",
};

export function ProductDetailDialog({ productId, onOpenChange }: { productId: number | null; onOpenChange: (o: boolean) => void }) {
  const { data: p, isLoading } = useProduct(productId);
  return (
    <Dialog open={productId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{p?.name ?? "Product"}</DialogTitle>
          <DialogDescription>{p && `${p.sku} · ${p.category}`}</DialogDescription>
        </DialogHeader>
        {isLoading || !p ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Price", ksh(p.price)],
                ["Cost", ksh(p.cost)],
                ["In stock", String(p.stock)],
                ["Reorder at", String(p.reorderLevel)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold">{value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <StockBadge status={p.status} />
              {p.archived && <span className="text-sm text-muted-foreground">Archived</span>}
            </div>
            {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
            <div>
              <h3 className="mb-2 font-medium">Stock movements</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.movements.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No movements yet
                      </TableCell>
                    </TableRow>
                  )}
                  {p.movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-sm">{formatDateTime(m.createdAt)}</TableCell>
                      <TableCell className="text-sm">{MOVEMENT_LABEL[m.reason]}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.reference}
                        {m.userName && ` · ${m.userName}`}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${m.change < 0 ? "text-destructive" : "text-accent"}`}>
                        {m.change > 0 ? `+${m.change}` : m.change}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
