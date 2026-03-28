import { cn } from "@/lib/utils";

export function StatusChip({ label, tone = "default" }: { label: string; tone?: "default" | "success" | "warning" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs",
        tone === "success" && "bg-emerald-500/20 text-emerald-300",
        tone === "warning" && "bg-amber-500/20 text-amber-300",
        tone === "default" && "bg-primary/20 text-primary"
      )}
    >
      {label}
    </span>
  );
}
