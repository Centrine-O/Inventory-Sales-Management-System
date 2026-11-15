import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Package,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Store,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const metrics = [
  { label: "Orders processed", value: "12.4K" },
  { label: "Inventory accuracy", value: "98.7%" },
  { label: "Active locations", value: "18" },
];

const features = [
  {
    icon: Package,
    title: "Inventory control",
    description: "Track stock levels, fast-moving items, reorders, and supplier lead times in one dashboard.",
  },
  {
    icon: ShoppingCart,
    title: "Sales operations",
    description: "Record transactions, monitor payment status, and keep clean daily sales history.",
  },
  {
    icon: Users,
    title: "Customer records",
    description: "Keep customer activity, order patterns, and revenue contribution visible to staff.",
  },
  {
    icon: BarChart3,
    title: "Decision reporting",
    description: "Surface product performance, low-stock risk, and revenue trends without manual spreadsheets.",
  },
];

const workflows = [
  "Receive stock from suppliers and update quantities instantly.",
  "Track low-stock and out-of-stock products before they affect sales.",
  "Process daily sales and keep invoice history organized.",
  "Monitor customer activity and top-value buyers across the business.",
];

const Index = () => {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(72,114,255,0.16),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(13,148,136,0.18),_transparent_24%),linear-gradient(180deg,_hsl(var(--background)),_hsl(220_35%_96%))] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-6 lg:px-10">
        <header className="sticky top-4 z-30 rounded-3xl border border-white/60 bg-white/80 px-5 py-4 shadow-[0_18px_60px_-32px_rgba(15,23,42,0.35)] backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#3157ff,#39b9a7)] text-white shadow-[0_14px_28px_-16px_rgba(49,87,255,0.8)]">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="text-lg font-semibold tracking-tight">StockFlow IMS</p>
                <p className="text-sm text-muted-foreground">Inventory and sales control for modern retail teams</p>
              </div>
            </div>

            <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
              <a href="#features" className="transition-colors hover:text-foreground">Features</a>
              <a href="#workflows" className="transition-colors hover:text-foreground">How It Works</a>
              <a href="#operations" className="transition-colors hover:text-foreground">Operations View</a>
            </nav>

            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" className="rounded-full px-5">
                <Link to="/app">Open App</Link>
              </Button>
              <Button asChild className="rounded-full bg-[linear-gradient(135deg,#3157ff,#39b9a7)] px-5 text-white shadow-[0_20px_36px_-18px_rgba(49,87,255,0.75)] transition-transform duration-200 hover:-translate-y-0.5">
                <Link to="/app/products">
                  View Demo
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="grid items-center gap-10 px-1 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              </div>
              <h1 className="mt-6 max-w-xl text-5xl font-semibold leading-[1.02] tracking-tight text-slate-950 sm:text-6xl">
                One system for stock, sales, customers, and daily decisions.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
                StockFlow helps shops and growing retail businesses replace scattered spreadsheets with a clear operating system for inventory, sales tracking, customer records, and reporting.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button asChild size="lg" className="rounded-full bg-slate-950 px-7 text-white transition-transform duration-200 hover:-translate-y-0.5">
                  <Link to="/app">
                    Launch dashboard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="rounded-full border-slate-300 bg-white/75 px-7 backdrop-blur">
                  <a href="#operations">See product screens</a>
                </Button>
              </div>

              <div className="mt-10 grid gap-4 sm:grid-cols-3">
                {metrics.map((metric) => (
                  <Card key={metric.label} className="border-white/70 bg-white/78 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.7)] backdrop-blur">
                    <CardContent className="px-5 py-5">
                      <p className="text-3xl font-semibold tracking-tight text-slate-950">{metric.value}</p>
                      <p className="mt-1 text-sm text-slate-600">{metric.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div id="operations" className="relative">
              <div className="absolute -left-6 top-16 hidden h-28 w-28 rounded-full bg-cyan-300/30 blur-3xl lg:block" />
              <div className="absolute -right-4 top-0 hidden h-36 w-36 rounded-full bg-blue-300/25 blur-3xl lg:block" />
              <Card className="relative overflow-hidden rounded-[2rem] border-white/70 bg-white/78 p-3 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur">
                <div className="rounded-[1.5rem] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff,#eef4ff)] p-4">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Operations console</p>
                      <p className="text-sm text-slate-500">Main branch, Nairobi</p>
                    </div>
                    <div className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      System healthy
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-sm text-slate-500">Products in catalog</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-950">1,248</p>
                    </div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-sm text-slate-500">Sales today</p>
                      <p className="mt-3 text-3xl font-semibold text-slate-950">142</p>
                    </div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-sm text-slate-500">Low stock alerts</p>
                      <p className="mt-3 text-3xl font-semibold text-amber-600">19</p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-3xl bg-slate-950 p-5 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-slate-300">Weekly sales trend</p>
                          <p className="mt-2 text-2xl font-semibold">KSh 842,300</p>
                        </div>
                        <Receipt className="h-5 w-5 text-emerald-300" />
                      </div>
                      <div className="mt-5 flex h-40 items-end gap-3">
                        {[34, 54, 40, 66, 49, 76, 58].map((bar, index) => (
                          <div key={index} className="flex-1 rounded-t-2xl bg-[linear-gradient(180deg,#60a5fa,#34d399)]" style={{ height: `${bar}%` }} />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-sm text-slate-500">Most sold item</p>
                        <p className="mt-2 font-semibold text-slate-950">Wireless Barcode Scanner</p>
                        <p className="mt-1 text-sm text-slate-500">43 units this week</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-sm text-slate-500">Pending restock</p>
                        <p className="mt-2 font-semibold text-slate-950">Office Chairs, USB Hubs, Shelf Labels</p>
                      </div>
                      <div className="rounded-2xl bg-white p-4 shadow-sm">
                        <p className="text-sm text-slate-500">Customer snapshot</p>
                        <p className="mt-2 font-semibold text-slate-950">274 repeat buyers this month</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </section>

          <section id="features" className="py-12">
            <div className="mb-8 max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-700">Core capabilities</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Built for the daily realities of inventory and retail operations.
              </h2>
            </div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              {features.map((feature) => (
                <Card key={feature.title} className="group rounded-[1.75rem] border-white/70 bg-white/76 shadow-[0_22px_50px_-38px_rgba(15,23,42,0.65)] backdrop-blur transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_28px_80px_-36px_rgba(49,87,255,0.35)]">
                  <CardContent className="p-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(49,87,255,0.12),rgba(57,185,167,0.18))] text-sky-700 transition-transform duration-300 group-hover:scale-105">
                      <feature.icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-slate-950">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-slate-600">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section id="workflows" className="grid gap-6 py-12 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="rounded-[2rem] border-slate-200 bg-slate-950 text-white shadow-[0_30px_80px_-42px_rgba(15,23,42,0.9)]">
              <CardContent className="p-8">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-sky-300">Why it matters</p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">
                  Replace fragmented stock tracking with one reliable workflow.
                </h2>
                <p className="mt-5 text-base leading-8 text-slate-300">
                  This frontend is designed to present a realistic product demo: branch-level inventory visibility, customer records, sales monitoring, and action-oriented dashboards that a business owner or operations lead can understand immediately.
                </p>
                <Button asChild className="mt-8 rounded-full bg-white px-6 text-slate-950 hover:bg-slate-100">
                  <Link to="/app/sales">Explore sales workspace</Link>
                </Button>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              {workflows.map((workflow) => (
                <Card key={workflow} className="rounded-[1.75rem] border-white/70 bg-white/76 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.7)] backdrop-blur">
                  <CardContent className="flex h-full items-start gap-4 p-6">
                    <div className="mt-1 rounded-full bg-emerald-100 p-2 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <p className="text-sm leading-7 text-slate-700">{workflow}</p>
                  </CardContent>
                </Card>
              ))}
              <Card className="rounded-[1.75rem] border border-dashed border-sky-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(239,244,255,0.88))]">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 text-sky-700">
                    <Boxes className="h-5 w-5" />
                    <p className="text-sm font-semibold uppercase tracking-[0.2em]">Demo sections</p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {["Dashboard", "Products", "Customers", "Sales", "Reports", "Settings"].map((item) => (
                      <span key={item} className="rounded-full bg-white px-3 py-2 text-sm text-slate-700 shadow-sm">
                        {item}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default Index;
