import { PricingCard } from "@/components/cards/pricing-card";
import { MarketingShell } from "@/components/layout/marketing-shell";

const tiers = [
  { tier: "Starter", price: "$99/mo", features: ["20 generations", "Basic benchmark QA", "1 seat"] },
  { tier: "Studio", price: "$349/mo", features: ["120 generations", "Advanced cinematic presets", "5 seats"] },
  { tier: "Enterprise", price: "Custom", features: ["Unlimited routing", "Dedicated GPU pool", "SAML + SOC2"] }
];

export default function PricingPage() {
  return (
    <MarketingShell>
      <section className="space-y-8">
        <h1 className="text-4xl font-semibold">Pricing built for production velocity</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {tiers.map((tier) => (
            <PricingCard key={tier.tier} {...tier} />
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
