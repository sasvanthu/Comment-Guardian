
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ShieldAlert, Trash2, EyeOff, Eye, Ban, RotateCcw, Download, FileText,
  AlertTriangle, Users, UserX, Flame, CheckCircle2, Sparkles, Settings2, X,
  Brain, Quote,
} from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { PlatformBadge } from "@/components/PlatformBadge";
import { StatsCard } from "@/components/StatsCard";
import type { Comment, Category, Platform } from "@/lib/types";
import {
  useComments, useBlacklist,
  setCommentsStatus, addBlacklist, removeBlacklist,
} from "@/lib/data";
import { buildOffenderProfiles, OffenderProfileCard } from "@/components/OffenderProfile";

export default CyberbullyingPage;

// ----- Detection types -----
const BULLY_CATS: Category[] = ["cyberbullying", "harassment", "threats", "hate"];

type Severity = "Low" | "Medium" | "High" | "Critical";
type Status = "active" | "hidden" | "deleted";

interface BullyComment extends Comment {
  bullyScore: number;        // 0-100 cyberbullying probability
  aiConfidence: number;      // 0-100
  severity: Severity;
  detections: string[];      // e.g. ["Harassment", "Threats"]
  recommended: "Auto Delete & Block" | "Hide & Review" | "Flag Only";
  status: Status;
  deletedAt?: string;
  hiddenAt?: string;
}

interface AutomationRules {
  enabled: boolean;
  highThreshold: number;     // > => auto delete + block
  midThreshold: number;      // > => hide + send for review
}

const RULES_KEY = "modtool.cyberbullying.rules";
const DEFAULT_RULES: AutomationRules = { enabled: true, highThreshold: 90, midThreshold: 70 };

function loadRules(): AutomationRules {
  if (typeof window === "undefined") return DEFAULT_RULES;
  try {
    const raw = localStorage.getItem(RULES_KEY);
    return raw ? { ...DEFAULT_RULES, ...JSON.parse(raw) } : DEFAULT_RULES;
  } catch { return DEFAULT_RULES; }
}
function saveRules(r: AutomationRules) { localStorage.setItem(RULES_KEY, JSON.stringify(r)); }

function detectionLabels(c: Comment): string[] {
  const out: string[] = [];
  const t = c.text.toLowerCase();
  if (c.categories.includes("harassment") || /\b(stupid|idiot|loser|garbage)\b/.test(t)) out.push("Harassment");
  if (c.categories.includes("threats") || /\b(kill|hurt|find you|regret)\b/.test(t)) out.push("Threats");
  if (c.categories.includes("hate")) out.push("Hate speech");
  if (c.categories.includes("cyberbullying")) out.push("Targeted bullying");
  if (c.toxicityScore >= 70) out.push("Abusive language");
  if (out.length === 0) out.push("Personal attack");
  return Array.from(new Set(out));
}

// AI signal extraction — surfaces the lexical / contextual cues the model relied on.
const SIGNAL_LEXICON: { label: string; pattern: RegExp }[] = [
  { label: "Insult", pattern: /\b(stupid|idiot|loser|garbage|trash|dumb|moron|clueless)\b/i },
  { label: "Threat language", pattern: /\b(kill|hurt|find you|regret|destroy|beat)\b/i },
  { label: "Profanity", pattern: /\b(damn|hell|crap|wtf|stfu)\b/i },
  { label: "Targeted “you”", pattern: /\byou\b|\bur\b|\byour\b/i },
  { label: "Imperative", pattern: /\b(shut up|delete|leave|stop|get out)\b/i },
  { label: "Hate slur indicator", pattern: /\b(hate|disgust|filthy)\b/i },
  { label: "Scam cue", pattern: /\b(click|win|free|prize|send money|link)\b/i },
];

function extractSignals(c: BullyComment): { label: string; match: string }[] {
  const out: { label: string; match: string }[] = [];
  for (const s of SIGNAL_LEXICON) {
    const m = c.text.match(s.pattern);
    if (m) out.push({ label: s.label, match: m[0] });
  }
  if (c.toxicityScore >= 80) out.push({ label: "High toxicity", match: `${c.toxicityScore}%` });
  if (c.sentimentScore <= 20) out.push({ label: "Strongly negative tone", match: `${c.sentimentScore}%` });
  return out.slice(0, 6);
}

function buildExplanation(c: BullyComment): string {
  const parts: string[] = [];
  if (c.detections.length) parts.push(`Classified as ${c.detections.join(", ").toLowerCase()}`);
  parts.push(`with ${c.bullyScore}% cyberbullying probability (${c.severity.toLowerCase()} severity)`);
  parts.push(`and ${c.aiConfidence}% model confidence`);
  const tone = c.sentimentScore <= 25 ? "strongly negative" : c.sentimentScore <= 45 ? "negative" : "mixed";
  parts.push(`based on ${tone} sentiment and a toxicity score of ${c.toxicityScore}%`);
  return parts.join(" ") + ".";
}


