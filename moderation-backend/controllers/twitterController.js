const svc = require('../services/twitterService');

/**
 * GET /api/twitter/comments
 * Query params:
 *   - conversationId (optional): fetch replies for a single thread
 *   - maxPosts (optional, default 5): how many recent posts to scan
 *   - maxPages (optional, default 2): reply pagination pages per post
 *
 * Returns: { platform: "twitter", count, comments: UnifiedComment[] }
 */
exports.getComments = async (req, res, next) => {
  try {
    const comments = await svc.fetchComments({
      conversationId: req.query.conversationId,
      maxPosts: req.query.maxPosts,
      maxPages: req.query.maxPages,
    });
    res.json({ platform: 'twitter', count: comments.length, comments });
  } catch (e) {
    next(e);
  }
};

exports.deleteComment = async (req, res, next) => {
  try {
    if (!req.params.id) return res.status(400).json({ error: 'id is required' });
    res.json(await svc.deleteComment(req.params.id));
  } catch (e) {
    next(e);
  }
};

exports.bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids[] is required' });
    res.json({ results: await svc.bulkDelete(ids) });
  } catch (e) {
    next(e);
  }
};

exports.xApiIntegration = async (req, res, next) => {
  try {
    const apiUrl = process.env.X_API_URL || 'https://api.twitter.com/2';
    const accessToken = process.env.X_ACCESS_TOKEN || process.env.TWITTER_BEARER_TOKEN;

    if (!accessToken) {
      return res.status(400).json({ error: 'Missing X (Twitter) access token in .env' });
    }

    const axios = require('axios');
    const url = `${apiUrl}/users/me`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    res.json({
      platform: 'twitter',
      integration_status: 'success',
      endpoint: url,
      data: response.data
    });
  } catch (e) {
    if (e.response && e.response.data) {
      return res.status(e.response.status || 500).json({ platform: 'twitter', integration_status: 'error', data: e.response.data });
    }
    next(e);
  }
};
