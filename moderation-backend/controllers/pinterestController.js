const svc = require('../services/pinterestService');

exports.getComments = async (_req, res, next) => {
  try {
    const comments = await svc.fetchComments();
    res.json({ platform: 'pinterest', count: comments.length, comments });
  } catch (e) { next(e); }
};
