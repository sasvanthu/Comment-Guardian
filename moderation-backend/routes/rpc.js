const router = require('express').Router();
const c = require('../controllers/rpcController');

router.get('/listUsers', c.listUsers);
router.post('/createUser', c.createUser);
router.post('/deleteUser', c.deleteUser);
router.post('/setUserRole', c.setUserRole);

router.get('/listWorkflowRules', c.listWorkflowRules);
router.post('/upsertWorkflowRule', c.upsertWorkflowRule);
router.post('/toggleWorkflowRule', c.toggleWorkflowRule);
router.post('/deleteWorkflowRule', c.deleteWorkflowRule);
router.get('/listWorkflowExecutions', c.listWorkflowExecutions);

router.post('/analyzeToxic', c.analyzeToxic);
router.post('/translateText', c.translateText);
router.post('/detectSpam', c.detectSpam);
router.post('/researchUser', c.researchUser);

router.get('/listPlatformConnections', c.listPlatformConnections);
router.post('/disconnectPlatform', c.disconnectPlatform);
router.post('/syncPlatform', c.syncPlatform);
router.post('/syncAllPlatforms', c.syncAllPlatforms);
router.post('/testInstagramConnection', c.testInstagramConnection);
router.post('/syncInstagramNow', c.syncInstagramNow);
router.post('/disconnectInstagram', c.disconnectInstagram);

router.post('/testFacebookConnection', c.testFacebookConnection);
router.post('/syncFacebookNow', c.syncFacebookNow);
router.post('/disconnectFacebook', c.disconnectFacebook);

router.post('/testYoutubeConnection', c.testYoutubeConnection);
router.post('/syncYoutubeNow', c.syncYoutubeNow);
router.post('/disconnectYoutube', c.disconnectYoutube);

module.exports = router;
