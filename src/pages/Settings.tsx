import { useEffect, useState, type FormEvent } from "react";
import { Loader2, Plus, UserCog } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/common";
import { useChangePassword, useSaveSettings, useSaveUser, useSettings, useUsers } from "@/hooks/api";
import { useAuth } from "@/contexts/AuthContext";
import { formatDate } from "@/lib/format";
import type { ManagedUser, Role, Settings as SettingsT } from "@/lib/types";

function BusinessProfile({ readOnly }: { readOnly: boolean }) {
  const { data, isLoading } = useSettings();
  const save = useSaveSettings();
  const [form, setForm] = useState<SettingsT | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) return <Skeleton className="h-96 rounded-xl" />;
  const set = <K extends keyof SettingsT>(k: K, v: SettingsT[K]) => setForm({ ...form, [k]: v });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      businessName: form.businessName,
      email: form.email,
      phone: form.phone,
      address: form.address,
      currency: form.currency,
      taxRate: Number(form.taxRate),
    });
  };

  return (
    <Card className="shadow-medium">
      <CardHeader>
        <CardTitle>Business profile</CardTitle>
        <CardDescription>Shown on printed invoices.{readOnly && " Only admins can change these."}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <fieldset disabled={readOnly} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="business-name">Business name</Label>
              <Input id="business-name" required value={form.businessName} onChange={(e) => set("businessName", e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="biz-email">Email</Label>
                <Input id="biz-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="biz-phone">Phone</Label>
                <Input id="biz-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="biz-address">Address</Label>
              <Input id="biz-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" value={form.currency} onChange={(e) => set("currency", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax">VAT rate (%) — included in prices</Label>
                <Input
                  id="tax"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.taxRate}
                  onChange={(e) => set("taxRate", e.target.value as unknown as number)}
                />
              </div>
            </div>
          </fieldset>
          {!readOnly && (
            <Button type="submit" disabled={save.isPending} className="bg-gradient-primary hover:bg-primary-dark">
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

const ALERTS: { key: "lowStockAlerts" | "largeTransactionReview"; label: string; hint: string }[] = [
  { key: "lowStockAlerts", label: "Low stock alerts", hint: "Show products at or below their reorder level in the header bell" },
  { key: "largeTransactionReview", label: "Large transaction review", hint: "Flag sales at or above a threshold in the sales list" },
];

function AlertSettings({ readOnly }: { readOnly: boolean }) {
  const { data } = useSettings();
  const save = useSaveSettings();
  const [threshold, setThreshold] = useState("");
  useEffect(() => {
    if (data) setThreshold(String(data.largeTransactionThreshold));
  }, [data]);
  if (!data) return <Skeleton className="h-72 rounded-xl" />;

  return (
    <Card className="shadow-medium">
      <CardHeader>
        <CardTitle>Alerts and automation</CardTitle>
        <CardDescription>Operational preferences for this branch.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ALERTS.map((a) => (
          <div key={a.key} className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3">
            <div>
              <p className="font-medium">{a.label}</p>
              <p className="text-sm text-muted-foreground">{a.hint}</p>
            </div>
            <Switch
              checked={data[a.key]}
              disabled={readOnly || save.isPending}
              onCheckedChange={(v) => save.mutate({ [a.key]: v })}
              aria-label={a.label}
            />
          </div>
        ))}
        {data.largeTransactionReview && (
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="threshold">Large transaction threshold (KSh)</Label>
              <Input
                id="threshold"
                type="number"
                min="0"
                disabled={readOnly}
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
              />
            </div>
            {!readOnly && (
              <Button variant="outline" onClick={() => save.mutate({ largeTransactionThreshold: Number(threshold) || 0 })}>
                Save
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function UserDialog({ user, open, onOpenChange }: { user: ManagedUser | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("cashier");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (open) {
      setName(user?.name ?? "");
      setEmail(user?.email ?? "");
      setRole(user?.role ?? "cashier");
      setPassword("");
    }
  }, [open, user]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      { id: user?.id, name, email, role, ...(password ? { password } : {}) },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{user ? "Edit staff account" : "Add staff account"}</DialogTitle>
          <DialogDescription>Cashiers can record sales and manage customers. Admins can do everything.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="u-name">Name</Label>
            <Input id="u-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-email">Email</Label>
            <Input id="u-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cashier">Cashier</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="u-pass">{user ? "New password (leave blank to keep)" : "Password"}</Label>
            <Input
              id="u-pass"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required={!user}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {user ? "Save" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserManagement() {
  const { user: me } = useAuth();
  const { data: users = [], isLoading } = useUsers();
  const save = useSaveUser();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Card className="shadow-medium xl:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Staff accounts</CardTitle>
          <CardDescription>Who can sign in, and what they can do.</CardDescription>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add user
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[60px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            )}
            {users.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">
                  {u.name}
                  {u.id === me?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>
                  <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell>{formatDate(u.createdAt)}</TableCell>
                <TableCell>
                  <Switch
                    checked={u.active}
                    disabled={u.id === me?.id || save.isPending}
                    onCheckedChange={(active) => save.mutate({ id: u.id, active })}
                    aria-label={`${u.active ? "Deactivate" : "Activate"} ${u.name}`}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setEditing(u);
                      setOpen(true);
                    }}
                    aria-label={`Edit ${u.name}`}
                  >
                    <UserCog className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <UserDialog user={editing} open={open} onOpenChange={setOpen} />
    </Card>
  );
}

function ChangePassword() {
  const change = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && next !== confirm;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mismatch) return;
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          setCurrent("");
          setNext("");
          setConfirm("");
        },
      },
    );
  };

  return (
    <Card className="shadow-medium">
      <CardHeader>
        <CardTitle>Your password</CardTitle>
        <CardDescription>Change the password you use to sign in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pw-current">Current password</Label>
            <Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pw-new">New password</Label>
              <Input id="pw-new" type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw-confirm">Confirm</Label>
              <Input id="pw-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          {mismatch && <p className="text-sm text-destructive">Passwords don't match.</p>}
          <Button type="submit" variant="outline" disabled={change.isPending || mismatch}>
            {change.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Update password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

const Settings = () => {
  const { isAdmin } = useAuth();
  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader title="Settings" description="Manage business identity, operational defaults, staff accounts, and your password." />
        <div className="grid gap-6 xl:grid-cols-2">
          <BusinessProfile readOnly={!isAdmin} />
          <div className="space-y-6">
            <AlertSettings readOnly={!isAdmin} />
            <ChangePassword />
          </div>
          {isAdmin && <UserManagement />}
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
