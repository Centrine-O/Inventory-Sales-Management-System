import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FieldError, StockBadge } from "@/components/common";
import { PoStatusBadge } from "./PurchaseOrderDialogs";
import { useSaveSupplier, useSupplier } from "@/hooks/api";
import { formatDate, ksh } from "@/lib/format";
import type { Supplier } from "@/lib/types";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  contactName: z.string().trim().max(200),
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")]),
  phone: z.string().trim().max(40),
  address: z.string().trim().max(300),
  notes: z.string().trim().max(1000),
  active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

export function SupplierFormDialog({
  open,
  onOpenChange,
  supplier,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  supplier: Supplier | null;
}) {
  const save = useSaveSupplier();
  const { register, handleSubmit, reset, watch, setValue, formState } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      reset(
        supplier
          ? { ...supplier }
          : { name: "", contactName: "", email: "", phone: "", address: "", notes: "", active: true },
      );
    }
  }, [open, supplier, reset]);

  const onSubmit = (v: FormValues) =>
    save.mutate({ id: supplier?.id, ...(v as Required<FormValues>) }, { onSuccess: () => onOpenChange(false) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{supplier ? "Edit supplier" : "Add supplier"}</DialogTitle>
          <DialogDescription>Supplier details appear on printed purchase orders.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="s-name">Business name</Label>
            <Input id="s-name" {...register("name")} />
            <FieldError message={formState.errors.name?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s-contact">Contact person</Label>
              <Input id="s-contact" {...register("contactName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-phone">Phone</Label>
              <Input id="s-phone" type="tel" {...register("phone")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-email">Email</Label>
            <Input id="s-email" type="email" {...register("email")} />
            <FieldError message={formState.errors.email?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-address">Address</Label>
            <Input id="s-address" {...register("address")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-notes">Notes (payment terms, lead times...)</Label>
            <Textarea id="s-notes" rows={2} {...register("notes")} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Active supplier</p>
              <p className="text-xs text-muted-foreground">Inactive suppliers can't receive new purchase orders.</p>
            </div>
            <Switch checked={watch("active")} onCheckedChange={(v) => setValue("active", v)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending} className="bg-gradient-primary hover:bg-primary-dark">
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {supplier ? "Save changes" : "Add supplier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierDetailDialog({
  supplierId,
  onOpenChange,
  onOpenOrder,
}: {
  supplierId: number | null;
  onOpenChange: (o: boolean) => void;
  onOpenOrder: (poId: number) => void;
}) {
  const { data: s, isLoading } = useSupplier(supplierId);
  return (
    <Dialog open={supplierId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{s?.name ?? "Supplier"}</DialogTitle>
          <DialogDescription>{s && [s.contactName, s.phone, s.email].filter(Boolean).join(" · ")}</DialogDescription>
        </DialogHeader>
        {isLoading || !s ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Products supplied", String(s.productCount)],
                ["Open orders", String(s.openOrders)],
                ["Total received", ksh(s.totalPurchased)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {(s.address || s.notes) && (
              <div className="space-y-1 text-sm text-muted-foreground">
                {s.address && <p>{s.address}</p>}
                {s.notes && <p className="rounded-lg bg-muted/50 p-3">{s.notes}</p>}
              </div>
            )}
            <Tabs defaultValue="orders">
              <TabsList>
                <TabsTrigger value="orders">Purchase orders ({s.orders.length})</TabsTrigger>
                <TabsTrigger value="products">Products ({s.products.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="orders">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.orders.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No purchase orders yet
                        </TableCell>
                      </TableRow>
                    )}
                    {s.orders.map((o) => (
                      <TableRow key={o.id} className="cursor-pointer" onClick={() => onOpenOrder(o.id)}>
                        <TableCell className="font-mono text-primary">{o.poNumber}</TableCell>
                        <TableCell>{formatDate(o.createdAt)}</TableCell>
                        <TableCell className="text-right">{ksh(o.total)}</TableCell>
                        <TableCell>
                          <PoStatusBadge status={o.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
              <TabsContent value="products">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Unit cost</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.products.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground">
                          No products list this supplier as preferred
                        </TableCell>
                      </TableRow>
                    )}
                    {s.products.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>
                          {p.name} <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                        </TableCell>
                        <TableCell className="text-right">{ksh(p.cost)}</TableCell>
                        <TableCell className="text-right">{p.stock}</TableCell>
                        <TableCell>
                          <StockBadge status={p.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
