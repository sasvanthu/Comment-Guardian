/**
 * Block-guard middleware — rejects requests authored by blacklisted users.
 * Expects req.body.userId (or req.body.author.id) and req.body.platform.
 */
const blacklist = require('../services/blacklistService');

module.exports = function blockGuard(req, res, next) {
  const userId = req.body?.userId || req.body?.author?.id;
  const platform = req.body?.platform;
  if (userId && blacklist.isBlocked(userId, platform)) {
    return res.status(403).json({
      error: 'User is blacklisted and cannot post comments.',
      userId, platform,
    });
  }
  next();
};
