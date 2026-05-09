const express = require("express");
const controller = require("../../controllers/reports/purchaseQuotationComparison.controller");

const router = express.Router();

router.post("/purchase-quotation-comparison", controller.postPurchaseQuotationComparison);

module.exports = router;
