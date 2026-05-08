const db = require('./dbService');

const ALLOWED_TABLES = new Set(['OQUT', 'QUT1', 'ORDR', 'RDR1', 'ODLN', 'DLN1', 'OINV', 'INV1', 'ORIN', 'RIN1']);

const assertAllowedTable = (tableName) => {
  if (!ALLOWED_TABLES.has(tableName)) {
    throw new Error(`Unsupported UDF table "${tableName}".`);
  }
};

const getUdfColumnNames = async (tableName) => {
  assertAllowedTable(tableName);
  const result = await db.query(`
    SELECT c.name
    FROM sys.columns c
    INNER JOIN sys.objects o ON o.object_id = c.object_id
    WHERE o.name = @tableName
      AND c.name LIKE 'U[_]%'
    ORDER BY c.column_id
  `, { tableName });

  return (result.recordset || []).map((row) => row.name).filter((name) => /^U_[A-Za-z0-9_]+$/.test(name));
};

const normalizeRowValues = (row = {}) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString().split('T')[0] : value ?? '',
    ])
  );

const getHeaderUdfs = async (tableName, docEntry) => {
  const columns = await getUdfColumnNames(tableName);
  if (!columns.length) return {};

  const selectColumns = columns.map((column) => `[${column}]`).join(', ');
  const result = await db.query(`
    SELECT ${selectColumns}
    FROM [${tableName}]
    WHERE DocEntry = @docEntry
  `, { docEntry: Number(docEntry) });

  return normalizeRowValues(result.recordset?.[0] || {});
};

const getRowUdfs = async (tableName, docEntry) => {
  const columns = await getUdfColumnNames(tableName);
  if (!columns.length) return new Map();

  const selectColumns = columns.map((column) => `[${column}]`).join(', ');
  const result = await db.query(`
    SELECT LineNum, ${selectColumns}
    FROM [${tableName}]
    WHERE DocEntry = @docEntry
  `, { docEntry: Number(docEntry) });

  return new Map((result.recordset || []).map((row) => {
    const { LineNum, ...values } = row;
    return [Number(LineNum), normalizeRowValues(values)];
  }));
};

module.exports = {
  getHeaderUdfs,
  getRowUdfs,
  hydrateMarketingDocumentUdfs: async (document, { headerTable, rowTable, docEntry }) => {
    if (!document) return document;

    const [headerUdfs, rowUdfs] = await Promise.all([
      getHeaderUdfs(headerTable, docEntry),
      getRowUdfs(rowTable, docEntry),
    ]);

    document.header_udfs = {
      ...(document.header_udfs || {}),
      ...headerUdfs,
    };

    document.lines = (document.lines || []).map((line, index) => ({
      ...line,
      udf: {
        ...(line.udf || {}),
        ...(rowUdfs.get(Number(line.lineNum ?? line.LineNum ?? index)) || {}),
      },
    }));

    return document;
  },
};
