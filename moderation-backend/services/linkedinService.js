/**
 * LinkedIn API service
 * Uses the LinkedIn Community Management API (formerly Marketing API)
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api
 */
const axios = require('axios');

const BASE = 'https://api.linkedin.com/v2';
const REST_BASE = 'https://api.linkedin.com/rest';

function token() {
  const t = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!t) {
    const err = new Error('LINKEDIN_ACCESS_TOKEN is not configured');
    err.status = 500;
    throw err;
  }
  return t;
}

function orgId() {
  const id = process.env.LINKEDIN_ORGANIZATION_ID;
  if (!id) {
    const err = new Error('LINKEDIN_ORGANIZATION_ID is not configured');
    err.status = 500;
    throw err;
  }
  return id;
}

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': '202406',
  };
}

function normalize(c, postUrn) {
  return {
    id: c['$URN'] || c.id || `li-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    platform: 'linkedin',
    author: c.actor?.['com.linkedin.voyager.feed.MemberActor']?.miniProfile?.publicIdentifier
      || c.authorUrn || c.actor || 'Unknown',
    text: c.message?.text || c.comment || '',
    timestamp: c.created?.time
      ? new Date(c.created.time).toISOString()
      : new Date().toISOString(),
    postId: postUrn || null,
    sentiment: 'neutral',
  };
}

/** Fetch comments across recent organization posts. */
async function fetchComments() {
  console.log('[linkedin] fetchComments');
  const accessToken = token();
  const organization = orgId();

  // 1) Fetch recent organization posts (shares)
  const postsRes = await axios.get(`${BASE}/ugcPosts`, {
    params: {
      q: 'authors',
      authors: `List(urn:li:organization:${organization})`,
      count: 25,
    },
    headers: headers(),
    timeout: 15000,
  });

  const posts = postsRes.data?.elements || [];
  const all = [];

  // 2) Fetch comments for each post
  for (const post of posts) {
    const postUrn = post.id || post['$URN'];
    if (!postUrn) continue;

    try {
      const encodedUrn = encodeURIComponent(postUrn);
      const { data } = await axios.get(`${BASE}/socialActions/${encodedUrn}/comments`, {
        params: { count: 100 },
        headers: headers(),
        timeout: 15000,
      });
      (data.elements || []).forEach((c) => all.push(normalize(c, postUrn)));
    } catch (e) {
      console.warn('[linkedin] failed to fetch comments for post', postUrn, e.message);
    }
  }
  return all;
}

async function deleteComment(commentUrn) {
  console.log('[linkedin] deleteComment', commentUrn);
  const encodedUrn = encodeURIComponent(commentUrn);
  const { data } = await axios.delete(`${BASE}/socialActions/${encodedUrn}`, {
    headers: headers(),
    timeout: 15000,
  });
  return { id: commentUrn, deleted: true };
}

async function replyToComment(postUrn, commentUrn, message) {
  console.log('[linkedin] replyToComment', commentUrn);
  const encodedPostUrn = encodeURIComponent(postUrn);
  const { data } = await axios.post(
    `${BASE}/socialActions/${encodedPostUrn}/comments`,
    {
      actor: `urn:li:organization:${orgId()}`,
      message: { text: message },
      parentComment: commentUrn,
    },
    { headers: headers(), timeout: 15000 }
  );
  return { id: commentUrn, repliedId: data?.id || data?.['$URN'] };
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

function loadLinkedinCreds() {
  const t = process.env.LINKEDIN_ACCESS_TOKEN;
  const id = process.env.LINKEDIN_ORGANIZATION_ID;
  if (!t || !id) return null;
  return { token: t.trim(), orgId: id.trim() };
}

function diagnoseLinkedinCreds() {
  const raw = process.env.LINKEDIN_ACCESS_TOKEN ?? '';
  const rawId = process.env.LINKEDIN_ORGANIZATION_ID ?? '';
  return {
    token_present: !!raw,
    token_prefix: raw ? raw.trim().slice(0, 5) : null,
    org_id_present: !!rawId,
    org_id: rawId.trim() || null,
  };
}

async function testLinkedinConnection() {
  const diagnostics = diagnoseLinkedinCreds();
  const creds = loadLinkedinCreds();
  if (!creds) {
    return {
      ok: false,
      status: 'not_configured',
      error: 'Missing LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORGANIZATION_ID',
      diagnostics,
    };
  }
  try {
    // Verify by fetching the organization profile
    const res = await axios.get(`${BASE}/organizations/${encodeURIComponent(creds.orgId)}`, {
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202406',
      },
      timeout: 15000,
    });
    if (!res.data || !res.data.id) {
      return { ok: false, status: 'invalid_account', error: 'LinkedIn Organization not resolvable', diagnostics };
    }
    return {
      ok: true,
      status: 'connected',
      account: {
        id: res.data.id,
        name: res.data.localizedName || res.data.vanityName || 'Unknown',
        username: res.data.vanityName || res.data.localizedName || 'Unknown',
      },
    };
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error || e.message;
    return { ok: false, status: 'error', error: msg, diagnostics };
  }
}

async function syncLinkedinForUser(supabase, userId) {
  const started = Date.now();
  const stats = { imported: 0, skipped: 0, failed: 0, comment_count: 0, duration_ms: 0, errors: [] };

  const creds = loadLinkedinCreds();
  if (!creds) return { ...stats, ok: false, reason: 'not_configured' };

  await supabase.from('platform_connections').upsert(
    { user_id: userId, platform: 'linkedin', status: 'syncing' },
    { onConflict: 'user_id,platform' }
  );

  let comments = [];
  try {
    comments = await fetchComments();
    stats.comment_count = comments.length;
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    await supabase.from('platform_connections').upsert({
      user_id: userId, platform: 'linkedin', status: 'error', last_error: msg,
    }, { onConflict: 'user_id,platform' });
    return { ...stats, ok: false, reason: 'error', error: msg };
  }

  if (comments.length) {
    const rows = comments.map((c) => ({
      user_id: userId,
      platform: 'linkedin',
      author: c.author,
      text: c.text,
      external_id: c.id,
      post_id: c.postId,
      permalink: null,
      created_at: c.timestamp,
    }));
    const { error, count } = await supabase.from('comments').upsert(rows, {
      onConflict: 'user_id,platform,external_id', count: 'exact', ignoreDuplicates: true,
    });
    if (error) {
      return { ...stats, ok: false, reason: 'error', error: error.message };
    }
    stats.imported = count ?? 0;
    stats.skipped = comments.length - stats.imported;

    try {
      const moderationService = require('./moderationService');
      await moderationService.run({ platform: 'linkedin', comments });
    } catch (err) {
      console.warn('[linkedin] Moderation run failed after sync', err.message);
    }
  }

  stats.duration_ms = Date.now() - started;
  await supabase.from('platform_connections').upsert({
    user_id: userId, platform: 'linkedin', status: 'connected',
    last_sync_at: new Date().toISOString(), imported_count: stats.imported,
  }, { onConflict: 'user_id,platform' });

  return { ...stats, ok: true, reason: 'ok' };
}

async function disconnectLinkedinForUser(supabase, userId) {
  await supabase.from('platform_connections').upsert({
    user_id: userId, platform: 'linkedin', status: 'disconnected', last_error: null, sync_cursor: null,
  }, { onConflict: 'user_id,platform' });
}

module.exports = {
  fetchComments,
  deleteComment,
  replyToComment,
  bulkDelete,
  normalize,
  testLinkedinConnection,
  syncLinkedinForUser,
  disconnectLinkedinForUser,
};
