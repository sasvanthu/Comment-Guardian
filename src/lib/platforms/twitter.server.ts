/**
 * Twitter / X API v2 adapter — incremental.
 * Uses `since_id` (provider-native cursor) when available, else `start_time`
 * from the prior `last_sync_at`. Returns the max tweet id seen as next_cursor.
 */
import type { PlatformId, SyncResult, SyncState, UnifiedComment } from "./types";

const BASE = "https://api.twitter.com/2";

interface FetchOutcome {
  comments: UnifiedComment[];
  rateLimitRemaining: number | null;
  rateLimitResetAt: string | null;
  rateLimited: boolean;
  error?: string;
  nextCursor?: string | null;
}

async function tx(url: string, token: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

function rl(res: Response): { remaining: number | null; resetAt: string | null } {
  const rem = res.headers.get("x-rate-limit-remaining");
  const reset = res.headers.get("x-rate-limit-reset");
  return {
    remaining: rem ? Number(rem) : null,
    resetAt: reset ? new Date(Number(reset) * 1000).toISOString() : null,
  };
}

/** Compare snowflake-like numeric ids as strings (length-then-lex). */
function maxId(a: string | null | undefined, b: string): string {
  if (!a) return b;
  if (a.length !== b.length) return a.length > b.length ? a : b;
  return a > b ? a : b;
}

async function fetchInner(
  token: string,
  userId: string | undefined,
  state: SyncState,
): Promise<FetchOutcome> {
  const out: FetchOutcome = {
    comments: [],
    rateLimitRemaining: null,
    rateLimitResetAt: null,
    rateLimited: false,
    nextCursor: state.cursor ?? null,
  };

  let uid = userId;
  if (!uid) {
    const meRes = await tx(`${BASE}/users/me`, token);
    Object.assign(out, rl(meRes));
    if (meRes.status === 429) { out.rateLimited = true; return out; }
    if (!meRes.ok) { out.error = `users/me ${meRes.status}`; return out; }
    const meJson = (await meRes.json()) as { data?: { id?: string } };
    uid = meJson.data?.id;
    if (!uid) { out.error = "Could not resolve Twitter user id"; return out; }
  }

  const tweetsRes = await tx(
    `${BASE}/users/${uid}/tweets?max_results=10&exclude=replies,retweets&tweet.fields=conversation_id`,
    token,
  );
  Object.assign(out, rl(tweetsRes));
  if (tweetsRes.status === 429) { out.rateLimited = true; return out; }
  if (!tweetsRes.ok) { out.error = `user tweets ${tweetsRes.status}`; return out; }

  const tweetsJson = (await tweetsRes.json()) as {
    data?: Array<{ id: string; conversation_id?: string }>;
  };
  const conversationIds = Array.from(
    new Set((tweetsJson.data ?? []).map((t) => t.conversation_id || t.id).filter(Boolean)),
  ).slice(0, 5);

  for (const cid of conversationIds) {
    const params = new URLSearchParams({
      query: `conversation_id:${cid} is:reply`,
      "tweet.fields": "created_at,author_id,conversation_id,lang",
      expansions: "author_id",
      "user.fields": "name,username",
      max_results: "100",
    });
    // Incremental filters: prefer since_id, fall back to start_time.
    if (state.cursor) {
      params.set("since_id", state.cursor);
    } else if (state.since) {
      params.set("start_time", new Date(state.since).toISOString());
    }

    const repRes = await tx(`${BASE}/tweets/search/recent?${params}`, token);
    Object.assign(out, rl(repRes));
    if (repRes.status === 429) { out.rateLimited = true; return out; }
    if (!repRes.ok) continue;

    const repJson = (await repRes.json()) as {
      data?: Array<{
        id: string; text: string; author_id: string; conversation_id?: string;
        created_at?: string; lang?: string;
      }>;
      meta?: { newest_id?: string };
      includes?: { users?: Array<{ id: string; username?: string; name?: string }> };
    };
    const userMap = Object.fromEntries(
      (repJson.includes?.users ?? []).map((u) => [u.id, u]),
    );
    for (const t of repJson.data ?? []) {
      const u = userMap[t.author_id];
      out.comments.push({
        external_id: t.id,
        platform: "twitter",
        author: u?.username ? `@${u.username}` : u?.name ?? t.author_id,
        text: t.text,
        created_at: t.created_at ?? new Date().toISOString(),
        post_id: t.conversation_id ?? cid,
        permalink: `https://twitter.com/i/web/status/${t.id}`,
        language: t.lang ?? null,
      });
      out.nextCursor = maxId(out.nextCursor, t.id);
    }
    if (repJson.meta?.newest_id) {
      out.nextCursor = maxId(out.nextCursor, repJson.meta.newest_id);
    }
  }
  return out;
}

export async function fetchTwitterComments(
  state: SyncState = {},
): Promise<SyncResult & { comments: UnifiedComment[] }> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  const platform: PlatformId = "twitter";
  if (!token) {
    return { ok: false, platform, reason: "not_configured", fetched: 0, inserted: 0, comments: [] };
  }
  try {
    const r = await fetchInner(token, process.env.TWITTER_USER_ID, state);
    if (r.rateLimited) {
      return {
        ok: false, platform, reason: "rate_limited", fetched: 0, inserted: 0,
        rate_limit_remaining: r.rateLimitRemaining, rate_limit_reset_at: r.rateLimitResetAt,
        error: "Twitter rate limit reached", next_cursor: r.nextCursor ?? null, comments: [],
      };
    }
    if (r.error) {
      return { ok: false, platform, reason: "error", fetched: 0, inserted: 0, error: r.error, comments: [] };
    }
    return {
      ok: true, platform, reason: "ok",
      fetched: r.comments.length, inserted: 0,
      rate_limit_remaining: r.rateLimitRemaining, rate_limit_reset_at: r.rateLimitResetAt,
      next_cursor: r.nextCursor ?? null,
      comments: r.comments,
    };
  } catch (e) {
    return { ok: false, platform, reason: "error", fetched: 0, inserted: 0, error: (e as Error).message, comments: [] };
  }
}
