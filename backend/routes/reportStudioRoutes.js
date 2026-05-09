const express = require('express');
const reportStudioController = require('../controllers/reportStudioController');

const router = express.Router();

router.get('/report-menus', reportStudioController.listReportMenus);
router.get('/report-codes', reportStudioController.listAuthorizedReportCodes);
router.get('/report-codes/:code/parameters', reportStudioController.getReportCodeParameters);
router.post('/report-menus', reportStudioController.createReportMenu);
router.post('/reports', reportStudioController.createReport);
router.get('/reports/:id', reportStudioController.getReportById);
router.post('/reports/run', reportStudioController.runReport);
router.post('/report-parameters', reportStudioController.addReportParameter);

module.exports = router;
