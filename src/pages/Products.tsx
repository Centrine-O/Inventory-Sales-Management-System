import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Edit, Trash2, Package, AlertTriangle, PackageX, Boxes, Eye, Tag } from "lucide-react";
import { ConfirmDialog, MetricCard, PageHeader, StockBadge, TableLoading, TableMessage } from "@/components/common";
import { ProductDetailDialog, ProductFormDialog, StockAdjustDialog } from "@/components/products/ProductDialogs";
import { useCategories, useDeleteProduct, useProducts } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { ksh } from "@/lib/format";
import type { Product, StockStatus } from "@/lib/types";

const ALL = "all";

const Products = () => {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get("search") ?? "";
  const [status, setStatus] = useState<StockStatus | typeof ALL>(ALL);
  const [category, setCategory] = useState<string>(ALL);

  const { data: all = [], isLoading: loadingAll } = useProducts();
  const { data: categories = [] } = useCategories();

  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const del = useDeleteProduct();

  // Filter client-side: the catalog is small and this keeps typing instant.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (p) =>
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.barcode === search.trim()) &&
        (status === ALL || p.status === status) &&
        (category === ALL || p.category === category),
    );
  }, [all, search, status, category]);

  const counts = {
    total: all.length,
    in: all.filter((p) => p.status === "in_stock").length,
    low: all.filter((p) => p.status === "low_stock").length,
    out: all.filter((p) => p.status === "out_of_stock").length,
  };
  const cols = isAdmin ? 7 : 6;

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Products"
          description="Manage stock levels, pricing, and reorder pressure across the catalog."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link to="/app/labels">
                  <Tag className="mr-2 h-4 w-4" />
                  Print labels
                </Link>
              </Button>
              {isAdmin && (
                <Button
                  className="bg-gradient-primary hover:bg-primary-dark"
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Product
                </Button>
              )}
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total products" value={counts.total} icon={<Package className="h-6 w-6" />} loading={loadingAll} />
          <MetricCard label="In stock" value={counts.in} icon={<Boxes className="h-6 w-6" />} tone="accent" loading={loadingAll} />
          <MetricCard label="Low stock" value={counts.low} icon={<AlertTriangle className="h-6 w-6" />} tone="warning" loading={loadingAll} />
          <MetricCard label="Out of stock" value={counts.out} icon={<PackageX className="h-6 w-6" />} tone="destructive" loading={loadingAll} />
        </div>

        <Card className="shadow-medium">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>Product list</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search name, SKU, barcode..."
                    value={search}
                    onChange={(e) => setParams(e.target.value ? { search: e.target.value } : {}, { replace: true })}
                    className="pl-10 sm:w-64"
                  />
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={status} onValueChange={(v) => setStatus(v as StockStatus | typeof ALL)}>
                  <SelectTrigger className="sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All statuses</SelectItem>
                    <SelectItem value="in_stock">In stock</SelectItem>
                    <SelectItem value="low_stock">Low stock</SelectItem>
                    <SelectItem value="out_of_stock">Out of stock</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-[50px]" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingAll && <TableLoading cols={cols} />}
                {!loadingAll && filtered.length === 0 && (
                  <TableMessage cols={cols}>
                    {all.length === 0 ? "No products yet. Add your first product to get started." : "No products match these filters."}
                  </TableMessage>
                )}
                {filtered.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => setViewing(p.id)}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-sm">{p.sku}</TableCell>
                    <TableCell>{p.category}</TableCell>
                    <TableCell className="text-right">{ksh(p.price)}</TableCell>
                    <TableCell className="text-right font-medium">{p.stock}</TableCell>
                    <TableCell>
                      <StockBadge status={p.status} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label={`Actions for ${p.name}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setViewing(p.id)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View history
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setAdjusting(p)}>
                              <Boxes className="mr-2 h-4 w-4" />
                              Adjust stock
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/app/labels?items=${p.id}:1`}>
                                <Tag className="mr-2 h-4 w-4" />
                                Print labels
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(p)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
      <StockAdjustDialog product={adjusting} onOpenChange={(o) => !o && setAdjusting(null)} />
      <ProductDetailDialog productId={viewing} onOpenChange={(o) => !o && setViewing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="Products that appear on past sales are archived instead of deleted, so invoices and reports stay intact."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </Layout>
  );
};

export default Products;
