
import { useMemo, useState } from "react";
import { Search, Trash2, Inbox, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Layout } from "@/components/Layout";
import { CommentCard } from "@/components/CommentCard";
import { CommentSkeleton } from "@/components/LoadingSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { IngestDialog } from "@/components/IngestDialog";
import { useComments, deleteCommentsByIds } from "@/lib/data";
import type { Platform } from "@/lib/types";

export default CommentsPage;

type Tab = "all" | Platform;
type SortKey = "latest" | "oldest" | "toxic";
const PAGE = 8;

function CommentsPage() {
  const { comments, loading, reload } = useComments();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("latest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [ingestOpen, setIngestOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    let list = comments;
    if (tab !== "all") list = list.filter((c) => c.platform === tab);
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((c) => c.text.toLowerCase().includes(s) || c.author.toLowerCase().includes(s));
    }
    return [...list].sort((a, b) =>
      sort === "latest" ? +new Date(b.timestamp) - +new Date(a.timestamp)
      : sort === "oldest" ? +new Date(a.timestamp) - +new Date(b.timestamp)
      : b.toxicityScore - a.toxicityScore,
    );
  }, [comments, tab, q, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const paged = filtered.slice((page - 1) * PAGE, page * PAGE);

  const deleteOne = async (id: string) => {
    setBusy(true);
    try { await deleteCommentsByIds([id]); toast.success("Comment deleted"); await reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const bulkDelete = async () => {
    setBusy(true);
    try {
      await deleteCommentsByIds(Array.from(selected));
      toast.success(`Deleted ${selected.size} comments`);
      setSelected(new Set()); setConfirmOpen(false);
      await reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const toggleAllOnPage = (checked: boolean) => {
    setSelected((s) => {
      const n = new Set(s);
      paged.forEach((c) => checked ? n.add(c.id) : n.delete(c.id));
      return n;
    });
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "twitter", label: "Twitter" },
    { key: "facebook", label: "Facebook" },
    { key: "instagram", label: "Instagram" },
  ];

  return (
    <Layout>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Comments</h1>
          <p className="text-sm text-muted-foreground">{comments.length} live comments across your platforms.</p>
        </div>
        <button onClick={() => setIngestOpen(true)} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-500 px-3 py-2 text-sm font-semibold text-primary-foreground shadow-elegant hover:opacity-90">
          <Plus className="h-4 w-4" /> Ingest comment
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="glass-panel flex flex-wrap rounded-lg border border-border/60 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setPage(1); }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-primary text-primary-foreground shadow-elegant" : "text-muted-foreground hover:bg-accent"
              }`}
            >{t.label}</button>
          ))}
        </div>
        <div className="relative ml-auto flex w-full max-w-xs items-center">
          <Search className="absolute left-3 h-4 w-4 text-muted-foreground" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search comments…" aria-label="Search comments" className="w-full rounded-md border bg-input py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border bg-input px-3 py-2 text-sm outline-none focus:border-primary">
          <option value="latest">Latest</option>
          <option value="oldest">Oldest</option>
          <option value="toxic">Most Toxic</option>
        </select>
      </div>

      {comments.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg border bg-card/60 px-4 py-2 backdrop-blur">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={paged.length > 0 && paged.every((c) => selected.has(c.id))} onChange={(e) => toggleAllOnPage(e.target.checked)} />
            Select page · <span className="text-muted-foreground">{selected.size} selected</span>
          </label>
          <button disabled={selected.size === 0 || busy} onClick={() => setConfirmOpen(true)} className="inline-flex items-center gap-1.5 rounded-md border border-toxic/40 bg-toxic/10 px-3 py-1.5 text-sm font-medium text-toxic disabled:opacity-40 hover:bg-toxic/20">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete selected
          </button>
        </div>
      )}

      <div className="space-y-3">
        {loading ? Array.from({ length: 5 }).map((_, i) => <CommentSkeleton key={i} />)
          : paged.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={comments.length === 0 ? "No comments yet" : "No matches"}
              description={comments.length === 0 ? "Ingest your first comment to start moderating." : "Try a different filter or search term."}
              action={comments.length === 0 ? { label: "Ingest first comment", onClick: () => setIngestOpen(true) } : undefined}
            />
          ) : paged.map((c) => (
            <CommentCard
              key={c.id} c={c}
              selected={selected.has(c.id)}
              onSelectChange={(val) => setSelected((s) => { const n = new Set(s); val ? n.add(c.id) : n.delete(c.id); return n; })}
              onDelete={() => void deleteOne(c.id)}
            />
          ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-1">
          {Array.from({ length: totalPages }).map((_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              className={`h-9 w-9 rounded-md border text-sm ${page === i + 1 ? "bg-primary text-primary-foreground" : "bg-card hover:bg-accent"}`}>{i + 1}</button>
          ))}
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setConfirmOpen(false)}>
          <div className="glass-panel w-full max-w-sm rounded-2xl border border-border/60 p-6 shadow-elegant" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">Delete {selected.size} comments?</h3>
            <p className="mt-1 text-sm text-muted-foreground">They will be marked as deleted in your database.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="rounded-md border bg-secondary px-3 py-2 text-sm">Cancel</button>
              <button onClick={() => void bulkDelete()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-toxic px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <IngestDialog open={ingestOpen} onClose={() => setIngestOpen(false)} onSaved={reload} />
    </Layout>
  );
}
