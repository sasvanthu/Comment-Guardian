/**
 * Instagram Graph API adapter — incremental.
 * IG comments edge doesn't support `since`, so we filter by timestamp
 * against the stored cursor (newest comment ISO from previous run).
 */
import type { PlatformId, SyncResult, SyncState, UnifiedComment } from "./types";

const BASE = "https://graph.facebook.com/v20.0";

export async function fetchInstagramComments(
  state: SyncState = {},
): Promise<SyncResult & { comments: UnifiedComment[] }> {
  const platform: PlatformId = "instagram";
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igId = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!token || !igId) {
    return { ok: false, platform, reason: "not_configured", fetched: 0, inserted: 0, comments: [] };
  }

  const sinceIso = state.cursor || state.since || null;

  try {
    const mediaRes = await fetch(
      `${BASE}/${igId}/media?fields=id,permalink&limit=10&access_token=${encodeURIComponent(token)}`,
    );
    if (mediaRes.status === 429) {
      return { ok: false, platform, reason: "rate_limited", fetched: 0, inserted: 0,
        error: "Instagram rate limit reached", comments: [] };
    }
    if (!mediaRes.ok) {
      return { ok: false, platform, reason: "error", fetched: 0, inserted: 0,
        error: `media ${mediaRes.status}`, comments: [] };
    }
    const mediaJson = (await mediaRes.json()) as {
      data?: Array<{ id: string; permalink?: string }>;
    };

    const comments: UnifiedComment[] = [];
    let newestSeen = sinceIso;

    for (const m of mediaJson.data ?? []) {
      const cRes = await fetch(
        `${BASE}/${m.id}/comments?fields=id,username,text,timestamp&limit=50&access_token=${encodeURIComponent(token)}`,
      );
      if (cRes.status === 429) {
        return { ok: false, platform, reason: "rate_limited", fetched: comments.length, inserted: 0,
          error: "Instagram rate limit reached", comments, next_cursor: newestSeen };
      }
      if (!cRes.ok) continue;
      const cJson = (await cRes.json()) as {
        data?: Array<{ id: string; username?: string; text?: string; timestamp?: string }>;
      };
      for (const c of cJson.data ?? []) {
        const createdAt = c.timestamp ?? new Date().toISOString();
        if (sinceIso && createdAt <= sinceIso) continue;
        comments.push({
          external_id: c.id,
          platform: "instagram",
          author: c.username ? `@${c.username}` : "Unknown",
          text: c.text ?? "",
          created_at: createdAt,
          post_id: m.id,
          permalink: m.permalink ?? null,
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
