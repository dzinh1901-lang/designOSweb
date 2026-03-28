import { StatusChip } from "@/components/feedback/status-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ResultsPage({ params }: { params: { jobId: string } }) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Render job {params.jobId}</h1>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0"><CardTitle>Generation status</CardTitle><StatusChip label="Processing" tone="warning" /></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Scene logic is running through Kling 3.0, director, and QA agents.</CardContent>
      </Card>
    </section>
  );
}
