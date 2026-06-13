/**
 * Server-fn wrappers driving the incremental sync pipeline.
 *  1. Read prior sync state (last_sync_at + sync_cursor) from platform_connections.
 *  2. Call adapter with that state — adapters only return NEW comments.
 *  3. Upsert into public.comments (idempotent via unique (user_id, platform, external_id)).
 *  4. Persist next_cursor + last_sync_at so the next run picks up where we left off.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PlatformId, SyncResult, SyncState, UnifiedComment } from "./platforms/types";

const PlatformSchema = z.object({
  platform: z.enum(["twitter", "facebook", "instagram"]),
});

async function runAdapter(
  platform: PlatformId,
  state: SyncState,
): Promise<SyncResult & { comments: UnifiedComment[] }> {
  if (platform === "twitter") {
    const { fetchTwitterComments } = await import("./platforms/twitter.server");
    return fetchTwitterComments(state);
  }
  if (platform === "facebook") {
    const { fetchFacebookComments } = await import("./platforms/facebook.server");
    return fetchFacebookComments(state);
  }
  const { fetchInstagramComments } = await import("./platforms/instagram.server");
  return fetchInstagramComments(state);
}

async function loadState(
  supabase: { from: (t: string) => any },
  userId: string,
  platform: PlatformId,
): Promise<SyncState> {
  const { data } = await supabase
    .from("platform_connections")
    .select("last_sync_at, sync_cursor")
    .eq("user_id", userId)
    .eq("platform", platform)
    .maybeSingle();
  return { since: data?.last_sync_at ?? null, cursor: data?.sync_cursor ?? null };
}

async function persistResult(
  supabase: { from: (t: string) => any },
  userId: string,
  platform: PlatformId,
  result: SyncResult,
  priorCursor: string | null,
): Promise<void> {
  const status =
    result.reason === "ok" ? "connected" :
    result.reason === "rate_limited" ? "rate_limited" :
    result.reason === "not_configured" ? "disconnected" : "error";

  await supabase.from("platform_connections").upsert(
    {
      user_id: userId,
      platform,
      status,
      last_sync_at: new Date().toISOString(),
      last_error: result.error ?? null,
      rate_limit_remaining: result.rate_limit_remaining ?? null,
      rate_limit_reset_at: result.rate_limit_reset_at ?? null,
      imported_count: result.inserted,
      sync_cursor: result.next_cursor ?? priorCursor ?? null,
    },
    { onConflict: "user_id,platform" },
  );
}

async function syncOne(
  supabase: { from: (t: string) => any },
  userId: string,
  platform: PlatformId,
): Promise<SyncResult> {
  const state = await loadState(supabase, userId, platform);
  await supabase.from("platform_connections").upsert(
    { user_id: userId, platform, status: "syncing" },
    { onConflict: "user_id,platform" },
  );

  const r = await runAdapter(platform, state);

  let inserted = 0;
  if (r.ok && r.comments.length) {
    const rows = r.comments.map((c) => ({
      user_id: userId, platform: c.platform, author: c.author, text: c.text,
      external_id: c.external_id, post_id: c.post_id ?? null,
      permalink: c.permalink ?? null, language: c.language ?? null,
      created_at: c.created_at,
    }));
    const { error, count } = await supabase.from("comments").upsert(
      rows,
      { onConflict: "user_id,platform,external_id", count: "exact", ignoreDuplicates: true },
    );
    if (error) {
      const msg = (error as { message?: string }).message ?? String(error);
      const failed: SyncResult = { ...r, ok: false, reason: "error", error: msg, inserted: 0 };
      await persistResult(supabase, userId, platform, failed, state.cursor ?? null);
      return failed;
    }
    inserted = count ?? rows.length;

    // Enqueue moderation jobs. The background drainer (process-jobs cron)
    // performs DeepSeek analysis + audit logging + review queue creation.
    try {
      const externalIds = r.comments.map((c) => c.external_id);
      const { data: fresh } = await supabase
        .from("comments")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", platform)
        .in("external_id", externalIds);
      const ids = (fresh ?? []).map((x: { id: string }) => x.id);
      if (ids.length) {
        const { enqueueModerateComments } = await import("./jobs/pipeline.server");
        await enqueueModerateComments(supabase, userId, ids);
      }
    } catch {
      // enqueue must not break the sync pipeline
    }
  }

  const final: SyncResult = { ...r, inserted };
  await persistResult(supabase, userId, platform, final, state.cursor ?? null);
  return final;
}

export const syncPlatform = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PlatformSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as unknown as {
      supabase: { from: (t: string) => any }; userId: string;
    };
    return syncOne(supabase, userId, data.platform as PlatformId);
  });

export const syncAllPlatforms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as unknown as {
      supabase: { from: (t: string) => any }; userId: string;
    };
    const results: SyncResult[] = [];
    for (const platform of ["twitter", "facebook", "instagram"] as PlatformId[]) {
      results.push(await syncOne(supabase, userId, platform));
    }
    return { results };
  });
