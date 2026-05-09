const db = require("../../db/odbc");
const purchaseAnalysisService = require("./purchaseAnalysis.service");

const tableColumnsCache = new Map();

const queryRows = async (sql, params = {}) => {
  const result = await db.query(sql, params);
  return result.recordset || result || [];
};

const normalizeText = (value) => String(value || "").trim();
const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getTableColumns = async (tableName) => {
  const normalized = normalizeText(tableName).toUpperCase();
  if (tableColumnsCache.has(normalized)) return tableColumnsCache.get(normalized);

  const rows = await queryRows(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = @tableName
    `,
    { tableName: normalized }
  );
  const columns = new Set(rows.map((row) => String(row.COLUMN_NAME || "").toUpperCase()));
  tableColumnsCache.set(normalized, columns);
  return columns;
};

const hasColumn = async (tableName, columnName) => {
  const columns = await getTableColumns(tableName);
  return columns.has(String(columnName || "").trim().toUpperCase());
};

const buildRangeCondition = (alias, columnName, range = {}, params = {}, paramPrefix = "range") => {
  const clauses = [];
  const fromValue = normalizeText(range.from);
  const toValue = normalizeText(range.to);

  if (fromValue && toValue) {
    params[`${paramPrefix}From`] = fromValue;
    params[`${paramPrefix}To`] = toValue;
    clauses.push(`${alias}.${columnName} BETWEEN @${paramPrefix}From AND @${paramPrefix}To`);
  } else if (fromValue) {
    params[`${paramPrefix}From`] = fromValue;
    clauses.push(`${alias}.${columnName} >= @${paramPrefix}From`);
  } else if (toValue) {
    params[`${paramPrefix}To`] = toValue;
    clauses.push(`${alias}.${columnName} <= @${paramPrefix}To`);
  }

  return clauses;
};

const buildNumericRangeCondition = (alias, columnName, range = {}, params = {}, paramPrefix = "range") => {
  const clauses = [];
  const fromValue = normalizeText(range.from);
  const toValue = normalizeText(range.to);

  if (fromValue) {
    params[`${paramPrefix}From`] = Number(fromValue);
    clauses.push(`${alias}.${columnName} >= @${paramPrefix}From`);
  }
  if (toValue) {
    params[`${paramPrefix}To`] = Number(toValue);
    clauses.push(`${alias}.${columnName} <= @${paramPrefix}To`);
  }

  return clauses;
};

const buildPropertyCondition = (alias, mode, properties = []) => {
  if (mode === "Ignore" || !properties.length) return "";
  const clauses = properties.map((propertyNumber) => `ISNULL(${alias}.QryGroup${propertyNumber}, 'N') = 'Y'`);
  if (!clauses.length) return "";
  return mode === "Include selected"
    ? `(${clauses.join(" OR ")})`
    : `NOT (${clauses.join(" OR ")})`;
};

const appendPropertyCondition = (whereClauses, alias, selection = {}) => {
  const condition = buildPropertyCondition(alias, selection.propertiesMode, selection.properties);
  if (condition) whereClauses.push(condition);
};

const appendDateRange = (whereClauses, params, columnName, range, prefix) => {
  if (range.from) {
    params[`${prefix}From`] = range.from;
    whereClauses.push(`${columnName} >= @${prefix}From`);
  }
  if (range.to) {
    params[`${prefix}To`] = range.to;
    whereClauses.push(`${columnName} <= @${prefix}To`);
  }
};

const getCompanyCurrencies = async () => {
  try {
    const rows = await queryRows(`
      SELECT TOP 1 CompnyName, MainCurncy
      FROM OADM
    `);
    return {
      companyName: rows[0]?.CompnyName || "SAP B1",
      currencyCode: rows[0]?.MainCurncy || "INR",
    };
  } catch (_error) {
    return { companyName: "SAP B1", currencyCode: "INR" };
  }
};

const buildQuotationRowsQuery = async (criteria) => {
  const params = {};
  const whereClauses = ["1 = 1"];
  const hasCanceledColumn = await hasColumn("OPQT", "CANCELED");
  const hasLineStatusColumn = await hasColumn("PQT1", "LineStatus");
  const hasOpenQtyColumn = await hasColumn("PQT1", "OpenQty");
  const hasVatColumn = await hasColumn("PQT1", "VatSum");
  const lineStatusExpr = hasLineStatusColumn ? "ISNULL(L.LineStatus, H.DocStatus)" : "ISNULL(H.DocStatus, 'O')";
  const openQtyExpr = hasOpenQtyColumn ? "ISNULL(L.OpenQty, 0)" : "CASE WHEN ISNULL(H.DocStatus, 'O') = 'O' THEN ISNULL(L.Quantity, 0) ELSE 0 END";
  const vatExpr = hasVatColumn ? "ISNULL(L.VatSum, 0)" : "0";

  if (criteria.openOnly) {
    whereClauses.push("ISNULL(H.DocStatus, 'O') = 'O'");
    if (hasLineStatusColumn) whereClauses.push("ISNULL(L.LineStatus, 'O') = 'O'");
  }

  if (hasCanceledColumn) {
    whereClauses.push("ISNULL(H.CANCELED, 'N') = 'N'");
  }

  if (criteria.type === "item") {
    whereClauses.push("(ISNULL(L.ItemCode, '') <> '' OR ISNULL(H.DocType, 'I') = 'I')");
  } else {
    whereClauses.push("ISNULL(H.DocType, 'I') = 'S'");
  }

  whereClauses.push(...buildRangeCondition("L", "ItemCode", criteria.item, params, "itemCode"));
  whereClauses.push(...buildRangeCondition("H", "CardCode", criteria.vendor, params, "vendorCode"));
  whereClauses.push(...buildNumericRangeCondition("H", "DocNum", criteria.documentNo, params, "documentNo"));
  whereClauses.push(...buildNumericRangeCondition("H", "GroupNum", criteria.groupNo, params, "groupNo"));

  if (criteria.item.group && criteria.item.group !== "All") {
    params.itemGroup = criteria.item.group;
    whereClauses.push("(CAST(I.ItmsGrpCod AS NVARCHAR(50)) = @itemGroup OR IG.ItmsGrpNam = @itemGroup)");
  }

  if (criteria.vendor.group && criteria.vendor.group !== "All") {
    params.vendorGroup = criteria.vendor.group;
    whereClauses.push("(CAST(V.GroupCode AS NVARCHAR(50)) = @vendorGroup OR VG.GroupName = @vendorGroup)");
  }

  appendPropertyCondition(whereClauses, "I", criteria.item);
  appendPropertyCondition(whereClauses, "V", criteria.vendor);
  appendDateRange(whereClauses, params, "H.DocDueDate", criteria.requiredDate, "requiredDate");
  appendDateRange(whereClauses, params, "H.DocDate", criteria.documentDate, "documentDate");

  const sql = `
    SELECT
      H.DocEntry,
      H.DocNum,
      H.DocDate,
      H.DocDueDate AS ReqDate,
      H.CardCode,
      H.CardName,
      H.GroupNum,
      ISNULL(P.PymntGroup, CAST(ISNULL(H.GroupNum, 0) AS NVARCHAR(50))) AS GroupName,
      ISNULL(H.DocCur, '') AS DocCur,
      ISNULL(H.DocRate, 1) AS DocRate,
      ISNULL(H.DocStatus, '') AS DocStatus,
      L.LineNum,
      ISNULL(L.ItemCode, '') AS ItemCode,
      ISNULL(L.Dscription, '') AS ItemName,
      ISNULL(I.ItmsGrpCod, 0) AS ItemGroupCode,
      ISNULL(IG.ItmsGrpNam, '') AS ItemGroupName,
      ISNULL(L.Quantity, 0) AS Quantity,
      ${openQtyExpr} AS OpenQty,
      ISNULL(L.Price, 0) AS Price,
      ISNULL(L.DiscPrcnt, 0) AS DiscountPercent,
      ISNULL(L.LineTotal, 0) AS LineTotal,
      ${vatExpr} AS TaxAmount,
      ISNULL(L.WhsCode, '') AS WarehouseCode,
      ${lineStatusExpr} AS LineStatus
    FROM OPQT H
    INNER JOIN PQT1 L ON L.DocEntry = H.DocEntry
    LEFT JOIN OCRD V ON V.CardCode = H.CardCode
    LEFT JOIN OCRG VG ON VG.GroupCode = V.GroupCode
    LEFT JOIN OITM I ON I.ItemCode = L.ItemCode
    LEFT JOIN OITB IG ON IG.ItmsGrpCod = I.ItmsGrpCod
    LEFT JOIN OCTG P ON P.GroupNum = H.GroupNum
    WHERE ${whereClauses.join("\n      AND ")}
    ORDER BY L.ItemCode, H.CardCode, H.DocDate, H.DocNum, L.LineNum
  `;

  return { sql, params };
};

const formatDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const getPurchaseQuotationComparison = async (criteria) => {
  const company = await getCompanyCurrencies();
  const { sql, params } = await buildQuotationRowsQuery(criteria);
  const rawRows = await queryRows(sql, params);

  const rows = rawRows.map((row, index) => {
    const quantity = toNumber(row.Quantity);
    const openQty = toNumber(row.OpenQty);
    const price = toNumber(row.Price);
    const discountPercent = toNumber(row.DiscountPercent);
    const netPrice = price * (1 - discountPercent / 100);
    const lineTotal = toNumber(row.LineTotal);

    return {
      rowNo: index + 1,
      key: `${row.DocEntry}-${row.LineNum}`,
      docEntry: row.DocEntry,
      docNum: row.DocNum,
      documentNo: row.DocNum,
      documentDate: formatDate(row.DocDate),
      requiredDate: formatDate(row.ReqDate),
      vendorCode: normalizeText(row.CardCode),
      vendorName: normalizeText(row.CardName),
      itemCode: normalizeText(row.ItemCode),
      itemName: normalizeText(row.ItemName),
      itemGroupCode: String(row.ItemGroupCode || ""),
      itemGroupName: normalizeText(row.ItemGroupName),
      groupNo: normalizeText(row.GroupNum),
      groupName: normalizeText(row.GroupName),
      quantity,
      openQty,
      price,
      discountPercent,
      netPrice,
      lineTotal,
      taxAmount: toNumber(row.TaxAmount),
      grossTotal: lineTotal + toNumber(row.TaxAmount),
      warehouseCode: normalizeText(row.WarehouseCode),
      currency: normalizeText(row.DocCur) || company.currencyCode,
      docRate: toNumber(row.DocRate) || 1,
      status: normalizeText(row.LineStatus) === "O" ? "Open" : "Closed",
    };
  });

  const bestByItem = new Map();
  rows.forEach((row) => {
    const key = row.itemCode || row.itemName || `line-${row.rowNo}`;
    const current = bestByItem.get(key);
    if (!current || row.netPrice < current.netPrice) bestByItem.set(key, row);
  });

  const resultRows = rows.map((row) => {
    const key = row.itemCode || row.itemName || `line-${row.rowNo}`;
    const best = bestByItem.get(key);
    return {
      ...row,
      bestPrice: best?.netPrice || row.netPrice,
      bestVendorCode: best?.vendorCode || row.vendorCode,
      bestVendorName: best?.vendorName || row.vendorName,
      varianceFromBest: row.netPrice - (best?.netPrice || row.netPrice),
      isBestPrice: best?.key === row.key,
    };
  });

  return {
    mode: "comparison",
    reportKind: "purchaseQuotationComparison",
    title: "Purchase Quotation Comparison Report",
    companyName: company.companyName,
    currencyCode: company.currencyCode,
    rows: resultRows,
    totals: {
      quotationCount: new Set(resultRows.map((row) => row.docEntry)).size,
      lineCount: resultRows.length,
      quantity: resultRows.reduce((sum, row) => sum + row.quantity, 0),
      openQty: resultRows.reduce((sum, row) => sum + row.openQty, 0),
      lineTotal: resultRows.reduce((sum, row) => sum + row.lineTotal, 0),
      grossTotal: resultRows.reduce((sum, row) => sum + row.grossTotal, 0),
    },
    message: resultRows.length ? "" : "No matching records found",
  };
};

module.exports = {
  getPurchaseQuotationComparison,
  lookupItems: purchaseAnalysisService.lookupItems,
  lookupVendors: purchaseAnalysisService.lookupVendors,
  lookupItemGroups: purchaseAnalysisService.lookupItemGroups,
  lookupVendorGroups: purchaseAnalysisService.lookupVendorGroups,
  lookupItemProperties: purchaseAnalysisService.lookupItemProperties,
  lookupVendorProperties: purchaseAnalysisService.lookupVendorProperties,
};
