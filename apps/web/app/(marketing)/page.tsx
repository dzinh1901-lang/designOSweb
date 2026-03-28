"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function MarketingHomePage() {
  return (
    <MarketingShell>
      <section className="grid gap-10 md:grid-cols-2 md:items-center">
        <div className="space-y-5">
          <p className="text-sm text-primary">Cinematic Generation Engine</p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">
            Broadcast-ready visuals for marine and real estate teams.
          </h1>
          <p className="text-muted-foreground">
            DesignOS transforms structured prompts and reference imagery into benchmark-calibrated cinematic renders.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild><Link href="/sign-up">Start generating</Link></Button>
            <Button asChild variant="outline"><Link href="/showcase">Watch showcase</Link></Button>
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <Card className="border-white/10 bg-gradient-to-b from-white/10 to-transparent">
            <CardContent className="space-y-4 p-6">
              <div className="h-44 rounded-lg bg-gradient-to-br from-cyan-500/30 to-purple-500/30" />
              <p className="text-sm text-muted-foreground">Kling 3.0 + Genspark orchestration, QA-calibrated shot plans, real-time delivery.</p>
            </CardContent>
          </Card>
        </motion.div>
      </section>
    </MarketingShell>
  );
}
