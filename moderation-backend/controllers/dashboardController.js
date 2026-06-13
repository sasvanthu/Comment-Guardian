/**
 * Dashboard controller - cross-platform aggregation.
 */
const ai = require('../services/aiService');
const blacklist = require('../services/blacklistService');
const log = require('../services/logService');
const { gatherAll, deleteAllNegative } = require('../services/moderationService');

exports.allComments = async (_req, res, next) => {
  try {
    const comments = await gatherAll();
    res.json({ count: comments.length, comments });
  } catch (e) { next(e); }
};

exports.stats = async (_req, res, next) => {
  try {
    const comments = await gatherAll();

    let analyses = [];
    try { analyses = await ai.analyzeBulk(comments); }
    catch (e) { console.warn('[dashboard] AI analysis skipped:', e.message); }

    const languageDistribution = {};
    let positive = 0, negative = 0, neutral = 0, spam = 0, deletedRecommended = 0, blockRecommended = 0;

    for (const a of analyses) {
      if (!a || a.error) continue;
      if (a.sentiment === 'positive') positive++;
      else if (a.sentiment === 'negative') negative++;
      else neutral++;
      if (a.categories?.includes('spam') || a.categories?.includes('scam')) spam++;
      if (a.decision === 'delete') deletedRecommended++;
      if (a.decision === 'block') blockRecommended++;
      if (a.languageName) languageDistribution[a.languageName] = (languageDistribution[a.languageName] || 0) + 1;
    }

    const byPlatform = comments.reduce((acc, c) => {
      acc[c.platform] = (acc[c.platform] || 0) + 1;
      return acc;
    }, {});

    res.json({
      total: comments.length,
      positive, negative, neutral, spam,
      deletedRecommended, blockRecommended,
      blockedUsers: blacklist.list().length,
      byPlatform,
      languageDistribution,
      recentLogs: log.list({ limit: 25 }),
    });
  } catch (e) { next(e); }
};

exports.autoClean = async (_req, res, next) => {
  try { res.json(await deleteAllNegative()); }
  catch (e) { next(e); }
};
