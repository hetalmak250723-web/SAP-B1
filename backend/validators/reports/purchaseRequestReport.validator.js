const VALID_REPORT_TYPES = new Set(["Item", "Service"]);
const VALID_REQUESTER_TYPES = new Set(["users", "employees", "usersAndEmployees"]);
const VALID_PROPERTY_LINK_MODES = new Set(["and", "or"]);

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
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toISOString().slice(0, 10);
};

const normalizeCodeRange = (value = {}) => ({
  from: normalizeText(value.from),
  to: normalizeText(value.to),
});

const normalizeDateRange = (value = {}) => ({
  from: normalizeDate(value.from),
  to: normalizeDate(value.to),
});

const normalizeSelector = (value = {}) => ({
  enabled: normalizeBool(value.enabled),
  code: normalizeText(value.code),
  name: normalizeText(value.name),
});

const normalizeProperties = (value = {}) => ({
  ignoreProperties: value.ignoreProperties !== false,
  linkMode: VALID_PROPERTY_LINK_MODES.has(value.linkMode) ? value.linkMode : "and",
  exactlyMatch: normalizeBool(value.exactlyMatch),
  selectedPropertyNumbers: Array.isArray(value.selectedPropertyNumbers)
    ? value.selectedPropertyNumbers
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry >= 1 && entry <= 64)
        .sort((left, right) => left - right)
    : [],
});

const ensureOrderedRange = (range, label, comparator = null) => {
  if (!range.from || !range.to) return;

  const isInvalid = comparator ? comparator(range.from, range.to) : range.from > range.to;
  if (isInvalid) {
    throw createValidationError(`${label} range is invalid.`);
  }
};

const sanitizePurchaseRequestReportPayload = (payload = {}) => {
  const type = VALID_REPORT_TYPES.has(payload.type) ? payload.type : "Item";
  const requesterType = VALID_REQUESTER_TYPES.has(payload.requesterType)
    ? payload.requesterType
    : "usersAndEmployees";

  const criteria = {
    type,
    requesterType,
    requesterUser: normalizeSelector(payload.requesterUser),
    requesterEmployee: normalizeSelector(payload.requesterEmployee),
    codeRange: normalizeCodeRange(payload.codeRange),
    preferredVendorRange: normalizeCodeRange(payload.preferredVendorRange),
    itemGroup: normalizeText(payload.itemGroup) || "All",
    properties: normalizeProperties(payload.properties),
    branch: normalizeSelector(payload.branch),
    department: normalizeSelector(payload.department),
    project: normalizeSelector(payload.project),
    documentNumberRange: normalizeCodeRange(payload.documentNumberRange),
    postingDateRange: normalizeDateRange(payload.postingDateRange),
    validUntilRange: normalizeDateRange(payload.validUntilRange),
    documentDateRange: normalizeDateRange(payload.documentDateRange),
    requiredDateRange: normalizeDateRange(payload.requiredDateRange),
    displayOpenOnly: normalizeBool(payload.displayOpenOnly ?? true),
    displayMrpOnly: normalizeBool(payload.displayMrpOnly),
  };

  ensureOrderedRange(criteria.codeRange, "Code");
  ensureOrderedRange(criteria.preferredVendorRange, "Preferred vendor");
  ensureOrderedRange(
    criteria.documentNumberRange,
    "Document number",
    (from, to) => {
      const fromNumber = Number(from);
      const toNumber = Number(to);

      if (Number.isFinite(fromNumber) && Number.isFinite(toNumber)) {
        return fromNumber > toNumber;
      }

      return from > to;
    },
  );
  ensureOrderedRange(criteria.postingDateRange, "Posting date");
  ensureOrderedRange(criteria.validUntilRange, "Valid until");
  ensureOrderedRange(criteria.documentDateRange, "Document date");
  ensureOrderedRange(criteria.requiredDateRange, "Required date");

  return criteria;
};

module.exports = {
  sanitizePurchaseRequestReportPayload,
};
