import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { SALE_STATUS_LABEL, STOCK_STATUS_LABEL } from "@/lib/format";
import type { SaleStatus, StockStatus } from "@/lib/types";

export const PageHeader = ({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) => (
  <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
    <div>
      <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
    </div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);

export const MetricCard = ({
  label,
  value,
  icon,
  tone = "primary",
  hint,
  loading,
}: {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  tone?: "primary" | "accent" | "warning" | "destructive";
  hint?: ReactNode;
  loading?: boolean;
}) => (
  <Card className="shadow-soft">
    <CardContent className="p-5">
      <div className="flex items-center gap-4">
        <div
          className={cn(
            "rounded-xl p-2.5",
            tone === "primary" && "bg-primary/10 text-primary",
            tone === "accent" && "bg-accent/10 text-accent",
            tone === "warning" && "bg-warning/10 text-warning",
            tone === "destructive" && "bg-destructive/10 text-destructive",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {loading ? <Skeleton className="mt-1 h-7 w-20" /> : <p className="truncate text-2xl font-bold">{value}</p>}
        </div>
      </div>
      {hint && <div className="mt-3 text-xs text-muted-foreground">{hint}</div>}
    </CardContent>
  </Card>
);

export const StockBadge = ({ status }: { status: StockStatus }) => (
  <Badge
    variant="outline"
    className={cn(
      "whitespace-nowrap border-transparent",
      status === "in_stock" && "bg-accent/10 text-accent",
      status === "low_stock" && "bg-warning/15 text-warning",
      status === "out_of_stock" && "bg-destructive/10 text-destructive",
    )}
  >
    {STOCK_STATUS_LABEL[status]}
  </Badge>
);

export const SaleStatusBadge = ({ status }: { status: SaleStatus }) => (
  <Badge
    variant="outline"
    className={cn(
      "border-transparent",
      status === "paid" && "bg-accent/10 text-accent",
      status === "pending" && "bg-warning/15 text-warning",
      status === "cancelled" && "bg-muted text-muted-foreground line-through",
    )}
  >
    {SALE_STATUS_LABEL[status]}
  </Badge>
);

export const TableLoading = ({ cols, rows = 5 }: { cols: number; rows?: number }) => (
  <>
    {Array.from({ length: rows }, (_, i) => (
      <TableRow key={i}>
        {Array.from({ length: cols }, (_, j) => (
          <TableCell key={j}>
            <Skeleton className="h-5 w-full" />
          </TableCell>
        ))}
      </TableRow>
    ))}
  </>
);

export const TableMessage = ({ cols, children }: { cols: number; children: ReactNode }) => (
  <TableRow>
    <TableCell colSpan={cols} className="py-10 text-center text-muted-foreground">
      {children}
    </TableCell>
  </TableRow>
);

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const FieldError = ({ message }: { message?: string }) =>
  message ? <p className="text-sm text-destructive">{message}</p> : null;
