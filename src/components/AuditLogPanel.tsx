/**
 * Global audit ledger — chronological mutation log with timestamps,
 * actor IDs, and applied action codes. Rendered as enterprise security ledger rows.
 */
import { useActivityLogs } from "@/lib/data";
import { ScrollText } from "lucide-react";

function pad(n: number) { return n.toString().padStart(2, "0"); }
function fmt(iso: string) {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
}

const actionCode: Record<string, string> = {
  delete: "DEL", block: "BLK", unblock: "UNB", restore: "RST", hide: "HID", allow: "ALW",
};

export function AuditLogPanel({ limit = 60, dense = false }: { limit?: number; dense?: boolean }) {
  const { logs } = useActivityLogs(limit);
  return (
    <section className="border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ScrollText className="h-3.5 w-3.5 text-primary" strokeWidth={1.75} />
          <h3 className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">Audit Log Workspace</h3>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
          {logs.length.toString().padStart(3, "0")} entries · append-only
        </span>
      </header>
      {logs.length === 0 ? (
        <p className="px-4 py-8 text-center font-mono text-[11px] text-muted-foreground">
          // no mutations recorded
        </p>
      ) : (
        <ol className={`max-h-[420px] divide-y divide-border overflow-y-auto font-mono text-[11px] ${dense ? "" : "tabular-nums"}`}>
          {logs.map((l) => (
            <li key={l.id} className="grid grid-cols-[10.5rem_3rem_5rem_1fr] items-center gap-3 px-4 py-1.5">
              <span className="text-muted-foreground/80">{fmt(l.timestamp)}</span>
              <span className="text-primary/90">{actionCode[l.action] ?? l.action.slice(0,3).toUpperCase()}</span>
              <span className="text-foreground/80 uppercase tracking-[0.12em]">{l.platform}</span>
              <span className="truncate text-foreground/70">{l.reason}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
