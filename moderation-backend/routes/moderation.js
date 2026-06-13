const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/moderationController');
const stream = require('../controllers/streamController');

// Real-time SSE stream — handles its own auth (query token) since
// browsers' EventSource cannot send custom headers.
router.get('/logs/stream', stream.stream);

router.use(auth);

// Pipeline
router.post('/run', c.run);
router.get('/negative', c.negative);
router.post('/delete-negative', c.deleteNegative);

// Logs
router.get('/logs', c.logs);
router.post('/restore', c.restore);

// Blacklist
router.get('/blacklist', c.blacklistList);
router.post('/blacklist', c.blacklistAdd);
router.delete('/blacklist/:userId', c.blacklistRemove);
router.get('/blacklist/check/:userId', c.blacklistCheck);

module.exports = router;

