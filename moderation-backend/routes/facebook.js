const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/facebookController');

router.use(auth);
router.get('/comments', c.getComments);
router.delete('/comments/:id', c.deleteComment);
router.post('/comments/bulk-delete', c.bulkDelete);

// New endpoint for raw Graph API integration
router.get('/graph', c.graphApiIntegration);

module.exports = router;
