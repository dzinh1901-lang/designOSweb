"use client";

import { motion } from "framer-motion";
import { ShowcaseCard } from "@/components/cards/showcase-card";
import { MarketingShell } from "@/components/layout/marketing-shell";

const items = [
  ["Superyacht hero film", "34-second golden-hour vessel sequence with benchmark-aligned prompt stages."],
  ["Luxury penthouse reveal", "Staged cinematic walkthrough with adaptive transitions and window-light balancing."],
  ["Character motion test", "Avatar-driven performance run with lip-sync and editorial camera cuts."]
] as const;

export default function ShowcasePage() {
  return (
    <MarketingShell>
      <section className="space-y-8">
        <h1 className="text-4xl font-semibold">Showcase</h1>
        <div className="grid gap-4 md:grid-cols-3">
          {items.map(([title, description], i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.12 }}
              viewport={{ once: true }}
            >
              <ShowcaseCard title={title} description={description} />
            </motion.div>
          ))}
        </div>
      </section>
    </MarketingShell>
  );
}