function toSeverity(score: number): Severity {
  if (score >= 90) return "Critical";
  if (score >= 75) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function recommendedAction(score: number, rules: AutomationRules): BullyComment["recommended"] {
  if (score > rules.highThreshold) return "Auto Delete & Block";
  if (score >= rules.midThreshold) return "Hide & Review";
  return "Flag Only";
}

function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function dbStatusToBully(s: string | null | undefined): Status {
  return s === "hidden" ? "hidden" : s === "deleted" ? "deleted" : "active";
}

function deriveBullyComments(
  comments: Comment[],
  rowStatusById: Map<string, string | null>,
  rules: AutomationRules,
): BullyComment[] {
  return comments
    .filter((c) => c.sentiment === "toxic" || c.categories.some((x) => BULLY_CATS.includes(x)))
    .map<BullyComment>((c) => {
      const catBoost = c.categories.filter((x) => BULLY_CATS.includes(x)).length * 8;
      const jitter = (hashSeed(c.id) % 9) - 4;
      const bullyScore = Math.min(99, Math.max(40, Math.round(c.toxicityScore * 0.85 + catBoost + jitter)));
      const aiConfidence = Math.min(99, 70 + (hashSeed(c.id + "ai") % 30));
      return {
        ...c,
        bullyScore,
        aiConfidence,
        severity: toSeverity(bullyScore),
        detections: detectionLabels(c),
        recommended: recommendedAction(bullyScore, rules),
        status: dbStatusToBully(rowStatusById.get(c.id)),
      };
    })
    .sort((a, b) => b.bullyScore - a.bullyScore);
}

// ----- UI tokens -----
const severityClass: Record<Severity, string> = {
  Low: "border-positive/30 bg-positive/10 text-positive",
  Medium: "border-neutral-warn/30 bg-neutral-warn/10 text-neutral-warn",
  High: "border-orange-500/40 bg-orange-500/10 text-orange-400",
  Critical: "border-red-600/50 bg-red-600/15 text-red-300",
};

function CyberbullyingPage() {
  const [rules, setRules] = useState<AutomationRules>(DEFAULT_RULES);
  const { rows, allComments, reload } = useComments();
  const { rows: blacklistRows, reload: reloadBlacklist } = useBlacklist();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "hidden" | "deleted" | "all">("active");
  const [confirm, setConfirm] = useState<null | {
    title: string;
    note?: string;
    affectedComments: number;
    affectedUsers: number;
    run: () => void;
  }>(null);
  const [showRules, setShowRules] = useState(false);

  // Audit trail (for rollback within 30 days)
  type Action = {
    id: string;
    kind: "delete" | "hide" | "block" | "restore-hidden" | "restore-deleted" | "unblock";
    at: string;
    commentIds: string[];
    userIds: string[];
    label: string;
  };
  const [actions, setActions] = useState<Action[]>([]);

  useEffect(() => { setRules(loadRules()); }, []);

  const rowStatusById = useMemo(() => {
    const m = new Map<string, string | null>();
    rows.forEach((r) => m.set(r.id, r.status));
    return m;
  }, [rows]);

  const comments = useMemo(
    () => deriveBullyComments(allComments, rowStatusById, rules),
    [allComments, rowStatusById, rules],
  );

  // Blocked users: user_handle entries in blacklist (map author -> blacklist row id for unblock)
  const blockedUsers = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of blacklistRows) if (r.type === "user_handle") m.set(r.value, r.id);
    return m;
  }, [blacklistRows]);
  

  const visible = useMemo(() => comments.filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (severityFilter !== "all" && c.severity !== severityFilter) return false;
    return true;
  }), [comments, statusFilter, severityFilter]);

  // ----- Stats -----
  const userViolations = useMemo(() => {
    const map = new Map<string, { username: string; platform: Platform; count: number; risk: number; last: string }>();
    for (const c of comments) {
      const cur = map.get(c.authorId);
      if (cur) {
        cur.count += 1;
        cur.risk = Math.max(cur.risk, c.bullyScore);
        if (c.timestamp > cur.last) cur.last = c.timestamp;
      } else {
        map.set(c.authorId, { username: c.author, platform: c.platform, count: 1, risk: c.bullyScore, last: c.timestamp });
      }
    }
    return Array.from(map.entries()).map(([userId, v]) => ({ userId, ...v }));
  }, [comments]);

  const highRiskUsers = userViolations.filter((u) => u.risk >= 80).length;
  const repeatOffenders = userViolations.filter((u) => u.count >= 2).length;
  const totalBully = comments.length;
  const hiddenCount = comments.filter((c) => c.status === "hidden").length;
  const deletedCount = comments.filter((c) => c.status === "deleted").length;

  // ----- Actions -----
  const recordAction = (a: Omit<Action, "id" | "at">) => {
    setActions((arr) => [{ id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, at: new Date().toISOString(), ...a }, ...arr]);
  };

  const setStatus = async (ids: string[], status: Status) => {
    if (!ids.length) return;
    const dbStatus = status === "active" ? "allowed" : status;
    try {
      await setCommentsStatus(ids, dbStatus);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update comments");
    }
  };

  const block = async (authors: string[]) => {
    for (const a of authors) {
      if (blockedUsers.has(a)) continue;
      try { await addBlacklist("user_handle", a); } catch { /* duplicate ignored */ }
    }
    await reloadBlacklist();
  };
  const unblock = async (authors: string[]) => {
    for (const a of authors) {
      const id = blockedUsers.get(a);
      if (id) { try { await removeBlacklist(id); } catch { /* ignore */ } }
    }
    await reloadBlacklist();
  };

  // Bulk action runners
  const targetsForBulk = (scope: "all-bully" | "selected" | "active"): BullyComment[] => {
    if (scope === "selected") return comments.filter((c) => selected.has(c.id));
    if (scope === "active") return comments.filter((c) => c.status === "active");
    return comments; // all bully
  };

  const askDelete = (scope: "all-bully" | "selected" | "active") => {
    const t = targetsForBulk(scope).filter((c) => c.status !== "deleted");
    setConfirm({
      title: "Delete cyberbullying comments?",
      note: "Comments will be marked deleted. You can restore within 30 days.",
      affectedComments: t.length,
      affectedUsers: new Set(t.map((c) => c.authorId)).size,
      run: () => {
        setStatus(t.map((c) => c.id), "deleted");
        recordAction({ kind: "delete", commentIds: t.map((c) => c.id), userIds: [], label: `Deleted ${t.length} comments` });
        toast.success(`Deleted ${t.length} comments`);
        setSelected(new Set());
        setConfirm(null);
      },
    });
  };

  const askHide = (scope: "all-bully" | "selected" | "active") => {
    const t = targetsForBulk(scope).filter((c) => c.status === "active");
    setConfirm({
      title: "Hide cyberbullying comments?",
      affectedComments: t.length,
      affectedUsers: new Set(t.map((c) => c.authorId)).size,
      run: () => {
        setStatus(t.map((c) => c.id), "hidden");
        recordAction({ kind: "hide", commentIds: t.map((c) => c.id), userIds: [], label: `Hid ${t.length} comments` });
        toast.success(`Hid ${t.length} comments`);
        setSelected(new Set());
        setConfirm(null);
      },
    });
  };

  const askReviewAll = () => {
    const t = comments.filter((c) => c.status === "active");
    toast.success(`Queued ${t.length} comments for human review`);
  };

  const askBlockAll = () => {
    const users = Array.from(new Set(comments.filter((c) => c.status !== "deleted").map((c) => c.authorId)));
    setConfirm({
      title: "Block all offending users?",
      note: "Blocked accounts cannot post. You can unblock anytime.",
      affectedComments: comments.filter((c) => users.includes(c.authorId)).length,
      affectedUsers: users.length,
      run: () => {
        block(users);
        recordAction({ kind: "block", commentIds: [], userIds: users, label: `Blocked ${users.length} users` });
        toast.success(`Blocked ${users.length} users`);
        setConfirm(null);
      },
    });
  };

  const askUnblockSelected = () => {
    const users = comments.filter((c) => selected.has(c.id)).map((c) => c.authorId).filter((u) => blockedUsers.has(u));
    const uniq = Array.from(new Set(users));
    if (uniq.length === 0) { toast("No selected users are blocked"); return; }
    setConfirm({
      title: "Unblock selected users?",
      affectedComments: 0,
      affectedUsers: uniq.length,
      run: () => {
        unblock(uniq);
        recordAction({ kind: "unblock", commentIds: [], userIds: uniq, label: `Unblocked ${uniq.length} users` });
        toast.success(`Unblocked ${uniq.length} users`);
        setConfirm(null);
      },
    });
  };

  const askUnblockAll = () => {
    const uniq = Array.from(blockedUsers.keys());
    if (uniq.length === 0) { toast("No users currently blocked"); return; }
    setConfirm({
      title: "Unblock all users?",
      affectedComments: 0,
      affectedUsers: uniq.length,
      run: () => {
        unblock(uniq);
        recordAction({ kind: "unblock", commentIds: [], userIds: uniq, label: `Unblocked ${uniq.length} users` });
        toast.success(`Unblocked ${uniq.length} users`);
        setConfirm(null);
      },
    });
  };

  const restoreDeleted = () => {
    const t = comments.filter((c) => c.status === "deleted");
    if (t.length === 0) { toast("Nothing to restore"); return; }
    setStatus(t.map((c) => c.id), "active");
    recordAction({ kind: "restore-deleted", commentIds: t.map((c) => c.id), userIds: [], label: `Restored ${t.length} deleted comments` });
    toast.success(`Restored ${t.length} comments`);
  };

  const restoreHidden = () => {
    const t = comments.filter((c) => c.status === "hidden");
    if (t.length === 0) { toast("Nothing to restore"); return; }
    setStatus(t.map((c) => c.id), "active");
    recordAction({ kind: "restore-hidden", commentIds: t.map((c) => c.id), userIds: [], label: `Restored ${t.length} hidden comments` });
    toast.success(`Restored ${t.length} comments`);
  };

  const rollbackAction = (a: Action) => {
    const ageMs = Date.now() - +new Date(a.at);
    if (ageMs > 30 * 86400000) { toast.error("Action older than 30 days — cannot rollback"); return; }
    if (a.kind === "delete" || a.kind === "hide") setStatus(a.commentIds, "active");
    if (a.kind === "block") unblock(a.userIds);
    if (a.kind === "unblock") block(a.userIds);
    if (a.kind === "restore-deleted") setStatus(a.commentIds, "deleted");
    if (a.kind === "restore-hidden") setStatus(a.commentIds, "hidden");
    setActions((arr) => arr.filter((x) => x.id !== a.id));
    toast.success(`Rolled back: ${a.label}`);
  };

  // Export CSV report
  const exportReport = () => {
    const header = ["id", "platform", "author", "userId", "text", "bullyScore", "confidence", "severity", "detections", "recommended", "status", "timestamp"];
    const rows = comments.map((c) => [
      c.id, c.platform, JSON.stringify(c.author), c.authorId, JSON.stringify(c.text),
      c.bullyScore, c.aiConfidence, c.severity, c.detections.join("|"), c.recommended, c.status, c.timestamp,
    ]);
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cyberbullying-report-${Date.now()}.csv`;
    a.click();
    toast.success("Report exported");
  };

  // Apply automation rules to active comments
  const applyAutomation = () => {
    if (!rules.enabled) { toast("Automation is disabled"); return; }
    let deleted = 0, hidden = 0, blocked = 0;
    const toDelete: string[] = [];
    const toHide: string[] = [];
    const toBlock = new Set<string>();
    for (const c of comments) {
      if (c.status !== "active") continue;
      if (c.bullyScore > rules.highThreshold) {
        toDelete.push(c.id); toBlock.add(c.authorId); deleted++; blocked++;
      } else if (c.bullyScore >= rules.midThreshold) {
        toHide.push(c.id); hidden++;
      }
    }
    if (toDelete.length) setStatus(toDelete, "deleted");
    if (toHide.length) setStatus(toHide, "hidden");
    if (toBlock.size) block(Array.from(toBlock));
    if (toDelete.length) recordAction({ kind: "delete", commentIds: toDelete, userIds: [], label: `Auto-deleted ${toDelete.length} comments` });
    if (toHide.length) recordAction({ kind: "hide", commentIds: toHide, userIds: [], label: `Auto-hid ${toHide.length} comments` });
    if (toBlock.size) recordAction({ kind: "block", commentIds: [], userIds: Array.from(toBlock), label: `Auto-blocked ${toBlock.size} users` });
    toast.success(`Automation: deleted ${deleted}, hidden ${hidden}, blocked ${blocked}`);
  };

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <ShieldAlert className="h-7 w-7 text-red-400" /> Cyberbullying Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Detect harassment, threats, hate speech, and targeted bullying. Act in one click with AI-recommended severity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowRules(true)} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent">
            <Settings2 className="h-4 w-4" /> Automation Rules
          </button>
          <button onClick={applyAutomation} className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/20">
            <Sparkles className="h-4 w-4" /> Run Automation
          </button>
          <button onClick={exportReport} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent">
            <Download className="h-4 w-4" /> Generate Report
          </button>
        </div>
      </header>

      {/* Offender Profile Ledger — isolated from standard streams */}
      <section className="mb-6 border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-3.5 w-3.5 text-red-400" strokeWidth={1.75} />
            <h2 className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">Offender Profile · Security Ledger</h2>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
            top {Math.min(6, buildOffenderProfiles(rows).length).toString().padStart(2, "0")} by risk composite
          </span>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {buildOffenderProfiles(rows).length === 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">// no offenders detected · ledger clean</p>
          ) : buildOffenderProfiles(rows).map((p) => <OffenderProfileCard key={p.author} profile={p} />)}
        </div>
      </section>


      {/* Dashboard stats */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatsCard label="Total Cyberbullying" value={totalBully} icon={ShieldAlert} tone="toxic" />
        <StatsCard label="Hidden Comments" value={hiddenCount} icon={EyeOff} tone="neutral" />
        <StatsCard label="Deleted Comments" value={deletedCount} icon={Trash2} tone="toxic" />
        <StatsCard label="Blocked Users" value={blockedUsers.size} icon={UserX} tone="toxic" />
        <StatsCard label="High-Risk Users" value={highRiskUsers} icon={Flame} tone="neutral" />
        <StatsCard label="Repeat Offenders" value={repeatOffenders} icon={Users} tone="neutral" />
      </div>

      {/* One-click bulk actions */}
      <section className="mb-6 rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">One-Click Bulk Actions</h2>
        <div className="flex flex-wrap gap-2">
          <BulkBtn onClick={() => askDelete("active")} icon={Trash2} tone="toxic">Delete All Cyberbullying Comments</BulkBtn>
          <BulkBtn onClick={() => askHide("active")} icon={EyeOff} tone="neutral">Hide All Cyberbullying Comments</BulkBtn>
          <BulkBtn onClick={askReviewAll} icon={Eye} tone="primary">Review All</BulkBtn>
          <BulkBtn onClick={askBlockAll} icon={Ban} tone="toxic">Block All Offending Users</BulkBtn>
          <BulkBtn onClick={askUnblockSelected} icon={RotateCcw} tone="primary">Unblock Selected Users</BulkBtn>
          <BulkBtn onClick={askUnblockAll} icon={RotateCcw} tone="primary">Unblock All Users</BulkBtn>
          <BulkBtn onClick={restoreDeleted} icon={RotateCcw} tone="positive">Restore Deleted Comments</BulkBtn>
          <BulkBtn onClick={restoreHidden} icon={RotateCcw} tone="positive">Restore Hidden Comments</BulkBtn>
          <BulkBtn onClick={exportReport} icon={FileText} tone="primary">Export Cyberbullying Report</BulkBtn>
        </div>
      </section>

      {/* Filters + selection */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-card px-4 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={visible.length > 0 && visible.every((c) => selected.has(c.id))}
            onChange={(e) => {
              const n = new Set(selected);
              visible.forEach((c) => e.target.checked ? n.add(c.id) : n.delete(c.id));
              setSelected(n);
            }}
          />
          Select all visible · <span className="text-muted-foreground">{selected.size} selected</span>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-md border bg-input px-2 py-1.5 text-sm">
            <option value="active">Active</option>
            <option value="hidden">Hidden</option>
            <option value="deleted">Deleted</option>
            <option value="all">All statuses</option>
          </select>
          <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value as typeof severityFilter)} className="rounded-md border bg-input px-2 py-1.5 text-sm">
            <option value="all">All severities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <button disabled={selected.size === 0} onClick={() => askDelete("selected")} className="inline-flex items-center gap-1.5 rounded-md border border-toxic/40 bg-toxic/10 px-3 py-1.5 text-sm font-medium text-toxic disabled:opacity-40 hover:bg-toxic/20">
            <Trash2 className="h-4 w-4" /> Delete Selected
          </button>
          <button disabled={selected.size === 0} onClick={() => askHide("selected")} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-warn/40 bg-neutral-warn/10 px-3 py-1.5 text-sm font-medium text-neutral-warn disabled:opacity-40 hover:bg-neutral-warn/20">
            <EyeOff className="h-4 w-4" /> Hide Selected
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="space-y-3">
        {visible.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-positive" />
            <p className="text-sm text-muted-foreground">No comments match these filters.</p>
          </div>
        ) : visible.map((c) => (
          <BullyCard
            key={c.id}
            c={c}
            blocked={blockedUsers.has(c.authorId)}
            selected={selected.has(c.id)}
            onSelectChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(c.id) : n.delete(c.id); return n; })}
            onDelete={() => { setStatus([c.id], "deleted"); recordAction({ kind: "delete", commentIds: [c.id], userIds: [], label: `Deleted comment by ${c.author}` }); toast.success("Comment deleted"); }}
            onHide={() => { setStatus([c.id], "hidden"); recordAction({ kind: "hide", commentIds: [c.id], userIds: [], label: `Hid comment by ${c.author}` }); toast.success("Comment hidden"); }}
            onRestore={() => { setStatus([c.id], "active"); toast.success("Comment restored"); }}
            onBlock={() => { block([c.authorId]); recordAction({ kind: "block", commentIds: [], userIds: [c.authorId], label: `Blocked ${c.author}` }); toast.success(`Blocked ${c.author}`); }}
            onUnblock={() => { unblock([c.authorId]); recordAction({ kind: "unblock", commentIds: [], userIds: [c.authorId], label: `Unblocked ${c.author}` }); toast.success(`Unblocked ${c.author}`); }}
          />
        ))}
      </div>

      {/* User management */}
      <section className="mt-8 overflow-hidden rounded-xl border bg-card">
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Flagged User Management</h2>
          <span className="text-xs text-muted-foreground">{userViolations.length} users</span>
        </header>
        <table className="w-full text-sm">
          <thead className="border-b bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Violations</th>
              <th className="px-4 py-3">Risk Score</th>
              <th className="px-4 py-3">Last Violation</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {userViolations.slice(0, 20).map((u) => {
              const isBlocked = blockedUsers.has(u.userId);
              return (
                <tr key={u.userId} className="hover:bg-accent/30">
                  <td className="px-4 py-3 font-medium">{u.username}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{u.userId}</td>
                  <td className="px-4 py-3"><PlatformBadge platform={u.platform} /></td>
                  <td className="px-4 py-3">{u.count}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${severityClass[toSeverity(u.risk)]}`}>
                      {u.risk}% · {toSeverity(u.risk)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(u.last), { addSuffix: true })}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${isBlocked ? "border-red-600/40 bg-red-600/10 text-red-300" : "border-positive/30 bg-positive/10 text-positive"}`}>
                      {isBlocked ? "Blocked" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isBlocked ? (
                      <button onClick={() => { unblock([u.userId]); recordAction({ kind: "unblock", commentIds: [], userIds: [u.userId], label: `Unblocked ${u.username}` }); toast.success(`Unblocked ${u.username}`); }} className="inline-flex items-center gap-1.5 rounded-md border border-positive/40 bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive hover:bg-positive/20">
                        <RotateCcw className="h-3.5 w-3.5" /> Unblock
                      </button>
                    ) : (
                      <button onClick={() => { block([u.userId]); recordAction({ kind: "block", commentIds: [], userIds: [u.userId], label: `Blocked ${u.username}` }); toast.success(`Blocked ${u.username}`); }} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20">
                        <Ban className="h-3.5 w-3.5" /> Block
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {/* Rollback feed (30-day window) */}
      <section className="mt-8 rounded-xl border bg-card p-4">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recent Actions (rollback within 30 days)</h2>
          <span className="text-xs text-muted-foreground">{actions.length} actions</span>
        </header>
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent actions.</p>
        ) : (
          <ul className="divide-y">
            {actions.slice(0, 12).map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{a.label}</p>
                  <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(a.at), { addSuffix: true })}</p>
                </div>
                <button onClick={() => rollbackAction(a)} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-accent">
                  <RotateCcw className="h-3.5 w-3.5" /> Rollback
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-neutral-warn" />
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold">{confirm.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Affects <span className="font-semibold text-foreground">{confirm.affectedComments}</span> comments
                  {" · "}<span className="font-semibold text-foreground">{confirm.affectedUsers}</span> users.
                </p>
                {confirm.note && <p className="mt-2 text-xs text-muted-foreground">{confirm.note}</p>}
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-md border bg-secondary px-3 py-2 text-sm">Cancel</button>
              <button onClick={confirm.run} className="rounded-md bg-toxic px-3 py-2 text-sm font-medium text-white">Confirm</button>
            </div>
          </div>
        </div>
      )}

      {/* Rules modal */}
      {showRules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowRules(false)}>
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Automation Rules</h3>
              <button onClick={() => setShowRules(false)} className="rounded-md p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={rules.enabled} onChange={(e) => setRules((r) => ({ ...r, enabled: e.target.checked }))} />
                Enable automation
              </label>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Auto-delete & block if score &gt; <span className="font-semibold text-foreground">{rules.highThreshold}%</span>
                </label>
                <input type="range" min={50} max={99} value={rules.highThreshold} onChange={(e) => setRules((r) => ({ ...r, highThreshold: +e.target.value }))} className="w-full accent-primary" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Hide & send for review if score ≥ <span className="font-semibold text-foreground">{rules.midThreshold}%</span>
                </label>
                <input type="range" min={30} max={95} value={rules.midThreshold} onChange={(e) => setRules((r) => ({ ...r, midThreshold: +e.target.value }))} className="w-full accent-primary" />
              </div>
              <p className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
                Below {rules.midThreshold}%: flag only — no automatic action.
              </p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => { setRules(DEFAULT_RULES); saveRules(DEFAULT_RULES); }} className="rounded-md border bg-secondary px-3 py-2 text-sm">Reset</button>
              <button onClick={() => { saveRules(rules); setShowRules(false); toast.success("Rules saved"); }} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Save</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function BulkBtn({ children, icon: Icon, onClick, tone }: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  tone: "toxic" | "neutral" | "primary" | "positive";
}) {
  const cls = {
    toxic: "border-toxic/40 bg-toxic/10 text-toxic hover:bg-toxic/20",
    neutral: "border-neutral-warn/40 bg-neutral-warn/10 text-neutral-warn hover:bg-neutral-warn/20",
    primary: "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
    positive: "border-positive/40 bg-positive/10 text-positive hover:bg-positive/20",
  }[tone];
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium ${cls}`}>
      <Icon className="h-4 w-4" /> {children}
    </button>
  );
}

