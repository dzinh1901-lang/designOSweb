import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ShowcaseCardProps = {
  title: string;
  description: string;
};

export function ShowcaseCard({ title, description }: ShowcaseCardProps) {
  return (
    <Card className="overflow-hidden border-white/10 bg-gradient-to-br from-white/5 to-white/0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
