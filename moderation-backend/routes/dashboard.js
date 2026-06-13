const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/dashboardController');

router.use(auth);
router.get('/all-comments', c.allComments);
router.get('/stats', c.stats);
router.post('/auto-clean', c.autoClean);

module.exports = router;
