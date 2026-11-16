import type { CSSProperties } from "react";
import { productSymbol, symbolModules, type BarcodeSymbol } from "@/lib/barcode";
import { PAD, moduleWidth, perPage, quiet, type LabelFields, type LabelTemplate } from "./templates";
import { ksh } from "@/lib/format";
import type { Product } from "@/lib/types";

export function Barcode({ symbol, x, heightMm }: { symbol: BarcodeSymbol; x: number; heightMm: number }) {
  const [l, r] = quiet(symbol);
  const total = symbolModules(symbol) + l + r;
  const rects: JSX.Element[] = [];
  let pos = l;
  symbol.widths.forEach((w, i) => {
    if (i % 2 === 0) rects.push(<rect key={i} x={pos} y={0} width={w} height={1} />);
    pos += w;
  });
  return (
    <svg
      width={`${total * x}mm`}
      height={`${heightMm}mm`}
      viewBox={`0 0 ${total} 1`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`${symbol.format} barcode ${symbol.text}`}
      style={{ display: "block" }}
    >
      <rect width={total} height={1} fill="#fff" />
      <g fill="#000">{rects}</g>
    </svg>
  );
}

/** One label. All sizes are in mm so it prints at true size. */
export function LabelCard({ product, template, fields, business }: { product: Product; template: LabelTemplate; fields: LabelFields; business: string }) {
  const { labelW: w, labelH: h } = template;
  const symbol = productSymbol(product);
  const x = moduleWidth(symbol, w);
  const small = h < 28;
  const nameSize = small ? 2.4 : 2.9;
  const priceSize = small ? 3.4 : 4.4;
  const textSize = small ? 1.9 : 2.2;
  // Height left for the bars once the text lines are laid out.
  const used =
    2 * PAD +
    (fields.business ? 2.4 : 0) +
    (fields.name ? nameSize * 1.15 * (small ? 1 : 2) : 0) +
    (fields.price ? priceSize * 1.2 : 0) +
    textSize * 1.3 +
    0.6;
  const barH = Math.max(5, Math.min(h * 0.5, h - used));
  const style: CSSProperties = {
    width: `${w}mm`,
    height: `${h}mm`,
    padding: `${PAD}mm`,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "space-between",
    overflow: "hidden",
    color: "#000",
    background: "#fff",
    fontFamily: "Inter, Arial, sans-serif",
    textAlign: "center",
    lineHeight: 1.15,
  };
  return (
    <div style={style} data-label>
      <div style={{ width: "100%" }}>
        {fields.business && business && (
          <div style={{ fontSize: "1.8mm", textTransform: "uppercase", letterSpacing: "0.2mm", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {business}
          </div>
        )}
        {fields.name && (
          <div
            style={{
              fontSize: `${nameSize}mm`,
              fontWeight: 600,
              display: "-webkit-box",
              WebkitLineClamp: small ? 1 : 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {product.name}
          </div>
        )}
        {fields.price && <div style={{ fontSize: `${priceSize}mm`, fontWeight: 800, lineHeight: 1.2 }}>{ksh(product.price)}</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Barcode symbol={symbol} x={x} heightMm={barH} />
        <div style={{ fontSize: `${textSize}mm`, fontFamily: "ui-monospace, Menlo, Consolas, monospace", letterSpacing: "0.3mm", marginTop: "0.4mm" }}>
          {symbol.text}
          {fields.sku && symbol.text !== product.sku && <span style={{ fontFamily: "Inter, Arial, sans-serif", letterSpacing: 0 }}> · {product.sku}</span>}
        </div>
      </div>
    </div>
  );
}

/** Pages of labels at true size. `slots` holds a product per label position, or null for a skipped position. */
export function LabelPages({
  slots,
  template,
  fields,
  business,
  outline,
}: {
  slots: (Product | null)[];
  template: LabelTemplate;
  fields: LabelFields;
  business: string;
  outline?: boolean;
}) {
  const n = perPage(template);
  const pages: (Product | null)[][] = [];
  for (let i = 0; i < slots.length; i += n) pages.push(slots.slice(i, i + n));
  return (
    <>
      {pages.map((page, p) => (
        <div
          key={p}
          className="label-page"
          style={{ position: "relative", width: `${template.pageW}mm`, height: `${template.pageH}mm`, background: "#fff", overflow: "hidden" }}
        >
          {page.map((product, i) => {
            const col = i % template.cols;
            const row = Math.floor(i / template.cols);
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: `${template.marginLeft + col * (template.labelW + template.gapX)}mm`,
                  top: `${template.marginTop + row * (template.labelH + template.gapY)}mm`,
                  width: `${template.labelW}mm`,
                  height: `${template.labelH}mm`,
                  outline: outline && template.kind === "sheet" ? "1px dashed #cbd5e1" : undefined,
                  outlineOffset: "-1px",
                }}
              >
                {product && <LabelCard product={product} template={template} fields={fields} business={business} />}
              </div>
            );
          })}
          {/* On screen, show the empty positions still left on a sheet. */}
          {outline &&
            template.kind === "sheet" &&
            Array.from({ length: n - page.length }, (_, k) => {
              const i = page.length + k;
              return (
                <div
                  key={`empty${i}`}
                  style={{
                    position: "absolute",
                    left: `${template.marginLeft + (i % template.cols) * (template.labelW + template.gapX)}mm`,
                    top: `${template.marginTop + Math.floor(i / template.cols) * (template.labelH + template.gapY)}mm`,
                    width: `${template.labelW}mm`,
                    height: `${template.labelH}mm`,
                    outline: "1px dashed #e2e8f0",
                    outlineOffset: "-1px",
                  }}
                />
              );
            })}
        </div>
      ))}
    </>
  );
}
