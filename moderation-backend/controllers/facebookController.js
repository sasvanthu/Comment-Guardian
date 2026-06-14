const svc = require('../services/facebookService');

exports.getComments = async (_req, res, next) => {
  try {
    const comments = await svc.fetchComments();
    res.json({ platform: 'facebook', count: comments.length, comments });
  } catch (e) { next(e); }
};

exports.deleteComment = async (req, res, next) => {
  try {
    if (!req.params.id) return res.status(400).json({ error: 'id is required' });
    res.json(await svc.deleteComment(req.params.id));
  } catch (e) { next(e); }
};

exports.bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids[] is required' });
    res.json({ results: await svc.bulkDelete(ids) });
  } catch (e) { next(e); }
};

exports.graphApiIntegration = async (req, res, next) => {
  try {
    const apiUrl = process.env.FB_API_URL || 'https://graph.facebook.com/v20.0';
    const accessToken = process.env.FB_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    const pageId = process.env.FACEBOOK_PAGE_ID;

    if (!accessToken || !pageId) {
      return res.status(400).json({ error: 'Missing FB access token or page ID in .env' });
    }

    const axios = require('axios');
    const url = `${apiUrl}/${pageId}/posts`;
    const response = await axios.get(url, {
      params: { fields: 'id,message,created_time', limit: 1, access_token: accessToken }
    });

    res.json({
      platform: 'facebook',
      integration_status: 'success',
      endpoint: url,
      data: response.data
    });
  } catch (e) {
    if (e.response && e.response.data) {
      return res.status(e.response.status || 500).json({ platform: 'facebook', integration_status: 'error', data: e.response.data });
    }
    next(e);
  }
};
