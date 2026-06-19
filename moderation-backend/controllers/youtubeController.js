/**
 * YouTube Controller — All endpoints for YouTube OAuth + comment management.
 */
const svc = require('../services/youtubeService');

// ─── OAuth Flow ──────────────────────────────────────────────────────────

/** GET /api/youtube/oauth/url — Returns the Google OAuth consent URL */
exports.getOAuthUrl = async (_req, res, next) => {
  try {
    const url = svc.getOAuthUrl();
    res.json({ url });
  } catch (e) { next(e); }
};

/** GET /api/youtube/oauth/callback — Handles Google OAuth callback */
exports.handleOAuthCallback = async (req, res, next) => {
  try {
    const { code, error } = req.query;
    if (error) {
      // User denied access or error from Google
      return res.send(`
        <!DOCTYPE html>
        <html><head><title>YouTube Connection</title></head>
        <body>
          <script>
            window.opener && window.opener.postMessage({ type: 'youtube-oauth-error', error: '${error}' }, '*');
            window.close();
          </script>
          <p>Authorization failed: ${error}. You can close this window.</p>
        </body></html>
      `);
    }

    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const result = await svc.handleOAuthCallback(code);

    // Return HTML that messages the opener window and closes itself
    res.send(`
      <!DOCTYPE html>
      <html><head><title>YouTube Connected!</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
        .card { text-align: center; padding: 2rem; border-radius: 1rem; background: #1a1a2e; border: 1px solid #333; }
        .check { font-size: 3rem; margin-bottom: 1rem; }
        h2 { margin: 0 0 0.5rem; }
        p { color: #888; font-size: 0.9rem; }
      </style>
      </head>
      <body>
        <div class="card">
          <div class="check">✅</div>
          <h2>YouTube Connected!</h2>
          <p>This window will close automatically...</p>
        </div>
        <script>
          window.opener && window.opener.postMessage({ type: 'youtube-oauth-success' }, '*');
          setTimeout(() => window.close(), 2000);
        </script>
      </body></html>
    `);
  } catch (e) {
    res.send(`
      <!DOCTYPE html>
      <html><head><title>YouTube Connection Error</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0a0a0a; color: #fff; }
        .card { text-align: center; padding: 2rem; border-radius: 1rem; background: #1a1a2e; border: 1px solid #333; max-width: 400px; }
        .icon { font-size: 3rem; margin-bottom: 1rem; }
        h2 { margin: 0 0 0.5rem; color: #f87171; }
        p { color: #888; font-size: 0.85rem; word-break: break-all; }
      </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">❌</div>
          <h2>Connection Failed</h2>
          <p>${e.message}</p>
        </div>
        <script>
          window.opener && window.opener.postMessage({ type: 'youtube-oauth-error', error: '${e.message.replace(/'/g, "\\'")}' }, '*');
        </script>
      </body></html>
    `);
  }
};

// ─── Connection Status ───────────────────────────────────────────────────

/** GET /api/youtube/connection-status */
exports.getConnectionStatus = async (_req, res, next) => {
  try {
    res.json(svc.getConnectionStatus());
  } catch (e) { next(e); }
};

/** POST /api/youtube/disconnect */
exports.disconnect = async (_req, res, next) => {
  try {
    const result = await svc.disconnectYoutube();
    res.json(result);
  } catch (e) { next(e); }
};

// ─── Channel & Videos ────────────────────────────────────────────────────

/** GET /api/youtube/channel */
exports.getChannelInfo = async (_req, res, next) => {
  try {
    const info = await svc.getChannelInfo();
    res.json(info);
  } catch (e) { next(e); }
};

/** GET /api/youtube/videos */
exports.listVideos = async (req, res, next) => {
  try {
    const maxResults = parseInt(req.query.maxResults) || 25;
    const pageToken = req.query.pageToken || null;
    const result = await svc.listChannelVideos(maxResults, pageToken);
    res.json(result);
  } catch (e) { next(e); }
};

// ─── Comments ────────────────────────────────────────────────────────────

/** GET /api/youtube/comments — All channel comments */
exports.getComments = async (_req, res, next) => {
  try {
    const comments = await svc.fetchComments();
    res.json({ platform: 'youtube', count: comments.length, comments });
  } catch (e) { next(e); }
};

/** GET /api/youtube/videos/:videoId/comments */
exports.getVideoComments = async (req, res, next) => {
  try {
    const { videoId } = req.params;
    const maxResults = parseInt(req.query.maxResults) || 50;
    const pageToken = req.query.pageToken || null;
    const result = await svc.listVideoComments(videoId, maxResults, pageToken);
    res.json(result);
  } catch (e) { next(e); }
};

/** POST /api/youtube/comments/:id/reply */
exports.replyToComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Reply text is required' });
    const result = await svc.replyToComment(id, text.trim());
    res.json(result);
  } catch (e) { next(e); }
};

/** PUT /api/youtube/comments/:id/moderate */
exports.moderateComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'published' | 'heldForReview' | 'rejected'
    if (!['published', 'heldForReview', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid moderation status. Use: published, heldForReview, rejected' });
    }
    const result = await svc.setModerationStatus(id, status);
    res.json(result);
  } catch (e) { next(e); }
};

/** DELETE /api/youtube/comments/:id */
exports.deleteComment = async (req, res, next) => {
  try {
    if (!req.params.id) return res.status(400).json({ error: 'id is required' });
    res.json(await svc.deleteComment(req.params.id));
  } catch (e) { next(e); }
};

/** POST /api/youtube/comments/bulk-delete */
exports.bulkDelete = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'ids[] is required' });
    res.json({ results: await svc.bulkDelete(ids) });
  } catch (e) { next(e); }
};

/** POST /api/youtube/comments/:id/ban-user */
exports.banUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'comment id is required' });
    const result = await svc.banUser(id);
    res.json(result);
  } catch (e) { next(e); }
};

/** POST /api/youtube/comments/:id/approve */
exports.approveComment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await svc.approveComment(id);
    res.json(result);
  } catch (e) { next(e); }
};

/** POST /api/youtube/comments/:id/spam */
exports.markAsSpam = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await svc.markAsSpam(id);
    res.json(result);
  } catch (e) { next(e); }
};
