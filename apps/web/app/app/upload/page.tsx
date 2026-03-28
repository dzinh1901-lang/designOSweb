import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function UploadPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Upload references</h1>
      <Card>
        <CardHeader><CardTitle>Drop zone</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Drop images, LUTs, and style frames here.</div>
          <Button variant="outline">Choose files</Button>
        </CardContent>
      </Card>
    </section>
  );
}
