import apiClient from './client';

export const fetchReceiptReferenceData = () =>
  apiClient.get('/receipt-from-production/reference-data').then((r) => r.data);

export const fetchProductionOrderForReceipt = (docEntry) =>
  apiClient.get(`/receipt-from-production/production-order/${encodeURIComponent(docEntry)}`).then((r) => r.data);

export const fetchReceiptList = (params = {}) =>
  apiClient.get('/receipt-from-production/list', { params }).then((r) => r.data);

export const fetchReceiptByDocEntry = (docEntry) =>
  apiClient.get(`/receipt-from-production/${encodeURIComponent(docEntry)}`).then((r) => r.data);

export const createReceipt = (data) =>
  apiClient.post('/receipt-from-production', data).then((r) => r.data);

export const lookupProductionOrdersForReceipt = (query = '') =>
  apiClient.get('/receipt-from-production/lookup/production-orders', { params: { query } }).then((r) => r.data);
