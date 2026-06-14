const svc = require('../services/instagramService');

exports.getComments = async (_req, res, next) => {
  try {
    const comments = await svc.fetchComments();
    res.json({ platform: 'instagram', count: comments.length, comments });
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
    const apiUrl = process.env.INSTA_API_URL || 'https://graph.instagram.com/v20.0';
    const accessToken = process.env.INSTA_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN;
    const accountId = process.env.INSTAGRAM_ACCOUNT_ID;

    if (!accessToken || !accountId) {
      return res.status(400).json({ error: 'Missing INSTAGRAM access token or account ID in .env' });
    }

    const url = `${apiUrl}/${accountId}?fields=id,username,name&access_token=${accessToken}`;
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ platform: 'instagram', integration_status: 'error', data });
    }

    res.json({
      platform: 'instagram',
      integration_status: 'success',
      endpoint: url.replace(accessToken, 'HIDDEN'),
      data
    });
  } catch (e) {
    next(e);
  }
};
