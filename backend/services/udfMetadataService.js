const db = require('./dbService');
const authDbService = require('./authDbService');

const DOCUMENT_TABLES = {
  'sales-quotation': { header: 'OQUT', row: 'QUT1' },
  'sales-order': { header: 'ORDR', row: 'RDR1' },
  delivery: { header: 'ODLN', row: 'DLN1' },
  'ar-invoice': { header: 'OINV', row: 'INV1' },
  'ar-credit-memo': { header: 'ORIN', row: 'RIN1' },
};

const TYPE_BY_ID = new Map([
  ['A', 'text'],
  ['M', 'text'],
  ['N', 'number'],
  ['B', 'number'],
  ['D', 'date'],
]);

const TABLE_ID_VALUES = Object.values(DOCUMENT_TABLES).flatMap((tables) => [tables.header, tables.row]);

const getCompanyDatabaseName = async (auth = {}) => {
  if (!auth.companyId || !auth.userId) return undefined;

  const company = await authDbService.getAssignedCompanyForUser(auth.userId, auth.companyId);
  return company?.DbName || undefined;
};

const getBaseFieldType = (row) => {
  if (row.ValidValuesCount > 0) return 'select';

  const editType = String(row.EditType || '').trim().toUpperCase();
  if (editType === 'D') return 'date';
  if (editType === 'T') return 'time';

  const typeId = String(row.TypeID || '').trim().toUpperCase();
  return TYPE_BY_ID.get(typeId) || 'text';
};

const normalizeField = (row) => ({
  key: `U_${row.AliasID}`,
  label: row.Descr || row.AliasID,
  type: getBaseFieldType(row),
  defaultValue: row.Dflt == null ? '' : String(row.Dflt),
  size: row.Size,
  mandatory: row.Mandatory === 'Y',
  options: (row.ValidValues || []).map((value) => ({
    value: value.Value,
    label: value.Description || value.Value,
  })),
  sourceTable: row.TableID,
});

const getMarketingDocumentUdfs = async ({ documentType, auth }) => {
  const tableConfig = DOCUMENT_TABLES[documentType];
  if (!tableConfig) {
    const supported = Object.keys(DOCUMENT_TABLES).join(', ');
    throw new Error(`Unsupported UDF document type "${documentType}". Supported types: ${supported}.`);
  }

  const databaseName = await getCompanyDatabaseName(auth);
  const result = await db.query(`
    SELECT
      c.TableID,
      c.FieldID,
      c.AliasID,
      c.Descr,
      c.TypeID,
      c.EditType,
      c.EditSize AS Size,
      c.NotNull AS Mandatory,
      c.Dflt,
      valid.ValidValuesCount,
      valuesJson.ValidValuesJson
    FROM CUFD c
    OUTER APPLY (
      SELECT COUNT(1) AS ValidValuesCount
      FROM UFD1 u
      WHERE u.TableID = c.TableID
        AND u.FieldID = c.FieldID
    ) valid
    OUTER APPLY (
      SELECT (
        SELECT
          u.FldValue AS [Value],
          u.Descr AS [Description]
        FROM UFD1 u
        WHERE u.TableID = c.TableID
          AND u.FieldID = c.FieldID
        ORDER BY u.IndexID
        FOR JSON PATH
      ) AS ValidValuesJson
    ) valuesJson
    WHERE c.TableID IN (@headerTable, @rowTable)
    ORDER BY c.TableID, c.FieldID
  `, {
    headerTable: tableConfig.header,
    rowTable: tableConfig.row,
  }, { databaseName });

  const fields = (result.recordset || []).map((row) => {
    let validValues = [];
    try {
      validValues = row.ValidValuesJson ? JSON.parse(row.ValidValuesJson) : [];
    } catch (_error) {
      validValues = [];
    }

    return normalizeField({ ...row, ValidValues: validValues });
  });

  return {
    documentType,
    tables: tableConfig,
    header: fields.filter((field) => field.sourceTable === tableConfig.header),
    row: fields.filter((field) => field.sourceTable === tableConfig.row),
  };
};

module.exports = {
  DOCUMENT_TABLES,
  TABLE_ID_VALUES,
  getMarketingDocumentUdfs,
};
