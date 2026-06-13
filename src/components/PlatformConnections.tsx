/**
 * Platform connection status panel.
 * Lists Twitter / Facebook / Instagram, their current connection status,
 * last sync time, last error, rate-limit info, and a "Sync now" button.
 * Reads from public.platform_connections via realtime; mutations go
 * through the syncPlatform / syncAllPlatforms server functions.
 */
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Twitter, Facebook, Instagram, RefreshCw, AlertCircle, Clock, CheckCircle2, Loader2, Plug, PlugZap, Unplug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncPlatform, syncAllPlatforms } from "@/lib/platforms.functions";
import { PLATFORM_IDS, type ConnectionStatus, type PlatformId } from "@/lib/platforms/types";
import {
  testInstagramConnection,
  syncInstagramNow,
  disconnectInstagram,
} from "@/lib/integrations/instagram";

interface ConnRow {
  id: string;
  user_id: string;
  platform: string;
  status: ConnectionStatus;
  last_sync_at: string | null;
  last_error: string | null;
  rate_limit_remaining: number | null;
  rate_limit_reset_at: string | null;
  imported_count: number;
}

const PLATFORM_META: Record<PlatformId, { label: string; Icon: typeof Twitter; color: string }> = {
  twitter:   { label: "Twitter / X", Icon: Twitter,   color: "text-sky-400" },
  facebook:  { label: "Facebook",    Icon: Facebook,  color: "text-blue-500" },
  instagram: { label: "Instagram",   Icon: Instagram, color: "text-fuchsia-400" },
};

function relTime(iso: string | null): string {
  if (!iso) return "Never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleString();
}

