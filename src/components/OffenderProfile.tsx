/**
 * Offender Profile — enterprise security ledger style.
 * Aggregates risk matrix per author from comment rows.
 */
import { useMemo } from "react";
import type { DbComment } from "@/lib/data";
import { TelemetryMatrix } from "./TelemetryMatrix";
import { ShieldAlert, User } from "lucide-react";

interface Profile {
  author: string;
  toxicityCount: number;
  harassmentCount: number;
  spamCount: number;
  violations: number;
  riskScore: number;
  lastSeen: string;
}

export function buildOffenderProfiles(rows: DbComment[], limit = 6): Profile[] {
  const acc = new Map<string, Profile>();
  for (const r of rows) {
    const a = r.author;
    const p = acc.get(a) ?? {
      author: a, toxicityCount: 0, harassmentCount: 0, spamCount: 0,
      violations: 0, riskScore: 0, lastSeen: r.created_at,
    };
    if (r.category === "toxic") p.toxicityCount++;
    if (r.category === "cyberbullying") p.harassmentCount++;
    if (r.category === "spam") p.spamCount++;
    if (["toxic", "cyberbullying", "spam"].includes(r.category)) p.violations++;
    if (+new Date(r.created_at) > +new Date(p.lastSeen)) p.lastSeen = r.created_at;
    acc.set(a, p);
  }
  for (const p of acc.values()) {
    p.riskScore = Math.min(100, p.toxicityCount * 18 + p.harassmentCount * 28 + p.spamCount * 10);
  }
  return Array.from(acc.values())
    .filter((p) => p.violations > 0)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, limit);
}

export function OffenderProfileCard({ profile }: { profile: Profile }) {
  return (
    <article className="border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
          <span className="font-mono text-[11px] text-foreground">{profile.author}</span>
        </div>
        <span className="inline-flex items-center gap-1.5 border border-red-500/55 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-red-300" style={{ borderRadius: 4 }}>
          <ShieldAlert className="h-3 w-3" /> RISK {profile.riskScore.toString().padStart(3,"0")}
        </span>
      </header>
      <div className="px-4 py-3">
        <TelemetryMatrix
          dense
          tiers={[
            { key: "toxicity",   label: "Toxicity Hist.",  value: Math.min(100, profile.toxicityCount * 18) },
            { key: "harassment", label: "Harassment Hist.", value: Math.min(100, profile.harassmentCount * 24) },
            { key: "spam",       label: "Spam Activity",    value: Math.min(100, profile.spamCount * 14) },
            { key: "action",     label: "Risk Composite",   value: profile.riskScore },
          ]}
        />
      </div>
      <footer className="grid grid-cols-2 border-t border-border font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="border-r border-border px-4 py-1.5">Violations · <span className="text-foreground">{profile.violations}</span></span>
        <span className="px-4 py-1.5">Last Seen · <span className="text-foreground">{new Date(profile.lastSeen).toISOString().slice(0,10)}</span></span>
      </footer>
    </article>
  );
}
