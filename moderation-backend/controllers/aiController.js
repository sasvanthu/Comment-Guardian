const ai = require('../services/aiService');
const twitter = require('../services/twitterService');
const facebook = require('../services/facebookService');
const instagram = require('../services/instagramService');

exports.analyze = async (req, res, next) => {
  try {
    const text = req.body?.text;
    if (!text) return res.status(400).json({ error: 'text is required' });
    res.json(await ai.analyzeComment(text));
  } catch (e) { next(e); }
};

exports.analyzeBulk = async (req, res, next) => {
  try {
    const comments = Array.isArray(req.body?.comments) ? req.body.comments : [];
    if (!comments.length) return res.status(400).json({ error: 'comments[] is required' });
    res.json({ results: await ai.analyzeBulk(comments) });
  } catch (e) { next(e); }
};

/**
 * Auto-moderate: take an array of comments (or fetch from a given platform),
 * analyze each, then delete the toxic ones.
 * Body: { platform?: 'twitter'|'facebook'|'instagram', comments?: [], threshold?: 70 }
 */
exports.autoModerate = async (req, res, next) => {
  try {
    const { platform, comments: provided, threshold = 70 } = req.body || {};
    let comments = Array.isArray(provided) ? provided : null;

    if (!comments) {
      if (platform === 'twitter') comments = await twitter.fetchComments();
      else if (platform === 'facebook') comments = await facebook.fetchComments();
      else if (platform === 'instagram') comments = await instagram.fetchComments();
      else return res.status(400).json({ error: 'platform or comments[] is required' });
    }

    const analyses = await ai.analyzeBulk(comments);
    const toxic = analyses.filter((a) => a && !a.error && (a.toxic || a.score >= threshold));

    // map analysis -> original comment for deletion
    const byId = new Map(comments.map((c) => [c.id, c]));
    const deletions = [];
    for (const a of toxic) {
      const c = byId.get(a.id);
      if (!c) continue;
      try {
        let result;
        if (c.platform === 'twitter') result = await twitter.deleteComment(c.id);
        else if (c.platform === 'facebook') result = await facebook.deleteComment(c.id);
        else if (c.platform === 'instagram') result = await instagram.deleteComment(c.id);
        else result = { id: c.id, deleted: false, error: 'unknown platform' };
        deletions.push({ ...result, platform: c.platform, reason: a.reason, score: a.score });
      } catch (e) {
        deletions.push({ id: c.id, deleted: false, platform: c.platform, error: e.message });
      }
    }

    res.json({
      analyzed: analyses.length,
      toxicFound: toxic.length,
      deleted: deletions.filter((d) => d.deleted).length,
      report: deletions,
    });
  } catch (e) { next(e); }
};
