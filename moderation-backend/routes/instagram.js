const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/instagramController');

router.use(auth);
router.get('/comments', c.getComments);
router.delete('/comments/:id', c.deleteComment);
router.post('/comments/bulk-delete', c.bulkDelete);

module.exports = router;
