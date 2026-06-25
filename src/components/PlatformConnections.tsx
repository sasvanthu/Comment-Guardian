/**
 * Platform connection status panel.
 * Lists all 6 supported platforms, their current connection status,
 * last sync time, last error, rate-limit info, and action buttons.
 * YouTube uses OAuth popup flow for connecting.
 */
import { useEffect, useMemo, useState, useCallback } from "react";

import { Twitter, Facebook, Instagram, Youtube, Linkedin, RefreshCw, AlertCircle, Clock, CheckCircle2, Loader2, Plug, PlugZap, Unplug, LogIn } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { syncPlatform, syncAllPlatforms } from "@/lib/platforms.functions";
import { PLATFORM_IDS, type ConnectionStatus, type PlatformId } from "@/lib/platforms/types";
import {
  testInstagramConnection,
  syncInstagramNow,
  disconnectInstagram,
} from "@/lib/integrations/instagram";
import {
  testFacebookConnection,
  syncFacebookNow,
  disconnectFacebook,
} from "@/lib/integrations/facebook";
import {
  testYoutubeConnection,
  syncYoutubeNow,
  disconnectYoutube,
  connectYoutubeOAuth,
  getYoutubeConnectionStatus,
  type YoutubeConnectionStatus,
} from "@/lib/integrations/youtube";
import {
  testTwitterConnection,
  syncTwitterNow,
  disconnectTwitter,
} from "@/lib/integrations/twitter";
import {
  testLinkedinConnection,
  syncLinkedinNow,
  disconnectLinkedin,
} from "@/lib/integrations/linkedin";
import {
  testPinterestConnection,
  syncPinterestNow,
  disconnectPinterest,
} from "@/lib/integrations/pinterest";

/* Simple Pinterest SVG icon since lucide-react doesn't have one */
function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z" />
    </svg>
  );
}

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
  facebook:  { label: "Facebook",    Icon: Facebook,       color: "text-blue-500" },
  instagram: { label: "Instagram",   Icon: Instagram,      color: "text-fuchsia-400" },
  youtube:   { label: "YouTube",     Icon: Youtube,        color: "text-red-500" },
  linkedin:  { label: "LinkedIn",    Icon: Linkedin,       color: "text-blue-400" },
  twitter:   { label: "Twitter / X", Icon: Twitter,        color: "text-sky-400" },
  pinterest: { label: "Pinterest",   Icon: PinterestIcon as unknown as typeof Twitter, color: "text-red-400" },
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

// Map of platform -> { test, sync, disconnect } functions
const platformActions: Record<PlatformId, {
  test: () => Promise<any>;
  sync: () => Promise<any>;
  disconnect: () => Promise<any>;
}> = {
  instagram:  { test: testInstagramConnection,  sync: syncInstagramNow,  disconnect: disconnectInstagram },
  facebook:   { test: testFacebookConnection,   sync: syncFacebookNow,   disconnect: disconnectFacebook },
  youtube:    { test: testYoutubeConnection,     sync: syncYoutubeNow,    disconnect: disconnectYoutube },
  twitter:    { test: testTwitterConnection,     sync: syncTwitterNow,    disconnect: disconnectTwitter },
  linkedin:   { test: testLinkedinConnection,    sync: syncLinkedinNow,   disconnect: disconnectLinkedin },
  pinterest:  { test: testPinterestConnection,   sync: syncPinterestNow,  disconnect: disconnectPinterest },
};