function StatusPill({ status }: { status: ConnectionStatus }) {
  const map: Record<ConnectionStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
    connected:    { label: "Connected",    cls: "bg-positive/15 text-positive border-positive/30", Icon: CheckCircle2 },
    syncing:      { label: "Syncing…",     cls: "bg-primary/15 text-primary border-primary/30",   Icon: Loader2 },
    rate_limited: { label: "Rate limited", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", Icon: Clock },
    error:        { label: "Error",        cls: "bg-destructive/15 text-destructive border-destructive/30", Icon: AlertCircle },
    disconnected: { label: "Not configured", cls: "bg-muted text-muted-foreground border-border", Icon: Plug },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon className={`h-3 w-3 ${status === "syncing" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

export function PlatformConnections() {
  const [rows, setRows] = useState<ConnRow[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const sync = useServerFn(syncPlatform);
  const syncAll = useServerFn(syncAllPlatforms);
  const igTest = useServerFn(testInstagramConnection);
  const igSync = useServerFn(syncInstagramNow);
  const igDisconnect = useServerFn(disconnectInstagram);

  useEffect(() => {
    let alive = true;
    const reload = async () => {
      const { data } = await supabase.from("platform_connections").select("*");
      if (alive) setRows((data ?? []) as ConnRow[]);
    };
    void reload();
    const ch = supabase
      .channel("platform-connections-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_connections" }, () => { void reload(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, []);

  const byPlatform = useMemo(() => {
    const m: Partial<Record<PlatformId, ConnRow>> = {};
    for (const r of rows) m[r.platform as PlatformId] = r;
    return m;
  }, [rows]);

  const doSync = async (platform: PlatformId) => {
    setBusy((b) => ({ ...b, [platform]: true }));
    try {
      const res = await sync({ data: { platform } });
      if (res.reason === "ok") {
        toast.success(`${PLATFORM_META[platform].label} synced`, {
          description: `${res.inserted} new of ${res.fetched} fetched`,
        });
      } else if (res.reason === "not_configured") {
        toast.warning(`${PLATFORM_META[platform].label} not configured`, {
          description: "Add the platform API credentials to your project secrets.",
        });
      } else if (res.reason === "rate_limited") {
        toast.warning(`${PLATFORM_META[platform].label} rate limited`, {
          description: res.rate_limit_reset_at ? `Resets ${relTime(res.rate_limit_reset_at)}` : "Try again later.",
        });
      } else {
        toast.error(`${PLATFORM_META[platform].label} sync failed`, { description: res.error ?? "Unknown error" });
      }
    } catch (e) {
      toast.error("Sync failed", { description: (e as Error).message });
    } finally {
      setBusy((b) => ({ ...b, [platform]: false }));
    }
  };

  const doSyncAll = async () => {
    setBusy({ twitter: true, facebook: true, instagram: true });
    try {
      const { results } = await syncAll({});
      const ok = results.filter((r) => r.reason === "ok").length;
      toast.success(`Synced ${ok}/${results.length} platforms`);
    } catch (e) {
      toast.error("Sync all failed", { description: (e as Error).message });
    } finally {
      setBusy({});
    }
  };

  const doIgTest = async () => {
    setBusy((b) => ({ ...b, instagram_test: true }));
    try {
      const res = await igTest({});
      if (res.ok) {
        toast.success("Instagram connection OK", { description: `@${res.account.username} (id ${res.account.id})` });
      } else {
        toast.error("Instagram connection failed", { description: `${res.status}: ${res.error}` });
      }
    } catch (e) {
      toast.error("Test failed", { description: (e as Error).message });
    } finally {
      setBusy((b) => ({ ...b, instagram_test: false }));
    }
  };

  const doIgSync = async () => {
    setBusy((b) => ({ ...b, instagram: true }));
    try {
      const res = await igSync({});
      if (res.ok) {
        toast.success("Instagram synced", {
          description: `${res.imported} imported, ${res.skipped} skipped, ${res.failed} failed (${res.comment_count} comments across ${res.media_count} posts)`,
        });
      } else if (res.reason === "not_configured") {
        toast.warning("Instagram not configured", { description: "Add INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_ACCOUNT_ID to project secrets." });
      } else if (res.reason === "rate_limited") {
        toast.warning("Instagram rate limited", { description: "Try again later." });
      } else {
        toast.error("Instagram sync failed", { description: res.error ?? "Unknown error" });
      }
    } catch (e) {
      toast.error("Sync failed", { description: (e as Error).message });
    } finally {
      setBusy((b) => ({ ...b, instagram: false }));
    }
  };

  const doIgDisconnect = async () => {
    setBusy((b) => ({ ...b, instagram_disc: true }));
    try {
      await igDisconnect({});
      toast.success("Instagram disconnected");
    } catch (e) {
      toast.error("Disconnect failed", { description: (e as Error).message });
    } finally {
      setBusy((b) => ({ ...b, instagram_disc: false }));
    }
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold">Platform connections</h2>
          <p className="text-xs text-muted-foreground">
            Comments sync into the unified moderation schema. Background sync runs every 15 minutes.
          </p>
        </div>
        <button
          onClick={() => void doSyncAll()}
          disabled={Object.values(busy).some(Boolean)}
          className="inline-flex items-center gap-2 rounded-lg border bg-secondary px-3 py-1.5 text-xs font-semibold hover:bg-secondary/80 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${Object.values(busy).some(Boolean) ? "animate-spin" : ""}`} />
          Sync all
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {PLATFORM_IDS.map((p) => {
          const row = byPlatform[p];
          const status: ConnectionStatus = (busy[p] ? "syncing" : (row?.status ?? "disconnected")) as ConnectionStatus;
          const { Icon, label, color } = PLATFORM_META[p];
          return (
            <div key={p} className="flex flex-col gap-3 rounded-lg border bg-background p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-5 w-5 ${color}`} />
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                <StatusPill status={status} />
              </div>

              <dl className="space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between"><dt>Last sync</dt><dd className="text-foreground">{relTime(row?.last_sync_at ?? null)}</dd></div>
                <div className="flex justify-between"><dt>Imported</dt><dd className="text-foreground">{row?.imported_count ?? 0}</dd></div>
                {row?.rate_limit_remaining != null && (
                  <div className="flex justify-between"><dt>API quota</dt><dd className="text-foreground">{row.rate_limit_remaining} left</dd></div>
                )}
                {row?.rate_limit_reset_at && (
                  <div className="flex justify-between"><dt>Resets</dt><dd className="text-foreground">{relTime(row.rate_limit_reset_at)}</dd></div>
                )}
              </dl>

              {row?.last_error && (
                <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">
                  {row.last_error}
                </p>
              )}

              <div className="mt-auto flex flex-col gap-1.5">
                <button
                  onClick={() => void (p === "instagram" ? doIgSync() : doSync(p))}
                  disabled={busy[p]}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busy[p] ? "animate-spin" : ""}`} />
                  {busy[p] ? "Syncing…" : "Sync now"}
                </button>
                {p === "instagram" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => void doIgTest()}
                      disabled={busy.instagram_test}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-secondary px-2 py-1.5 text-[11px] font-semibold hover:bg-secondary/80 disabled:opacity-50"
                    >
                      <PlugZap className="h-3 w-3" />
                      {busy.instagram_test ? "Testing…" : "Test"}
                    </button>
                    <button
                      onClick={() => void doIgDisconnect()}
                      disabled={busy.instagram_disc}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                    >
                      <Unplug className="h-3 w-3" />
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
