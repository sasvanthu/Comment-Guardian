/**
 * AI Explanation rendered as a code-comment block.
 * Each line prefixed by a geometric bar + `//` token, monospace family.
 */
import type { ReactNode } from "react";

export function AiExplanation({ children, lines, title = "// AI_REASONING" }: {
  children?: ReactNode;
  lines?: string[];
  title?: string;
}) {
  const items =
    lines ??
    (typeof children === "string"
      ? children.split(/(?<=[.!?])\s+/).filter(Boolean)
      : []);

  return (
    <div className="border-l-2 border-primary/70 bg-secondary/40 pl-4 pr-3 py-3 font-mono text-[11.5px] leading-relaxed text-foreground/85">
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-primary/80">{title}</p>
      {items.length === 0 ? (
        <p className="text-muted-foreground">// no reasoning emitted</p>
      ) : (
        items.map((l, i) => (
          <p key={i} className="flex gap-2">
            <span aria-hidden className="select-none text-muted-foreground">//</span>
            <span>{l}</span>
          </p>
        ))
      )}
    </div>
  );
}
