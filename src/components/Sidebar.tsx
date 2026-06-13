import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutDashboard, MessageSquare, ShieldCheck, BarChart3, Settings,
  ChevronLeft, ChevronRight, ShieldAlert, Twitter, Facebook, Instagram,
  AlertOctagon, Ban, Languages, Brain, Users, LogOut, ClipboardCheck, Workflow,
} from "lucide-react";
import { platformConnected } from "@/lib/storage";
import { useAuth } from "@/hooks/use-auth";
import { railTransition } from "@/lib/motion";


const baseLinks = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/review", label: "Review Queue", icon: ClipboardCheck },
  { to: "/comments", label: "Comments", icon: MessageSquare },
  { to: "/negative", label: "Negative", icon: AlertOctagon },
  { to: "/cyberbullying", label: "Cyberbullying", icon: ShieldAlert },
  { to: "/research", label: "AI Research", icon: Brain },
  { to: "/blacklist", label: "Blacklist", icon: Ban },
  { to: "/translator", label: "Translator", icon: Languages },
  { to: "/moderation", label: "Auto Moderation", icon: ShieldCheck },
  { to: "/workflows", label: "Workflows", icon: Workflow },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus] = useState({ twitter: false, facebook: false, instagram: false });
  const { location } = useRouterState();
  const { user, isAdmin, signOut } = useAuth();
  const links = isAdmin
    ? [...baseLinks, { to: "/admin" as const, label: "Admin", icon: Users }]
    : baseLinks;

  useEffect(() => {
    setStatus({
      twitter: platformConnected("twitter"),
      facebook: platformConnected("facebook"),
      instagram: platformConnected("instagram"),
    });
  }, [location.pathname]);

  return (
    <>
      <aside
        className={`sticky top-0 z-20 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] md:flex ${
          collapsed ? "w-[64px]" : "w-64"
        }`}
      >
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-border bg-background">
            <ShieldAlert className="h-4 w-4 text-primary" strokeWidth={2} />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold tracking-tight text-foreground">ModGuard</p>
              <p className="truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">v2.0 / Enterprise</p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {!collapsed && (
            <p className="px-3 pb-2 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Workspace
            </p>
          )}
          <div className="space-y-px">
            {links.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to;
              return (
                <Link
                  key={to}
                  to={to}
                  className={`group relative flex items-center gap-3 px-3 py-2 text-[13px] font-medium transition-colors duration-150 ${
                    active
                      ? "text-foreground"
                      : "text-sidebar-foreground/70 hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="sidebar-rail"
                      transition={railTransition}
                      className="absolute inset-y-0 left-0 right-0 -z-0 bg-secondary"
                      style={{ boxShadow: "inset 2px 0 0 var(--primary)" }}
                    />
                  )}
                  <Icon className="relative z-10 h-[15px] w-[15px] shrink-0" strokeWidth={1.75} />
                  {!collapsed && <span className="relative z-10 truncate">{label}</span>}
                </Link>
              );

            })}
          </div>
        </nav>

        {/* Platforms */}
        {!collapsed && (
          <div className="border-t border-sidebar-border px-4 py-4">
            <p className="mb-3 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Channels</p>
            <div className="space-y-1 text-xs">
              <StatusRow icon={Twitter} label="Twitter" ok={status.twitter} />
              <StatusRow icon={Facebook} label="Facebook" ok={status.facebook} />
              <StatusRow icon={Instagram} label="Instagram" ok={status.instagram} />
            </div>
          </div>
        )}

        {/* User */}
        {!collapsed && user && (
          <div className="border-t border-sidebar-border p-3">
            <div className="flex items-center gap-3 border border-border bg-background/60 px-3 py-2">
              <div className="grid h-7 w-7 shrink-0 place-items-center border border-border bg-secondary text-[11px] font-semibold text-foreground">
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-foreground">{user.email}</p>
                <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{isAdmin ? "Administrator" : "Member"}</p>
              </div>
              <button
                onClick={() => signOut()}
                title="Sign out"
                aria-label="Sign out"
                className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex h-8 items-center justify-center gap-2 border-t border-sidebar-border font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <><ChevronLeft className="h-3 w-3" /> Collapse</>}
        </button>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto border-t border-sidebar-border bg-sidebar md:hidden">
        {links.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to;
          return (
            <Link
              key={to}
              to={to}
              className={`relative flex min-w-[64px] shrink-0 flex-col items-center justify-center gap-1 px-3 py-2.5 text-[10px] font-medium transition-colors duration-150 ${
                active ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-rail-mobile"
                  transition={railTransition}
                  className="absolute inset-x-2 top-0 h-[2px] bg-primary"
                />
              )}
              <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
              <span className="truncate">{label.split(" ")[0]}</span>
            </Link>
          );

        })}
      </nav>
    </>
  );
}

function StatusRow({ icon: Icon, label, ok }: { icon: React.ComponentType<{ className?: string }>; label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between px-1 py-1.5">
      <span className="flex items-center gap-2 text-[12px] text-sidebar-foreground/80">
        <Icon className="h-3.5 w-3.5 opacity-70" />
        {label}
      </span>
      <span className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 ${ok ? "bg-positive" : "bg-muted-foreground/30"}`} />
        <span className={`font-mono text-[9px] uppercase tracking-[0.16em] ${ok ? "text-positive" : "text-muted-foreground/60"}`}>{ok ? "Live" : "Off"}</span>
      </span>
    </div>
  );
}
