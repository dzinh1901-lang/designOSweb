import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PricingCardProps = {
  tier: string;
  price: string;
  features: string[];
};

export function PricingCard({ tier, price, features }: PricingCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{tier}</CardTitle>
        <CardDescription>{price}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2 text-sm text-muted-foreground">
          {features.map((feature) => (
            <li key={feature}>• {feature}</li>
          ))}
        </ul>
        <Button className="w-full">Choose {tier}</Button>
      </CardContent>
    </Card>
  );
}
