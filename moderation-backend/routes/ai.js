const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/aiController');

router.use(auth);
router.post('/analyze', c.analyze);
router.post('/analyze-bulk', c.analyzeBulk);
router.post('/auto-moderate', c.autoModerate);

module.exports = router;
