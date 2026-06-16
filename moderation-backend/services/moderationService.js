/**
 * Moderation pipeline:
 *   1. analyze comment(s) with AI
 *   2. apply rules → action (allow / review / delete / block)
 *   3. perform deletion on the source platform
 *   4. add user to blacklist when policy says so
 *   5. record every action in the moderation log
 */
const ai = require('./aiService');
const blacklist = require('./blacklistService');
const log = require('./logService');
const twitter = require('./twitterService');
const facebook = require('./facebookService');
const instagram = require('./instagramService');
const youtube = require('./youtubeService');

const BLOCK_CATEGORIES = new Set(['hate', 'threats', 'cyberbullying', 'scam']);

function platformService(platform) {
  if (platform === 'twitter') return twitter;
  if (platform === 'facebook') return facebook;
  if (platform === 'instagram') return instagram;
  if (platform === 'youtube') return youtube;
  return null;
}

async function gatherAll() {
  async function safe(fn, label) {
    try { return await fn(); }
    catch (e) { console.warn(`[moderation] ${label} fetch failed: ${e.message}`); return []; }
  }
  const [tw, fb, ig, yt] = await Promise.all([
    safe(() => twitter.fetchComments(), 'twitter'),
    safe(() => facebook.fetchComments(), 'facebook'),
    safe(() => instagram.fetchComments(), 'instagram'),
    safe(() => youtube.fetchComments(), 'youtube'),
  ]);
  return [...tw, ...fb, ...ig, ...yt];
}

function shouldBlock(analysis, threshold = 80) {
  if (analysis.decision === 'block') return true;
  if (analysis.toxicityScore >= 90 && analysis.confidence >= threshold) return true;
  return Array.isArray(analysis.categories)
    && analysis.categories.some((c) => BLOCK_CATEGORIES.has(c))
    && analysis.confidence >= threshold;
}

function shouldDelete(analysis, threshold = 70) {
  return analysis.decision === 'delete' || analysis.decision === 'block' || analysis.toxicityScore >= threshold;
}

function shouldRewrite(analysis) {
  return analysis.decision === 'rewrite' && typeof analysis.rewrittenText === 'string' && analysis.rewrittenText.trim().length > 0;
}

/**
 * Run moderation pipeline.
 * options: { platform?, comments?, deleteThreshold?, blockThreshold?, dryRun? }
 */
async function run(options = {}) {
  const { platform, comments: provided, deleteThreshold = 70, blockThreshold = 80, dryRun = false } = options;

  let comments = Array.isArray(provided) ? provided : null;
  if (!comments) {
    if (!platform) comments = await gatherAll();
    else {
      const svc = platformService(platform);
      if (!svc) { const err = new Error('Unknown platform'); err.status = 400; throw err; }
      comments = await svc.fetchComments();
    }
  }

  const analyses = await ai.analyzeBulk(comments);
  const byId = new Map(comments.map((c) => [c.id, c]));
  const report = [];

  for (const a of analyses) {
    if (!a || a.error) {
      report.push({ id: a?.id, error: a?.error || 'analysis failed' });
      continue;
    }
    const c = byId.get(a.id);
    if (!c) continue;
    const svc = platformService(c.platform);
    const item = { id: c.id, platform: c.platform, author: c.author, authorId: c.authorId || c.author, analysis: a, actions: [] };

    if (shouldRewrite(a)) {
      if (!dryRun && svc) {
        try {
          if (svc.hideComment) await svc.hideComment(c.id);
          else await svc.deleteComment(c.id);
          
          if (svc.replyToComment) await svc.replyToComment(c.id, a.rewrittenText);
          item.actions.push('rewritten');
        } catch (e) { item.errors = (item.errors || []).concat(`rewrite: ${e.message}`); }
      } else { item.actions.push('would-rewrite'); }
      log.append({ action: 'rewrite', commentId: c.id, userId: item.authorId, platform: c.platform, reason: a.reason, scores: { toxicity: a.toxicityScore, sentiment: a.sentimentScore, confidence: a.confidence } });
    } else if (shouldDelete(a, deleteThreshold)) {
      if (!dryRun && svc) {
        try { await svc.deleteComment(c.id); item.actions.push('deleted'); }
        catch (e) { item.errors = (item.errors || []).concat(`delete: ${e.message}`); }
      } else { item.actions.push('would-delete'); }
      log.append({ action: 'delete', commentId: c.id, userId: item.authorId, platform: c.platform, reason: a.reason, scores: { toxicity: a.toxicityScore, sentiment: a.sentimentScore, confidence: a.confidence } });
    }

    if (shouldBlock(a, blockThreshold)) {
      if (!dryRun) {
        try {
          blacklist.add({ userId: item.authorId, username: c.author, platform: c.platform, reason: a.reason || a.categories.join(', '), categories: a.categories, ip: c.ip || null });
          item.actions.push('blocked');
        } catch (e) { item.errors = (item.errors || []).concat(`block: ${e.message}`); }
      } else { item.actions.push('would-block'); }
      log.append({ action: 'block', commentId: c.id, userId: item.authorId, platform: c.platform, reason: a.reason, scores: { toxicity: a.toxicityScore, sentiment: a.sentimentScore, confidence: a.confidence } });
    }

    report.push(item);
  }

  return {
    analyzed: analyses.length,
    deleted: report.filter((r) => r.actions?.includes('deleted')).length,
    blocked: report.filter((r) => r.actions?.includes('blocked')).length,
    rewritten: report.filter((r) => r.actions?.includes('rewritten')).length,
    report,
  };
}

async function listNegative() {
  const comments = await gatherAll();
  const analyses = await ai.analyzeBulk(comments);
  const byId = new Map(comments.map((c) => [c.id, c]));
  return analyses
    .filter((a) => a && !a.error && (a.sentiment === 'negative' || a.toxicityScore >= 50))
    .map((a) => ({ ...byId.get(a.id), analysis: a }));
}

async function deleteAllNegative() {
  return run({ deleteThreshold: 50, blockThreshold: 80 });
}

module.exports = { run, listNegative, deleteAllNegative, gatherAll };
