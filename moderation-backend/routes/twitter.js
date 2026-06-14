const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/twitterController');

router.use(auth);
router.get('/comments', c.getComments);
router.delete('/comments/:id', c.deleteComment);
router.post('/comments/bulk-delete', c.bulkDelete);

// New endpoint for raw X API integration
router.get('/x-api', c.xApiIntegration);

module.exports = router;
