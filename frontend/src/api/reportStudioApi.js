import apiClient from './client';

export const fetchReportMenus = () =>
  apiClient.get('/report-menus').then((response) => response.data);

export const fetchAuthorizedReportCodes = (query = '') =>
  apiClient.get('/report-codes', { params: { query } }).then((response) => response.data);

export const fetchReportCodeParameters = (reportCode) =>
  apiClient.get(`/report-codes/${encodeURIComponent(reportCode)}/parameters`).then((response) => response.data);

export const createReportMenu = (payload) =>
  apiClient.post('/report-menus', payload).then((response) => response.data);

export const createReport = (payload) =>
  apiClient.post('/reports', payload).then((response) => response.data);

export const addReportParameter = (payload) =>
  apiClient.post('/report-parameters', payload).then((response) => response.data);

export const fetchReportDetail = (reportId) =>
  apiClient.get(`/reports/${reportId}`).then((response) => response.data);

export const runReport = (payload) =>
  apiClient.post('/reports/run', payload).then((response) => response.data);
