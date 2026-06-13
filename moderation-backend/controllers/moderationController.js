const moderation = require('../services/moderationService');
const blacklist = require('../services/blacklistService');
const log = require('../services/logService');

exports.run = async (req, res, next) => {
  try { res.json(await moderation.run(req.body || {})); }
  catch (e) { next(e); }
};

exports.negative = async (_req, res, next) => {
  try {
    const items = await moderation.listNegative();
    res.json({ count: items.length, comments: items });
  } catch (e) { next(e); }
};

exports.deleteNegative = async (_req, res, next) => {
  try { res.json(await moderation.deleteAllNegative()); }
  catch (e) { next(e); }
};

exports.logs = (req, res) => {
  res.json({ logs: log.list({ limit: req.query.limit }) });
};

exports.restore = (req, res) => {
  const commentId = req.body?.commentId;
  if (!commentId) return res.status(400).json({ error: 'commentId is required' });
  log.append({ action: 'restore', commentId, platform: req.body?.platform || 'unknown', reason: req.body?.reason || 'admin restore' });
  res.json({ ok: true, commentId });
};

// Blacklist endpoints
exports.blacklistList = (_req, res) => res.json({ users: blacklist.list() });
exports.blacklistAdd = (req, res, next) => {
  try { res.json(blacklist.add(req.body || {})); }
  catch (e) { next(e); }
};
exports.blacklistRemove = (req, res) => {
  res.json(blacklist.remove(req.params.userId, req.query.platform));
};
exports.blacklistCheck = (req, res) => {
  res.json({ userId: req.params.userId, blocked: blacklist.isBlocked(req.params.userId, req.query.platform) });
};
