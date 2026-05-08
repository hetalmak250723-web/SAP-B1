import apiClient from "../api/client";

export const runPurchaseQuotationComparison = (payload) =>
  apiClient.post("/reports/purchase-quotation-comparison", payload).then((response) => response.data);

export const fetchComparisonItems = (query = "") =>
  apiClient.get("/lookups/purchase-quotation-comparison/items", { params: { query } }).then((response) => response.data);

export const fetchComparisonVendors = (query = "") =>
  apiClient.get("/lookups/purchase-quotation-comparison/vendors", { params: { query } }).then((response) => response.data);

export const fetchComparisonItemGroups = () =>
  apiClient.get("/lookups/purchase-quotation-comparison/item-groups").then((response) => response.data);

export const fetchComparisonVendorGroups = () =>
  apiClient.get("/lookups/purchase-quotation-comparison/vendor-groups").then((response) => response.data);

export const fetchComparisonItemProperties = () =>
  apiClient.get("/lookups/purchase-quotation-comparison/item-properties").then((response) => response.data);

export const fetchComparisonVendorProperties = () =>
  apiClient.get("/lookups/purchase-quotation-comparison/vendor-properties").then((response) => response.data);
