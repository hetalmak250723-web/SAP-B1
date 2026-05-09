import apiClient from './client';

const fetchMarketingDocumentUdfs = (documentType) =>
  apiClient.get(`/udfs/marketing-documents/${encodeURIComponent(documentType)}`);

export {
  fetchMarketingDocumentUdfs,
};
