import apiClient from "../api/client";

export const runPurchaseRequestReport = (payload) =>
  apiClient.post("/reports/purchase-request-report", payload).then((response) => response.data);

export const fetchPurchaseRequestReportItems = (query = "") =>
  apiClient.get("/lookups/purchase-request-report/items", { params: { query } }).then((response) => response.data);

export const fetchPurchaseRequestReportVendors = (query = "") =>
  apiClient.get("/lookups/purchase-request-report/vendors", { params: { query } }).then((response) => response.data);

export const fetchPurchaseRequestReportItemGroups = () =>
  apiClient.get("/lookups/purchase-request-report/item-groups").then((response) => response.data);

export const fetchPurchaseRequestReportItemProperties = () =>
  apiClient.get("/lookups/purchase-request-report/item-properties").then((response) => response.data);

export const fetchPurchaseRequestReportBranches = (query = "") =>
  apiClient.get("/lookups/purchase-request-report/branches", { params: { query } }).then((response) => response.data);

export const fetchPurchaseRequestReportDepartments = (query = "") =>
  apiClient.get("/lookups/purchase-request-report/departments", { params: { query } }).then((response) => response.data);

export const fetchPurchaseRequestReportProjects = (query = "") =>
  apiClient.get("/lookups/purchase-request-report/projects", { params: { query } }).then((response) => response.data);

export const fetchPurchaseRequestReportUsers = (query = "") =>
  apiClient.get("/lookups/purchase-request-report/users", { params: { query } }).then((response) => response.data);

export const fetchPurchaseRequestReportEmployees = (query = "") =>
  apiClient.get("/lookups/purchase-request-report/employees", { params: { query } }).then((response) => response.data);
