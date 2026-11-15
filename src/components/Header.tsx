import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu, Package, Receipt, Search, Settings, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useDashboard, useSearch } from "@/hooks/api";
import { initials } from "@/lib/format";
import { mobileNavigation } from "./Sidebar";

function GlobalSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const { data } = useSearch(debounced);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const go = (path: string) => {
    setOpen(false);
    setQ("");
    navigate(path);
  };

  const empty = data && !data.products.length && !data.customers.length && !data.sales.length;

  return (
    <Popover open={open && debounced.length >= 2} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative hidden lg:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products, customers, invoices..."
            className="w-72 pl-10"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        {empty && <p className="p-3 text-sm text-muted-foreground">No matches for “{debounced}”.</p>}
        {data?.products.map((p) => (
          <button
            key={`p${p.id}`}
            onClick={() => go(`/app/products?search=${encodeURIComponent(p.sku)}`)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate">{p.name}</span>
            <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
          </button>
        ))}
        {data?.customers.map((c) => (
          <button
            key={`c${c.id}`}
            onClick={() => go(`/app/customers?view=${c.id}`)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate">{c.name}</span>
            <span className="truncate text-xs text-muted-foreground">{c.phone}</span>
          </button>
        ))}
        {data?.sales.map((s) => (
          <button
            key={`s${s.id}`}
            onClick={() => go(`/app/sales?view=${s.id}`)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
          >
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono">{s.invoiceNo}</span>
            <span className="flex-1 truncate text-right text-xs text-muted-foreground">{s.customerName}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Alerts() {
  const { data } = useDashboard();
  const count = (data?.lowStockCount ?? 0) + (data?.outOfStockCount ?? 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="Stock alerts">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {count}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Stock alerts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {count === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">All products are above their reorder level.</p>}
        {data?.lowStock.map((p) => (
          <DropdownMenuItem key={p.id} asChild>
            <Link to={`/app/products?search=${encodeURIComponent(p.sku)}`} className="flex justify-between">
              <span className="truncate">{p.name}</span>
              <span className={p.stock === 0 ? "text-destructive" : "text-warning"}>
                {p.stock === 0 ? "Out" : `${p.stock} left`}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, logout } = useAuth();
  const sectionTitle =
    location.pathname === "/app" ? "Operations Dashboard" : location.pathname.replace("/app/", "").replace("-", " ");

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-card/90 px-4 py-3 backdrop-blur md:px-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {mobileNavigation
                .filter((n) => !n.adminOnly || isAdmin)
                .map((n) => (
                  <DropdownMenuItem key={n.href} asChild>
                    <Link to={n.href}>
                      <n.icon className="mr-2 h-4 w-4" />
                      {n.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div>
            <Link to="/app" className="bg-gradient-primary bg-clip-text text-2xl font-bold text-transparent">
              StockFlow
            </Link>
            <p className="text-sm capitalize text-muted-foreground">{sectionTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <GlobalSearch />
          <Alerts />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full" aria-label="Account menu">
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials(user?.name ?? "?")}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60" align="end">
              <DropdownMenuLabel className="font-normal">
                <p className="font-medium">{user?.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                <Badge variant="secondary" className="mt-2 capitalize">
                  {user?.role}
                </Badge>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/app/settings")}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
