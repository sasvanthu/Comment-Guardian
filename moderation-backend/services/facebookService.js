/**
 * Facebook Graph API service
 * Docs: https://developers.facebook.com/docs/graph-api
 */
const axios = require('axios');

const BASE = 'https://graph.facebook.com/v20.0';

function token() {
  const t = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  if (!t) {
    const err = new Error('FACEBOOK_PAGE_ACCESS_TOKEN is not configured');
    err.status = 500;
    throw err;
  }
  return t;
}

function pageId() {
  const id = process.env.FACEBOOK_PAGE_ID;
  if (!id) {
    const err = new Error('FACEBOOK_PAGE_ID is not configured');
    err.status = 500;
    throw err;
  }
  return id;
}

function normalize(c, postId) {
  return {
    id: c.id,
    platform: 'facebook',
    author: c.from?.name || 'Unknown',
    text: c.message || '',
    timestamp: c.created_time || new Date().toISOString(),
    postId: postId || null,
    sentiment: 'neutral',
  };
}

/** Fetch comments across all recent posts on the page. */
async function fetchComments() {
  console.log('[facebook] fetchComments');
  const access_token = token();

  // 1) recent posts
  const postsRes = await axios.get(`${BASE}/${pageId()}/posts`, {
    params: { fields: 'id', limit: 25, access_token },
    timeout: 15000,
  });

  const posts = postsRes.data?.data || [];
  const all = [];

  // 2) comments for each post
  for (const post of posts) {
    try {
      const { data } = await axios.get(`${BASE}/${post.id}/comments`, {
        params: { fields: 'id,from,message,created_time', limit: 100, access_token },
        timeout: 15000,
      });
      (data.data || []).forEach((c) => all.push(normalize(c, post.id)));
    } catch (e) {
      console.warn('[facebook] failed to fetch comments for post', post.id, e.message);
    }
  }
  return all;
}

async function deleteComment(id) {
  console.log('[facebook] deleteComment', id);
  const { data } = await axios.delete(`${BASE}/${id}`, {
    params: { access_token: token() },
    timeout: 15000,
  });
  return { id, deleted: !!data?.success };
}

async function replyToComment(id, message) {
  console.log('[facebook] replyToComment', id);
  const { data } = await axios.post(`${BASE}/${id}/comments`, { message }, {
    params: { access_token: token() },
    timeout: 15000,
  });
  return { id, repliedId: data?.id };
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

async function hideComment(id) {
  console.log('[facebook] hideComment', id);
  const { data } = await axios.post(`${BASE}/${id}`, { is_hidden: true }, {
    params: { access_token: token() },
    timeout: 15000,
  });
  return { id, hidden: !!data?.success };
}

async function unhideComment(id) {
  console.log('[facebook] unhideComment', id);
  const { data } = await axios.post(`${BASE}/${id}`, { is_hidden: false }, {
    params: { access_token: token() },
    timeout: 15000,
  });
  return { id, hidden: !data?.success };
}

function loadFacebookCreds() {
  const t = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
  const id = process.env.FACEBOOK_PAGE_ID;
  if (!t || !id) return null;
  return { token: t.trim(), pageId: id.trim() };
}

function diagnoseFacebookCreds() {
  const raw = process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? "";
  const rawId = process.env.FACEBOOK_PAGE_ID ?? "";
  return {
    token_present: !!raw,
    token_prefix: raw ? raw.trim().slice(0, 5) : null,
    page_id_present: !!rawId,
    page_id: rawId.trim() || null,
  };
}

async function testFacebookConnection() {
  const diagnostics = diagnoseFacebookCreds();
  const creds = loadFacebookCreds();
  if (!creds) {
    return {
      ok: false,
      status: "not_configured",
      error: "Missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID",
      diagnostics,
    };
  }
  try {
    const res = await axios.get(`${BASE}/${encodeURIComponent(creds.pageId)}`, {
      params: { fields: 'id,name,username', access_token: creds.token },
      timeout: 15000,
    });
    if (!res.data || !res.data.id) {
      return { ok: false, status: "invalid_account", error: "Facebook Page not resolvable", diagnostics };
    }
    return {
      ok: true,
      status: "connected",
      account: { id: res.data.id, name: res.data.name, username: res.data.username || res.data.name },
    };
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    return { ok: false, status: "error", error: msg, diagnostics };
  }
}

async function syncFacebookForUser(supabase, userId) {
  const started = Date.now();
  const stats = { imported: 0, skipped: 0, failed: 0, comment_count: 0, duration_ms: 0, errors: [] };

  const creds = loadFacebookCreds();
  if (!creds) return { ...stats, ok: false, reason: "not_configured" };

  await supabase.from("platform_connections").upsert({ user_id: userId, platform: "facebook", status: "syncing" }, { onConflict: "user_id,platform" });

  let comments = [];
  try {
    comments = await fetchComments();
    stats.comment_count = comments.length;
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message;
    await supabase.from("platform_connections").upsert({
      user_id: userId, platform: "facebook", status: "error", last_error: msg,
    }, { onConflict: "user_id,platform" });
    return { ...stats, ok: false, reason: "error", error: msg };
  }

  if (comments.length) {
    const rows = comments.map((c) => ({
      user_id: userId,
      platform: "facebook",
      author: c.author,
      text: c.text,
      external_id: c.id,
      post_id: c.postId,
      permalink: null,
      created_at: c.timestamp,
    }));
    const { error, count } = await supabase.from("comments").upsert(rows, { onConflict: "user_id,platform,external_id", count: "exact", ignoreDuplicates: true });
    if (error) {
      return { ...stats, ok: false, reason: "error", error: error.message };
    }
    stats.imported = count ?? 0;
    stats.skipped = comments.length - stats.imported;

    try {
      const moderationService = require('./moderationService');
      await moderationService.run({ platform: 'facebook', comments: comments });
    } catch (err) {
      console.warn('[facebook] Moderation run failed after sync', err.message);
    }
  }

  stats.duration_ms = Date.now() - started;
  await supabase.from("platform_connections").upsert({
    user_id: userId, platform: "facebook", status: "connected",
    last_sync_at: new Date().toISOString(), imported_count: stats.imported,
  }, { onConflict: "user_id,platform" });

  return { ...stats, ok: true, reason: "ok" };
}

async function disconnectFacebookForUser(supabase, userId) {
  await supabase.from("platform_connections").upsert({
    user_id: userId, platform: "facebook", status: "disconnected", last_error: null, sync_cursor: null,
  }, { onConflict: "user_id,platform" });
}

async function banUser(id) {
  const creds = loadFacebookCreds();
  if (!creds) throw new Error("No creds");
  console.log('[facebook] banUser via comment', id);
  
  // 1. Get author of the comment
  const commentRes = await axios.get(`${BASE}/${id}`, {
    params: { fields: 'from', access_token: creds.token },
    timeout: 15000,
  });
  const authorId = commentRes.data?.from?.id;
  if (!authorId) throw new Error('Could not resolve author_id for comment');
  
  // 2. Block the user from the page
  const blockRes = await axios.post(`${BASE}/${creds.pageId}/blocked`, { user: authorId }, {
    params: { access_token: creds.token },
    timeout: 15000,
  });
  
  return { id, banned: !!blockRes.data?.success, authorId };
}

module.exports = {
  fetchComments,
  deleteComment,
  hideComment,
  unhideComment,
  banUser,
  replyToComment,
  bulkDelete,
  normalize,
  testFacebookConnection,
  syncFacebookForUser,
  disconnectFacebookForUser,
};
