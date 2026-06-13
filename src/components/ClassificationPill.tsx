/**
 * Outline-only flat classification pill for the 6 core buckets.
 * 1px semantic border, transparent center, no background fill.
 */
type Bucket = "positive" | "neutral" | "negative" | "toxic" | "cyberbullying" | "spam";

const TONE: Record<Bucket, { border: string; text: string; label: string }> = {
  positive:      { border: "border-positive/55",      text: "text-positive",      label: "Positive" },
  neutral:       { border: "border-muted-foreground/45", text: "text-muted-foreground", label: "Neutral" },
  negative:      { border: "border-neutral-warn/55",  text: "text-neutral-warn",  label: "Negative" },
  toxic:         { border: "border-toxic/60",         text: "text-toxic",         label: "Toxic" },
  cyberbullying: { border: "border-red-500/55",       text: "text-red-300",       label: "Cyberbullying" },
  spam:          { border: "border-amber-500/55",     text: "text-amber-300",     label: "Spam" },
};

export function ClassificationPill({ bucket, count, active, onClick }: {
  bucket: Bucket; count?: number; active?: boolean; onClick?: () => void;
}) {
  const t = TONE[bucket];
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      onClick={onClick}
      className={`inline-flex items-center gap-2 border bg-transparent px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] transition-colors duration-150 ${t.border} ${t.text} ${onClick ? "hover:bg-foreground/[0.04]" : ""} ${active ? "bg-foreground/[0.06]" : ""}`}
      style={{ borderRadius: 4 }}
    >
      <span aria-hidden className={`h-1 w-1 ${t.text.replace("text-", "bg-")}`} />
      {t.label}
      {typeof count === "number" && <span className="text-foreground/60">· {count}</span>}
    </Comp>
  );
}

export type { Bucket as ClassificationBucket };
