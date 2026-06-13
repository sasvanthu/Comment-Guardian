/**
 * Ingestion Stream status indicator — surfaces normalized source origins
 * (Instagram, Facebook, Twitter/X) with a live throughput pulse.
 */
import { Twitter, Facebook, Instagram, Radio } from "lucide-react";
import { useMemo } from "react";
import type { DbComment } from "@/lib/data";

const SOURCES = [
  { key: "twitter",   label: "Twitter / X", icon: Twitter },
  { key: "facebook",  label: "Facebook",    icon: Facebook },
  { key: "instagram", label: "Instagram",   icon: Instagram },
] as const;

export function IngestionStream({ rows }: { rows: DbComment[] }) {
  const counts = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600_000;
    const m: Record<string, number> = { twitter: 0, facebook: 0, instagram: 0 };
    for (const r of rows) {
      if (+new Date(r.created_at) >= cutoff) m[r.platform] = (m[r.platform] ?? 0) + 1;
    }
    return m;
  }, [rows]);

  const total = counts.twitter + counts.facebook + counts.instagram;

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 border border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping bg-positive/70" />
          <span className="relative h-2 w-2 bg-positive" />
        </span>
        <Radio className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
          Ingestion Stream
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
          / normalized · {total.toString().padStart(3, "0")} last 24h
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SOURCES.map(({ key, label, icon: Icon }) => {
          const v = counts[key] ?? 0;
          const live = v > 0;
          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] ${
                live ? "border-positive/40 text-foreground/90" : "border-border text-muted-foreground/70"
              }`}
              style={{ borderRadius: 4 }}
            >
              <Icon className="h-3 w-3" strokeWidth={1.75} />
              {label}
              <span className="text-foreground/60">· {v.toString().padStart(2, "0")}</span>
              <span className={`h-1 w-1 ${live ? "bg-positive" : "bg-muted-foreground/40"}`} />
            </span>
          );
        })}
      </div>
    </section>
  );
}
