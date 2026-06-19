/**
 * YouTube API Routes
 *
 * OAuth callback is NOT behind auth middleware (it's a redirect from Google).
 * All other routes require the API_AUTH_TOKEN bearer header.
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/youtubeController');

// ─── OAuth (no auth required — Google redirects here) ────────────────────
router.get('/oauth/url', c.getOAuthUrl);
router.get('/oauth/callback', c.handleOAuthCallback);

// ─── All other routes require auth ───────────────────────────────────────
router.use(auth);

// Connection management
router.get('/connection-status', c.getConnectionStatus);
router.post('/disconnect', c.disconnect);

// Channel & videos
router.get('/channel', c.getChannelInfo);
router.get('/videos', c.listVideos);
router.get('/videos/:videoId/comments', c.getVideoComments);

// Comments — read
router.get('/comments', c.getComments);

// Comments — actions
router.post('/comments/:id/reply', c.replyToComment);
router.put('/comments/:id/moderate', c.moderateComment);
router.post('/comments/:id/approve', c.approveComment);
router.post('/comments/:id/spam', c.markAsSpam);
router.post('/comments/:id/ban-user', c.banUser);
router.delete('/comments/:id', c.deleteComment);
router.post('/comments/bulk-delete', c.bulkDelete);

module.exports = router;
