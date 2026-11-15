import { useState } from "react";
import { endOfMonth, startOfMonth, startOfYear, subDays, subMonths } from "date-fns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ymd } from "@/lib/format";

const PRESETS: Record<string, { label: string; range: () => [Date, Date] }> = {
  "7d": { label: "Last 7 days", range: () => [subDays(new Date(), 6), new Date()] },
  "30d": { label: "Last 30 days", range: () => [subDays(new Date(), 29), new Date()] },
  "90d": { label: "Last 90 days", range: () => [subDays(new Date(), 89), new Date()] },
  month: { label: "This month", range: () => [startOfMonth(new Date()), new Date()] },
  lastMonth: {
    label: "Last month",
    range: () => [startOfMonth(subMonths(new Date(), 1)), endOfMonth(subMonths(new Date(), 1))],
  },
  ytd: { label: "Year to date", range: () => [startOfYear(new Date()), new Date()] },
};

export type PresetKey = keyof typeof PRESETS | "custom";

export function useDateRange(initial: Exclude<PresetKey, "custom"> = "30d") {
  const [preset, setPreset] = useState<string>(initial);
  const [from, setFrom] = useState(() => ymd(PRESETS[initial].range()[0]));
  const [to, setTo] = useState(() => ymd(PRESETS[initial].range()[1]));

  const applyPreset = (key: string) => {
    setPreset(key);
    const p = PRESETS[key];
    if (p) {
      const [f, t] = p.range();
      setFrom(ymd(f));
      setTo(ymd(t));
    }
  };

  return {
    preset,
    from,
    to,
    applyPreset,
    setFrom: (v: string) => {
      setFrom(v);
      setPreset("custom");
    },
    setTo: (v: string) => {
      setTo(v);
      setPreset("custom");
    },
  };
}

export function DateRangePicker({ range }: { range: ReturnType<typeof useDateRange> }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={range.preset} onValueChange={range.applyPreset}>
        <SelectTrigger className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {Object.entries(PRESETS).map(([key, p]) => (
            <SelectItem key={key} value={key}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom range</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        className="w-40"
        value={range.from}
        max={range.to}
        aria-label="From date"
        onChange={(e) => e.target.value && range.setFrom(e.target.value)}
      />
      <span className="text-muted-foreground">to</span>
      <Input
        type="date"
        className="w-40"
        value={range.to}
        min={range.from}
        aria-label="To date"
        onChange={(e) => e.target.value && range.setTo(e.target.value)}
      />
    </div>
  );
}
