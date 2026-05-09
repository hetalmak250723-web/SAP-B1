const axios = require('axios');
const https = require('https');
const env = require('../config/env');
const dbService = require('./dbService');

const reportClient = axios.create({
  baseURL: env.reportServiceBaseUrl,
  timeout: env.reportServiceTimeoutMs,
  responseType: 'text',
  headers: {
    'Content-Type': 'application/json',
  },
  httpsAgent: new https.Agent({
    rejectUnauthorized: env.reportServiceRejectUnauthorized,
  }),
});

let reportSessionCookie = '';
let reportSessionExpiresAt = 0;

const stripPdfPrefix = (value) =>
  String(value || '')
    .trim()
    .replace(/^data:application\/pdf;base64,/i, '')
    .replace(/\s+/g, '');

const extractCookieHeader = (cookieHeader) => {
  if (!Array.isArray(cookieHeader)) {
    return '';
  }

  return cookieHeader
    .map((cookie) => String(cookie).split(';')[0])
    .filter(Boolean)
    .join('; ');
};

const normalizeStringPayload = (value) => {
  const trimmed = String(value || '').trim();

  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return stripPdfPrefix(JSON.parse(trimmed));
    } catch (_error) {
      return stripPdfPrefix(trimmed.slice(1, -1));
    }
  }

  return stripPdfPrefix(trimmed);
};

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const padNumber = (value) => String(value).padStart(2, '0');

const normalizeLoadCrDateValue = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  const partMatch = text.match(/^Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})\)$/i);
  if (partMatch) {
    const year = Number(partMatch[1]);
    const month = Number(partMatch[2]);
    const day = Number(partMatch[3]);

    if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) {
      return `${year}-${padNumber(month)}-${padNumber(day)}`;
    }
  }

  const epochMatch = text.match(/^\/?Date\((\d{10,})\)\/?$/i);
  if (epochMatch) {
    const epoch = Number(epochMatch[1]);
    if (Number.isFinite(epoch)) {
      return new Date(epoch).toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return text;
};

const humanizeParameterName = (value) =>
  String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');

const mapCrParameterType = (value) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (
    normalized === 'xsd:number' ||
    normalized === 'xsd:int' ||
    normalized === 'xsd:integer' ||
    normalized === 'xsd:decimal' ||
    normalized === 'number' ||
    normalized === 'numeric'
  ) {
    return 'number';
  }

  if (normalized === 'xsd:date' || normalized === 'xsd:datetime' || normalized === 'date') {
    return 'date';
  }

  return 'string';
};

const extractParameterDefaultValue = (row, paramType) => {
  const candidates = [
    ...(Array.isArray(row?.initialValues) ? row.initialValues : []),
    ...(Array.isArray(row?.values) ? row.values : []),
    row?.defaultValue,
  ].filter((entry) => entry != null && entry !== '');

  const firstValue = candidates[0];
  if (firstValue == null) {
    return '';
  }

  if (paramType === 'date') {
    return normalizeLoadCrDateValue(firstValue);
  }

  if (paramType === 'number') {
    const numeric = Number(firstValue);
    return Number.isFinite(numeric) ? String(numeric) : String(firstValue);
  }

  return String(firstValue);
};

const normalizeCrParameter = (row, index) => {
  const paramName =
    String(
      row?.name ||
      row?.parameterName ||
      row?.parameter ||
      row?.description ||
      '',
    ).trim();

  if (!paramName) {
    return null;
  }

  const paramType = mapCrParameterType(row?.type);
  const displayNameRaw = String(row?.description || row?.displayName || paramName).trim();
  const sortOrder = Number(row?.sortOrder ?? row?.SortOrder);
  const isOptionalPrompt = normalizeBoolean(row?.isOptionalPrompt);
  const allowNullValue = normalizeBoolean(row?.allowNullValue);

  return {
    paramName,
    displayName: humanizeParameterName(displayNameRaw || paramName) || paramName,
    paramType,
    isRequired: !isOptionalPrompt || !allowNullValue,
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : index,
    defaultValue: extractParameterDefaultValue(row, paramType),
  };
};

const extractBase64Pdf = (payload) => {
  if (typeof payload === 'string') {
    return normalizeStringPayload(payload);
  }

  if (!payload) {
    return '';
  }

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      const result = extractBase64Pdf(entry);
      if (result) {
        return result;
      }
    }

    return '';
  }

  if (typeof payload === 'object') {
    const preferredKeys = ['base64Pdf', 'Base64Pdf', 'pdfBase64', 'PDFData', 'data', 'value'];

    for (const key of preferredKeys) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        const result = extractBase64Pdf(payload[key]);
        if (result) {
          return result;
        }
      }
    }

    for (const value of Object.values(payload)) {
      const result = extractBase64Pdf(value);
      if (result) {
        return result;
      }
    }
  }

  return '';
};

