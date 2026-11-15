import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format, parseISO } from "date-fns";
import { ksh, kshCompact } from "@/lib/format";
import type { DayPoint } from "@/lib/types";

const PRIMARY = "hsl(var(--primary))";
const GRID = "hsl(var(--border))";
const AXIS = { fontSize: 12, fill: "hsl(var(--muted-foreground))" };

function ChartTooltip({ active, payload, label, labelFormat }: {
  active?: boolean;
  payload?: { payload: DayPoint & { name?: string; orders?: number; units?: number } }[];
  label?: string;
  labelFormat?: (l: string) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md">
      <p className="font-medium">{labelFormat && label ? labelFormat(label) : label}</p>
      <p>{ksh(p.revenue)}</p>
      {p.orders !== undefined && <p className="text-muted-foreground">{p.orders} orders</p>}
      {p.units !== undefined && <p className="text-muted-foreground">{p.units} units</p>}
    </div>
  );
}

/** Daily revenue as bars (short ranges) - single series, so it uses the primary hue and needs no legend. */
export function DailyRevenueBars({ data, height = 260 }: { data: DayPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickFormatter={(d) => format(parseISO(d), "EEE")} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis tickFormatter={(v) => kshCompact(v).replace("KSh ", "")} tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }}
          content={<ChartTooltip labelFormat={(d) => format(parseISO(d), "EEEE d MMM")} />}
        />
        <Bar dataKey="revenue" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={44} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Daily revenue trend for longer ranges. */
export function DailyRevenueArea({ data, height = 280 }: { data: DayPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.22} />
            <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis
          dataKey="date"
          tickFormatter={(d) => format(parseISO(d), "d MMM")}
          tick={AXIS}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis tickFormatter={(v) => kshCompact(v).replace("KSh ", "")} tick={AXIS} axisLine={false} tickLine={false} width={44} />
        <Tooltip
          cursor={{ stroke: GRID, strokeWidth: 1 }}
          content={<ChartTooltip labelFormat={(d) => format(parseISO(d), "EEEE d MMM yyyy")} />}
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={PRIMARY}
          strokeWidth={2}
          fill="url(#revFill)"
          activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Horizontal magnitude bars for a ranked breakdown (categories, payment methods). */
export function RankedBars({
  data,
  height,
}: {
  data: { name: string; revenue: number; units?: number; orders?: number }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid horizontal={false} stroke={GRID} strokeDasharray="3 3" />
        <XAxis type="number" tickFormatter={(v) => kshCompact(v).replace("KSh ", "")} tick={AXIS} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={AXIS} axisLine={false} tickLine={false} width={110} />
        <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.6 }} content={<ChartTooltip />} />
        <Bar dataKey="revenue" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
