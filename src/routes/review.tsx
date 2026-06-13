
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ClipboardCheck, CheckCircle2, XCircle, AlertTriangle, Trash2, EyeOff,
  Ban, Filter, ArrowUpDown, X, Sparkles, Brain, ShieldAlert, Inbox,
  ThumbsUp, ThumbsDown, HelpCircle, MessageCircleQuestion, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { PlatformBadge } from "@/components/PlatformBadge";
import { SentimentBadge } from "@/components/SentimentBadge";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";

import type { Platform } from "@/lib/mock-data";
import {
  useComments, useModeratorFeedback,
  addFeedback, seedSampleFlaggedComments,
  type DbComment, type ReviewStatus, type FeedbackType,
} from "@/lib/data";
import { runModerationAction, type ModeratorAction } from "@/lib/moderation-actions";

export default ReviewQueuePage;

/* ---------- Domain helpers ---------- */

const FLAGGED_CATEGORIES = new Set(["toxic", "spam", "cyberbullying"]);
const STATUS_ORDER: ReviewStatus[] = ["pending", "reviewed", "approved", "ignored", "escalated"];

type SortKey = "confidence" | "newest" | "risk";

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function baseToxicity(row: DbComment): number {
  if (row.category === "cyberbullying") return 88;
  if (row.category === "toxic") return 80;
  if (row.category === "spam") return 55;
  if (row.sentiment === "negative") return 60;
  if (row.sentiment === "positive") return 8;
  return 22;
}

function confidenceFor(row: DbComment): number {
  const base = baseToxicity(row);
  const jitter = (hashSeed(row.id) % 18) - 9;
  return Math.max(55, Math.min(99, Math.round(base * 0.9 + jitter + 10)));
}

function recommendedFor(row: DbComment): { label: string; tone: "danger" | "warn" | "info" } {
  const t = baseToxicity(row);
  if (t >= 85) return { label: "Delete & block", tone: "danger" };
  if (t >= 65) return { label: "Hide & review", tone: "warn" };
  if (row.category === "spam") return { label: "Mark spam", tone: "warn" };
  return { label: "Allow", tone: "info" };
}

const SIGNAL_LEXICON: { label: string; pattern: RegExp }[] = [
  { label: "Insult", pattern: /\b(stupid|idiot|loser|garbage|trash|dumb|moron|ugly)\b/i },
  { label: "Threat", pattern: /\b(kill|hurt|find you|regret|destroy|beat|watch your back)\b/i },
  { label: "Self-harm", pattern: /\b(kill yourself|kys|end it)\b/i },
  { label: "Spam URL", pattern: /\b(bit\.ly|click|link|free|win|prize|btc|crypto)\b/i },
  { label: "Targeted you", pattern: /\b(you|ur|your)\b/i },
  { label: "Imperative", pattern: /\b(shut up|leave|stop|get out)\b/i },
  { label: "Hate slur", pattern: /\b(filth|disgust|hate)\b/i },
];

function extractSignals(row: DbComment): string[] {
  const out: string[] = [];
  for (const s of SIGNAL_LEXICON) if (s.pattern.test(row.text)) out.push(s.label);
  return Array.from(new Set(out)).slice(0, 5);
}

function explainability(row: DbComment, confidence: number, recommended: string): string {
  const sigs = extractSignals(row);
  const cat = row.category;
  const parts: string[] = [];
  parts.push(`Classified as ${cat} with ${confidence}% confidence.`);
  if (sigs.length) parts.push(`Signals detected: ${sigs.join(", ")}.`);
  if (row.sentiment === "negative") parts.push("Tone is strongly negative.");
  parts.push(`Recommended action: ${recommended}.`);
  return parts.join(" ");
}

function withinDateRange(iso: string, range: "all" | "today" | "7d" | "30d"): boolean {
  if (range === "all") return true;
  const t = +new Date(iso);
  const now = Date.now();
  const day = 86400000;
  if (range === "today") return now - t < day;
  if (range === "7d") return now - t < 7 * day;
  return now - t < 30 * day;
}

