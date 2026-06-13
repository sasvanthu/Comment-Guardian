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
