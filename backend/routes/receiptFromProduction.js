const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/receiptFromProductionController');

// Lookups (before /:docEntry)
router.get('/lookup/production-orders',   ctrl.lookupProductionOrders);
router.get('/reference-data',             ctrl.getReferenceData);

// Load production order for receipt form
router.get('/production-order/:docEntry', ctrl.getProductionOrderForReceipt);

// Receipt document
router.get('/list',       ctrl.getReceiptList);
router.get('/:docEntry',  ctrl.getReceiptByDocEntry);
router.post('/',          ctrl.createReceipt);

module.exports = router;
