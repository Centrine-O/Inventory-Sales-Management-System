import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const Settings = () => {
  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">
            Manage branch identity, operational defaults, and alert preferences for the demo workspace.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Business profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="business-name">Business name</Label>
                <Input id="business-name" defaultValue="StockFlow Main Branch" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch-email">Operations email</Label>
                <Input id="branch-email" defaultValue="ops@stockflow.demo" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Input id="currency" defaultValue="KES - Kenyan Shilling" />
              </div>
              <Button className="bg-gradient-primary hover:bg-primary-dark">Save Changes</Button>
            </CardContent>
          </Card>

          <Card className="shadow-medium">
            <CardHeader>
              <CardTitle>Alerts and automation</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {[
                "Low stock alerts",
                "Daily sales summary",
                "Large transaction review",
                "Inactive customer reminders",
              ].map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-border px-4 py-4">
                  <div>
                    <p className="font-medium">{item}</p>
                    <p className="text-sm text-muted-foreground">
                      {index < 2 ? "Enabled for operations team" : "Can be configured per branch"}
                    </p>
                  </div>
                  <Switch defaultChecked={index !== 3} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default Settings;
