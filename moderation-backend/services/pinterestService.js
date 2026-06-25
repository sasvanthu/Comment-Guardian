/**
 * Pinterest API v5 service
 * Docs: https://developers.pinterest.com/docs/api/v5/
 *
 * NOTE: Pinterest API v5 does NOT support deleting or hiding pin comments.
 * This service supports read + sync + AI moderation only.
 */
const axios = require('axios');

const BASE = 'https://api.pinterest.com/v5';

function token() {
  const t = process.env.PINTEREST_ACCESS_TOKEN;
  if (!t) {
    const err = new Error('PINTEREST_ACCESS_TOKEN is not configured');
    err.status = 500;
    throw err;
  }
  return t;
}

function headers() {
  return {
    Authorization: `Bearer ${token()}`,
    'Content-Type': 'application/json',
  };
}

function normalize(c, pinId) {
  return {
    id: c.id || `pin-comment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    platform: 'pinterest',
    author: c.pinner?.username || c.pinner?.full_name || 'Unknown',
    text: c.text || '',
    timestamp: c.created_at || new Date().toISOString(),
    postId: pinId || null,
    sentiment: 'neutral',
  };
}

/** Fetch all pins for the authenticated user, then comments for each. */
async function fetchComments() {
  console.log('[pinterest] fetchComments');
  const accessToken = token();

  // 1) Fetch user's boards
  let pins = [];
  try {
    const boardsRes = await axios.get(`${BASE}/boards`, {
      headers: headers(),
      params: { page_size: 25 },
      timeout: 15000,
    });
    const boards = boardsRes.data?.items || [];

    // 2) Fetch pins from each board
    for (const board of boards) {
      try {
        const pinsRes = await axios.get(`${BASE}/boards/${board.id}/pins`, {
          headers: headers(),
          params: { page_size: 50 },
          timeout: 15000,
        });
        pins.push(...(pinsRes.data?.items || []));
      } catch (e) {
        console.warn('[pinterest] failed to fetch pins for board', board.id, e.message);
      }
    }
  } catch (e) {
    // Fallback: try fetching user's own pins directly
    console.warn('[pinterest] boards fetch failed, trying user pins', e.message);
    const pinsRes = await axios.get(`${BASE}/pins`, {
      headers: headers(),
      params: { page_size: 50 },
      timeout: 15000,
    });
    pins = pinsRes.data?.items || [];
  }

  const all = [];

  // 3) Fetch comments for each pin
  for (const pin of pins.slice(0, 50)) {
    try {
      const { data } = await axios.get(`${BASE}/pins/${pin.id}/comments`, {
        headers: headers(),
        params: { page_size: 100 },
        timeout: 15000,
      });
      (data.items || []).forEach((c) => all.push(normalize(c, pin.id)));
    } catch (e) {
      // 404 or 403 is expected for pins without comments or pins that don't support it
      if (e.response?.status !== 404 && e.response?.status !== 403) {
        console.warn('[pinterest] failed to fetch comments for pin', pin.id, e.message);
      }
    }
  }
  return all;
}

function loadPinterestCreds() {
  const t = process.env.PINTEREST_ACCESS_TOKEN;
  if (!t) return null;
  return { token: t.trim() };
}

function diagnosePinterestCreds() {
  const raw = process.env.PINTEREST_ACCESS_TOKEN ?? '';
  return {
    token_present: !!raw,
    token_prefix: raw ? raw.trim().slice(0, 5) : null,
  };
}

async function testPinterestConnection() {
  const diagnostics = diagnosePinterestCreds();
  const creds = loadPinterestCreds();
  if (!creds) {
    return {
      ok: false,
      status: 'not_configured',
      error: 'Missing PINTEREST_ACCESS_TOKEN',
      diagnostics,
    };
  }
  try {
    const res = await axios.get(`${BASE}/user_account`, {
      headers: { Authorization: `Bearer ${creds.token}` },
      timeout: 15000,
    });
    if (!res.data || !res.data.username) {
      return { ok: false, status: 'invalid_account', error: 'Pinterest account not resolvable', diagnostics };
    }
    return {
      ok: true,
      status: 'connected',
      account: {
        id: res.data.username,
        name: res.data.business_name || res.data.username,
        username: res.data.username,
      },
    };
  } catch (e) {
    const msg = e.response?.data?.message || e.response?.data?.error || e.message;
    return { ok: false, status: 'error', error: msg, diagnostics };
  }
}

async function syncPinterestForUser(supabase, userId) {
  const started = Date.now();
  const stats = { imported: 0, skipped: 0, failed: 0, comment_count: 0, duration_ms: 0, errors: [] };

  const creds = loadPinterestCreds();
  if (!creds) return { ...stats, ok: false, reason: 'not_configured' };

  await supabase.from('platform_connections').upsert(
    { user_id: userId, platform: 'pinterest', status: 'syncing' },
    { onConflict: 'user_id,platform' }
  );

  let comments = [];
  try {
    comments = await fetchComments();
    stats.comment_count = comments.length;
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    await supabase.from('platform_connections').upsert({
      user_id: userId, platform: 'pinterest', status: 'error', last_error: msg,
    }, { onConflict: 'user_id,platform' });
    return { ...stats, ok: false, reason: 'error', error: msg };
  }

  if (comments.length) {
    const rows = comments.map((c) => ({
      user_id: userId,
      platform: 'pinterest',
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
      await moderationService.run({ platform: 'pinterest', comments });
    } catch (err) {
      console.warn('[pinterest] Moderation run failed after sync', err.message);
    }
  }

  stats.duration_ms = Date.now() - started;
  await supabase.from('platform_connections').upsert({
    user_id: userId, platform: 'pinterest', status: 'connected',
    last_sync_at: new Date().toISOString(), imported_count: stats.imported,
  }, { onConflict: 'user_id,platform' });

  return { ...stats, ok: true, reason: 'ok' };
}

async function disconnectPinterestForUser(supabase, userId) {
  await supabase.from('platform_connections').upsert({
    user_id: userId, platform: 'pinterest', status: 'disconnected', last_error: null, sync_cursor: null,
  }, { onConflict: 'user_id,platform' });
}

module.exports = {
  fetchComments,
  normalize,
  testPinterestConnection,
  syncPinterestForUser,
  disconnectPinterestForUser,
};