export function PlatformConnections() {
  const [rows, setRows] = useState<ConnRow[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [ytStatus, setYtStatus] = useState<YoutubeConnectionStatus | null>(null);

  // Fetch YouTube OAuth connection status
  const refreshYtStatus = useCallback(async () => {
    try {
      const status = await getYoutubeConnectionStatus();
      setYtStatus(status);
    } catch {
      setYtStatus(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const reload = async () => {
      const { data } = await supabase.from("platform_connections").select("*");
      if (alive) setRows((data ?? []) as ConnRow[]);
    };
    void reload();
    void refreshYtStatus();
    const ch = supabase
      .channel("platform-connections-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "platform_connections" }, () => { void reload(); })
      .subscribe();
    return () => { alive = false; void supabase.removeChannel(ch); };
  }, [refreshYtStatus]);

  const byPlatform = useMemo(() => {
    const m: Partial<Record<PlatformId, ConnRow>> = {};
    for (const r of rows) m[r.platform as PlatformId] = r;
    return m;
  }, [rows]);

  // ─── Generic platform handlers ─────────────────────────────────────
  const doTest = async (platform: PlatformId) => {
    const key = `${platform}_test`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const res = await platformActions[platform].test();
      if (res.ok) {
        toast.success(`${PLATFORM_META[platform].label} connection OK`, {
          description: res.account?.username ? `@${res.account.username}` : res.account?.name ?? "Valid",
        });
      } else {
        toast.error(`${PLATFORM_META[platform].label} connection failed`, {
          description: `${res.status}: ${res.error}`,
        });
      }
    } catch (e) {
      toast.error("Test failed", { description: (e as Error).message });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const doSync = async (platform: PlatformId) => {
    setBusy((b) => ({ ...b, [platform]: true }));
    try {
      const res = await platformActions[platform].sync();
      if (res.ok) {
        toast.success(`${PLATFORM_META[platform].label} synced`, {
          description: `${res.imported} imported, ${res.skipped} skipped (${res.comment_count} comments)`,
        });
      } else if (res.reason === "not_configured") {
        toast.warning(`${PLATFORM_META[platform].label} not configured`, {
          description: `Add the ${PLATFORM_META[platform].label} API credentials to your project secrets.`,
        });
      } else if (res.reason === "rate_limited") {
        toast.warning(`${PLATFORM_META[platform].label} rate limited`, { description: "Try again later." });
      } else {
        toast.error(`${PLATFORM_META[platform].label} sync failed`, { description: res.error ?? "Unknown error" });
      }
    } catch (e) {
      toast.error("Sync failed", { description: (e as Error).message });
    } finally {
      setBusy((b) => ({ ...b, [platform]: false }));
    }
  };

  const doDisconnect = async (platform: PlatformId) => {
    const key = `${platform}_disc`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await platformActions[platform].disconnect();
      if (platform === "youtube") {
        setYtStatus(null);
        await refreshYtStatus();
      }
      toast.success(`${PLATFORM_META[platform].label} disconnected`);
    } catch (e) {
      toast.error("Disconnect failed", { description: (e as Error).message });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  // ─── YouTube OAuth Connect ─────────────────────────────────────────────
  const doYtConnect = async () => {
    setBusy((b) => ({ ...b, youtube_connect: true }));
    try {
      await connectYoutubeOAuth();
      toast.success("YouTube connected!", { description: "Your channel is now linked." });
      await refreshYtStatus();
    } catch (e) {
      const msg = (e as Error).message;
      if (!msg.includes("was closed")) {
        toast.error("YouTube connection failed", { description: msg });
      }
    } finally {
      setBusy((b) => ({ ...b, youtube_connect: false }));
    }
  };

  const doSyncAll = async () => {
    const busyMap: Record<string, boolean> = {};
    PLATFORM_IDS.forEach((p) => { busyMap[p] = true; });
    setBusy(busyMap);
    try {
      const { results } = await syncAllPlatforms();
      const ok = results.filter((r: any) => r.reason === "ok").length;
      toast.success(`Synced ${ok}/${results.length} platforms`);
    } catch (e) {
      toast.error("Sync all failed", { description: (e as Error).message });
    } finally {
      setBusy({});
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

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {PLATFORM_IDS.map((p) => {
          const row = byPlatform[p];
          const isYt = p === "youtube";
          const ytConnected = isYt && ytStatus?.connected;
          const status: ConnectionStatus = (busy[p] ? "syncing" : ytConnected ? "connected" : (row?.status ?? "disconnected")) as ConnectionStatus;
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

              {/* YouTube channel info when connected via OAuth */}
              {isYt && ytConnected && ytStatus?.channel_name && (
                <div className="flex items-center gap-2.5 rounded-md bg-muted/50 px-3 py-2">
                  {ytStatus.channel_avatar && (
                    <img
                      src={ytStatus.channel_avatar}
                      alt=""
                      className="h-8 w-8 rounded-full ring-2 ring-red-500/30"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold">{ytStatus.channel_name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ytStatus.subscriber_count ? `${Number(ytStatus.subscriber_count).toLocaleString()} subscribers` : ""}
                      {ytStatus.video_count ? ` · ${ytStatus.video_count} videos` : ""}
                    </p>
                  </div>
                </div>
              )}

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
                {/* YouTube: Show "Connect with Google" when not connected */}
                {isYt && !ytConnected && (
                  <button
                    onClick={() => void doYtConnect()}
                    disabled={busy.youtube_connect}
                    className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
                    style={{
                      background: "linear-gradient(135deg, #ea4335 0%, #ff6d00 50%, #fbbc05 100%)",
                    }}
                  >
                    {busy.youtube_connect ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogIn className="h-3.5 w-3.5" />
                    )}
                    {busy.youtube_connect ? "Connecting…" : "Connect with Google"}
                  </button>
                )}

                {/* Sync button */}
                <button
                  onClick={() => void doSync(p)}
                  disabled={busy[p]}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busy[p] ? "animate-spin" : ""}`} />
                  {busy[p] ? "Syncing…" : "Sync now"}
                </button>

                {/* Test & Disconnect row */}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => void doTest(p)}
                    disabled={busy[`${p}_test`]}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border bg-secondary px-2 py-1.5 text-[11px] font-semibold hover:bg-secondary/80 disabled:opacity-50"
                  >
                    <PlugZap className="h-3 w-3" />
                    {busy[`${p}_test`] ? "Testing…" : "Test"}
                  </button>
                  <button
                    onClick={() => void doDisconnect(p)}
                    disabled={busy[`${p}_disc`]}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <Unplug className="h-3 w-3" />
                    Disconnect
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
