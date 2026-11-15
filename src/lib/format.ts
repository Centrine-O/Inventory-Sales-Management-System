import { format, formatDistanceToNow, parseISO } from "date-fns";

const money = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-KE", { notation: "compact", maximumFractionDigits: 2 });

export const ksh = (n: number) => `KSh ${money.format(n)}`;
export const kshExact = (n: number) =>
  `KSh ${n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const kshCompact = (n: number) => `KSh ${compact.format(n)}`;

export const formatDate = (iso: string) => format(parseISO(iso), "d MMM yyyy");
export const formatDateTime = (iso: string) => format(parseISO(iso), "d MMM yyyy, HH:mm");
export const timeAgo = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true });

export const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? null : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

/** Local date as YYYY-MM-DD. */
export const ymd = (d: Date) => format(d, "yyyy-MM-dd");

export const STOCK_STATUS_LABEL = {
  in_stock: "In stock",
  low_stock: "Low stock",
  out_of_stock: "Out of stock",
} as const;

export const SALE_STATUS_LABEL = { paid: "Paid", pending: "Pending", cancelled: "Cancelled" } as const;
