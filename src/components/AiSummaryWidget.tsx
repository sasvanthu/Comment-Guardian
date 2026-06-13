import { useMemo } from "react";
import { Sparkles, AlertTriangle, ShieldAlert, Flame, Eye, Clock } from "lucide-react";
import type { Comment } from "@/lib/mock-data";
import type { DbComment } from "@/lib/data";

function isToday(iso: string) {
  return Date.now() - +new Date(iso) < 86400000;
}

export function AiSummaryWidget({ allRows, comments }: { allRows: DbComment[]; comments: Comment[] }) {
  const stats = useMemo(() => {
    const today = allRows.filter((r) => isToday(r.created_at));
    const flagged = today.filter((r) => ["toxic","cyberbullying","spam"].includes(r.category) || r.sentiment === "negative");
    return {
      analyzed: today.length,
      flagged: flagged.length,
      spam: today.filter((r) => r.category === "spam").length,
      harassment: today.filter((r) => r.category === "cyberbullying").length,
      toxic: today.filter((r) => r.category === "toxic" || r.sentiment === "negative").length,
      pending: allRows.filter((r) => r.review_status === "pending").length,
    };
  }, [allRows]);

  // Suppress unused — currently we only use allRows; comments kept for API parity if widget grows
  void comments;

  const items: Array<{ label: string; value: number; icon: typeof Sparkles; tone: string }> = [
    { label: "Analyzed",     value: stats.analyzed,    icon: Sparkles,      tone: "text-primary" },
    { label: "Flagged",      value: stats.flagged,     icon: AlertTriangle, tone: "text-neutral-warn" },
    { label: "Spam",         value: stats.spam,        icon: ShieldAlert,   tone: "text-orange-300" },
    { label: "Harassment",   value: stats.harassment,  icon: Flame,         tone: "text-red-300" },
    { label: "Toxic",        value: stats.toxic,       icon: Eye,           tone: "text-toxic" },
    { label: "Pending",      value: stats.pending,     icon: Clock,         tone: "text-fuchsia-300" },
  ];

  return (
    <div className="glass-panel rounded-2xl border border-border/60 p-5 shadow-elegant">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" /> Today's AI Moderation Summary
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">last 24h</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.label} className="rounded-xl border border-border/60 bg-secondary/40 p-3">
            <div className="flex items-center gap-2">
              <it.icon className={`h-4 w-4 ${it.tone}`} />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{it.label}</span>
            </div>
            <p className="mt-1 text-2xl font-bold tabular-nums">{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
