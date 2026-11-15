import { format, formatDistanceToNow, parseISO } from "date-fns";

const whole = new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-KE", { notation: "compact", maximumSignificantDigits: 3 });

/** Whole shillings when exact, otherwise always two decimals (never "1,234.5"). */
export const ksh = (n: number) => `KSh ${Number.isInteger(Math.round(n * 100) / 100) ? whole.format(n) : cents.format(n)}`;
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

export const PO_STATUS_LABEL = {
  draft: "Draft",
  ordered: "Ordered",
  partially_received: "Partly received",
  received: "Received",
  cancelled: "Cancelled",
} as const;
