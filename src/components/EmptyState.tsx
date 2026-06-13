import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface QuickAction {
  label: string;
  onClick?: () => void;
  href?: string;
  hint?: string;
}

export function EmptyState({
  icon: Icon, title, description, action, quickActions, children,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  quickActions?: QuickAction[];
  children?: ReactNode;
}) {
  return (
    <section className="border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
        <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">// awaiting input</span>
      </header>
      <div className="grid gap-4 px-4 py-4 md:grid-cols-[1fr_minmax(220px,260px)]">
        <div>
          {description && <p className="text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-3 inline-flex items-center gap-2 border border-primary/60 bg-primary/10 px-3 py-1.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20"
            >
              {action.label}
            </button>
          )}
          {children && <div className="mt-3">{children}</div>}
        </div>
        {quickActions && quickActions.length > 0 && (
          <aside className="border border-border bg-background/40">
            <p className="border-b border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-muted-foreground">Quick actions</p>
            <ul className="divide-y divide-border">
              {quickActions.map((q, i) => {
                const inner = (
                  <>
                    <span className="text-[12px] font-medium text-foreground">{q.label}</span>
                    {q.hint && <span className="block font-mono text-[10px] text-muted-foreground">{q.hint}</span>}
                  </>
                );
                return (
                  <li key={i}>
                    {q.href ? (
                      <a href={q.href} className="block px-3 py-2 transition-colors hover:bg-secondary/60">{inner}</a>
                    ) : (
                      <button onClick={q.onClick} className="block w-full px-3 py-2 text-left transition-colors hover:bg-secondary/60">{inner}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>
        )}
      </div>
    </section>
  );
}
