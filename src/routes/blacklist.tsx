
import { useMemo, useState } from "react";
import { Ban, Search, Download, Trash2, Plus, Loader2, AtSign, Hash } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { EmptyState } from "@/components/EmptyState";
import { formatDistanceToNow } from "date-fns";
import { useBlacklist, addBlacklist, removeBlacklist } from "@/lib/data";

export default BlacklistPage;

function BlacklistPage() {
  const { rows, loading, reload } = useBlacklist();
  const [q, setQ] = useState("");
  const [type, setType] = useState<"keyword" | "user_handle">("keyword");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    return rows.filter((r) => !s || r.value.toLowerCase().includes(s) || r.type.includes(s));
  }, [rows, q]);

  const submit = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      await addBlacklist(type, value);
      toast.success(`${type === "keyword" ? "Keyword" : "Handle"} added to blacklist`);
      setValue("");
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  };

  const onRemove = async (id: string) => {
    try { await removeBlacklist(id); toast.success("Removed"); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const exportCSV = () => {
    const csv = [["type","value","created_at"], ...rows.map((r) => [r.type, r.value, r.created_at])]
      .map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `blacklist-${Date.now()}.csv`; a.click();
  };

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Ban className="h-7 w-7 text-red-400" /> Blacklist
          </h1>
          <p className="text-sm text-muted-foreground">{rows.length} entries blocking comments before they reach you.</p>
        </div>
        <button onClick={exportCSV} disabled={rows.length === 0} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-2 text-sm font-medium disabled:opacity-50 hover:bg-accent">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </header>

      <div className="glass-panel mb-4 rounded-2xl border border-border/60 p-4 shadow-elegant">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex rounded-lg border border-border/60 bg-input p-1">
            <button onClick={() => setType("keyword")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${type === "keyword" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              <Hash className="h-3.5 w-3.5" /> Keyword
            </button>
            <button onClick={() => setType("user_handle")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm ${type === "user_handle" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}>
              <AtSign className="h-3.5 w-3.5" /> User handle
            </button>
          </div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder={type === "keyword" ? "e.g. spam-link.com" : "@username"}
            className="flex-1 rounded-md border bg-input px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <button onClick={() => void submit()} disabled={saving || !value.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-500 px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-60 hover:opacity-90">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search blacklist…" className="w-full rounded-md border bg-input py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
      </div>

      {!loading && rows.length === 0 ? (
        <EmptyState icon={Ban} title="No blacklist entries yet" description="Add a keyword or user handle to automatically block matching comments." action={{ label: "Focus input above", onClick: () => { const el = document.querySelector<HTMLInputElement>("input[placeholder^=\"e.g.\"], input[placeholder=\"@username\"]"); el?.focus(); } }} />
      ) : (
        <div className="glass-panel overflow-hidden rounded-2xl border border-border/60 shadow-elegant">
          <table className="w-full text-sm">
            <thead className="border-b border-border/60 bg-secondary/30 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Added</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">No entries match.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs text-primary">
                      {r.type === "keyword" ? <Hash className="h-3 w-3" /> : <AtSign className="h-3 w-3" />}
                      {r.type === "keyword" ? "Keyword" : "Handle"}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono">{r.value}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => void onRemove(r.id)} className="inline-flex items-center gap-1.5 rounded-md border border-toxic/40 bg-toxic/10 px-2.5 py-1 text-xs font-medium text-toxic hover:bg-toxic/20">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
