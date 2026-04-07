import Link from "next/link";
import { DesignOSLogo } from "@/components/branding/logo";
import { Button } from "@/components/ui/button";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <DesignOSLogo />
          <nav className="hidden items-center gap-6 text-sm md:flex">
            <Link href="/pricing">Pricing</Link>
            <Link href="/showcase">Showcase</Link>
          </nav>
          <Button asChild size="sm" variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10">{children}</main>
    </div>
  );
}
