import apiClient from "./client";

export const listBOMs  = (query = "", top = 50, skip = 0) =>
  apiClient.get("/bom", { params: { query, top, skip } }).then((r) => r.data);

export const getBOM    = (treeCode) =>
  apiClient.get(`/bom/${encodeURIComponent(treeCode)}`).then((r) => r.data);

export const createBOM = (data) =>
  apiClient.post("/bom", data).then((r) => r.data);

export const updateBOM = (treeCode, data) =>
  apiClient.patch(`/bom/${encodeURIComponent(treeCode)}`, data).then((r) => r.data);

export const deleteBOM = (treeCode) =>
  apiClient.delete(`/bom/${encodeURIComponent(treeCode)}`).then((r) => r.data);

// Lookups
export const fetchBOMItems             = (query = "") =>
  apiClient.get("/bom/lookup/items", { params: { query } }).then((r) => r.data);

export const fetchBOMList              = (query = "") =>
  apiClient.get("/bom", { params: { query, top: 100 } }).then((r) => r.data);

export const fetchBOMWarehouses        = () =>
  apiClient.get("/bom/lookup/warehouses").then((r) => r.data);

export const fetchBOMPriceLists        = () =>
  apiClient.get("/bom/lookup/price-lists").then((r) => r.data);

export const fetchBOMDistributionRules = () =>
  apiClient.get("/bom/lookup/distribution-rules").then((r) => r.data);

export const fetchBOMProjects          = () =>
  apiClient.get("/bom/lookup/projects").then((r) => r.data);

export const fetchBOMGLAccounts        = (query = "") =>
  apiClient.get("/bom/lookup/gl-accounts", { params: { query } }).then((r) => r.data);

export const getItemDetails = (itemCode) =>
  apiClient.get(`/bom/lookup/item-details/${encodeURIComponent(itemCode)}`).then((r) => r.data);
