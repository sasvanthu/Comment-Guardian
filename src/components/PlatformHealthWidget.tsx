import { useMemo } from "react";
import { Twitter, Facebook, Instagram, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { DbComment } from "@/lib/data";

type Platform = "twitter" | "facebook" | "instagram";

const META: Record<Platform, { label: string; icon: typeof Twitter; accent: string }> = {
  twitter:   { label: "Twitter / X", icon: Twitter,   accent: "from-twitter/30 to-twitter/5 text-twitter" },
  facebook:  { label: "Facebook",    icon: Facebook,  accent: "from-facebook/30 to-facebook/5 text-facebook" },
  instagram: { label: "Instagram",   icon: Instagram, accent: "from-pink-500/30 to-purple-500/10 text-pink-300" },
};

function isWithin(ms: number, iso: string) { return Date.now() - +new Date(iso) < ms; }

function platformStats(rows: DbComment[], p: Platform) {
  const all = rows.filter((r) => r.platform === p);
  const total = all.length;
  const toxic = all.filter((r) => r.sentiment === "negative" || ["toxic","cyberbullying"].includes(r.category)).length;
  const actions = all.filter((r) => r.status === "hidden" || r.status === "deleted").length;
  const day = 86400000;
  const today = all.filter((r) => isWithin(day, r.created_at)).length;
  const prev = all.filter((r) => !isWithin(day, r.created_at) && isWithin(2 * day, r.created_at)).length;
  const toxicityRate = total === 0 ? 0 : Math.round((toxic / total) * 100);
  // Health: 100 - toxicity rate, with small penalty for unmoderated toxic content
  const unmoderatedToxic = all.filter((r) => (r.sentiment === "negative" || ["toxic","cyberbullying"].includes(r.category)) && r.status === "allowed").length;
  const penalty = Math.min(20, unmoderatedToxic * 2);
  const health = Math.max(0, 100 - toxicityRate - penalty);
  const trend = today === prev ? "flat" : today > prev ? "up" : "down";
  return { total, toxic, actions, toxicityRate, health, trend, today };
}

export function PlatformHealthWidget({ allRows }: { allRows: DbComment[] }) {
  const platforms: Platform[] = ["twitter", "facebook", "instagram"];
  const data = useMemo(() => platforms.map((p) => ({ p, s: platformStats(allRows, p) })), [allRows]);

  return (
    <div className="glass-panel rounded-2xl border border-border/60 p-5 shadow-elegant">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Platform Health</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {data.map(({ p, s }) => {
          const M = META[p];
          const Trend = s.trend === "up" ? TrendingUp : s.trend === "down" ? TrendingDown : Minus;
          const trendTone = s.trend === "up" ? "text-toxic" : s.trend === "down" ? "text-positive" : "text-muted-foreground";
          const healthTone = s.health >= 75 ? "text-positive" : s.health >= 50 ? "text-neutral-warn" : "text-toxic";
          return (
            <div key={p} className="rounded-xl border border-border/60 bg-secondary/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${M.accent}`}>
                  <M.icon className="h-4 w-4" />
                </div>
                <Trend className={`h-4 w-4 ${trendTone}`} aria-label={`Trend ${s.trend}`} />
              </div>
              <p className="text-sm font-semibold">{M.label}</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-2xl font-bold tabular-nums ${healthTone}`}>{s.health}</span>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">/ 100</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className={`h-full ${s.health >= 75 ? "bg-positive" : s.health >= 50 ? "bg-neutral-warn" : "bg-toxic"}`}
                  style={{ width: `${s.health}%` }} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[11px] text-muted-foreground">
                <dt>Toxicity rate</dt><dd className="text-right tabular-nums text-foreground">{s.toxicityRate}%</dd>
                <dt>Actions taken</dt><dd className="text-right tabular-nums text-foreground">{s.actions}</dd>
                <dt>Today</dt><dd className="text-right tabular-nums text-foreground">{s.today}</dd>
              </dl>
            </div>
          );
        })}
      </div>
    </div>
  );
}
