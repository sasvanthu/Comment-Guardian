/**
 * Instagram Graph API service
 * Docs: https://developers.facebook.com/docs/instagram-api
 */
const axios = require('axios');

const BASE = 'https://graph.facebook.com/v20.0';

function token() {
  const t = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!t) {
    const err = new Error('INSTAGRAM_ACCESS_TOKEN is not configured');
    err.status = 500;
    throw err;
  }
  return t;
}
function accountId() {
  const id = process.env.INSTAGRAM_ACCOUNT_ID;
  if (!id) {
    const err = new Error('INSTAGRAM_ACCOUNT_ID is not configured');
    err.status = 500;
    throw err;
  }
  return id;
}

function normalize(c, mediaId) {
  return {
    id: c.id,
    platform: 'instagram',
    author: c.username || c.from?.username || 'Unknown',
    text: c.text || '',
    timestamp: c.timestamp || new Date().toISOString(),
    postId: mediaId || null,
    sentiment: 'neutral',
  };
}

async function fetchComments() {
  console.log('[instagram] fetchComments');
  const access_token = token();

  // 1) recent media for the IG business account
  const mediaRes = await axios.get(`${BASE}/${accountId()}/media`, {
    params: { fields: 'id', limit: 25, access_token },
    timeout: 15000,
  });
  const media = mediaRes.data?.data || [];
  const all = [];

  for (const m of media) {
    try {
      const { data } = await axios.get(`${BASE}/${m.id}/comments`, {
        params: { fields: 'id,username,text,timestamp', limit: 50, access_token },
        timeout: 15000,
      });
      (data.data || []).forEach((c) => all.push(normalize(c, m.id)));
    } catch (e) {
      console.warn('[instagram] failed to fetch comments for media', m.id, e.message);
    }
  }
  return all;
}

async function deleteComment(id) {
  console.log('[instagram] deleteComment', id);
  const { data } = await axios.delete(`${BASE}/${id}`, {
    params: { access_token: token() },
    timeout: 15000,
  });
  return { id, deleted: !!data?.success };
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