const isKnownUnsupportedLayoutMessage = (value) =>
  /^ThereisnodefaultCrystalReportlayoutrelatedto/i.test(String(value || '').trim());

const isKnownPdfGenerationFailureMessage = (value) =>
  /^AnerrorhasoccurredwhilegeneratingthePDFfile\.?$/i.test(String(value || '').trim());

const isProbablyBase64 = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length < 80 || normalized.length % 4 !== 0) {
    return false;
  }

  return /^[A-Za-z0-9+/=]+$/.test(normalized);
};

const ensureReportLoginConfig = () => {
  if (
    !env.reportServiceBaseUrl ||
    !env.reportServiceUsername ||
    !env.reportServicePassword ||
    !env.reportServiceCompanyDb
  ) {
    const error = new Error('Missing SAP Report Service login configuration. Check backend/.env.');
    error.statusCode = 500;
    throw error;
  }
};

const loginToReportService = async () => {
  ensureReportLoginConfig();

  const response = await reportClient.post('/login', {
    CompanyDB: env.reportServiceCompanyDb,
    UserName: env.reportServiceUsername,
    Password: env.reportServicePassword,
  });

  const sessionCookie = extractCookieHeader(response.headers['set-cookie']);

  if (!sessionCookie) {
    const error = new Error('SAP Report Service login did not return a session cookie.');
    error.statusCode = 502;
    throw error;
  }

  const sessionTimeoutMinutes = Number(response.data?.SessionTimeout);
  const ttlMinutes = Number.isFinite(sessionTimeoutMinutes) && sessionTimeoutMinutes > 0
    ? sessionTimeoutMinutes
    : 30;

  reportSessionCookie = sessionCookie;
  reportSessionExpiresAt = Date.now() + Math.max(ttlMinutes - 1, 1) * 60 * 1000;

  return reportSessionCookie;
};

const ensureReportSession = async () => {
  if (!reportSessionCookie || Date.now() >= reportSessionExpiresAt) {
    await loginToReportService();
  }
};

const toRequiredString = (value, fieldName) => {
  const normalized = String(value ?? '').trim();

  if (!normalized) {
    const error = new Error(`${fieldName} is required.`);
    error.statusCode = 400;
    throw error;
  }

  return normalized;
};

const buildFileName = ({ docEntry, docCode }) => `sales-order-${docEntry}-${docCode}.pdf`;

const DOCUMENT_TYPE_LABELS = new Map([
  ['RDR', 'Sales Order'],
  ['POR', 'Purchase Order'],
  ['PRQ', 'Purchase Request'],
  ['PQT', 'Purchase Quotation'],
  ['PCH', 'A/P Invoice'],
  ['PDN', 'Goods Receipt PO'],
  ['DLN', 'Delivery'],
  ['QUT', 'Sales Quotation'],
  ['INV', 'A/R Invoice'],
  ['RIN', 'A/R Credit Memo'],
  ['RPC', 'A/P Credit Memo'],
  ['IGN', 'Goods Receipt'],
  ['IGE', 'Goods Issue'],
  ['WTR', 'Inventory Transfer'],
  ['WTQ', 'Inventory Transfer Request'],
]);

const getLayoutMetadata = async (docCode) => {
  const normalizedDocCode = String(docCode || '').trim();
  if (!normalizedDocCode) {
    return null;
  }

  const result = await dbService.query(`
    SELECT TOP 1 DocCode, DocName, TypeCode, Category, Status
    FROM RDOC
    WHERE DocCode = @docCode
  `, { docCode: normalizedDocCode });

  return result.recordset?.[0] || null;
};

const getDocumentTypeLabel = (typeCode) => {
  const prefix = String(typeCode || '').trim().slice(0, 3).toUpperCase();
  return DOCUMENT_TYPE_LABELS.get(prefix) || String(typeCode || '').trim() || 'document';
};

const isDocumentPrintLayout = (layoutMetadata) => {
  const typeCode = String(layoutMetadata?.TypeCode || '').trim().toUpperCase();
  const prefix = typeCode.slice(0, 3);
  return DOCUMENT_TYPE_LABELS.has(prefix);
};

const resolveXsdType = (type) => {
  const normalized = String(type || '').trim().toLowerCase();

  if (normalized === 'number' || normalized === 'numeric' || normalized === 'int' || normalized === 'xsd:number') {
    return 'xsd:number';
  }

  if (normalized === 'date' || normalized === 'xsd:date') {
    return 'xsd:date';
  }

  if (normalized === 'datetime' || normalized === 'xsd:datetime') {
    return 'xsd:dateTime';
  }

  if (normalized.startsWith('xsd:')) {
    return normalized;
  }

  return 'xsd:string';
};

