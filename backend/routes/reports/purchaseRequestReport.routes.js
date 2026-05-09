const express = require("express");
const controller = require("../../controllers/reports/purchaseRequestReport.controller");

const router = express.Router();

router.post("/purchase-request-report", controller.postPurchaseRequestReport);

module.exports = router;
