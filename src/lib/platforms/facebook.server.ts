/**
 * Facebook Graph API adapter — incremental.
 * Uses `since` (unix seconds) on /comments to pull only new items.
 * Returns next_cursor = ISO of the newest comment timestamp seen.
 */
import type { PlatformId, SyncResult, SyncState, UnifiedComment } from "./types";

const BASE = "https://graph.facebook.com/v20.0";

export async function fetchFacebookComments(
  state: SyncState = {},
): Promise<SyncResult & { comments: UnifiedComment[] }> {
  const platform: PlatformId = "facebook";
  const token = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.FACEBOOK_PAGE_ID;
  if (!token || !pageId) {
    return { ok: false, platform, reason: "not_configured", fetched: 0, inserted: 0, comments: [] };
  }

  // Prefer explicit cursor (last newest-comment ISO); fallback to last_sync_at.
  const sinceIso = state.cursor || state.since || null;
  const sinceUnix = sinceIso ? Math.floor(new Date(sinceIso).getTime() / 1000) : null;

  try {
    const postsRes = await fetch(
      `${BASE}/${pageId}/posts?fields=id,permalink_url&limit=10&access_token=${encodeURIComponent(token)}`,
    );
    if (postsRes.status === 429) {
      return { ok: false, platform, reason: "rate_limited", fetched: 0, inserted: 0,
        error: "Facebook rate limit reached", comments: [] };
    }
    if (!postsRes.ok) {
      return { ok: false, platform, reason: "error", fetched: 0, inserted: 0,
        error: `posts ${postsRes.status}`, comments: [] };
    }
    const postsJson = (await postsRes.json()) as {
      data?: Array<{ id: string; permalink_url?: string }>;
    };

    const comments: UnifiedComment[] = [];
    let newestSeen = sinceIso;

    for (const post of postsJson.data ?? []) {
      const params = new URLSearchParams({
        fields: "id,from,message,created_time",
        limit: "100",
        access_token: token,
      });
      if (sinceUnix) params.set("since", String(sinceUnix));

      const cRes = await fetch(`${BASE}/${post.id}/comments?${params}`);
      if (cRes.status === 429) {
        return { ok: false, platform, reason: "rate_limited", fetched: comments.length, inserted: 0,
          error: "Facebook rate limit reached", comments, next_cursor: newestSeen };
      }
      if (!cRes.ok) continue;
      const cJson = (await cRes.json()) as {
        data?: Array<{ id: string; from?: { name?: string; id?: string }; message?: string; created_time?: string }>;
      };
      for (const c of cJson.data ?? []) {
        const createdAt = c.created_time ?? new Date().toISOString();
        // Guard: skip anything not strictly newer than cursor.
        if (sinceIso && createdAt <= sinceIso) continue;
        comments.push({
          external_id: c.id,
          platform: "facebook",
          author: c.from?.name ?? c.from?.id ?? "Unknown",
          text: c.message ?? "",
          created_at: createdAt,
          post_id: post.id,
          permalink: post.permalink_url ?? null,
        });
        if (!newestSeen || createdAt > newestSeen) newestSeen = createdAt;
      }
    }
    return {
      ok: true, platform, reason: "ok",
      fetched: comments.length, inserted: 0,
      next_cursor: newestSeen,
      comments,
    };
  } catch (e) {
    return { ok: false, platform, reason: "error", fetched: 0, inserted: 0, error: (e as Error).message, comments: [] };
  }
}
