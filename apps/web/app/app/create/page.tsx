import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function CreatePage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Create generation</h1>
      <Card>
        <CardHeader><CardTitle>Prompt blueprint</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2"><Label>Project title</Label><Input placeholder="Superyacht teaser" /></div>
          <div className="space-y-2"><Label>Creative brief</Label><Textarea placeholder="Golden hour, 35mm anamorphic, slow crane reveal..." /></div>
          <Button>Queue generation</Button>
        </CardContent>
      </Card>
    </section>
  );
}
