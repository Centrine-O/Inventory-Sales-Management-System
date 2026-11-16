import { symbolModules, type BarcodeSymbol } from "@/lib/barcode";

/** Physical label layouts, in millimetres. Sheet layouts match common A4 label stock. */
export interface LabelTemplate {
  id: string;
  name: string;
  kind: "sheet" | "roll";
  pageW: number;
  pageH: number;
  cols: number;
  rows: number;
  labelW: number;
  labelH: number;
  marginTop: number;
  marginLeft: number;
  gapX: number;
  gapY: number;
}

const sheet = (id: string, name: string, cols: number, rows: number, labelW: number, labelH: number, marginTop: number, marginLeft: number, gapX = 0, gapY = 0): LabelTemplate => ({
  id,
  name,
  kind: "sheet",
  pageW: 210,
  pageH: 297,
  cols,
  rows,
  labelW,
  labelH,
  marginTop,
  marginLeft,
  gapX,
  gapY,
});
const roll = (id: string, name: string, w: number, h: number): LabelTemplate => ({
  id,
  name,
  kind: "roll",
  pageW: w,
  pageH: h,
  cols: 1,
  rows: 1,
  labelW: w,
  labelH: h,
  marginTop: 0,
  marginLeft: 0,
  gapX: 0,
  gapY: 0,
});

export const LABEL_TEMPLATES: LabelTemplate[] = [
  sheet("a4-24", "A4 sheet · 24 labels (70 × 37 mm)", 3, 8, 70, 37, 0.5, 0),
  sheet("a4-21", "A4 sheet · 21 labels (63.5 × 38.1 mm, L7160)", 3, 7, 63.5, 38.1, 15.15, 7.25, 2.5),
  sheet("a4-40", "A4 sheet · 40 labels (45.7 × 25.4 mm, L7654)", 4, 10, 45.7, 25.4, 21.5, 9.7, 2.6),
  roll("roll-50x25", "Thermal roll · 50 × 25 mm", 50, 25),
  roll("roll-40x30", "Thermal roll · 40 × 30 mm", 40, 30),
  roll("roll-58x40", "Thermal roll · 58 × 40 mm", 58, 40),
];

export const perPage = (t: LabelTemplate) => t.cols * t.rows;

export interface LabelFields {
  business: boolean;
  name: boolean;
  price: boolean;
  sku: boolean;
}

/** Narrowest bar we'll print. Below this, cheap thermal printers and phone cameras struggle to read it. */
export const MIN_MODULE_MM = 0.19;
export const PAD = 1.5;

/** Quiet zones in modules: EAN-13 needs 11 on the left and 7 on the right; Code 128 needs 10 each side. */
export const quiet = (s: BarcodeSymbol) => (s.format === "EAN-13" ? [11, 7] : [10, 10]);

/** Module width that fits the label, capped at a comfortable 0.33 mm (EAN-13's nominal size). */
export function moduleWidth(symbol: BarcodeSymbol, labelW: number) {
  const [l, r] = quiet(symbol);
  return Math.min(0.33, (labelW - 2 * PAD) / (symbolModules(symbol) + l + r));
}