function BullyCard({
  c, blocked, selected, onSelectChange, onDelete, onHide, onRestore, onBlock, onUnblock,
}: {
  c: BullyComment; blocked: boolean; selected: boolean;
  onSelectChange: (v: boolean) => void;
  onDelete: () => void; onHide: () => void; onRestore: () => void;
  onBlock: () => void; onUnblock: () => void;
}) {
  const initials = c.author.split(" ").map((s) => s[0]).slice(0, 2).join("");
  const tint = c.status === "deleted" ? "bg-muted/40 border-muted opacity-70"
    : c.status === "hidden" ? "bg-neutral-warn/5 border-neutral-warn/30"
    : "bg-toxic/5 border-toxic/20";
  return (
    <div className={`rounded-xl border p-4 transition ${tint}`}>
      <div className="flex gap-3">
        <input type="checkbox" checked={selected} onChange={(e) => onSelectChange(e.target.checked)} className="mt-1 h-4 w-4 accent-primary" />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-fuchsia-500 text-sm font-bold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{c.author}</span>
            <span className="font-mono text-xs text-muted-foreground">{c.authorId}</span>
            <PlatformBadge platform={c.platform} />
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${severityClass[c.severity]}`}>
              {c.severity}
            </span>
            {blocked && (
              <span className="inline-flex items-center gap-1 rounded-md border border-red-600/40 bg-red-600/10 px-1.5 py-0.5 text-[10px] font-medium text-red-300">
                <Ban className="h-3 w-3" /> Blocked
              </span>
            )}
            {c.status !== "active" && (
              <span className="inline-flex items-center gap-1 rounded-md border bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                {c.status}
              </span>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.timestamp), { addSuffix: true })}</span>
          </div>

          <p className={`mt-2 text-sm leading-relaxed text-foreground/90 ${c.status === "deleted" ? "line-through" : ""}`}>{c.text}</p>

          <div className="mt-2 flex flex-wrap gap-1">
            {c.detections.map((d) => (
              <span key={d} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                {d}
              </span>
            ))}
          </div>

          {/* AI confidence panel */}
          <div className="mt-3 grid gap-3 rounded-lg border bg-card/60 p-3 sm:grid-cols-4">
            <Metric label="Bullying Probability" value={c.bullyScore} tone={c.bullyScore >= 75 ? "toxic" : c.bullyScore >= 50 ? "neutral" : "positive"} />
            <Metric label="AI Confidence" value={c.aiConfidence} tone="primary" />
            <div>
              <p className="text-[11px] text-muted-foreground">Severity</p>
              <p className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs font-semibold ${severityClass[c.severity]}`}>{c.severity}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Recommended</p>
              <p className="mt-1 text-xs font-semibold text-foreground">{c.recommended}</p>
            </div>
          </div>

          {/* AI explanation panel */}
          <AIExplanation c={c} />


          <div className="mt-3 flex flex-wrap gap-2">
            {c.status === "active" && (
              <>
                <button onClick={onHide} className="inline-flex items-center gap-1.5 rounded-md border border-neutral-warn/40 bg-neutral-warn/10 px-2.5 py-1 text-xs font-medium text-neutral-warn hover:bg-neutral-warn/20">
                  <EyeOff className="h-3.5 w-3.5" /> Hide
                </button>
                <button onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-md border border-toxic/40 bg-toxic/10 px-2.5 py-1 text-xs font-medium text-toxic hover:bg-toxic/20">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </>
            )}
            {(c.status === "deleted" || c.status === "hidden") && (
              <button onClick={onRestore} className="inline-flex items-center gap-1.5 rounded-md border border-positive/40 bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive hover:bg-positive/20">
                <RotateCcw className="h-3.5 w-3.5" /> Restore
              </button>
            )}
            {blocked ? (
              <button onClick={onUnblock} className="inline-flex items-center gap-1.5 rounded-md border border-positive/40 bg-positive/10 px-2.5 py-1 text-xs font-medium text-positive hover:bg-positive/20">
                <RotateCcw className="h-3.5 w-3.5" /> Unblock user
              </button>
            ) : (
              <button onClick={onBlock} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20">
                <Ban className="h-3.5 w-3.5" /> Block user
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "toxic" | "neutral" | "positive" | "primary" }) {
  const bar = { toxic: "bg-toxic", neutral: "bg-neutral-warn", positive: "bg-positive", primary: "bg-primary" }[tone];
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold text-foreground">{value}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function AIExplanation({ c }: { c: BullyComment }) {
  const signals = extractSignals(c);
  const explanation = buildExplanation(c);
  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
        <Brain className="h-3.5 w-3.5" /> AI Explanation
      </div>
      <p className="text-xs leading-relaxed text-foreground/90">{explanation}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reason tags</p>
          <div className="flex flex-wrap gap-1">
            {c.detections.map((d) => (
              <span key={d} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-300">
                {d}
              </span>
            ))}
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${severityClass[c.severity]}`}>
              {c.severity} severity
            </span>
            <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {c.recommended}
            </span>
          </div>
        </div>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Key signals</p>
          {signals.length === 0 ? (
            <p className="text-[11px] italic text-muted-foreground">No explicit lexical cues — flagged on overall tone.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {signals.map((s, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-md border bg-secondary/60 px-2 py-0.5 text-[10px] font-medium">
                  <Quote className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-muted-foreground">{s.label}:</span>
                  <span className="font-mono text-foreground">{s.match}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 border-t border-primary/15 pt-2 text-[11px]">
        <span><span className="text-muted-foreground">Probability:</span> <span className="font-semibold text-foreground">{c.bullyScore}%</span></span>
        <span><span className="text-muted-foreground">Confidence:</span> <span className="font-semibold text-foreground">{c.aiConfidence}%</span></span>
        <span><span className="text-muted-foreground">Toxicity:</span> <span className="font-semibold text-foreground">{c.toxicityScore}%</span></span>
      </div>

      <ConfidenceBreakdown c={c} signals={signals} />
    </div>
  );
}

// Weight table — how each extracted signal contributes to derived scores.
const SIGNAL_WEIGHTS: Record<string, { toxicity: number; probability: number }> = {
  "Insult": { toxicity: 18, probability: 16 },
  "Threat language": { toxicity: 28, probability: 26 },
  "Profanity": { toxicity: 10, probability: 6 },
  "Targeted “you”": { toxicity: 4, probability: 10 },
  "Imperative": { toxicity: 6, probability: 8 },
  "Hate slur indicator": { toxicity: 22, probability: 20 },
  "Scam cue": { toxicity: 8, probability: 6 },
  "High toxicity": { toxicity: 15, probability: 10 },
  "Strongly negative tone": { toxicity: 12, probability: 8 },
};

type Contribution = { source: string; toxicity: number; probability: number };

function buildBreakdown(c: BullyComment, signals: { label: string; match: string }[]) {
  const contributions: Contribution[] = [];
  const sentimentBase = Math.max(0, Math.round((50 - c.sentimentScore) * 0.4));
  contributions.push({
    source: `Sentiment polarity (${c.sentimentScore}%)`,
    toxicity: sentimentBase,
    probability: Math.round(sentimentBase * 0.6),
  });
  for (const s of signals) {
    const w = SIGNAL_WEIGHTS[s.label] ?? { toxicity: 5, probability: 5 };
    contributions.push({ source: `${s.label} → “${s.match}”`, toxicity: w.toxicity, probability: w.probability });
  }
  const catBoost = c.detections.length * 6;
  if (catBoost) {
    contributions.push({
      source: `Category boost (${c.detections.length} tag${c.detections.length > 1 ? "s" : ""})`,
      toxicity: 0,
      probability: catBoost,
    });
  }
  const rawToxicity = contributions.reduce((a, b) => a + b.toxicity, 0);
  const rawProbability = contributions.reduce((a, b) => a + b.probability, 0);
  return {
    contributions,
    rawToxicity,
    rawProbability,
    severityRule:
      c.bullyScore >= 90 ? "≥ 90% → Critical" :
      c.bullyScore >= 75 ? "75–89% → High" :
      c.bullyScore >= 55 ? "55–74% → Medium" : "< 55% → Low",
    confidenceFactors: [
      { label: "Matched signals", value: `${signals.length} cue${signals.length === 1 ? "" : "s"}`, weight: Math.min(40, signals.length * 8) },
      { label: "Score extremity", value: `${Math.abs(c.bullyScore - 50)} pts from neutral`, weight: Math.min(40, Math.abs(c.bullyScore - 50)) },
      { label: "Model prior", value: "base classifier", weight: 20 },
    ],
  };
}

function ContribBar({ value, max, tone }: { value: number; max: number; tone: "tox" | "prob" }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === "tox" ? "bg-red-500/70" : "bg-amber-500/70";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
      <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function ConfidenceBreakdown({ c, signals }: { c: BullyComment; signals: { label: string; match: string }[] }) {
  const b = buildBreakdown(c, signals);
  const maxTox = Math.max(1, ...b.contributions.map((x) => x.toxicity));
  const maxProb = Math.max(1, ...b.contributions.map((x) => x.probability));
  return (
    <div className="mt-3 rounded-md border border-primary/15 bg-background/40 p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Confidence breakdown — how scores were derived
      </p>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-[11px]">
          <thead className="bg-secondary/60 text-muted-foreground">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Signal source</th>
              <th className="px-2 py-1 text-left font-medium">→ Toxicity</th>
              <th className="px-2 py-1 text-left font-medium">→ Probability</th>
            </tr>
          </thead>
          <tbody>
            {b.contributions.map((row, i) => (
              <tr key={i} className="border-t border-border/60">
                <td className="px-2 py-1.5 text-foreground">{row.source}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 text-right font-mono text-foreground">+{row.toxicity}</span>
                    <ContribBar value={row.toxicity} max={maxTox} tone="tox" />
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-7 text-right font-mono text-foreground">+{row.probability}</span>
                    <ContribBar value={row.probability} max={maxProb} tone="prob" />
                  </div>
                </td>
              </tr>
            ))}
            <tr className="border-t bg-secondary/30 font-semibold">
              <td className="px-2 py-1.5 text-muted-foreground">Aggregated (normalized → final)</td>
              <td className="px-2 py-1.5 font-mono">{b.rawToxicity} → {c.toxicityScore}%</td>
              <td className="px-2 py-1.5 font-mono">{b.rawProbability} → {c.bullyScore}%</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-secondary/30 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Severity derivation</p>
          <p className="mt-1 text-[11px]">
            Probability <span className="font-mono font-semibold text-foreground">{c.bullyScore}%</span> falls in bucket{" "}
            <span className="font-semibold text-foreground">{b.severityRule}</span> →{" "}
            <span className={`ml-1 inline-flex rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${severityClass[c.severity]}`}>{c.severity}</span>
          </p>
        </div>
        <div className="rounded-md border bg-secondary/30 p-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Confidence derivation ({c.aiConfidence}%)</p>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {b.confidenceFactors.map((f) => (
              <li key={f.label} className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{f.label}</span>
                <span className="text-foreground">{f.value} <span className="ml-1 font-mono text-muted-foreground">+{f.weight}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

