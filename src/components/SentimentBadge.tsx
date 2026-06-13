import type { Sentiment } from "@/lib/mock-data";

const map: Record<Sentiment, { label: string; cls: string }> = {
  toxic:    { label: "Toxic",    cls: "border-toxic/60 text-toxic" },
  positive: { label: "Positive", cls: "border-positive/60 text-positive" },
  neutral:  { label: "Neutral",  cls: "border-neutral-warn/55 text-neutral-warn" },
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const m = map[sentiment];
  return (
    <span
      className={`inline-flex items-center border bg-transparent px-2 py-[2px] font-mono text-[10px] uppercase tracking-[0.14em] ${m.cls}`}
      style={{ borderRadius: 4 }}
    >
      {m.label}
    </span>
  );
}
