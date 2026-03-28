import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CharacterPage({ params }: { params: { id: string } }) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Character {params.id}</h1>
      <Card>
        <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">Manage identity lock, motion presets, and voice alignment for this character.</CardContent>
      </Card>
    </section>
  );
}
