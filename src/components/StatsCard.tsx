import type { LucideIcon } from "lucide-react";

export function StatsCard({
  label, value, icon: Icon, tone = "default", hint, delta,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "default" | "toxic" | "positive" | "neutral";
  hint?: string;
  delta?: { value: number; direction?: "up" | "down" };
}) {
  const accent = {
    default: "text-foreground/70",
    toxic: "text-toxic",
    positive: "text-positive",
    neutral: "text-neutral-warn",
  }[tone];

  const deltaTone =
    delta?.direction === "up" ? "text-positive" :
    delta?.direction === "down" ? "text-toxic" : "text-muted-foreground";

  return (
    <div className="group relative border border-border bg-card px-3 py-2.5 transition-colors hover:border-foreground/20">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <Icon className={`h-3 w-3 ${accent}`} strokeWidth={1.75} />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <p className="font-mono text-[18px] font-semibold leading-none tabular-nums text-foreground">{value}</p>
        {delta && (
          <span className={`font-mono text-[10px] tabular-nums ${deltaTone}`}>
            {delta.direction === "down" ? "−" : "+"}{Math.abs(delta.value)}%
          </span>
        )}
      </div>
      {hint && <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">{hint}</p>}
    </div>
  );
}
