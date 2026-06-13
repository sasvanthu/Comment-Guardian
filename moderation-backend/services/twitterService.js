/**
 * Twitter / X API v2 service
 * Docs: https://developer.x.com/en/docs/twitter-api
 *
 * Strategy for fetching "reply comments":
 *   1. Resolve the authed user (GET /users/me) — or use TWITTER_USER_ID if set.
 *   2. List the user's recent original tweets (GET /users/:id/tweets, excluding
 *      replies/retweets) to discover conversation_ids.
 *   3. For each conversation_id, query GET /tweets/search/recent with
 *      `conversation_id:<id>` to pull all replies (paginated).
 *   4. Normalize every reply into the unified comment shape.
 *
 * Optional query params on the route:
 *   - conversationId: scope to a single thread (skip steps 1-2)
 *   - maxPosts:       how many recent original tweets to scan (default 5, max 20)
 *   - maxPages:       reply pagination pages per conversation  (default 2, max 5)
 */
const axios = require('axios');

const BASE = 'https://api.twitter.com/2';
const PAGE_SIZE = 100; // v2 max for search/recent and user mentions

// ---------- low-level client ----------

function client() {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    const err = new Error('TWITTER_BEARER_TOKEN is not configured');
    err.status = 500;
    throw err;
  }
  return axios.create({
    baseURL: BASE,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 15000,
    // Don't throw on 4xx so we can surface a clean error message.
    validateStatus: (s) => s < 500,
  });
}

function ensureOk(res, label) {
  if (res.status >= 400) {
    const detail =
      res.data?.detail || res.data?.title || res.data?.error || JSON.stringify(res.data);
    const err = new Error(`Twitter API ${label} failed (${res.status}): ${detail}`);
    err.status = res.status === 429 ? 429 : 502;
    throw err;
  }
}

// ---------- unified normalizer ----------

/**
 * Map a v2 Tweet object into the unified comment shape used across platforms.
 *   { id, platform, author, text, timestamp, postId, sentiment }
 */
function normalize(tweet, authorMap = {}) {
  const author = authorMap[tweet.author_id] || {};
  const authorName =
    author.username ? `@${author.username}` : author.name || tweet.author_id || 'unknown';

  return {
    id: tweet.id,
    platform: 'twitter',
    author: authorName,
    text: tweet.text || '',
    timestamp: tweet.created_at || new Date().toISOString(),
    // For a reply, the original post is the conversation root.
    postId: tweet.conversation_id || null,
    sentiment: 'neutral', // filled in later by the AI pipeline
  };
}

// ---------- helpers ----------

async function resolveUserId(api) {
  if (process.env.TWITTER_USER_ID) return process.env.TWITTER_USER_ID;
  const res = await api.get('/users/me');
  ensureOk(res, 'GET /users/me');
  const id = res.data?.data?.id;
  if (!id) {
    const err = new Error('Could not resolve authed Twitter user id');
    err.status = 500;
    throw err;
  }
  return id;
}

async function listRecentConversationIds(api, userId, maxPosts) {
  const res = await api.get(`/users/${userId}/tweets`, {
    params: {
      max_results: Math.max(5, Math.min(100, maxPosts * 2)),
      exclude: 'replies,retweets',
      'tweet.fields': 'conversation_id',
    },
  });
  ensureOk(res, `GET /users/${userId}/tweets`);
  const ids = (res.data?.data || [])
    .map((t) => t.conversation_id || t.id)
    .filter(Boolean);
  // de-dupe and cap
  return [...new Set(ids)].slice(0, maxPosts);
}

async function fetchRepliesForConversation(api, conversationId, maxPages) {
  const replies = [];
  let nextToken = undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = {
      query: `conversation_id:${conversationId} is:reply`,
      'tweet.fields': 'created_at,author_id,conversation_id,in_reply_to_user_id',
      expansions: 'author_id',
      'user.fields': 'name,username',
      max_results: PAGE_SIZE,
    };
    if (nextToken) params.next_token = nextToken;

    const res = await api.get('/tweets/search/recent', { params });
    ensureOk(res, 'GET /tweets/search/recent');

    const authorMap = Object.fromEntries(
      (res.data?.includes?.users || []).map((u) => [u.id, u]),
    );
    for (const t of res.data?.data || []) {
      replies.push(normalize(t, authorMap));
    }

    nextToken = res.data?.meta?.next_token;
    if (!nextToken) break;
  }

  return replies;
}

// ---------- public API ----------

/**
 * Fetch reply comments to the authed account's recent tweets,
 * returning an array of unified comment objects.
 */
async function fetchComments({ conversationId, maxPosts = 5, maxPages = 2 } = {}) {
  const api = client();
  const cappedPosts = Math.max(1, Math.min(20, Number(maxPosts) || 5));
  const cappedPages = Math.max(1, Math.min(5, Number(maxPages) || 2));

  console.log('[twitter] fetchComments', { conversationId, cappedPosts, cappedPages });

  // Single-thread mode
  if (conversationId) {
    return fetchRepliesForConversation(api, conversationId, cappedPages);
  }

  // Multi-thread mode: discover then fan out
  const userId = await resolveUserId(api);
  const conversationIds = await listRecentConversationIds(api, userId, cappedPosts);

  const all = [];
  for (const cid of conversationIds) {
    try {
      const replies = await fetchRepliesForConversation(api, cid, cappedPages);
      all.push(...replies);
    } catch (e) {
      console.warn('[twitter] failed to fetch replies for conversation', cid, e.message);
    }
  }

  // De-dupe by id (a reply could be returned across overlapping queries)
  const byId = new Map();
  for (const c of all) byId.set(c.id, c);
  return [...byId.values()].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/** Delete a tweet by id (must be owned by authed user). */
async function deleteComment(id) {
  const api = client();
  console.log('[twitter] deleteComment', id);
  const res = await api.delete(`/tweets/${id}`);
  ensureOk(res, `DELETE /tweets/${id}`);
  return { id, deleted: !!res.data?.data?.deleted };
}

async function bulkDelete(ids = []) {
  const results = [];
  for (const id of ids) {
    try {
      results.push(await deleteComment(id));
    } catch (e) {
      results.push({ id, deleted: false, error: e.message });
    }
  }
  return results;
}

module.exports = { fetchComments, deleteComment, bulkDelete, normalize };
