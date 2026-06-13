/**
 * Cron endpoint: every 15 minutes pg_cron POSTs here. For each
 * connected (user, platform) pair we run an INCREMENTAL sync — adapters
 * are called with the row's last_sync_at + sync_cursor and only fetch new
 * comments since the previous run. Authenticated via Supabase anon key.
 */
import { createFileRoute } from "@tanstack/react-router";
import type { PlatformId, SyncResult, SyncState, UnifiedComment } from "@/lib/platforms/types";

async function runAdapter(
  platform: PlatformId,
  state: SyncState,
): Promise<SyncResult & { comments: UnifiedComment[] }> {
  if (platform === "twitter") {
    const { fetchTwitterComments } = await import("@/lib/platforms/twitter.server");
    return fetchTwitterComments(state);
  }
  if (platform === "facebook") {
    const { fetchFacebookComments } = await import("@/lib/platforms/facebook.server");
    return fetchFacebookComments(state);
  }
  const { fetchInstagramComments } = await import("@/lib/platforms/instagram.server");
  return fetchInstagramComments(state);
}

export const Route = createFileRoute("/api/public/hooks/sync-platforms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: conns } = await supabaseAdmin
          .from("platform_connections")
          .select("user_id, platform, last_sync_at, sync_cursor");

        const summary: Array<{ user_id: string; platform: PlatformId; reason?: string; inserted: number }> = [];

        for (const row of conns ?? []) {
          const platform = row.platform as PlatformId;
          const userId = row.user_id as string;
          const state: SyncState = {
            since: (row as { last_sync_at: string | null }).last_sync_at ?? null,
            cursor: (row as { sync_cursor: string | null }).sync_cursor ?? null,
          };

          const r = await runAdapter(platform, state);

          let inserted = 0;
          if (r.ok && r.comments.length) {
            const rows = r.comments.map((c) => ({
              user_id: userId, platform: c.platform, author: c.author, text: c.text,
              external_id: c.external_id, post_id: c.post_id ?? null,
              permalink: c.permalink ?? null, language: c.language ?? null,
              created_at: c.created_at,
            }));
            const { count, error: upsertErr } = await supabaseAdmin
              .from("comments")
              .upsert(rows, { onConflict: "user_id,platform,external_id", count: "exact", ignoreDuplicates: true });
            if (upsertErr) {
              // Surface the upsert failure on the connection row instead of swallowing it.
              await supabaseAdmin.from("platform_connections").upsert({
                user_id: userId, platform, status: "error",
                last_sync_at: new Date().toISOString(),
                last_error: upsertErr.message,
                sync_cursor: state.cursor ?? null,
              }, { onConflict: "user_id,platform" });
              summary.push({ user_id: userId, platform, reason: "error", inserted: 0 });
              continue;
            }
            inserted = count ?? rows.length;

            // Enqueue moderation jobs for freshly upserted comments.
            // Actual DeepSeek work runs in the background drainer (process-jobs).
            try {
              const externalIds = r.comments.map((c) => c.external_id);
              const { data: fresh } = await supabaseAdmin
                .from("comments")
                .select("id")
                .eq("user_id", userId)
                .eq("platform", platform)
                .in("external_id", externalIds);
              const ids = (fresh ?? []).map((x: { id: string }) => x.id);
              if (ids.length) {
                const { enqueueModerateComments } = await import("@/lib/jobs/pipeline.server");
                await enqueueModerateComments(supabaseAdmin, userId, ids);
              }
            } catch {
              // enqueue failures must not break the cron sync
            }
          }

          const status =
            r.reason === "ok" ? "connected" :
            r.reason === "rate_limited" ? "rate_limited" :
            r.reason === "not_configured" ? "disconnected" : "error";

          await supabaseAdmin.from("platform_connections").upsert({
            user_id: userId, platform, status,
            last_sync_at: new Date().toISOString(),
            last_error: r.error ?? null,
            rate_limit_remaining: r.rate_limit_remaining ?? null,
            rate_limit_reset_at: r.rate_limit_reset_at ?? null,
            imported_count: inserted,
            sync_cursor: r.next_cursor ?? state.cursor ?? null,
          }, { onConflict: "user_id,platform" });

          summary.push({ user_id: userId, platform, reason: r.reason, inserted });
        }

        return Response.json({ ok: true, processed: summary.length, summary });
      },
    },
  },
});
