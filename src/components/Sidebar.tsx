import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BarChart3, Package, Users, ShoppingCart, FileText, Settings, ChevronDown, Truck, ClipboardList, Banknote, Vault, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

const navigation = [
  { name: "Dashboard", href: "/app", icon: BarChart3 },
  { name: "Products", href: "/app/products", icon: Package },
  { name: "Customers", href: "/app/customers", icon: Users },
  { name: "Sales", href: "/app/sales", icon: ShoppingCart },
  { name: "Till", href: "/app/till", icon: Vault },
  { name: "Purchasing", href: "/app/purchase-orders", icon: ClipboardList, adminOnly: true },
  { name: "Suppliers", href: "/app/suppliers", icon: Truck, adminOnly: true },
  { name: "Expenses", href: "/app/expenses", icon: Banknote, adminOnly: true },
  { name: "Reports", href: "/app/reports", icon: FileText, adminOnly: true },
  { name: "Activity log", href: "/app/activity", icon: History, adminOnly: true },
  { name: "Settings", href: "/app/settings", icon: Settings },
];

export const Sidebar = () => {
  const location = useLocation();
  const { isAdmin } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className={cn(
        "sticky top-[73px] hidden h-[calc(100vh-73px)] shrink-0 border-r border-sidebar-border bg-sidebar/90 backdrop-blur transition-all duration-300 md:block",
        collapsed ? "w-16" : "w-64",
      )}
    >
      <div className="p-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="w-full justify-end"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", collapsed ? "rotate-90" : "-rotate-90")} />
        </Button>
      </div>

      <nav className="space-y-2 px-4">
        {navigation
          .filter((item) => !item.adminOnly || isAdmin)
          .map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                title={collapsed ? item.name : undefined}
                className={cn(
                  "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span className="ml-3">{item.name}</span>}
              </Link>
            );
          })}
      </nav>
    </div>
  );
};

export const mobileNavigation = navigation;
