
import { useMemo, useState } from "react";
import { Trash2, Download, AlertOctagon, Filter, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { CommentCard } from "@/components/CommentCard";
import { EmptyState } from "@/components/EmptyState";
import { useComments, deleteCommentsByIds } from "@/lib/data";
import type { Category, Platform } from "@/lib/types";

export default NegativePage;

const CATEGORIES: Category[] = ["toxic", "cyberbullying", "spam"];

function NegativePage() {
  const { comments, reload } = useComments();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [cat, setCat] = useState<"all" | Category>("all");
  const [minTox, setMinTox] = useState(50);
  const [confirm, setConfirm] = useState<null | "selected" | "all" | "spam">(null);
  const [busy, setBusy] = useState(false);

  const negative = useMemo(() => comments.filter((c) => {
    if (c.sentiment !== "toxic" && c.toxicityScore < minTox) return false;
    if (platform !== "all" && c.platform !== platform) return false;
    if (cat !== "all" && !c.categories.includes(cat)) return false;
    return true;
  }), [comments, platform, cat, minTox]);

  const remove = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try { await deleteCommentsByIds(ids); setSelected(new Set()); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); setConfirm(null); }
  };

  const exportCSV = () => {
    const rows = [["id","platform","author","language","text","toxicity","categories","timestamp"],
      ...negative.map((c) => [c.id, c.platform, c.author, c.languageName, JSON.stringify(c.text), c.toxicityScore, c.categories.join("|"), c.timestamp])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `negative-${Date.now()}.csv`; a.click();
    toast.success("CSV exported");
  };

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <AlertOctagon className="h-7 w-7 text-toxic" /> Negative Comments
          </h1>
          <p className="text-sm text-muted-foreground">{negative.length} of {comments.length} comments flagged.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setConfirm("all")} disabled={busy || negative.length === 0} className="inline-flex items-center gap-1.5 rounded-md bg-toxic px-4 py-2 text-sm font-semibold text-white shadow-elegant disabled:opacity-50 hover:bg-toxic/90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete All Negative
          </button>
          <button onClick={() => setConfirm("spam")} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-400 disabled:opacity-50 hover:bg-amber-500/20">
            <Trash2 className="h-4 w-4" /> Delete All Spam
          </button>
          <button onClick={exportCSV} className="inline-flex items-center gap-1.5 rounded-md border bg-secondary px-3 py-2 text-sm font-medium hover:bg-accent">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        </div>
      </header>

      <div className="glass-panel mb-4 grid gap-3 rounded-2xl border border-border/60 p-4 md:grid-cols-4">
        <div>
          <label className="mb-1 flex items-center gap-1 text-xs text-muted-foreground"><Filter className="h-3 w-3" /> Platform</label>
          <select value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)} className="w-full rounded-md border bg-input px-3 py-2 text-sm">
            <option value="all">All platforms</option>
            <option value="twitter">Twitter</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Category</label>
          <select value={cat} onChange={(e) => setCat(e.target.value as typeof cat)} className="w-full rounded-md border bg-input px-3 py-2 text-sm capitalize">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">Min toxicity: <span className="font-semibold text-foreground">{minTox}%</span></label>
          <input type="range" min={0} max={100} value={minTox} onChange={(e) => setMinTox(+e.target.value)} aria-label="Minimum toxicity" className="w-full accent-primary" />
        </div>
      </div>

      {negative.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/60 px-4 py-2 backdrop-blur">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary"
              checked={negative.every((c) => selected.has(c.id))}
              onChange={(e) => {
                const n = new Set(selected);
                negative.forEach((c) => e.target.checked ? n.add(c.id) : n.delete(c.id));
                setSelected(n);
              }} />
            Select all · <span className="text-muted-foreground">{selected.size} selected</span>
          </label>
          <button disabled={selected.size === 0 || busy} onClick={() => setConfirm("selected")} className="inline-flex items-center gap-1.5 rounded-md border border-toxic/40 bg-toxic/10 px-3 py-1.5 text-sm font-medium text-toxic disabled:opacity-40 hover:bg-toxic/20">
            <Trash2 className="h-4 w-4" /> Delete Selected
          </button>
        </div>
      )}

      <div className="space-y-3">
        {negative.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="All clean!" description={comments.length === 0 ? "No comments ingested yet." : "No comments match these filters."} />
        ) : negative.map((c) => (
          <CommentCard key={c.id} c={c}
            selected={selected.has(c.id)}
            onSelectChange={(v) => setSelected((s) => { const n = new Set(s); v ? n.add(c.id) : n.delete(c.id); return n; })}
            onDelete={() => void remove([c.id])} />
        ))}
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setConfirm(null)}>
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-border/60 p-6 shadow-elegant" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">
              {confirm === "selected" && `Delete ${selected.size} selected comments?`}
              {confirm === "all" && `Delete all ${negative.length} negative comments?`}
              {confirm === "spam" && "Delete all spam comments?"}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">They will be marked as deleted in your database.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-md border bg-secondary px-3 py-2 text-sm">Cancel</button>
              <button
                onClick={() => {
                  const ids = confirm === "selected" ? Array.from(selected)
                    : confirm === "all" ? negative.map((c) => c.id)
                    : comments.filter((c) => c.categories.includes("spam") || c.categories.includes("scam")).map((c) => c.id);
                  void remove(ids);
                }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-toxic px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
