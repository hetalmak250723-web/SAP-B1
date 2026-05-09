const express = require("express");
const {
  searchBP,
  lookupBPGroups,
  lookupSalesPersons,
} = require("../controllers/businessPartnerController");
const {
  searchItems,
  lookupItemGroups,
  lookupItemProperties,
} = require("../controllers/itemController");
const purchaseController = require("../controllers/reports/purchaseAnalysis.controller");
const purchaseRequestReportController = require("../controllers/reports/purchaseRequestReport.controller");

const router = express.Router();

const lookupCustomerProperties = async (_req, res) => {
  res.json(
    Array.from({ length: 64 }, (_, index) => ({
      number: index + 1,
      name: `Business Partners Property ${index + 1}`,
    })),
  );
};

router.get("/customers", (req, _res, next) => {
  req.query.type = req.query.type || "cCustomer";
  req.query.top = req.query.top || "200";
  return searchBP(req, _res, next);
});
router.get("/items", (req, _res, next) => {
  req.query.top = req.query.top || "200";
  return searchItems(req, _res, next);
});
router.get("/sales-employees", lookupSalesPersons);
router.get("/customer-groups", lookupBPGroups);
router.get("/item-groups", lookupItemGroups);
router.get("/customer-properties", lookupCustomerProperties);
router.get("/item-properties", lookupItemProperties);

router.get("/purchase-vendors", purchaseController.lookupVendors);
router.get("/purchase-items", purchaseController.lookupItems);
router.get("/purchasing-employees", purchaseController.lookupPurchasingEmployees);
router.get("/purchase-vendor-groups", purchaseController.lookupVendorGroups);
router.get("/purchase-item-groups", purchaseController.lookupItemGroups);
router.get("/purchase-vendor-properties", purchaseController.lookupVendorProperties);
router.get("/purchase-item-properties", purchaseController.lookupItemProperties);

router.get("/purchase-request-report/items", purchaseRequestReportController.lookupItems);
router.get("/purchase-request-report/vendors", purchaseRequestReportController.lookupVendors);
router.get("/purchase-request-report/item-groups", purchaseRequestReportController.lookupItemGroups);
router.get("/purchase-request-report/item-properties", purchaseRequestReportController.lookupItemProperties);
router.get("/purchase-request-report/branches", purchaseRequestReportController.lookupBranches);
router.get("/purchase-request-report/departments", purchaseRequestReportController.lookupDepartments);
router.get("/purchase-request-report/projects", purchaseRequestReportController.lookupProjects);
router.get("/purchase-request-report/users", purchaseRequestReportController.lookupUsers);
router.get("/purchase-request-report/employees", purchaseRequestReportController.lookupEmployees);

module.exports = router;
