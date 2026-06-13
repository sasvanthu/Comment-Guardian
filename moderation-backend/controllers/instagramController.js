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
