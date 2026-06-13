/**
 * Global enterprise top navigation bar.
 * Workspace switcher · global search · notifications · recent activity.
 * Purely presentational — wired to existing data hooks; no business logic changes.
 */
import { useMemo, useRef, useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Bell, ChevronDown, Activity, ShieldAlert, Check } from "lucide-react";
import { useActivityLogs, useComments } from "@/lib/data";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";

const WORKSPACES = [
  { id: "prod", name: "Production", env: "live" },
  { id: "stg", name: "Staging", env: "test" },
  { id: "sbx", name: "Sandbox", env: "dev" },
] as const;

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAdmin } = useAuth();
  const { comments } = useComments();
  const { logs } = useActivityLogs(20);

  const [wsOpen, setWsOpen] = useState(false);
  const [ws, setWs] = useState<typeof WORKSPACES[number]>(WORKSPACES[0]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const wsRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setWsOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        (document.getElementById("global-search") as HTMLInputElement)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.toLowerCase();
    return comments
      .filter((c) => c.text.toLowerCase().includes(needle) || c.author.toLowerCase().includes(needle))
      .slice(0, 6);
  }, [q, comments]);

  const breadcrumb = useMemo(() => {
    const seg = location.pathname.split("/").filter(Boolean)[0];
    const map: Record<string, string> = {
      "": "Dashboard", review: "Review Queue", comments: "Comments", negative: "Negative",
      cyberbullying: "Threat Center", research: "User Intelligence", blacklist: "Blacklist",
      translator: "Translator", moderation: "Auto Moderation", workflows: "Workflows",
      reports: "Analytics", settings: "Settings", admin: "Administration",
    };
    return map[seg ?? ""] ?? "Dashboard";
  }, [location.pathname]);

  const unread = logs.length;
  const threats = comments.filter((c) => c.sentiment === "toxic").length;

  return (
    <header className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:gap-3 md:px-6">
      {/* Workspace switcher */}
      <div ref={wsRef} className="relative">
        <button
          onClick={() => setWsOpen((o) => !o)}
          className="flex h-8 items-center gap-2 border border-border bg-card px-2.5 text-[12px] font-medium text-foreground transition-colors hover:border-foreground/25"
        >
          <span className="grid h-4 w-4 place-items-center bg-primary/15 font-mono text-[9px] text-primary">{ws.id.toUpperCase().slice(0,2)}</span>
          <span className="truncate">{ws.name}</span>
          <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">/{ws.env}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
        {wsOpen && (
          <div className="absolute left-0 top-9 z-40 w-56 border border-border bg-popover py-1 shadow-lg">
            <p className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">Workspaces</p>
            {WORKSPACES.map((w) => (
              <button
                key={w.id}
                onClick={() => { setWs(w); setWsOpen(false); }}
                className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[12px] hover:bg-secondary"
              >
                <span className="flex items-center gap-2">
                  <span className="grid h-4 w-4 place-items-center bg-primary/15 font-mono text-[9px] text-primary">{w.id.toUpperCase().slice(0,2)}</span>
                  {w.name}
                  <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">/{w.env}</span>
                </span>
                {ws.id === w.id && <Check className="h-3 w-3 text-primary" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Breadcrumb */}
      <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground sm:inline">/ {breadcrumb}</span>

      {/* Global search */}
      <div className="relative ml-auto flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          id="global-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 120)}
          placeholder="Search comments, authors, rules…"
          className="h-8 w-full border border-border bg-card pl-8 pr-12 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-foreground/30"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">⌘K</kbd>
        {focused && results.length > 0 && (
          <div className="absolute left-0 right-0 top-9 z-40 border border-border bg-popover py-1 shadow-lg">
            <p className="px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">{results.length} matches</p>
            {results.map((r) => (
              <button
                key={r.id}
                onMouseDown={() => navigate("/comments")}
                className="block w-full px-3 py-1.5 text-left text-[12px] hover:bg-secondary"
              >
                <span className="font-medium text-foreground">{r.author}</span>
                <span className="ml-2 truncate text-muted-foreground">{r.text.slice(0, 64)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Threat alert chip */}
      <Link
        to="/cyberbullying"
        className="hidden h-8 items-center gap-1.5 border border-toxic/55 px-2.5 text-[11px] font-medium text-toxic transition-colors hover:bg-toxic/10 md:inline-flex"
      >
        <ShieldAlert className="h-3.5 w-3.5" strokeWidth={1.75} />
        <span className="font-mono tabular-nums">{threats.toString().padStart(2,"0")}</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-toxic/80">threats</span>
      </Link>

      {/* Notifications */}
      <div ref={notifRef} className="relative">
        <button
          onClick={() => setNotifOpen((o) => !o)}
          aria-label="Notifications"
          className="relative grid h-8 w-8 place-items-center border border-border bg-card text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
        >
          <Bell className="h-3.5 w-3.5" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 grid h-3.5 min-w-[14px] place-items-center bg-primary px-1 font-mono text-[9px] font-medium text-primary-foreground">
              {Math.min(unread, 99)}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-9 z-40 w-80 border border-border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-foreground">
                <Activity className="h-3 w-3 text-primary" /> Recent activity
              </span>
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{unread} events</span>
            </div>
            {logs.length === 0 ? (
              <p className="px-3 py-6 text-center font-mono text-[11px] text-muted-foreground">// no events</p>
            ) : (
              <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                {logs.slice(0, 10).map((l) => (
                  <li key={l.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 px-3 py-1.5 text-[11px]">
                    <span className="font-mono text-[10px] uppercase text-primary">{l.action.slice(0,3).toUpperCase()}</span>
                    <span className="truncate text-foreground/85">{l.reason}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">{formatDistanceToNow(new Date(l.timestamp), { addSuffix: false })}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* User chip */}
      {user && (
        <div className="hidden h-8 items-center gap-2 border border-border bg-card px-2 md:flex">
          <div className="grid h-5 w-5 place-items-center bg-secondary text-[10px] font-semibold text-foreground">
            {user.email?.[0]?.toUpperCase() ?? "U"}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{isAdmin ? "Admin" : "Member"}</span>
        </div>
      )}
    </header>
  );
}
