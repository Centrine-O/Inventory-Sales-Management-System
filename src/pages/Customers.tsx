import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Edit, Trash2, Users, UserCheck, HandCoins, Wallet, Eye } from "lucide-react";
import { ConfirmDialog, MetricCard, PageHeader, TableLoading, TableMessage } from "@/components/common";
import { CustomerDetailDialog, CustomerFormDialog } from "@/components/customers/CustomerDialogs";
import { useCustomers, useDeleteCustomer } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate, initials, ksh, kshCompact } from "@/lib/format";
import type { Customer } from "@/lib/types";

const Customers = () => {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const viewParam = params.get("view");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const { data: all = [], isLoading } = useCustomers();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const del = useDeleteCustomer();

  const viewing = viewParam ? Number(viewParam) : null;
  const setViewing = (id: number | null) => setParams(id ? { view: String(id) } : {}, { replace: true });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter(
      (c) =>
        (!q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || c.phone.includes(q)) &&
        (status === "all" || (status === "owing" ? c.balance > 0 : c.status === status)),
    );
  }, [all, search, status]);

  const totals = {
    count: all.length,
    active: all.filter((c) => c.status === "active").length,
    owed: all.reduce((s, c) => s + c.balance, 0),
    debtors: all.filter((c) => c.balance > 0).length,
    revenue: all.reduce((s, c) => s + c.totalSpent, 0),
  };

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Customers"
          description="Track customer history, contact details, and repeat buying patterns."
          actions={
            <Button
              className="bg-gradient-primary hover:bg-primary-dark"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total customers" value={totals.count} icon={<Users className="h-6 w-6" />} loading={isLoading} />
          <MetricCard label="Active" value={totals.active} icon={<UserCheck className="h-6 w-6" />} tone="accent" loading={isLoading} />
          <MetricCard
            label="Owed to you"
            value={kshCompact(totals.owed)}
            icon={<HandCoins className="h-6 w-6" />}
            tone="warning"
            loading={isLoading}
            hint={totals.debtors > 0 && `${totals.debtors} customer${totals.debtors === 1 ? "" : "s"} with a balance`}
          />
          <MetricCard label="Lifetime revenue" value={kshCompact(totals.revenue)} icon={<Wallet className="h-6 w-6" />} tone="accent" loading={isLoading} />
        </div>

        <Card className="shadow-medium">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <CardTitle>Customer list</CardTitle>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search name, phone, email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 sm:w-64"
                  />
                </div>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="sm:w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="owing">Owing money</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Total spent</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Last purchase</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableLoading cols={8} />}
                {!isLoading && filtered.length === 0 && (
                  <TableMessage cols={8}>{all.length === 0 ? "No customers yet." : "No customers match these filters."}</TableMessage>
                )}
                {filtered.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setViewing(c.id)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>{initials(c.name)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="font-medium">{c.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{c.email || "No email"}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.phone || "—"}</TableCell>
                    <TableCell className="text-right">{c.totalOrders}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">{ksh(c.totalSpent)}</TableCell>
                    <TableCell className={`whitespace-nowrap text-right ${c.balance > 0 ? "font-medium text-warning" : "text-muted-foreground"}`}>
                      {c.balance > 0 ? ksh(c.balance) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.lastPurchaseAt ? formatDate(c.lastPurchaseAt) : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.status === "active" ? "default" : "secondary"} className="capitalize">
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${c.name}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setViewing(c.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View history
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(c);
                              setFormOpen(true);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          {isAdmin && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(c)}>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
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

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} />
      <CustomerDetailDialog customerId={viewing} onOpenChange={(o) => !o && setViewing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        description="This permanently removes the customer. Customers with sales history can't be deleted — mark them inactive instead."
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={() => deleting && del.mutate(deleting, { onSuccess: () => setDeleting(null) })}
      />
    </Layout>
  );
};

export default Customers;
