import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  MessageSquare, AlertOctagon, ThumbsUp, Activity, RefreshCw, Trash2,
  Ban, ShieldAlert, Languages, Plus, Inbox,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { StatsCard } from "@/components/StatsCard";
import { PlatformBadge } from "@/components/PlatformBadge";
import { EmptyState } from "@/components/EmptyState";
import { IngestDialog } from "@/components/IngestDialog";
import { AiSummaryWidget } from "@/components/AiSummaryWidget";
import { PlatformHealthWidget } from "@/components/PlatformHealthWidget";
import { buildDailySeries, buildLanguageDistribution } from "@/lib/types";
import { useComments, useBlacklist, useActivityLogs, deleteCommentsByIds } from "@/lib/data";
import { formatDistanceToNow } from "date-fns";
import { DataStagger, DataItem } from "@/components/motion/DataStagger";
import { IngestionStream } from "@/components/IngestionStream";
import { AuditLogPanel } from "@/components/AuditLogPanel";


export default Dashboard;

function Dashboard() {
  const { rows: dbRows, comments, allComments, loading, reload } = useComments();
  const { rows: blocked } = useBlacklist();
  const { logs } = useActivityLogs(30);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const stats = useMemo(() => {
    const toxic = comments.filter((c) => c.sentiment === "toxic").length;
    const positive = comments.filter((c) => c.sentiment === "positive").length;
    const neutral = comments.filter((c) => c.sentiment === "neutral").length;
    const spam = comments.filter((c) => c.categories.includes("spam") || c.categories.includes("scam")).length;
    const deleted = allComments.length - comments.length;
    return { total: comments.length, toxic, positive, neutral, spam, deleted };
  }, [comments, allComments]);

  const pieData = [
    { name: "Negative", value: stats.toxic, color: "oklch(0.65 0.23 22)" },
    { name: "Positive", value: stats.positive, color: "oklch(0.7 0.18 152)" },
    { name: "Neutral", value: stats.neutral, color: "oklch(0.78 0.16 85)" },
  ].filter((d) => d.value > 0);
  const langData = useMemo(() => buildLanguageDistribution(comments).slice(0, 8), [comments]);
  const dailyData = useMemo(() => buildDailySeries(comments), [comments]);

  const autoClean = async () => {
    const ids = comments.filter((c) => c.sentiment === "toxic").map((c) => c.id);
    if (!ids.length) { toast.info("No negative comments to delete"); return; }
    setBusy(true);
    try { await deleteCommentsByIds(ids); toast.success(`Removed ${ids.length} negative comments`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const isEmpty = !loading && comments.length === 0;

  return (
    <Layout>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">// trustlens / control_plane</p>
          <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-foreground md:text-[22px]">Operations Dashboard</h1>
          <p className="text-[12.5px] text-muted-foreground">Trust & safety telemetry across connected channels.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => void reload()} className="inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:border-foreground/25">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => setIngestOpen(true)} className="inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:border-foreground/25">
            <Plus className="h-3.5 w-3.5" /> Ingest
          </button>
          <Link to="/negative" className="inline-flex items-center gap-1.5 border border-neutral-warn/55 px-2.5 py-1.5 text-[12px] font-medium text-neutral-warn transition-colors hover:bg-foreground/[0.04]">
            <AlertOctagon className="h-3.5 w-3.5" /> Negative <span className="font-mono text-[10px] text-muted-foreground">· {stats.toxic}</span>
          </Link>
          <button onClick={autoClean} disabled={busy || stats.toxic === 0} className="inline-flex items-center gap-1.5 border border-toxic/55 px-2.5 py-1.5 text-[12px] font-medium text-toxic transition-colors hover:bg-toxic/10 disabled:opacity-50">
            <Trash2 className={`h-3.5 w-3.5 ${busy ? "animate-pulse" : ""}`} /> Purge negative
          </button>
        </div>
      </header>

      <div className="mb-4"><IngestionStream rows={dbRows} /></div>


      <DataStagger className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
        <DataItem><StatsCard label="Total Content Items" value={stats.total} icon={MessageSquare} hint="All channels" /></DataItem>
        <DataItem><StatsCard label="Positive" value={stats.positive} icon={ThumbsUp} tone="positive" /></DataItem>
        <DataItem><StatsCard label="Neutral" value={stats.neutral} icon={Activity} tone="neutral" /></DataItem>
        <DataItem><StatsCard label="Negative" value={stats.toxic} icon={AlertOctagon} tone="toxic" /></DataItem>
        <DataItem><StatsCard label="Deleted" value={stats.deleted} icon={Trash2} tone="toxic" hint="Lifetime" /></DataItem>
        <DataItem><StatsCard label="Blocked" value={blocked.length} icon={Ban} tone="toxic" /></DataItem>
        <DataItem><StatsCard label="Spam" value={stats.spam} icon={ShieldAlert} tone="neutral" /></DataItem>
      </DataStagger>


      {isEmpty ? (
        <div className="mt-5">
          <EmptyState
            icon={Inbox}
            title="No comments ingested yet"
            description="Connect a channel or ingest a sample payload to start populating moderation queues, sentiment charts, and the audit ledger."
            action={{ label: "Ingest first comment", onClick: () => setIngestOpen(true) }}
            quickActions={[
              { label: "Open Review Queue", hint: "Triage incoming items", href: "/review" },
              { label: "Configure Auto-Moderation", hint: "Rules & thresholds", href: "/moderation" },
              { label: "Connect a channel", hint: "Twitter · Facebook · IG", href: "/settings" },
            ]}
          />
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-5">
            <div className="lg:col-span-3"><AiSummaryWidget allRows={dbRows} comments={comments} /></div>
            <div className="lg:col-span-2"><PlatformHealthWidget allRows={dbRows} /></div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="border border-border bg-card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Sentiment</h2>
              <div className="h-64">
                {pieData.length === 0 ? <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No data</div> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" innerRadius={50} outerRadius={85} paddingAngle={3}>
                        {pieData.map((d) => <Cell key={d.name} fill={d.color} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "oklch(0.22 0.03 265)", border: "1px solid oklch(0.3 0.03 265)", borderRadius: 8 }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="border border-border bg-card p-4 lg:col-span-2">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <Languages className="h-4 w-4" /> Language Distribution
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={langData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.03 265)" />
                    <XAxis dataKey="name" stroke="oklch(0.7 0.02 265)" fontSize={11} />
                    <YAxis stroke="oklch(0.7 0.02 265)" fontSize={11} />
                    <Tooltip contentStyle={{ background: "oklch(0.22 0.03 265)", border: "1px solid oklch(0.3 0.03 265)", borderRadius: 8 }} />
                    <Bar dataKey="value" fill="oklch(0.65 0.22 290)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="border border-border bg-card p-4 lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Daily Moderation Activity</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyData}>
                    <XAxis dataKey="day" stroke="oklch(0.7 0.02 265)" fontSize={11} tickLine={false} axisLine={{ stroke: "oklch(0.3 0.005 250)" }} />
                    <YAxis stroke="oklch(0.7 0.02 265)" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "oklch(0.22 0.03 265)", border: "1px solid oklch(0.3 0.03 265)", borderRadius: 4, fontSize: 11 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="toxic" stroke="oklch(0.65 0.23 22)" strokeWidth={1} dot={false} />
                    <Line type="monotone" dataKey="positive" stroke="oklch(0.7 0.18 152)" strokeWidth={1} dot={false} />
                    <Line type="monotone" dataKey="neutral" stroke="oklch(0.78 0.16 85)" strokeWidth={1} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>


            <div className="border border-border bg-card p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-positive opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-positive" />
                </span>
                Real-Time Logs
                <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground">live</span>
              </h2>
              {logs.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">No activity yet — actions will appear here in real time.</p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto pr-1 text-xs">
                  {logs.slice(0, 12).map((l) => (
                    <li key={l.id} className="flex items-start gap-2 rounded-md border border-border/60 bg-secondary/30 p-2">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                        l.action === "block" ? "bg-red-500" : l.action === "delete" ? "bg-toxic" : "bg-positive"
                      }`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium uppercase tracking-wide">{l.action} · {l.platform}</p>
                        <p className="truncate text-muted-foreground">{l.reason}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(l.timestamp), { addSuffix: true })}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-4 border border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</h2>
            <ul className="divide-y divide-border/60">
              {comments.slice(0, 7).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-fuchsia-500 text-xs font-bold text-primary-foreground">
                    {c.author.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{c.author}</span>
                      <PlatformBadge platform={c.platform} />
                      <span className="rounded border border-primary/30 bg-primary/10 px-1.5 text-[10px] text-primary">{c.languageName}</span>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{c.text}</p>
                  </div>
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {formatDistanceToNow(new Date(c.timestamp), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4"><AuditLogPanel limit={40} /></div>
        </>
      )}

      <IngestDialog open={ingestOpen} onClose={() => setIngestOpen(false)} onSaved={reload} />
    </Layout>
  );
}
