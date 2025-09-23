import { Layout } from "@/components/Layout";
import { StatsCard } from "@/components/StatsCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Package,
  Users,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Plus,
  FileText,
} from "lucide-react";

const Dashboard = () => {
  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">
              Welcome back! Here's what's happening with your business.
            </p>
          </div>
          <Button className="bg-gradient-primary hover:bg-primary-dark">
            <Plus className="mr-2 h-4 w-4" />
            Quick Sale
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Revenue"
            value="$45,231"
            change="+20.1% from last month"
            changeType="positive"
            icon={<DollarSign className="h-4 w-4" />}
          />
          <StatsCard
            title="Total Products"
            value="1,234"
            change="+8 new this week"
            changeType="positive"
            icon={<Package className="h-4 w-4" />}
          />
          <StatsCard
            title="Active Customers"
            value="573"
            change="+12% from last month"
            changeType="positive"
            icon={<Users className="h-4 w-4" />}
          />
          <StatsCard
            title="Sales Today"
            value="42"
            change="+5% from yesterday"
            changeType="positive"
            icon={<ShoppingCart className="h-4 w-4" />}
          />
        </div>

        {/* Charts and Tables */}
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle className="flex items-center">
                <TrendingUp className="mr-2 h-5 w-5" />
                Sales Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 bg-gradient-card rounded-lg flex items-center justify-center text-muted-foreground">
                Sales Chart (Coming Soon)
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { customer: "John Doe", amount: "$89.99", product: "Laptop Stand" },
                  { customer: "Jane Smith", amount: "$45.50", product: "Wireless Mouse" },
                  { customer: "Bob Johnson", amount: "$129.99", product: "Keyboard" },
                  { customer: "Alice Brown", amount: "$75.00", product: "Monitor" },
                ].map((sale, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div>
                      <p className="font-medium">{sale.customer}</p>
                      <p className="text-sm text-muted-foreground">{sale.product}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-accent">{sale.amount}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="shadow-medium">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <Button variant="outline" className="h-20 flex-col">
                <Package className="h-6 w-6 mb-2" />
                Add Product
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <Users className="h-6 w-6 mb-2" />
                Add Customer
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <ShoppingCart className="h-6 w-6 mb-2" />
                New Sale
              </Button>
              <Button variant="outline" className="h-20 flex-col">
                <FileText className="h-6 w-6 mb-2" />
                Generate Report
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;