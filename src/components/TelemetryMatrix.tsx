/**
 * 6-tier telemetry meter: sharp 1px horizontal bars, monospace numeric readouts.
 * Replaces colorful radial rings used in lesser AI scaffolding.
 */
type Tier = { key: string; label: string; value: number; tone?: "danger" | "warn" | "info" | "good" };

const toneBar: Record<NonNullable<Tier["tone"]>, string> = {
  danger: "bg-toxic",
  warn: "bg-neutral-warn",
  info: "bg-primary",
  good: "bg-positive",
};

function inferTone(key: string, v: number): NonNullable<Tier["tone"]> {
  if (key === "sentiment" || key === "confidence") return v >= 70 ? "good" : v >= 40 ? "info" : "warn";
  if (key === "action") return v >= 70 ? "danger" : v >= 40 ? "warn" : "info";
  return v >= 70 ? "danger" : v >= 40 ? "warn" : "info";
}

export function TelemetryMatrix({ tiers, dense = false }: { tiers: Tier[]; dense?: boolean }) {
  return (
    <div className={`grid gap-${dense ? "1.5" : "2.5"}`}>
      {tiers.map((t) => {
        const v = Math.max(0, Math.min(100, Math.round(t.value)));
        const tone = t.tone ?? inferTone(t.key, v);
        return (
          <div key={t.key} className="grid grid-cols-[7.5rem_1fr_2.75rem] items-center gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              {t.label}
            </span>
            <div className="relative h-[3px] w-full overflow-hidden bg-border/60">
              <div
                className={`absolute inset-y-0 left-0 ${toneBar[tone]} transition-[width] duration-300 ease-out`}
                style={{ width: `${v}%` }}
              />
            </div>
            <span className="text-right font-mono text-[11px] tabular-nums text-foreground/90">{v}</span>
          </div>
        );
      })}
    </div>
  );
}
