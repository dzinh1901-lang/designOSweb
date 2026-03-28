import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusChip } from "@/components/feedback/status-chip";

const assets = ["Deck flythrough", "Salon close-up", "Ocean wake pass"];

export default function LibraryPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Asset library</h1>
      <div className="grid gap-3">
        {assets.map((asset) => (
          <Card key={asset}>
            <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle className="text-base">{asset}</CardTitle><StatusChip label="Ready" tone="success" /></CardHeader>
            <CardContent className="text-sm text-muted-foreground">Benchmark score: 9.2 · Last updated 2h ago</CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