const normalizeReportParameterValue = (value, type) => {
  if (value == null) {
    return '';
  }

  if (resolveXsdType(type) === 'xsd:number') {
    return Number(value);
  }

  return String(value);
};

const buildExportDiagnostics = ({ docCode, layoutMetadata, payload, rawResponse }) => ({
  docCode,
  layout: {
    docName: String(layoutMetadata?.DocName || '').trim(),
    typeCode: String(layoutMetadata?.TypeCode || '').trim(),
    status: String(layoutMetadata?.Status || '').trim(),
  },
  payload,
  rawResponse: String(rawResponse || '').slice(0, 500),
});

const exportReportPdf = async ({
  docCode,
  parameters = [],
  fileName = '',
} = {}, retryOnAuth = true) => {
  const normalizedDocCode = toRequiredString(docCode || env.reportServiceDefaultDocCode, 'DocCode');
  const layoutMetadata = await getLayoutMetadata(normalizedDocCode);
  const parameterNames = new Set(
    parameters.map((parameter) => String(parameter?.name || '').trim().toUpperCase()).filter(Boolean),
  );

  if (!layoutMetadata) {
    const error = new Error(`SAP layout ${normalizedDocCode} was not found in RDOC.`);
    error.statusCode = 404;
    throw error;
  }

  if (String(layoutMetadata.Status || '').trim().toUpperCase() !== 'A') {
    const error = new Error(`SAP layout ${normalizedDocCode} (${layoutMetadata.DocName || 'Unknown'}) is not active.`);
    error.statusCode = 422;
    throw error;
  }

  if (isDocumentPrintLayout(layoutMetadata) && !parameterNames.has('DOCKEY@')) {
    const documentTypeLabel = getDocumentTypeLabel(layoutMetadata.TypeCode);
    const error = new Error(
      `SAP layout ${normalizedDocCode} (${layoutMetadata.DocName || 'Unknown'}) is a ${documentTypeLabel} print layout (${layoutMetadata.TypeCode}). It expects document-key parameters like Dockey@ and Schema@, not date-range criteria.`,
    );
    error.statusCode = 422;
    throw error;
  }

  const payload = parameters.map((parameter) => ({
    name: toRequiredString(parameter?.name, 'Parameter name'),
    type: resolveXsdType(parameter?.type),
    value: [[normalizeReportParameterValue(parameter?.value, parameter?.type)]],
  }));

  await ensureReportSession();

  let response;

  try {
    response = await reportClient.post('/rs/v1/ExportPDFData', payload, {
      params: {
        DocCode: normalizedDocCode,
      },
      headers: {
        Cookie: reportSessionCookie,
      },
    });
  } catch (error) {
    if (retryOnAuth && error.response?.status === 401) {
      reportSessionCookie = '';
      reportSessionExpiresAt = 0;
      await loginToReportService();
      return exportReportPdf({ docCode, parameters, fileName }, false);
    }

    throw error;
  }

  const base64Pdf = extractBase64Pdf(response.data);

  if (!base64Pdf) {
    const error = new Error('SAP Report Service returned an empty PDF response.');
    error.statusCode = 502;
    throw error;
  }

  if (isKnownUnsupportedLayoutMessage(base64Pdf)) {
    const error = new Error(`Layout ${normalizedDocCode} is not exportable through the Crystal Report PDF API.`);
    error.statusCode = 422;
    error.diagnostics = buildExportDiagnostics({
      docCode: normalizedDocCode,
      layoutMetadata,
      payload,
      rawResponse: base64Pdf,
    });
    throw error;
  }

  if (isKnownPdfGenerationFailureMessage(base64Pdf)) {
    const error = new Error('SAP Report Service could not generate the PDF for this layout and parameter set.');
    error.statusCode = 422;
    error.diagnostics = buildExportDiagnostics({
      docCode: normalizedDocCode,
      layoutMetadata,
      payload,
      rawResponse: base64Pdf,
    });
    throw error;
  }

  if (!isProbablyBase64(base64Pdf)) {
    const error = new Error(`SAP Report Service returned an unexpected response: ${String(base64Pdf).slice(0, 200)}`);
    error.statusCode = 502;
    error.diagnostics = buildExportDiagnostics({
      docCode: normalizedDocCode,
      layoutMetadata,
      payload,
      rawResponse: base64Pdf,
    });
    throw error;
  }

  return {
    message: 'SAP report PDF generated successfully.',
    base64Pdf,
    mimeType: 'application/pdf',
    fileName: fileName || `${normalizedDocCode}.pdf`,
    docCode: normalizedDocCode,
  };
};

