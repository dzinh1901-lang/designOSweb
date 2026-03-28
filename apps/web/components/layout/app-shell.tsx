"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Film, FolderOpen, PlusCircle, Upload, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const tabs = [
  { href: "/app/create", label: "Create", icon: PlusCircle },
  { href: "/app/upload", label: "Upload", icon: Upload },
  { href: "/app/library", label: "Library", icon: FolderOpen },
  { href: "/app/results/demo-job", label: "Results", icon: Film },
  { href: "/app/billing", label: "Billing", icon: Wallet }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto grid max-w-4xl grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = pathname.startsWith(tab.href.replace("demo-job", ""));
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn("flex flex-col items-center gap-1 py-3 text-xs", active ? "text-primary" : "text-muted-foreground")}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Sheet>
        <SheetTrigger asChild>
          <Button className="fixed bottom-24 right-4 rounded-full">Quick Actions</Button>
        </SheetTrigger>
        <SheetContent>
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Create Quickly</h3>
            <p className="text-sm text-muted-foreground">Start a generation, upload references, or revisit your last render.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline"><Link href="/app/create">New job</Link></Button>
              <Button asChild variant="outline"><Link href="/app/upload">Upload refs</Link></Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
