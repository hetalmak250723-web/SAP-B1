const { sanitizePurchaseRequestReportPayload } = require("../../validators/reports/purchaseRequestReport.validator");
const purchaseRequestReportService = require("../../services/reports/purchaseRequestReport.service");

const getErrorMessage = (error) =>
  error?.message ||
  error?.response?.data?.error?.message?.value ||
  error?.response?.data?.error?.message ||
  "Invalid selection criteria";

const runLookup = (lookupFn) => async (req, res) => {
  try {
    const rows = await lookupFn(req.query.query || "");
    res.json(rows || []);
  } catch (error) {
    res.status(error.status || 500).json({ message: getErrorMessage(error) });
  }
};

const postPurchaseRequestReport = async (req, res) => {
  try {
    const criteria = sanitizePurchaseRequestReportPayload(req.body || {});
    const result = await purchaseRequestReportService.getPurchaseRequestReport(criteria);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: getErrorMessage(error) });
  }
};

module.exports = {
  postPurchaseRequestReport,
  lookupItems: runLookup(purchaseRequestReportService.lookupItems),
  lookupVendors: runLookup(purchaseRequestReportService.lookupVendors),
  lookupItemGroups: runLookup(purchaseRequestReportService.lookupItemGroups),
  lookupItemProperties: runLookup(purchaseRequestReportService.lookupItemProperties),
  lookupBranches: runLookup(purchaseRequestReportService.lookupBranches),
  lookupDepartments: runLookup(purchaseRequestReportService.lookupDepartments),
  lookupProjects: runLookup(purchaseRequestReportService.lookupProjects),
  lookupUsers: runLookup(purchaseRequestReportService.lookupUsers),
  lookupEmployees: runLookup(purchaseRequestReportService.lookupEmployees),
};
