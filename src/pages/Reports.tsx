import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, TrendingUp, PackageX, Wallet, Users } from "lucide-react";

const highlights = [
  {
    title: "Revenue trend",
    value: "KSh 2.84M",
    note: "Up 12% vs previous period",
    icon: TrendingUp,
  },
  {
    title: "Shrinkage watch",
    value: "1.8%",
    note: "Within target range",
    icon: PackageX,
  },
  {
    title: "Cash collected",
    value: "KSh 1.12M",
    note: "Across all completed sales",
    icon: Wallet,
  },
  {
    title: "Returning buyers",
    value: "274",
    note: "Repeat customers this month",
    icon: Users,
  },
];

const Reports = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">
              Review business performance, restock pressure, and sales quality from one place.
            </p>
          </div>
          <Button className="w-fit bg-gradient-primary hover:bg-primary-dark">
            <Download className="mr-2 h-4 w-4" />
            Export Monthly Summary
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {highlights.map((item) => (
            <Card key={item.title} className="shadow-soft">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{item.title}</p>
                    <p className="mt-2 text-2xl font-bold">{item.value}</p>
                  </div>
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <item.icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{item.note}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Category performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { name: "Electronics", sales: "KSh 980,000", growth: "+14%" },
                { name: "Furniture", sales: "KSh 720,000", growth: "+9%" },
                { name: "Accessories", sales: "KSh 410,000", growth: "+18%" },
                { name: "Office supplies", sales: "KSh 290,000", growth: "+6%" },
              ].map((row) => (
                <div key={row.name} className="flex items-center justify-between rounded-2xl bg-muted/40 px-4 py-4">
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-sm text-muted-foreground">{row.sales}</p>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                    {row.growth}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Operational notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="rounded-2xl border border-border p-4">
                Three SKUs moved into low-stock threshold and should be reordered this week.
              </div>
              <div className="rounded-2xl border border-border p-4">
                Weekend transactions continue to outperform weekday walk-in sales by 17%.
              </div>
              <div className="rounded-2xl border border-border p-4">
                Customer repeat rate improved after introducing invoice-linked follow-up outreach.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Reports;
