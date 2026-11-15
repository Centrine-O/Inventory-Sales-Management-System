import { useMemo, useState } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Edit, Eye, MoreVertical, Plus, Search, Trash2, Truck, ClipboardList, Wallet } from "lucide-react";
import { ConfirmDialog, MetricCard, PageHeader, TableLoading, TableMessage } from "@/components/common";
import { SupplierDetailDialog, SupplierFormDialog } from "@/components/purchasing/SupplierDialogs";
import { PurchaseOrderDetailDialog } from "@/components/purchasing/PurchaseOrderDialogs";
import { useDeleteSupplier, useSuppliers } from "@/hooks/api";
import { ksh, kshCompact } from "@/lib/format";
import type { Supplier } from "@/lib/types";

const Suppliers = () => {
  const { data: suppliers = [], isLoading } = useSuppliers();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [viewingPo, setViewingPo] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const del = useDeleteSupplier();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return suppliers.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.contactName.toLowerCase().includes(q) || s.phone.includes(q),
    );
  }, [suppliers, search]);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Suppliers"
          description="Keep vendor contacts in one place and see what you buy from each of them."
          actions={
            <Button
              className="bg-gradient-primary hover:bg-primary-dark"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Supplier
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Active suppliers"
            value={suppliers.filter((s) => s.active).length}
            icon={<Truck className="h-6 w-6" />}
            loading={isLoading}
          />
          <MetricCard
            label="Open purchase orders"
            value={suppliers.reduce((n, s) => n + s.openOrders, 0)}
            icon={<ClipboardList className="h-6 w-6" />}
            tone="warning"
            loading={isLoading}
          />
          <MetricCard
            label="Total goods received"
            value={kshCompact(suppliers.reduce((n, s) => n + s.totalPurchased, 0))}
            icon={<Wallet className="h-6 w-6" />}
            tone="accent"
            loading={isLoading}
          />
        </div>

        <Card className="shadow-medium">
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Supplier list</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, contact, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 sm:w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Products</TableHead>
                  <TableHead className="text-right">Open orders</TableHead>
                  <TableHead className="text-right">Total received</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableLoading cols={7} />}
                {!isLoading && filtered.length === 0 && (
                  <TableMessage cols={7}>
                    {suppliers.length === 0 ? "No suppliers yet. Add the businesses you buy stock from." : "No suppliers match your search."}
                  </TableMessage>
                )}
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setViewing(s.id)}>
                    <TableCell>
                      <p className="font-medium">{s.name}</p>
                      <p className="text-sm text-muted-foreground">{s.contactName || "No contact person"}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{s.phone || "—"}</TableCell>
                    <TableCell className="text-right">{s.productCount}</TableCell>
                    <TableCell className="text-right">{s.openOrders}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{ksh(s.totalPurchased)}</TableCell>
                    <TableCell>
                      <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(s.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(s);
                              setFormOpen(true);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(s)}>
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

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
      <SupplierDetailDialog
        supplierId={viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        onOpenOrder={(id) => {
          setViewing(null);
          setViewingPo(id);
        }}
      />
      <PurchaseOrderDetailDialog poId={viewingPo} onOpenChange={(o) => !o && setViewingPo(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Products that list this supplier will have no preferred supplier. Suppliers with purchase orders can't be deleted — mark them inactive instead."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </Layout>
  );
};

export default Suppliers;