const exportSalesOrderPdf = async ({ docEntry, schema, docCode } = {}, retryOnAuth = true) => {
  const normalizedDocEntry = toRequiredString(docEntry, 'DocEntry');
  const normalizedSchema = toRequiredString(schema || env.reportServiceDefaultSchema, 'Schema');
  const normalizedDocCode = toRequiredString(docCode || env.reportServiceDefaultDocCode, 'DocCode');

  const genericResponse = await exportReportPdf({
    docCode: normalizedDocCode,
    parameters: [
      {
        name: 'Dockey@',
        type: 'number',
        value: normalizedDocEntry,
      },
      {
        name: 'Schema@',
        type: 'string',
        value: normalizedSchema,
      },
    ],
    fileName: buildFileName({
      docEntry: normalizedDocEntry,
      docCode: normalizedDocCode,
    }),
  }, retryOnAuth);

  return {
    message: 'Sales order PDF generated successfully.',
    base64Pdf: genericResponse.base64Pdf,
    mimeType: 'application/pdf',
    fileName: genericResponse.fileName,
    docEntry: normalizedDocEntry,
    docCode: normalizedDocCode,
    schema: normalizedSchema,
  };
};

const parseJsonPayload = (payload) => {
  if (payload == null) {
    return {};
  }

  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) {
      return {};
    }

    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      const error = new Error('SAP Report Service returned an invalid JSON response.');
      error.statusCode = 502;
      throw error;
    }
  }

  if (typeof payload === 'object') {
    return payload;
  }

  return {};
};

const loadReportParameters = async (docCode, retryOnAuth = true) => {
  const normalizedDocCode = toRequiredString(docCode, 'DocCode');
  await ensureReportSession();

  let response;

  try {
    response = await reportClient.get('/rs/v1/LoadCR', {
      params: {
        DocCode: normalizedDocCode,
      },
      headers: {
        Cookie: reportSessionCookie,
      },
    });
  } catch (error) {
    if (retryOnAuth && error.response?.status === 401) {
      reportSessionCookie = '';
      reportSessionExpiresAt = 0;
      await loginToReportService();
      return loadReportParameters(normalizedDocCode, false);
    }

    throw error;
  }

  const payload = parseJsonPayload(response.data);

  if (normalizeBoolean(payload?.error)) {
    const message =
      String(payload?.message || '').trim() ||
      String(payload?.detail || '').trim() ||
      `SAP Report Service could not load parameters for ${normalizedDocCode}.`;
    const error = new Error(message);
    error.statusCode = 502;
    throw error;
  }

  const rows = Array.isArray(payload?.resultSet) ? payload.resultSet : [];

  return rows
    .map((row, index) => normalizeCrParameter(row, index))
    .filter(Boolean)
    .filter((parameter, index, all) =>
      all.findIndex((candidate) => candidate.paramName.toLowerCase() === parameter.paramName.toLowerCase()) === index,
    );
};

const loadAuthorizedCrList = async (query = '', retryOnAuth = true) => {
  await ensureReportSession();

  let response;

  try {
    response = await reportClient.get('/rs/v1/LoadAuthorizedCRList', {
      headers: {
        Cookie: reportSessionCookie,
      },
    });
  } catch (error) {
    if (retryOnAuth && error.response?.status === 401) {
      reportSessionCookie = '';
      reportSessionExpiresAt = 0;
      await loginToReportService();
      return loadAuthorizedCrList(query, false);
    }

    throw error;
  }

  const payload = parseJsonPayload(response.data);
  const rows = Array.isArray(payload?.resultSet) ? payload.resultSet : [];
  const search = String(query || '').trim().toLowerCase();

  return rows
    .map((row) => ({
      code: String(row?.code || '').trim(),
      name: String(row?.name || '').trim(),
      rootName: String(row?.root_name || '').trim(),
      rootGuid: String(row?.root_guid || '').trim(),
    }))
    .filter((row) => row.code)
    .filter((row) => {
      if (!search) {
        return true;
      }

      return (
        row.code.toLowerCase().includes(search) ||
        row.name.toLowerCase().includes(search) ||
        row.rootName.toLowerCase().includes(search)
      );
    })
    .sort((left, right) => {
      const byRoot = left.rootName.localeCompare(right.rootName);
      if (byRoot !== 0) return byRoot;

      const byName = left.name.localeCompare(right.name);
      if (byName !== 0) return byName;

      return left.code.localeCompare(right.code);
    });
};

module.exports = {
  loadAuthorizedCrList,
  loadReportParameters,
  isProbablyBase64,
  exportReportPdf,
  exportSalesOrderPdf,
};
