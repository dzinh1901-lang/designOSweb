import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function BillingPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Billing</h1>
      <Card>
        <CardHeader><CardTitle>Current plan: Studio</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Usage this cycle: 78 / 120 renders</p>
          <Button variant="outline">Manage subscription</Button>
        </CardContent>
      </Card>
    </section>
  );
}
