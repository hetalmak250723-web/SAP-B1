const { sanitizePurchaseQuotationComparisonPayload } = require("../../validators/reports/purchaseQuotationComparison.validator");
const comparisonService = require("../../services/reports/purchaseQuotationComparison.service");

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

const postPurchaseQuotationComparison = async (req, res) => {
  try {
    const criteria = sanitizePurchaseQuotationComparisonPayload(req.body || {});
    const result = await comparisonService.getPurchaseQuotationComparison(criteria);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: getErrorMessage(error) });
  }
};

module.exports = {
  postPurchaseQuotationComparison,
  lookupItems: runLookup(comparisonService.lookupItems),
  lookupVendors: runLookup(comparisonService.lookupVendors),
  lookupItemGroups: runLookup(comparisonService.lookupItemGroups),
  lookupVendorGroups: runLookup(comparisonService.lookupVendorGroups),
  lookupItemProperties: runLookup(comparisonService.lookupItemProperties),
  lookupVendorProperties: runLookup(comparisonService.lookupVendorProperties),
};