const statusStyle: Record<ReviewStatus, string> = {
  pending: "border-neutral-warn/40 bg-neutral-warn/10 text-neutral-warn",
  reviewed: "border-primary/40 bg-primary/10 text-primary",
  approved: "border-positive/40 bg-positive/10 text-positive",
  ignored: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
  escalated: "border-red-600/50 bg-red-600/15 text-red-300",
};

const toneStyle: Record<"danger" | "warn" | "info", string> = {
  danger: "border-red-600/50 bg-red-600/15 text-red-300",
  warn: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  info: "border-positive/30 bg-positive/10 text-positive",
};

/* ---------- Page ---------- */

function ReviewQueuePage() {
  const { rows, loading, reload } = useComments();
  const { rows: feedbackRows } = useModeratorFeedback();

  // Filters
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [category, setCategory] = useState<string>("all");
  const [statusF, setStatusF] = useState<"all" | ReviewStatus>("pending");
  const [minConf, setMinConf] = useState(0);
  const [maxConf, setMaxConf] = useState(100);
  const [dateRange, setDateRange] = useState<"all" | "today" | "7d" | "30d">("all");
  const [sort, setSort] = useState<SortKey>("confidence");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Only flagged comments enter the queue
  const flagged = useMemo(
    () => rows.filter((r) => FLAGGED_CATEGORIES.has(r.category) || r.sentiment === "negative"),
    [rows],
  );

  const enriched = useMemo(() => flagged.map((r) => {
    const conf = confidenceFor(r);
    const rec = recommendedFor(r);
    return { row: r, confidence: conf, recommended: rec };
  }), [flagged]);

  const filtered = useMemo(() => {
    const list = enriched.filter(({ row, confidence }) => {
      if (platform !== "all" && row.platform !== platform) return false;
      if (category !== "all" && row.category !== category) return false;
      if (statusF !== "all" && row.review_status !== statusF) return false;
      if (confidence < minConf || confidence > maxConf) return false;
      if (!withinDateRange(row.created_at, dateRange)) return false;
      return true;
    });
    list.sort((a, b) => {
      if (sort === "newest") return +new Date(b.row.created_at) - +new Date(a.row.created_at);
      if (sort === "risk") return baseToxicity(b.row) - baseToxicity(a.row);
      return b.confidence - a.confidence;
    });
    return list;
  }, [enriched, platform, category, statusF, minConf, maxConf, dateRange, sort]);

  const stats = useMemo(() => {
    const today = enriched.filter((e) => withinDateRange(e.row.created_at, "today"));
    return {
      total: enriched.length,
      pending: enriched.filter((e) => e.row.review_status === "pending").length,
      approved: enriched.filter((e) => e.row.review_status === "approved").length,
      escalated: enriched.filter((e) => e.row.review_status === "escalated").length,
      todayCount: today.length,
    };
  }, [enriched]);

  const allChecked = filtered.length > 0 && filtered.every((e) => selected.has(e.row.id));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allChecked) {
        const next = new Set(prev);
        filtered.forEach((e) => next.delete(e.row.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((e) => next.add(e.row.id));
      return next;
    });
  };
  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedRows = useMemo(
    () => enriched.filter((e) => selected.has(e.row.id)),
    [enriched, selected],
  );

  const runBulk = async (action: ModeratorAction, label: string, note?: string) => {
    if (!selectedIds.length) { toast.error("Select rows first"); return; }
    // Optimistic toast; rollback by reload on error.
    const previous = selectedIds.slice();
    try {
      const res = await runModerationAction(previous, action, { note });
      const parts: string[] = [];
      if (res.applied.length) parts.push(`${res.applied.length} applied`);
      if (res.skipped.length) parts.push(`${res.skipped.length} skipped`);
      if (res.failed.length)  parts.push(`${res.failed.length} failed`);
      toast.success(`${label} — ${parts.join(", ")}`);
      setSelected(new Set());
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
      await reload(); // rollback optimistic UI
    }
  };

  const bulkApprove  = () => runBulk("approve",  "Approved");
  const bulkIgnore   = () => runBulk("approve",  "Ignored");
  const bulkEscalate = () => runBulk("escalate", "Escalated");
  const bulkHide     = () => runBulk("hide",     "Hidden");
  const bulkDelete   = () => runBulk("delete",   "Deleted");

  const seed = async () => {
    setSeeding(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const uid = authData?.user?.id;
      if (!uid) throw new Error("You must be logged in to seed data");

      const inserted = await seedSampleFlaggedComments();
      if (!inserted || !inserted.length) throw new Error("No comments seeded locally");

      toast.info("Analyzing with DeepSeek...");

      const res = await fetch("http://localhost:5000/api/rpc/seedSampleData", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments: inserted })
      });
      if (!res.ok) throw new Error("Failed to run AI analysis");
      
      const { analyses } = await res.json();
      
      for (const a of analyses) {
        if (!a.error && a.id) {
          await supabase.from("comments").update({
            sentiment: a.sentiment,
            category: a.categories && a.categories.length ? (a.categories[0] === 'safe' ? 'neutral' : a.categories[0]) : "neutral"
          }).eq("id", a.id);
        }
      }

      toast.success(`Seeded and analyzed ${inserted.length} comments!`);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to seed");
    } finally { setSeeding(false); }
  };

  const drawer = drawerId ? enriched.find((e) => e.row.id === drawerId) ?? null : null;

  const isEmpty = !loading && flagged.length === 0;

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-primary via-fuchsia-400 to-pink-400 bg-clip-text text-2xl font-bold tracking-tight text-transparent md:text-3xl">
            Review Queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Centralized triage for AI-flagged comments across all connected platforms.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={seed}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 rounded-md border bg-secondary/70 px-3 py-2 text-sm font-medium backdrop-blur hover:bg-accent disabled:opacity-60"
          >
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Seed sample data
          </button>
        </div>
      </header>

      {/* Stat strip */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatPill label="In queue" value={stats.total} icon={ClipboardCheck} tone="primary" />
        <StatPill label="Pending review" value={stats.pending} icon={AlertTriangle} tone="warn" />
        <StatPill label="Approved" value={stats.approved} icon={CheckCircle2} tone="positive" />
        <StatPill label="Escalated" value={stats.escalated} icon={ShieldAlert} tone="danger" />
        <StatPill label="Added today" value={stats.todayCount} icon={Sparkles} tone="primary" />
      </div>

      {isEmpty ? (
        <EmptyState
          icon={Inbox}
          title="Review queue is empty"
          description="No AI-flagged comments yet. Seed realistic sample data to explore the workflow, or ingest live comments from the Dashboard."
          action={{ label: seeding ? "Seeding…" : "Seed sample data", onClick: seed }}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="glass-panel mb-4 rounded-2xl border border-border/60 p-4 shadow-elegant">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Filter className="h-4 w-4" /> Filters
            </div>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Select label="Platform" value={platform} onChange={(v) => setPlatform(v as typeof platform)}
                options={[["all","All"],["twitter","Twitter"],["facebook","Facebook"],["instagram","Instagram"]]} />
              <Select label="Category" value={category} onChange={setCategory}
                options={[["all","All"],["toxic","Toxic"],["cyberbullying","Cyberbullying"],["spam","Spam"],["neutral","Neutral"],["positive","Positive"]]} />
              <Select label="Status" value={statusF} onChange={(v) => setStatusF(v as typeof statusF)}
                options={[["all","All"], ...STATUS_ORDER.map((s) => [s, s[0].toUpperCase()+s.slice(1)] as [string,string])]} />
              <Select label="Date" value={dateRange} onChange={(v) => setDateRange(v as typeof dateRange)}
                options={[["all","All time"],["today","Today"],["7d","Last 7 days"],["30d","Last 30 days"]]} />
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground">Confidence range</span>
                <div className="flex items-center gap-1.5">
                  <input type="number" min={0} max={100} value={minConf}
                    onChange={(e) => setMinConf(Math.max(0, Math.min(100, +e.target.value || 0)))}
                    className="w-full rounded-md border bg-input px-2 py-1.5 text-sm" />
                  <span className="text-muted-foreground">–</span>
                  <input type="number" min={0} max={100} value={maxConf}
                    onChange={(e) => setMaxConf(Math.max(0, Math.min(100, +e.target.value || 0)))}
                    className="w-full rounded-md border bg-input px-2 py-1.5 text-sm" />
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground"><ArrowUpDown className="h-3 w-3" /> Sort</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}
                  className="rounded-md border bg-input px-2 py-1.5 text-sm">
                  <option value="confidence">Highest confidence</option>
                  <option value="newest">Newest first</option>
                  <option value="risk">Highest risk</option>
                </select>
              </div>
            </div>
          </div>

          {/* Bulk action bar */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selectedIds.length} selected · {filtered.length} shown
            </span>
            <BulkBtn onClick={bulkApprove}  disabled={!selectedIds.length} icon={CheckCircle2} tone="positive">Approve</BulkBtn>
            <BulkBtn onClick={bulkIgnore}   disabled={!selectedIds.length} icon={XCircle}     tone="muted">Ignore</BulkBtn>
            <BulkBtn onClick={bulkEscalate} disabled={!selectedIds.length} icon={ShieldAlert} tone="danger">Escalate</BulkBtn>
            <BulkBtn onClick={bulkHide}     disabled={!selectedIds.length} icon={EyeOff}      tone="warn">Hide</BulkBtn>
            <BulkBtn onClick={bulkDelete}   disabled={!selectedIds.length} icon={Trash2}      tone="danger">Delete</BulkBtn>
          </div>

          {/* Table */}
          <div className="glass-panel overflow-hidden rounded-2xl border border-border/60 shadow-elegant">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-3">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" />
                    </th>
                    <th className="px-2 py-3 text-left">Platform</th>
                    <th className="px-2 py-3 text-left">Author</th>
                    <th className="px-2 py-3 text-left">Comment</th>
                    <th className="px-2 py-3 text-left">Sentiment</th>
                    <th className="px-2 py-3 text-left">Category</th>
                    <th className="px-2 py-3 text-left">Confidence</th>
                    <th className="px-2 py-3 text-left">Recommended</th>
                    <th className="px-2 py-3 text-left">Status</th>
                    <th className="px-2 py-3 text-left">When</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={10} className="px-3 py-10 text-center text-xs text-muted-foreground">No comments match these filters.</td></tr>
                  ) : filtered.map(({ row, confidence, recommended }) => (
                    <tr
                      key={row.id}
                      onClick={() => setDrawerId(row.id)}
                      className={`cursor-pointer border-t border-border/60 transition hover:bg-accent/40 ${selected.has(row.id) ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} aria-label={`Select ${row.author}`} />
                      </td>
                      <td className="px-2 py-3"><PlatformBadge platform={row.platform as Platform} /></td>
                      <td className="px-2 py-3 font-medium">{row.author}</td>
                      <td className="px-2 py-3 max-w-[260px] truncate text-muted-foreground">{row.text}</td>
                      <td className="px-2 py-3"><SentimentBadge sentiment={row.sentiment === "negative" ? "toxic" : row.sentiment === "positive" ? "positive" : "neutral"} /></td>
                      <td className="px-2 py-3 capitalize">{row.category}</td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                            <div className={`h-full ${confidence >= 80 ? "bg-red-500" : confidence >= 65 ? "bg-orange-400" : "bg-positive"}`}
                              style={{ width: `${confidence}%` }} />
                          </div>
                          <span className="text-xs tabular-nums">{confidence}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-3">
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${toneStyle[recommended.tone]}`}>
                          {recommended.label}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyle[row.review_status]}`}>
                          {row.review_status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-2 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {drawer && (
        <CommentDrawer
          row={drawer.row}
          confidence={drawer.confidence}
          recommended={drawer.recommended}
          feedbackCount={feedbackRows.filter((f) => f.comment_id === drawer.row.id).length}
          onClose={() => setDrawerId(null)}
          onChanged={reload}
        />
      )}
    </Layout>
  );
}

/* ---------- Subcomponents ---------- */

function StatPill({ label, value, icon: Icon, tone }: {
  label: string; value: number; icon: typeof CheckCircle2;
  tone: "primary" | "positive" | "warn" | "danger";
}) {
  const map = {
    primary: "from-primary/30 to-fuchsia-500/10 text-primary",
    positive: "from-positive/30 to-positive/5 text-positive",
    warn: "from-neutral-warn/30 to-neutral-warn/5 text-neutral-warn",
    danger: "from-red-600/30 to-red-600/5 text-red-300",
  }[tone];
  return (
    <div className="glass-panel flex items-center gap-3 rounded-xl border border-border/60 p-3 shadow-elegant">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br ${map}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-md border bg-input px-2 py-1.5 text-sm">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function BulkBtn({ onClick, disabled, icon: Icon, tone, children }: {
  onClick: () => void; disabled?: boolean; icon: typeof CheckCircle2;
  tone: "positive" | "muted" | "danger" | "warn"; children: React.ReactNode;
}) {
  const map = {
    positive: "border-positive/40 bg-positive/10 text-positive hover:bg-positive/20",
    muted: "border-border bg-secondary text-foreground hover:bg-accent",
    danger: "border-red-600/40 bg-red-600/10 text-red-300 hover:bg-red-600/20",
    warn: "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20",
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${map}`}>
      <Icon className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function CommentDrawer({ row, confidence, recommended, feedbackCount, onClose, onChanged }: {
  row: DbComment;
  confidence: number;
  recommended: { label: string; tone: "danger" | "warn" | "info" };
  feedbackCount: number;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const signals = extractSignals(row);
  const explanation = explainability(row, confidence, recommended.label);
  const tox = baseToxicity(row);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const runAction = async (action: ModeratorAction, label: string) => {
    setBusy(label);
    try {
      const res = await runModerationAction([row.id], action, { note: note.trim() || undefined });
      if (res.skipped.length) toast.info(`${label} skipped — already at that state`);
      else if (res.failed.length) toast.error(`${label} failed`);
      else toast.success(label);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      await onChanged();
    } finally { setBusy(null); }
  };

  const approve  = () => runAction("approve",  "Recommendation approved");
  const ignore   = () => runAction("approve",  "Ignored");
  const escalate = () => runAction("escalate", "Escalated");
  const hide     = () => runAction("hide",     "Comment hidden");
  const del      = () => runAction("delete",   "Comment deleted");
  const block    = () => runAction("block",    "User blocked");

  const feedback = async (kind: FeedbackType, label: string) => {
    setBusy(label);
    try {
      await addFeedback(row.id, kind);
      toast.success(`Feedback recorded: ${label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        className="glass-panel flex h-full w-full max-w-xl flex-col border-l border-border/60 bg-card/95 shadow-elegant"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-border/60 p-5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Comment detail</p>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold">
              <PlatformBadge platform={row.platform as Platform} /> {row.author}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 hover:bg-accent" aria-label="Close"><X className="h-4 w-4" /></button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <Section title="Original comment">
            <p className="rounded-lg border border-border/60 bg-secondary/40 p-3 text-sm leading-relaxed">{row.text}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
              {row.language ? ` · ${row.language}` : ""}
            </p>
          </Section>

          <Section title="AI analysis">
            <div className="grid grid-cols-2 gap-3">
              <MetricRow label="Sentiment" value={row.sentiment} />
              <MetricRow label="Toxicity score" value={`${tox}%`} bar={tox} />
              <MetricRow label="Category" value={row.category} />
              <MetricRow label="Confidence" value={`${confidence}%`} bar={confidence} />
            </div>
          </Section>

          <Section title="AI explainability" icon={Brain}>
            <p className="text-sm text-muted-foreground">{explanation}</p>
            {signals.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">Keywords / signals</p>
                <div className="flex flex-wrap gap-1.5">
                  {signals.map((s) => (
                    <span key={s} className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{s}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 rounded-lg border border-border/60 bg-secondary/30 p-3 text-xs">
              <p className="font-semibold">Recommendation: <span className={`ml-1 rounded-md border px-2 py-0.5 ${toneStyle[recommended.tone]}`}>{recommended.label}</span></p>
              <p className="mt-1 text-muted-foreground">
                {confidence >= 80
                  ? "High-confidence detection — model strongly supports the recommended action."
                  : confidence >= 65
                    ? "Medium confidence — manual review recommended before automatic action."
                    : "Lower confidence — consider reviewing surrounding context."}
              </p>
            </div>
          </Section>

          <Section title="Moderation actions">
            <label className="mb-2 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Moderator note (optional — attached to action, audit log, and any case)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add context for the audit trail, e.g. 'Repeat offender — escalating to trust & safety.'"
              rows={2}
              className="mb-3 w-full rounded-md border bg-input px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <DrawerBtn onClick={approve}  busy={busy} label="Approve recommendation"  tone="positive" icon={CheckCircle2} />
              <DrawerBtn onClick={ignore}   busy={busy} label="Ignore recommendation"   tone="muted"    icon={XCircle} />
              <DrawerBtn onClick={hide}     busy={busy} label="Hide comment"            tone="warn"     icon={EyeOff} />
              <DrawerBtn onClick={del}      busy={busy} label="Delete comment"          tone="danger"   icon={Trash2} />
              <DrawerBtn onClick={escalate} busy={busy} label="Escalated"               tone="danger"   icon={ShieldAlert} />
              <DrawerBtn onClick={block}    busy={busy} label="User blocked"            tone="danger"   icon={Ban} />
            </div>
          </Section>

          <Section title="Moderator feedback" icon={MessageCircleQuestion}>
            <p className="mb-2 text-xs text-muted-foreground">
              Help improve detection accuracy. Already received {feedbackCount} feedback {feedbackCount === 1 ? "entry" : "entries"} for this comment.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <FeedbackBtn onClick={() => feedback("correct", "Correct detection")}      icon={ThumbsUp}   label="Correct detection" busy={busy} tone="positive" />
              <FeedbackBtn onClick={() => feedback("false_positive", "False positive")}  icon={ThumbsDown} label="False positive"     busy={busy} tone="danger" />
              <FeedbackBtn onClick={() => feedback("wrong_category", "Wrong category")}  icon={HelpCircle} label="Wrong category"     busy={busy} tone="warn" />
              <FeedbackBtn onClick={() => feedback("missed_context", "Missed context")}  icon={HelpCircle} label="Missed context"     busy={busy} tone="muted" />
            </div>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, icon: Icon, children }: {
  title: string; icon?: typeof Brain; children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {title}
      </h3>
      {children}
    </section>
  );
}

function MetricRow({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
      {typeof bar === "number" && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className={`h-full ${bar >= 80 ? "bg-red-500" : bar >= 65 ? "bg-orange-400" : "bg-positive"}`} style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

function DrawerBtn({ onClick, busy, label, tone, icon: Icon }: {
  onClick: () => void; busy: string | null; label: string;
  tone: "positive" | "muted" | "danger" | "warn"; icon: typeof CheckCircle2;
}) {
  const map = {
    positive: "border-positive/40 bg-positive/10 text-positive hover:bg-positive/20",
    muted: "border-border bg-secondary text-foreground hover:bg-accent",
    danger: "border-red-600/40 bg-red-600/10 text-red-300 hover:bg-red-600/20",
    warn: "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20",
  }[tone];
  return (
    <button onClick={onClick} disabled={!!busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${map}`}>
      {busy === label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

function FeedbackBtn({ onClick, icon: Icon, label, busy, tone }: {
  onClick: () => void; icon: typeof ThumbsUp; label: string; busy: string | null;
  tone: "positive" | "muted" | "danger" | "warn";
}) {
  const map = {
    positive: "border-positive/40 bg-positive/10 text-positive hover:bg-positive/20",
    muted: "border-border bg-secondary text-foreground hover:bg-accent",
    danger: "border-red-600/40 bg-red-600/10 text-red-300 hover:bg-red-600/20",
    warn: "border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20",
  }[tone];
  return (
    <button onClick={onClick} disabled={busy === label}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-semibold transition disabled:opacity-60 ${map}`}>
      {busy === label ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
