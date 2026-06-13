import { useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { insertComment } from "@/lib/data";
import type { Platform } from "@/lib/mock-data";

const SENTIMENTS = ["positive", "neutral", "negative"] as const;
const CATEGORIES = ["positive", "neutral", "toxic", "spam", "cyberbullying"] as const;
const PLATFORMS: Platform[] = ["twitter", "facebook", "instagram"];

export function IngestDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const [platform, setPlatform] = useState<Platform>("twitter");
  const [author, setAuthor] = useState("");
  const [text, setText] = useState("");
  const [sentiment, setSentiment] = useState<(typeof SENTIMENTS)[number]>("neutral");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("neutral");
  const [saving, setSaving] = useState(false);
  const [pipeline, setPipeline] = useState<"idle" | "raw" | "normalized">("idle");
  if (!open) return null;

  const submit = async () => {
    if (!author.trim() || !text.trim()) { toast.error("Author and text are required"); return; }
    setSaving(true);
    setPipeline("raw");
    try {
      await insertComment({ platform, author: author.trim(), text: text.trim(), sentiment, category });
      setPipeline("normalized");
      toast.success("Comment ingested");
      setAuthor(""); setText("");
      onSaved?.();
      setTimeout(() => { setPipeline("idle"); onClose(); }, 1500);
    } catch (e) {
      setPipeline("idle");
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel w-full max-w-md rounded-2xl border border-border/60 bg-card/90 p-6 shadow-elegant" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold"><Plus className="h-5 w-5 text-primary" /> Ingest comment</h3>
            <p className="mt-1 text-xs text-muted-foreground">Add a real comment to your moderation queue.</p>
            {pipeline !== "idle" && (
              <p className="mt-2 inline-flex items-center gap-2 border border-primary/40 bg-primary/5 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary/90" style={{ borderRadius: 4 }}>
                <span className={`h-1.5 w-1.5 ${pipeline === "raw" ? "bg-neutral-warn animate-pulse" : "bg-positive"}`} />
                {pipeline === "raw" ? "[RAW_INGEST] → processing pipeline" : "[RAW_INGEST] → [NORMALIZED_RECORD] · committed"}
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <div className="focus-isolation-group space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="text-muted-foreground">Platform</span>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} className="mt-1 w-full px-2 py-1.5 text-sm capitalize">
                {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Author</span>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="@handle" className="mt-1 w-full px-2 py-1.5 text-sm" />
            </label>
          </div>
          <label className="block text-xs">
            <span className="text-muted-foreground">Text</span>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} className="mt-1 w-full px-2 py-1.5 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="text-muted-foreground">Sentiment</span>
              <select value={sentiment} onChange={(e) => setSentiment(e.target.value as typeof sentiment)} className="mt-1 w-full px-2 py-1.5 text-sm capitalize">
                {SENTIMENTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="text-muted-foreground">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="mt-1 w-full px-2 py-1.5 text-sm capitalize">
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border bg-secondary px-3 py-2 text-sm">Cancel</button>
          <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-gradient-to-r from-primary to-fuchsia-500 px-4 py-2 text-sm font-semibold text-primary-foreground shadow-elegant disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ingest
          </button>
        </div>
      </div>
    </div>
  );
}
