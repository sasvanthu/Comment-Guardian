/**
 * State-machine selector for review status transitions.
 * Explicit states: pending -> approved | ignored | escalated | resolved
 */
export type ReviewState = "pending" | "approved" | "ignored" | "escalated" | "resolved";

const STATES: { key: ReviewState; label: string; border: string; text: string }[] = [
  { key: "pending",   label: "Pending",   border: "border-neutral-warn/55",  text: "text-neutral-warn" },
  { key: "approved",  label: "Approved",  border: "border-positive/55",      text: "text-positive" },
  { key: "ignored",   label: "Ignored",   border: "border-muted-foreground/40", text: "text-muted-foreground" },
  { key: "escalated", label: "Escalated", border: "border-red-500/55",       text: "text-red-300" },
  { key: "resolved",  label: "Resolved",  border: "border-primary/55",       text: "text-primary" },
];

export function StatusSelector({ value, onChange, dense = false }: {
  value: ReviewState; onChange?: (next: ReviewState) => void; dense?: boolean;
}) {
  return (
    <div className={`inline-flex border border-border bg-card/60 ${dense ? "p-0.5" : "p-1"}`} style={{ borderRadius: 4 }}>
      {STATES.map((s) => {
        const on = value === s.key;
        return (
          <button
            key={s.key}
            disabled={!onChange}
            onClick={() => onChange?.(s.key)}
            className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-150 ${
              on ? `${s.text} bg-foreground/[0.06] border ${s.border}` : "text-muted-foreground/70 border border-transparent hover:text-foreground"
            }`}
            style={{ borderRadius: 4 }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
