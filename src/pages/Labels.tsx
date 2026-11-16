import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Barcode as BarcodeIcon, Boxes, ChevronsUpDown, Loader2, PackagePlus, Printer, Trash2, TriangleAlert } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, TableMessage } from "@/components/common";
import { LabelPages } from "@/components/labels/LabelSheet";
import { LABEL_TEMPLATES, MIN_MODULE_MM, moduleWidth, perPage, type LabelFields } from "@/components/labels/templates";
import { useAuth } from "@/contexts/AuthContext";
import { useAssignBarcodes, useProducts, useSettings } from "@/hooks/api";
import { productSymbol } from "@/lib/barcode";
import type { Product } from "@/lib/types";

const PREFS_KEY = "stockflow.labels";
const MAX_LABELS = 2000;

interface Prefs {
  template: string;
  fields: LabelFields;
}
const DEFAULT_PREFS: Prefs = { template: "a4-24", fields: { business: false, name: true, price: true, sku: false } };

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (saved && LABEL_TEMPLATES.some((t) => t.id === saved.template)) return { ...DEFAULT_PREFS, ...saved, fields: { ...DEFAULT_PREFS.fields, ...saved.fields } };
  } catch {
    // Storage unavailable: use defaults.
  }
  return DEFAULT_PREFS;
}

/** `?items=12:5,14:3` → [{productId: 12, qty: 5}, …] */
function parseItems(raw: string | null) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.split(":").map(Number))
    .filter(([id, qty]) => Number.isInteger(id) && id > 0)
    .map(([id, qty]) => ({ productId: id, qty: Number.isInteger(qty) && qty > 0 ? Math.min(qty, 500) : 1 }));
}

