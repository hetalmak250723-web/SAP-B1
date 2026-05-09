const express = require('express');
const udfMetadataController = require('../controllers/udfMetadataController');

const router = express.Router();

router.get('/marketing-documents/:documentType', udfMetadataController.getMarketingDocumentUdfs);

module.exports = router;
