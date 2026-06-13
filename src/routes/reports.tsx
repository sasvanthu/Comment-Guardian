
import { useMemo, useState } from "react";
import { Download, AlertOctagon, ThumbsUp, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Layout } from "@/components/Layout";
import { StatsCard } from "@/components/StatsCard";
import { buildDailySeries, type Platform } from "@/lib/mock-data";
import { useComments } from "@/lib/data";
import { AuditLogPanel } from "@/components/AuditLogPanel";

export default ReportsPage;

function ReportsPage() {
  const { comments } = useComments();
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [from, setFrom] = useState(() => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const filtered = useMemo(() => comments.filter((c) =>
    (platform === "all" || c.platform === platform) &&
    c.timestamp.slice(0, 10) >= from && c.timestamp.slice(0, 10) <= to,
  ), [comments, platform, from, to]);

  const daily = buildDailySeries(filtered);
  const byPlatform = (["twitter", "facebook", "instagram"] as Platform[]).map((p) => ({
    platform: p,
    toxic: filtered.filter((c) => c.platform === p && c.sentiment === "toxic").length,
    positive: filtered.filter((c) => c.platform === p && c.sentiment === "positive").length,
    neutral: filtered.filter((c) => c.platform === p && c.sentiment === "neutral").length,
  }));
  const stats = {
    total: filtered.length,
    toxic: filtered.filter((c) => c.sentiment === "toxic").length,
    positive: filtered.filter((c) => c.sentiment === "positive").length,
  };

  const exportCsv = () => {
    const rows = [["id","platform","author","sentiment","toxicity","timestamp","text"]];
    filtered.forEach((c) => rows.push([c.id, c.platform, c.author, c.sentiment, String(c.toxicity), c.timestamp, c.text.replace(/"/g, '""')]));
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `report_${from}_${to}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  const tooltipStyle = { background: "oklch(0.22 0.03 265)", border: "1px solid oklch(0.3 0.03 265)", borderRadius: 8 };

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Reports</h1>
          <p className="text-sm text-muted-foreground">Live trends from your moderation database.</p>
        </div>
        <button onClick={exportCsv} disabled={filtered.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-500 px-3 py-2 text-sm font-medium text-primary-foreground shadow-elegant disabled:opacity-50 hover:opacity-90">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </header>

      <div className="glass-panel mb-6 flex flex-wrap gap-3 rounded-2xl border border-border/60 p-4">
        <label className="text-sm"><span className="mr-2 text-muted-foreground">From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border bg-input px-2 py-1.5 text-sm" /></label>
        <label className="text-sm"><span className="mr-2 text-muted-foreground">To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border bg-input px-2 py-1.5 text-sm" /></label>
        <label className="text-sm"><span className="mr-2 text-muted-foreground">Platform</span>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as "all" | Platform)} className="rounded-md border bg-input px-2 py-1.5 text-sm capitalize">
            <option value="all">All</option><option value="twitter">Twitter</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option>
          </select></label>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StatsCard label="Total in range" value={stats.total} icon={MessageSquare} />
        <StatsCard label="Toxic" value={stats.toxic} icon={AlertOctagon} tone="toxic" />
        <StatsCard label="Positive" value={stats.positive} icon={ThumbsUp} tone="positive" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Daily toxic comments">
          <BarChart data={daily}>
            <XAxis dataKey="day" stroke="oklch(0.7 0.03 260)" fontSize={11} tickLine={false} axisLine={{ stroke: "oklch(0.3 0.005 250)" }} />
            <YAxis stroke="oklch(0.7 0.03 260)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="toxic" fill="oklch(0.65 0.23 22)" radius={[2, 2, 0, 0]} maxBarSize={14} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Platform comparison">
          <BarChart data={byPlatform}>
            <XAxis dataKey="platform" stroke="oklch(0.7 0.03 260)" fontSize={11} tickLine={false} axisLine={{ stroke: "oklch(0.3 0.005 250)" }} />
            <YAxis stroke="oklch(0.7 0.03 260)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="toxic" stackId="a" fill="oklch(0.65 0.23 22)" maxBarSize={20} />
            <Bar dataKey="neutral" stackId="a" fill="oklch(0.78 0.16 85)" maxBarSize={20} />
            <Bar dataKey="positive" stackId="a" fill="oklch(0.7 0.18 152)" maxBarSize={20} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Sentiment trend" className="lg:col-span-2">
          <LineChart data={daily}>
            <XAxis dataKey="day" stroke="oklch(0.7 0.03 260)" fontSize={11} tickLine={false} axisLine={{ stroke: "oklch(0.3 0.005 250)" }} />
            <YAxis stroke="oklch(0.7 0.03 260)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={tooltipStyle} /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="toxic" stroke="oklch(0.65 0.23 22)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="positive" stroke="oklch(0.7 0.18 152)" strokeWidth={1} dot={false} />
            <Line type="monotone" dataKey="neutral" stroke="oklch(0.78 0.16 85)" strokeWidth={1} dot={false} />
          </LineChart>
        </ChartCard>
      </div>

      <div className="mt-6"><AuditLogPanel limit={50} /></div>

    </Layout>
  );
}

function ChartCard({ title, children, className }: { title: string; children: React.ReactElement; className?: string }) {
  return (
    <div className={`glass-panel rounded-2xl border border-border/60 p-5 shadow-elegant ${className ?? ""}`}>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer></div>
    </div>
  );
}
