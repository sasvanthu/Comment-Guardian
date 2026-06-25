const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/pinterestController');

router.use(auth);
router.get('/comments', c.getComments);

module.exports = router;
