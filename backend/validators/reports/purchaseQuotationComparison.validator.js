const VALID_TYPES = new Set(["item", "service"]);
const VALID_PROPERTY_MODES = new Set(["Ignore", "Include selected", "Exclude selected"]);

const createValidationError = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

const normalizeText = (value) => String(value || "").trim();
const normalizeBool = (value) => value === true || value === "true" || value === 1 || value === "1";

const normalizeDate = (value) => {
  const text = normalizeText(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
};

const normalizeRange = (value = {}) => ({
  from: normalizeText(value.from),
  to: normalizeText(value.to),
});

const normalizeNumberRange = (value = {}, label = "Range") => {
  const range = normalizeRange(value);
  if ((range.from && !/^\d+$/.test(range.from)) || (range.to && !/^\d+$/.test(range.to))) {
    throw createValidationError(`${label} must be numeric`);
  }
  return range;
};

const normalizeDateRange = (value = {}) => {
  const range = {
    from: normalizeDate(value.from),
    to: normalizeDate(value.to),
  };

  if (range.from && range.to && range.from > range.to) {
    throw createValidationError("Enter valid date range");
  }

  return range;
};

const normalizePropertySelection = (value = {}) => ({
  group: normalizeText(value.group) || "All",
  propertiesMode: VALID_PROPERTY_MODES.has(value.propertiesMode) ? value.propertiesMode : "Ignore",
  properties: Array.isArray(value.properties)
    ? value.properties.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 64)
    : [],
});

const validateCodeRange = (range) => {
  if (range.from && range.to && range.from > range.to) {
    throw createValidationError("Invalid selection criteria");
  }
};

const sanitizePurchaseQuotationComparisonPayload = (payload = {}) => {
  const type = VALID_TYPES.has(payload.type) ? payload.type : "item";
  const item = {
    ...normalizeRange(payload.item),
    ...normalizePropertySelection(payload.item),
  };
  const vendor = {
    ...normalizeRange(payload.vendor),
    ...normalizePropertySelection(payload.vendor),
  };
  const requiredDate = normalizeDateRange(payload.requiredDate);
  const documentDate = normalizeDateRange(payload.documentDate);
  const documentNo = normalizeNumberRange(payload.documentNo, "Document No.");
  const groupNo = normalizeNumberRange(payload.groupNo, "Group No.");

  validateCodeRange(item);
  validateCodeRange(vendor);
  validateCodeRange(documentNo);
  validateCodeRange(groupNo);

  return {
    type,
    item,
    vendor,
    requiredDate,
    documentDate,
    documentNo,
    groupNo,
    openOnly: normalizeBool(payload.openOnly),
  };
};

module.exports = {
  sanitizePurchaseQuotationComparisonPayload,
};