function AddProduct({ products, onAdd, exclude }: { products: Product[]; onAdd: (p: Product) => void; exclude: Set<number> }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between sm:w-72" role="combobox" aria-expanded={open}>
          Add a product…
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search by name, SKU or barcode…" />
          <CommandList>
            <CommandEmpty>No products found.</CommandEmpty>
            <CommandGroup>
              {products
                .filter((p) => !exclude.has(p.id))
                .map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.sku} ${p.barcode ?? ""}`}
                    onSelect={() => {
                      onAdd(p);
                      setOpen(false);
                    }}
                  >
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const Labels = () => {
  const { isAdmin } = useAuth();
  const [params] = useSearchParams();
  const { data: products = [], isLoading } = useProducts();
  const { data: settings } = useSettings();
  const assign = useAssignBarcodes();
  const [items, setItems] = useState(() => parseItems(params.get("items")));
  const [prefs, setPrefs] = useState(loadPrefs);
  const [startAt, setStartAt] = useState(1);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Not saved; preferences just won't persist.
    }
  }, [prefs]);

  const template = LABEL_TEMPLATES.find((t) => t.id === prefs.template) ?? LABEL_TEMPLATES[0];
  const capacity = perPage(template);
  const start = template.kind === "sheet" ? Math.min(Math.max(1, startAt), capacity) : 1;
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const rows = items.map((it) => ({ ...it, product: byId.get(it.productId) })).filter((r) => r.product) as {
    productId: number;
    qty: number;
    product: Product;
  }[];
  const total = rows.reduce((s, r) => s + r.qty, 0);
  const slots: (Product | null)[] = Array.from({ length: start - 1 }, () => null);
  for (const r of rows) for (let i = 0; i < r.qty; i++) slots.push(r.product);
  const pages = Math.ceil(slots.length / capacity);
  const withoutBarcode = rows.filter((r) => !r.product.barcode);
  const tooDense = rows.filter((r) => moduleWidth(productSymbol(r.product), template.labelW) < MIN_MODULE_MM);

  const setQty = (id: number, qty: number) => setItems((xs) => xs.map((x) => (x.productId === id ? { ...x, qty } : x)));
  const add = (p: Product, qty = 1) =>
    setItems((xs) => (xs.some((x) => x.productId === p.id) ? xs : [...xs, { productId: p.id, qty }]));

  // Print: render the labels outside the app, set the page size for the label stock, then open the print dialog.
  useEffect(() => {
    if (!printing) return;
    const html = document.documentElement;
    const style = document.createElement("style");
    style.textContent = `@page { size: ${template.pageW}mm ${template.pageH}mm; margin: 0; }`;
    document.head.appendChild(style);
    html.classList.add("printing-labels");
    const done = () => setPrinting(false);
    window.addEventListener("afterprint", done);
    const frame = requestAnimationFrame(() => window.print());
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", done);
      style.remove();
      html.classList.remove("printing-labels");
    };
  }, [printing, template]);

  const scale = Math.min(1.8, 340 / (template.pageW * 3.7795));
  const previewPages = Math.min(pages, 3);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          title="Print labels"
          description="Price and barcode labels for shelves and products, on A4 label sheets or a thermal label printer."
          actions={
            <Button className="bg-gradient-primary hover:bg-primary-dark" disabled={total === 0 || total > MAX_LABELS} onClick={() => setPrinting(true)}>
              <Printer className="mr-2 h-4 w-4" />
              Print {total > 0 ? `${total} label${total === 1 ? "" : "s"}` : "labels"}
            </Button>
          }
        />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-6">
            <Card className="shadow-medium">
              <CardHeader className="space-y-4">
                <div>
                  <CardTitle>Products</CardTitle>
                  <CardDescription>Choose what to label and how many of each.</CardDescription>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <AddProduct products={products} onAdd={(p) => add(p)} exclude={new Set(items.map((i) => i.productId))} />
                  <Button variant="outline" onClick={() => products.forEach((p) => add(p))} disabled={!products.length}>
                    <PackagePlus className="mr-2 h-4 w-4" />
                    Add all products
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!rows.length}
                    onClick={() => setItems((xs) => xs.map((x) => ({ ...x, qty: Math.max(1, byId.get(x.productId)?.stock ?? 1) })))}
                  >
                    <Boxes className="mr-2 h-4 w-4" />
                    One per item in stock
                  </Button>
                  {rows.length > 0 && (
                    <Button variant="ghost" className="text-muted-foreground" onClick={() => setItems([])}>
                      Clear
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {withoutBarcode.length > 0 && (
                  <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p>
                      <strong>{withoutBarcode.length}</strong> product{withoutBarcode.length === 1 ? " has" : "s have"} no barcode, so the label
                      encodes the SKU instead. That scans at checkout too.
                    </p>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 bg-card"
                        disabled={assign.isPending}
                        onClick={() => assign.mutate(withoutBarcode.map((r) => r.productId))}
                      >
                        {assign.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarcodeIcon className="mr-2 h-4 w-4" />}
                        Assign in-store barcodes
                      </Button>
                    )}
                  </div>
                )}
                {tooDense.length > 0 && (
                  <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <p>
                      The code for {tooDense.map((r) => r.product.name).join(", ")} is too long to print clearly on {template.labelW} mm labels.
                      Use wider labels{isAdmin && withoutBarcode.some((r) => tooDense.includes(r)) ? " or assign in-store barcodes" : ""}.
                    </p>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Code on label</TableHead>
                        <TableHead className="w-28">Labels</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!isLoading && rows.length === 0 && <TableMessage cols={4}>Add products to start. Each label shows the price and a scannable barcode.</TableMessage>}
                      {rows.map(({ product: p, qty }) => {
                        const symbol = productSymbol(p);
                        return (
                          <TableRow key={p.id}>
                            <TableCell>
                              <p className="font-medium">{p.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {p.sku} · {p.stock} in stock
                              </p>
                            </TableCell>
                            <TableCell>
                              <p className="font-mono text-sm">{symbol.text}</p>
                              <Badge
                                variant="outline"
                                className={p.barcode ? "border-transparent bg-accent/10 text-accent" : "border-transparent bg-warning/15 text-warning"}
                              >
                                {p.barcode ? symbol.format : "SKU · Code 128"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                max={500}
                                value={qty}
                                onChange={(e) => setQty(p.id, Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
                                className="h-9"
                                aria-label={`Number of labels for ${p.name}`}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove ${p.name}`}
                                onClick={() => setItems((xs) => xs.filter((x) => x.productId !== p.id))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {total > MAX_LABELS && <p className="text-sm text-destructive">That's more than {MAX_LABELS.toLocaleString()} labels; print in smaller batches.</p>}
              </CardContent>
            </Card>

            <Card className="shadow-medium">
              <CardHeader>
                <CardTitle>Label stock and layout</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="label-template">Labels</Label>
                  <Select value={template.id} onValueChange={(v) => setPrefs((p) => ({ ...p, template: v }))}>
                    <SelectTrigger id="label-template">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LABEL_TEMPLATES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {template.kind === "sheet"
                      ? "Print at 100% scale (\"Actual size\"), not \"Fit to page\"."
                      : "Choose your label printer and set its paper size to the label size."}
                  </p>
                </div>
                {template.kind === "sheet" && (
                  <div className="space-y-2">
                    <Label htmlFor="label-start">Start at position</Label>
                    <Input
                      id="label-start"
                      type="number"
                      min={1}
                      max={capacity}
                      value={startAt}
                      onChange={(e) => setStartAt(Math.min(capacity, Math.max(1, Number(e.target.value) || 1)))}
                    />
                    <p className="text-xs text-muted-foreground">Reuse a part-used sheet: positions run left to right, top to bottom.</p>
                  </div>
                )}
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Show on label</legend>
                  {(
                    [
                      ["name", "Product name"],
                      ["price", "Price"],
                      ["sku", "SKU (when the barcode is different)"],
                      ["business", "Business name"],
                    ] as const
                  ).map(([key, text]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={`field-${key}`}
                        checked={prefs.fields[key]}
                        onCheckedChange={(c) => setPrefs((p) => ({ ...p, fields: { ...p.fields, [key]: c === true } }))}
                      />
                      <Label htmlFor={`field-${key}`} className="cursor-pointer font-normal">
                        {text}
                      </Label>
                    </div>
                  ))}
                </fieldset>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-medium xl:sticky xl:top-24 xl:self-start">
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {total === 0
                  ? "Nothing to print yet."
                  : template.kind === "sheet"
                    ? `${total} label${total === 1 ? "" : "s"} on ${pages} sheet${pages === 1 ? "" : "s"}`
                    : `${total} label${total === 1 ? "" : "s"} on the roll`}
                {pages > previewPages && ` · showing the first ${previewPages} ${template.kind === "sheet" ? "sheets" : "labels"}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center gap-4 rounded-lg bg-muted/50 p-4" data-testid="label-preview">
                {total === 0 ? (
                  <p className="py-16 text-sm text-muted-foreground">Labels appear here.</p>
                ) : (
                  Array.from({ length: previewPages }, (_, i) => (
                    <div
                      key={`${template.id}-${i}`}
                      className="shadow-soft"
                      style={{ width: `${template.pageW * 3.7795 * scale}px`, height: `${template.pageH * 3.7795 * scale}px` }}
                    >
                      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
                        <LabelPages
                          slots={slots.slice(i * capacity, (i + 1) * capacity)}
                          template={template}
                          fields={prefs.fields}
                          business={settings?.businessName ?? ""}
                          outline
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {printing &&
        createPortal(
          <div id="label-print-root">
            <LabelPages slots={slots} template={template} fields={prefs.fields} business={settings?.businessName ?? ""} />
          </div>,
          document.body,
        )}
    </Layout>
  );
};

export default Labels;
