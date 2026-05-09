const axios = require('axios');
const https = require('https');
const env = require('../config/env');
const authDbService = require('./authDbService');
const reportService = require('./reportService');

const VALID_PARAM_TYPES = new Set(['date', 'string', 'number']);
const VALID_REPORT_TYPES = new Set(['GET', 'POST', 'API', 'API_GET', 'API_POST']);

let schemaReadyPromise = null;
let relaxedHttpsAgent = null;

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeText = (value) => String(value || '').trim();
const toInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
};

const getRelaxedHttpsAgent = () => {
  if (!relaxedHttpsAgent) {
    relaxedHttpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  return relaxedHttpsAgent;
};

const escapePdfText = (value) =>
  String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const formatPdfLine = (key, value) => `${key}: ${value == null ? '' : String(value)}`;

const buildSimplePdfBase64 = ({ title, lines }) => {
  const pageWidth = 595;
  const pageHeight = 842;
  const marginLeft = 40;
  const startY = 800;
  const lineHeight = 14;
  const maxLines = 48;
  const pageLines = lines.slice(0, maxLines);
  const body = [
    'BT',
    '/F1 16 Tf',
    `${marginLeft} ${startY} Td`,
    `(${escapePdfText(title)}) Tj`,
    '/F1 10 Tf',
    `0 -22 Td`,
    ...pageLines.map((line, index) => `${index === 0 ? '' : 'T* ' }(${escapePdfText(line)}) Tj`.trim()),
    'ET',
  ].join('\n');

  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    `3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj`,
    `4 0 obj << /Length ${Buffer.byteLength(body, 'utf8')} >> stream\n${body}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  objects.forEach((objectText) => {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += `${objectText}\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, 'utf8').toString('base64');
};

const normalizeVisibleReport = (row) => ({
  reportId: row.ReportId,
  reportName: row.ReportName,
  reportCode: row.ReportCode,
  reportMenuId: row.ReportMenuId,
  apiUrl: row.ApiUrl,
  reportType: row.ReportType,
  companyId: row.CompanyId,
  createdBy: row.CreatedBy,
  isPublic: Boolean(row.IsPublic),
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
});

const normalizeParameter = (row) => ({
  parameterId: row.ParameterId,
  reportId: row.ReportId,
  paramName: row.ParamName,
  displayName: row.DisplayName,
  paramType: String(row.ParamType || '').toLowerCase(),
  isRequired: Boolean(row.IsRequired),
  sortOrder: Number(row.SortOrder || 0),
  defaultValue: row.DefaultValue || '',
  createdBy: row.CreatedBy,
  createdAt: row.CreatedAt,
  updatedAt: row.UpdatedAt,
});

const normalizeFetchedParameter = (parameter, index = 0) => {
  const paramName = normalizeText(parameter?.paramName || parameter?.ParamName);
  const displayName = normalizeText(parameter?.displayName || parameter?.DisplayName || paramName);
  const paramType = normalizeText(parameter?.paramType || parameter?.ParamType).toLowerCase();
  const isRequired = Boolean(parameter?.isRequired ?? parameter?.IsRequired);
  const sortOrder = toInt(parameter?.sortOrder ?? parameter?.SortOrder) ?? index;
  const defaultValue = normalizeText(parameter?.defaultValue || parameter?.DefaultValue);

  if (!paramName || !displayName || !VALID_PARAM_TYPES.has(paramType)) {
    throw createHttpError(400, 'Invalid parameter metadata was returned for the selected report code.');
  }

  return {
    paramName,
    displayName,
    paramType,
    isRequired,
    sortOrder,
    defaultValue,
  };
};

const getDraftParametersForReport = async (payload, reportCode) => {
  if (Array.isArray(payload?.parameters) && payload.parameters.length) {
    return payload.parameters.map((parameter, index) => normalizeFetchedParameter(parameter, index));
  }

  if (!reportCode) {
    return [];
  }

  const loadedParameters = await reportService.loadReportParameters(reportCode);
  return loadedParameters.map((parameter, index) => normalizeFetchedParameter(parameter, index));
};

const insertReportParameters = async (db, reportId, parameters, createdBy) => {
  for (const parameter of parameters) {
    await db.query(`
      INSERT INTO dbo.ReportParameters (
        ReportId,
        ParamName,
        DisplayName,
        ParamType,
        IsRequired,
        SortOrder,
        DefaultValue,
        CreatedBy,
        CreatedAt
      )
      VALUES (
        @reportId,
        @paramName,
        @displayName,
        @paramType,
        @isRequired,
        @sortOrder,
        @defaultValue,
        @createdBy,
        SYSUTCDATETIME()
      )
    `, {
      reportId,
      paramName: parameter.paramName,
      displayName: parameter.displayName,
      paramType: parameter.paramType,
      isRequired: parameter.isRequired ? 1 : 0,
      sortOrder: parameter.sortOrder,
      defaultValue: parameter.defaultValue || null,
      createdBy,
    });
  }
};

const loadStoredReportParameters = async (reportId) =>
  authDbService.queryRows(`
    SELECT ParamId AS ParameterId, ReportId, ParamName, DisplayName, ParamType, IsRequired, SortOrder, DefaultValue, CreatedBy, CreatedAt, UpdatedAt
    FROM dbo.ReportParameters
    WHERE ReportId = @reportId
    ORDER BY SortOrder ASC, ParamId ASC
  `, { reportId });

const isSapReportServiceApiUrl = (url) =>
  String(url || '').trim().toLowerCase().includes('/rs/v1/exportpdfdata');

const serializeParameterSignature = (parameters = []) =>
  JSON.stringify(
    parameters.map((parameter) => ({
      paramName: String(parameter.paramName || '').trim().toLowerCase(),
      displayName: String(parameter.displayName || '').trim().toLowerCase(),
      paramType: String(parameter.paramType || '').trim().toLowerCase(),
      isRequired: Boolean(parameter.isRequired),
      sortOrder: Number(parameter.sortOrder || 0),
      defaultValue: String(parameter.defaultValue || '').trim(),
    })),
  );

const syncSapReportParameters = async (reportRow) => {
  const reportId = Number(reportRow?.ReportId);
  const reportCode = normalizeText(reportRow?.ReportCode).toUpperCase();

  if (!reportId || !reportCode || !isSapReportServiceApiUrl(reportRow?.ApiUrl)) {
    return loadStoredReportParameters(reportId);
  }

  const storedRows = await loadStoredReportParameters(reportId);
  const storedParameters = storedRows.map(normalizeParameter);
  const sourceParameters = (await reportService.loadReportParameters(reportCode))
    .map((parameter, index) => normalizeFetchedParameter(parameter, index));

  if (serializeParameterSignature(storedParameters) === serializeParameterSignature(sourceParameters)) {
    return storedRows;
  }

  await authDbService.transaction(async (db) => {
    await db.query(`
      DELETE FROM dbo.ReportParameters
      WHERE ReportId = @reportId
    `, { reportId });

    await insertReportParameters(db, reportId, sourceParameters, toInt(reportRow?.CreatedBy));
  });

  return loadStoredReportParameters(reportId);
};

const buildMenuTree = (menus = [], reports = []) => {
  const menuMap = new Map(
    menus.map((menu) => [
      menu.MenuId,
      {
        menuId: menu.MenuId,
        menuName: menu.MenuName,
        parentId: menu.ParentId,
        sortOrder: Number(menu.SortOrder || 0),
        createdBy: menu.CreatedBy,
        companyId: menu.CompanyId,
        reports: [],
        children: [],
      },
    ]),
  );

  const roots = [];

  menuMap.forEach((menu) => {
    if (menu.parentId && menuMap.has(menu.parentId)) {
      menuMap.get(menu.parentId).children.push(menu);
    } else {
      roots.push(menu);
    }
  });

  reports.forEach((report) => {
    const normalized = normalizeVisibleReport(report);
    if (normalized.reportMenuId && menuMap.has(normalized.reportMenuId)) {
      menuMap.get(normalized.reportMenuId).reports.push(normalized);
    }
  });

  const sortNode = (node) => {
    node.children.sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.menuName.localeCompare(right.menuName);
    });
    node.reports.sort((left, right) => left.reportName.localeCompare(right.reportName));
    node.children.forEach(sortNode);
    return node;
  };

  return roots
    .sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.menuName.localeCompare(right.menuName);
    })
    .map(sortNode);
};

const appendAncestorMenus = (visibleMenus, allMenus) => {
  const menuMap = new Map(allMenus.map((menu) => [menu.MenuId, menu]));
  const resultMap = new Map(visibleMenus.map((menu) => [menu.MenuId, menu]));

  visibleMenus.forEach((menu) => {
    let cursor = menu;
    while (cursor?.ParentId && menuMap.has(cursor.ParentId)) {
      const parent = menuMap.get(cursor.ParentId);
      if (!resultMap.has(parent.MenuId)) {
        resultMap.set(parent.MenuId, parent);
      }
      cursor = parent;
    }
  });

  return [...resultMap.values()];
};

const ensureSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = authDbService.query(`
      IF OBJECT_ID(N'dbo.ReportMenus', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ReportMenus (
          ReportMenuId INT IDENTITY(1,1) PRIMARY KEY,
          MenuName NVARCHAR(150) NOT NULL,
          ParentId INT NULL,
          Icon NVARCHAR(50) NULL,
          SortOrder INT NOT NULL CONSTRAINT DF_ReportMenus_SortOrder DEFAULT (0),
          CreatedBy INT NOT NULL,
          CompanyId INT NOT NULL,
          CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportMenus_CreatedAt DEFAULT (SYSUTCDATETIME()),
          UpdatedAt DATETIME2 NULL,
          CONSTRAINT FK_ReportMenus_Parent FOREIGN KEY (ParentId) REFERENCES dbo.ReportMenus(ReportMenuId)
        );
      END;

      IF COL_LENGTH(N'dbo.ReportMenus', N'CreatedBy') IS NULL ALTER TABLE dbo.ReportMenus ADD CreatedBy INT NULL;
      IF COL_LENGTH(N'dbo.ReportMenus', N'CompanyId') IS NULL ALTER TABLE dbo.ReportMenus ADD CompanyId INT NULL;
      IF COL_LENGTH(N'dbo.ReportMenus', N'Icon') IS NULL ALTER TABLE dbo.ReportMenus ADD Icon NVARCHAR(50) NULL;
      IF COL_LENGTH(N'dbo.ReportMenus', N'SortOrder') IS NULL ALTER TABLE dbo.ReportMenus ADD SortOrder INT NOT NULL CONSTRAINT DF_ReportMenus_SortOrder_Alter DEFAULT (0);
      IF COL_LENGTH(N'dbo.ReportMenus', N'CreatedAt') IS NULL ALTER TABLE dbo.ReportMenus ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportMenus_CreatedAt_Alter DEFAULT (SYSUTCDATETIME());
      IF COL_LENGTH(N'dbo.ReportMenus', N'UpdatedAt') IS NULL ALTER TABLE dbo.ReportMenus ADD UpdatedAt DATETIME2 NULL;

      IF OBJECT_ID(N'dbo.Reports', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Reports (
          ReportId INT IDENTITY(1,1) PRIMARY KEY,
          ReportName NVARCHAR(150) NOT NULL,
          ReportCode NVARCHAR(100) NOT NULL,
          ReportMenuId INT NULL,
          ApiUrl NVARCHAR(500) NOT NULL,
          ReportType NVARCHAR(50) NOT NULL CONSTRAINT DF_Reports_ReportType DEFAULT ('GET'),
          CompanyId INT NOT NULL,
          CreatedBy INT NOT NULL,
          IsActive BIT NOT NULL CONSTRAINT DF_Reports_IsActive DEFAULT (1),
          IsPublic BIT NOT NULL CONSTRAINT DF_Reports_IsPublic DEFAULT (0),
          CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Reports_CreatedAt DEFAULT (SYSUTCDATETIME()),
          UpdatedAt DATETIME2 NULL,
          CONSTRAINT FK_Reports_ReportMenus FOREIGN KEY (ReportMenuId) REFERENCES dbo.ReportMenus(ReportMenuId)
        );
      END;

      IF COL_LENGTH(N'dbo.Reports', N'CreatedBy') IS NULL ALTER TABLE dbo.Reports ADD CreatedBy INT NULL;
      IF COL_LENGTH(N'dbo.Reports', N'CompanyId') IS NULL ALTER TABLE dbo.Reports ADD CompanyId INT NULL;
      IF COL_LENGTH(N'dbo.Reports', N'IsActive') IS NULL ALTER TABLE dbo.Reports ADD IsActive BIT NOT NULL CONSTRAINT DF_Reports_IsActive_Alter DEFAULT (1);
      IF COL_LENGTH(N'dbo.Reports', N'IsPublic') IS NULL ALTER TABLE dbo.Reports ADD IsPublic BIT NOT NULL CONSTRAINT DF_Reports_IsPublic_Alter DEFAULT (0);
      IF COL_LENGTH(N'dbo.Reports', N'ReportMenuId') IS NULL ALTER TABLE dbo.Reports ADD ReportMenuId INT NULL;
      IF COL_LENGTH(N'dbo.Reports', N'ReportType') IS NULL ALTER TABLE dbo.Reports ADD ReportType NVARCHAR(50) NOT NULL CONSTRAINT DF_Reports_ReportType_Alter DEFAULT ('GET');
      IF COL_LENGTH(N'dbo.Reports', N'ApiUrl') IS NULL ALTER TABLE dbo.Reports ADD ApiUrl NVARCHAR(500) NULL;
      IF COL_LENGTH(N'dbo.Reports', N'CreatedAt') IS NULL ALTER TABLE dbo.Reports ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_Reports_CreatedAt_Alter DEFAULT (SYSUTCDATETIME());
      IF COL_LENGTH(N'dbo.Reports', N'UpdatedAt') IS NULL ALTER TABLE dbo.Reports ADD UpdatedAt DATETIME2 NULL;

      IF OBJECT_ID(N'dbo.ReportParameters', N'U') IS NULL
      BEGIN
        CREATE TABLE dbo.ReportParameters (
          ParamId INT IDENTITY(1,1) PRIMARY KEY,
          ReportId INT NOT NULL,
          ParamName NVARCHAR(100) NOT NULL,
          DisplayName NVARCHAR(150) NOT NULL,
          ParamType NVARCHAR(30) NOT NULL,
          IsRequired BIT NOT NULL CONSTRAINT DF_ReportParameters_IsRequired DEFAULT (0),
          SortOrder INT NOT NULL CONSTRAINT DF_ReportParameters_SortOrder DEFAULT (0),
          DefaultValue NVARCHAR(255) NULL,
          CreatedBy INT NOT NULL,
          CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportParameters_CreatedAt DEFAULT (SYSUTCDATETIME()),
          UpdatedAt DATETIME2 NULL,
          CONSTRAINT FK_ReportParameters_Reports FOREIGN KEY (ReportId) REFERENCES dbo.Reports(ReportId)
        );
      END;

      IF COL_LENGTH(N'dbo.ReportParameters', N'CreatedBy') IS NULL ALTER TABLE dbo.ReportParameters ADD CreatedBy INT NULL;
      IF COL_LENGTH(N'dbo.ReportParameters', N'SortOrder') IS NULL ALTER TABLE dbo.ReportParameters ADD SortOrder INT NOT NULL CONSTRAINT DF_ReportParameters_SortOrder_Alter DEFAULT (0);
      IF COL_LENGTH(N'dbo.ReportParameters', N'DefaultValue') IS NULL ALTER TABLE dbo.ReportParameters ADD DefaultValue NVARCHAR(255) NULL;
      IF COL_LENGTH(N'dbo.ReportParameters', N'CreatedAt') IS NULL ALTER TABLE dbo.ReportParameters ADD CreatedAt DATETIME2 NOT NULL CONSTRAINT DF_ReportParameters_CreatedAt_Alter DEFAULT (SYSUTCDATETIME());
      IF COL_LENGTH(N'dbo.ReportParameters', N'UpdatedAt') IS NULL ALTER TABLE dbo.ReportParameters ADD UpdatedAt DATETIME2 NULL;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_ReportMenus_CompanyOwner'
          AND object_id = OBJECT_ID(N'dbo.ReportMenus')
      )
      BEGIN
        CREATE INDEX IX_ReportMenus_CompanyOwner
          ON dbo.ReportMenus (CompanyId, CreatedBy, ParentId, SortOrder, MenuName);
      END;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_Reports_CompanyOwner'
          AND object_id = OBJECT_ID(N'dbo.Reports')
      )
      BEGIN
        CREATE INDEX IX_Reports_CompanyOwner
          ON dbo.Reports (CompanyId, CreatedBy, IsPublic, ReportMenuId, ReportName);
      END;

      IF NOT EXISTS (
        SELECT 1 FROM sys.indexes
        WHERE name = N'IX_ReportParameters_Report'
          AND object_id = OBJECT_ID(N'dbo.ReportParameters')
      )
      BEGIN
        CREATE INDEX IX_ReportParameters_Report
          ON dbo.ReportParameters (ReportId, SortOrder, ParamId);
      END;
    `).catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
};

const getVisibleMenusAndReports = async ({ userId, companyId }) => {
  await ensureSchema();

  const [allMenus, visibleReports] = await Promise.all([
    authDbService.queryRows(`
      SELECT ReportMenuId AS MenuId, MenuName, ParentId, SortOrder, CreatedBy, CompanyId
      FROM dbo.ReportMenus
      WHERE CompanyId = @companyId
      ORDER BY SortOrder ASC, MenuName ASC, ReportMenuId ASC
    `, { companyId }),
    authDbService.queryRows(`
      SELECT ReportId, ReportName, ReportCode, ReportMenuId, ApiUrl, ReportType, CompanyId, CreatedBy, IsPublic, CreatedAt, UpdatedAt
      FROM dbo.Reports
      WHERE CompanyId = @companyId
        AND (CreatedBy = @userId OR IsPublic = 1)
      ORDER BY ReportName ASC, ReportId ASC
    `, { companyId, userId }),
  ]);

  const ownedMenus = allMenus.filter((menu) => Number(menu.CreatedBy) === Number(userId));
  const visibleMenuIds = new Set(ownedMenus.map((menu) => menu.MenuId));
  visibleReports.forEach((report) => {
    if (report.ReportMenuId) {
      visibleMenuIds.add(report.ReportMenuId);
    }
  });

  const directlyVisibleMenus = allMenus.filter((menu) => visibleMenuIds.has(menu.MenuId));
  const completeVisibleMenus = appendAncestorMenus(directlyVisibleMenus, allMenus);

  return {
    menus: buildMenuTree(completeVisibleMenus, visibleReports),
    flatMenus: completeVisibleMenus
      .map((menu) => ({
        menuId: menu.MenuId,
        menuName: menu.MenuName,
        parentId: menu.ParentId,
        sortOrder: menu.SortOrder,
        createdBy: menu.CreatedBy,
      }))
      .sort((left, right) => {
        if (Number(left.sortOrder || 0) !== Number(right.sortOrder || 0)) {
          return Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
        }
        return String(left.menuName || '').localeCompare(String(right.menuName || ''));
      }),
  };
};

const listReportMenus = async (auth) => {
  const userId = toInt(auth?.userId);
  const companyId = toInt(auth?.companyId);
  if (!userId || !companyId) {
    throw createHttpError(401, 'A valid company session is required.');
  }

  return getVisibleMenusAndReports({ userId, companyId });
};

const listAuthorizedReportCodes = async (auth, query = '') => {
  const userId = toInt(auth?.userId);
  const companyId = toInt(auth?.companyId);
  if (!userId || !companyId) {
    throw createHttpError(401, 'A valid company session is required.');
  }

  return {
    items: await reportService.loadAuthorizedCrList(query),
  };
};

const listReportCodeParameters = async (auth, docCode) => {
  const userId = toInt(auth?.userId);
  const companyId = toInt(auth?.companyId);
  if (!userId || !companyId) {
    throw createHttpError(401, 'A valid company session is required.');
  }

  const reportCode = normalizeText(docCode).toUpperCase();
  if (!reportCode) {
    throw createHttpError(400, 'DocCode is required.');
  }

  return {
    reportCode,
    parameters: await reportService.loadReportParameters(reportCode),
  };
};

const createReportMenu = async (payload, auth) => {
  const userId = toInt(auth?.userId);
  const companyId = toInt(auth?.companyId);
  if (!userId || !companyId) {
    throw createHttpError(401, 'A valid company session is required.');
  }

  await ensureSchema();

  const menuName = normalizeText(payload?.menuName || payload?.MenuName);
  const parentId = toInt(payload?.parentId ?? payload?.ParentId);
  const sortOrder = toInt(payload?.sortOrder ?? payload?.SortOrder) ?? 0;

  if (!menuName) {
    throw createHttpError(400, 'MenuName is required.');
  }

  if (parentId) {
    const parent = await authDbService.queryOne(`
      SELECT ReportMenuId AS MenuId, CompanyId, CreatedBy
      FROM dbo.ReportMenus
      WHERE ReportMenuId = @menuId
    `, { menuId: parentId });

    if (!parent || Number(parent.CompanyId) !== companyId || Number(parent.CreatedBy) !== userId) {
      throw createHttpError(403, 'You can only create child menus under your own menus in the selected company.');
    }
  }

  const inserted = await authDbService.query(`
    INSERT INTO dbo.ReportMenus (
      MenuName,
      ParentId,
      SortOrder,
      CreatedBy,
      CompanyId,
      CreatedAt
    )
    OUTPUT INSERTED.ReportMenuId AS MenuId
    VALUES (
      @menuName,
      @parentId,
      @sortOrder,
      @createdBy,
      @companyId,
      SYSUTCDATETIME()
    )
  `, {
    menuName,
    parentId,
    sortOrder,
    createdBy: userId,
    companyId,
  });

  return {
    menuId: inserted.recordset?.[0]?.MenuId,
    menuName,
    parentId,
    sortOrder,
    createdBy: userId,
    companyId,
  };
};

const createReport = async (payload, auth) => {
  const userId = toInt(auth?.userId);
  const companyId = toInt(auth?.companyId);
  if (!userId || !companyId) {
    throw createHttpError(401, 'A valid company session is required.');
  }

  await ensureSchema();

  const reportName = normalizeText(payload?.reportName || payload?.ReportName);
  const reportCode = normalizeText(payload?.reportCode || payload?.ReportCode).toUpperCase();
  const reportMenuId = toInt(payload?.reportMenuId ?? payload?.ReportMenuId);
  const apiUrl = normalizeText(payload?.apiUrl || payload?.ApiUrl);
  const reportTypeRaw = normalizeText(payload?.reportType || payload?.ReportType).toUpperCase() || 'GET';
  const reportType = VALID_REPORT_TYPES.has(reportTypeRaw) ? reportTypeRaw : 'GET';
  const isPublic = Boolean(payload?.isPublic ?? payload?.IsPublic);

  if (!reportName || !reportCode || !reportMenuId || !apiUrl) {
    throw createHttpError(400, 'ReportName, ReportCode, ReportMenuId, and ApiUrl are required.');
  }

  const menu = await authDbService.queryOne(`
    SELECT ReportMenuId AS MenuId, CompanyId, CreatedBy
    FROM dbo.ReportMenus
    WHERE ReportMenuId = @menuId
  `, { menuId: reportMenuId });

  if (!menu || Number(menu.CompanyId) !== companyId || Number(menu.CreatedBy) !== userId) {
    throw createHttpError(403, 'You can only create reports under your own menus in the selected company.');
  }

  const duplicate = await authDbService.queryOne(`
    SELECT ReportId
    FROM dbo.Reports
    WHERE CompanyId = @companyId
      AND CreatedBy = @createdBy
      AND ReportCode = @reportCode
  `, { companyId, createdBy: userId, reportCode });

  if (duplicate) {
    throw createHttpError(409, 'You already created a report with this code in the selected company.');
  }

  const draftParameters = await getDraftParametersForReport(payload, reportCode);

  const reportId = await authDbService.transaction(async (db) => {
    const inserted = await db.query(`
      INSERT INTO dbo.Reports (
        ReportName,
        ReportCode,
        ReportMenuId,
        ApiUrl,
        ReportType,
        CompanyId,
        CreatedBy,
        IsPublic,
        CreatedAt
      )
      OUTPUT INSERTED.ReportId
      VALUES (
        @reportName,
        @reportCode,
        @reportMenuId,
        @apiUrl,
        @reportType,
        @companyId,
        @createdBy,
        @isPublic,
        SYSUTCDATETIME()
      )
    `, {
      reportName,
      reportCode,
      reportMenuId,
      apiUrl,
      reportType,
      companyId,
      createdBy: userId,
      isPublic: isPublic ? 1 : 0,
    });

    const insertedReportId = inserted.recordset?.[0]?.ReportId;
    if (!insertedReportId) {
      throw createHttpError(500, 'Failed to create report.');
    }

    await insertReportParameters(db, insertedReportId, draftParameters, userId);
    return insertedReportId;
  });

  return getReportById(reportId, auth);
};

const addReportParameter = async (payload, auth) => {
  const userId = toInt(auth?.userId);
  const companyId = toInt(auth?.companyId);
  if (!userId || !companyId) {
    throw createHttpError(401, 'A valid company session is required.');
  }

  await ensureSchema();

  const reportId = toInt(payload?.reportId ?? payload?.ReportId);
  const paramName = normalizeText(payload?.paramName || payload?.ParamName);
  const displayName = normalizeText(payload?.displayName || payload?.DisplayName);
  const paramType = normalizeText(payload?.paramType || payload?.ParamType).toLowerCase();
  const isRequired = Boolean(payload?.isRequired ?? payload?.IsRequired);
  const sortOrder = toInt(payload?.sortOrder ?? payload?.SortOrder) ?? 0;
  const defaultValue = normalizeText(payload?.defaultValue || payload?.DefaultValue);

  if (!reportId || !paramName || !displayName || !VALID_PARAM_TYPES.has(paramType)) {
    throw createHttpError(400, 'ReportId, ParamName, DisplayName, and a valid ParamType are required.');
  }

  const report = await authDbService.queryOne(`
    SELECT ReportId, CompanyId, CreatedBy
    FROM dbo.Reports
    WHERE ReportId = @reportId
  `, { reportId });

  if (!report || Number(report.CompanyId) !== companyId || Number(report.CreatedBy) !== userId) {
    throw createHttpError(403, 'You can only add parameters to your own reports in the selected company.');
  }

  const duplicate = await authDbService.queryOne(`
    SELECT ParamId AS ParameterId
    FROM dbo.ReportParameters
    WHERE ReportId = @reportId
      AND ParamName = @paramName
  `, { reportId, paramName });

  if (duplicate) {
    throw createHttpError(409, 'This parameter name already exists for the selected report.');
  }

  await authDbService.query(`
    INSERT INTO dbo.ReportParameters (
      ReportId,
      ParamName,
      DisplayName,
      ParamType,
      IsRequired,
      SortOrder,
      DefaultValue,
      CreatedBy,
      CreatedAt
    )
    VALUES (
      @reportId,
      @paramName,
      @displayName,
      @paramType,
      @isRequired,
      @sortOrder,
      @defaultValue,
      @createdBy,
      SYSUTCDATETIME()
    )
  `, {
    reportId,
    paramName,
    displayName,
    paramType,
    isRequired: isRequired ? 1 : 0,
    sortOrder,
    defaultValue: defaultValue || null,
    createdBy: userId,
  });

  return getReportById(reportId, auth);
};

const getReportById = async (reportId, auth) => {
  const userId = toInt(auth?.userId);
  const companyId = toInt(auth?.companyId);
  if (!userId || !companyId) {
    throw createHttpError(401, 'A valid company session is required.');
  }

  await ensureSchema();

  const reportRow = await authDbService.queryOne(`
    SELECT ReportId, ReportName, ReportCode, ReportMenuId, ApiUrl, ReportType, CompanyId, CreatedBy, IsPublic, CreatedAt, UpdatedAt
    FROM dbo.Reports
    WHERE ReportId = @reportId
      AND CompanyId = @companyId
      AND (CreatedBy = @userId OR IsPublic = 1)
  `, { reportId, companyId, userId });

  if (!reportRow) {
    throw createHttpError(404, 'Report not found.');
  }

  let parameterRows = await loadStoredReportParameters(reportId);

  if (isSapReportServiceApiUrl(reportRow.ApiUrl) && normalizeText(reportRow.ReportCode)) {
    try {
      parameterRows = await syncSapReportParameters(reportRow);
    } catch (_error) {
      // Fall back to the stored metadata if the SAP parameter sync fails.
    }
  }

  return {
    report: normalizeVisibleReport(reportRow),
    parameters: parameterRows.map(normalizeParameter),
  };
};

const normalizeParameterInput = (parameter, rawValue) => {
  if (rawValue == null || rawValue === '') {
    return parameter.defaultValue || '';
  }

  if (parameter.paramType === 'number') {
    const numeric = Number(rawValue);
    if (!Number.isFinite(numeric)) {
      throw createHttpError(400, `${parameter.displayName} must be a valid number.`);
    }
    return numeric;
  }

  if (parameter.paramType === 'date') {
    const text = normalizeText(rawValue);
    if (!text) return '';
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw createHttpError(400, `${parameter.displayName} must be a valid date.`);
    }
    return parsed.toISOString().slice(0, 10);
  }

  return String(rawValue);
};

const resolveSubmittedParameterValue = (payload, parameter) => {
  const parameterBag = payload?.parameters || {};
  const compactDisplayName = normalizeText(parameter?.displayName).replace(/\s+/g, '');
  const compactParamName = normalizeText(parameter?.paramName).replace(/\s+/g, '');
  const normalizedParamName = compactParamName.replace(/@+$/, '');

  const candidateKeys = [
    parameter?.paramName,
    normalizedParamName,
    parameter?.displayName,
    compactDisplayName,
    compactParamName,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(parameterBag, key)) {
      return parameterBag[key];
    }

    if (Object.prototype.hasOwnProperty.call(payload || {}, key)) {
      return payload[key];
    }
  }

  return undefined;
};

const resolveApiUrl = (apiUrl) => {
  if (/^https?:\/\//i.test(apiUrl)) {
    return apiUrl;
  }

  if (apiUrl.startsWith('/')) {
    return `http://localhost:${env.port}${apiUrl}`;
  }

  return `http://localhost:${env.port}/${apiUrl}`;
};

const buildRequestAgentOptions = (url) => {
  if (!/^https:\/\//i.test(String(url || ''))) {
    return {};
  }

  const shouldRelaxTls =
    env.reportServiceRejectUnauthorized === false ||
    env.sapRejectUnauthorized === false;

  if (!shouldRelaxTls) {
    return {};
  }

  return {
    httpsAgent: getRelaxedHttpsAgent(),
  };
};

const isSapReportServiceUrl = isSapReportServiceApiUrl;

const collectReportLines = (data) => {
  if (Buffer.isBuffer(data)) {
    return [`Binary payload (${data.length} bytes)`];
  }

  if (Array.isArray(data)) {
    return data.flatMap((row, index) => {
      if (row && typeof row === 'object') {
        return [
          `Row ${index + 1}`,
          ...Object.entries(row).map(([key, value]) => formatPdfLine(key, value)),
          '',
        ];
      }
      return [`Row ${index + 1}: ${String(row)}`];
    });
  }

  if (data && typeof data === 'object') {
    if (Array.isArray(data.rows)) {
      return collectReportLines(data.rows);
    }

    return Object.entries(data).map(([key, value]) => formatPdfLine(key, typeof value === 'object' ? JSON.stringify(value) : value));
  }

  return [String(data ?? '')];
};

const executeReportSource = async ({ report, parameters, values, authHeader }) => {
  const normalizedType = String(report.reportType || 'GET').toUpperCase();
  const method = normalizedType.includes('POST') ? 'post' : 'get';
  const url = resolveApiUrl(report.apiUrl);

  if (isSapReportServiceUrl(url)) {
    const sapResponse = await reportService.exportReportPdf({
      docCode: report.reportCode,
      parameters: parameters.map((parameter) => ({
        name: parameter.paramName,
        type: parameter.paramType,
        value: values[parameter.paramName],
      })),
      fileName: `${report.reportCode || report.reportName}.pdf`,
    });

    return {
      pdfBase64: sapResponse.base64Pdf,
      sourceType: 'sap-report-service',
    };
  }

  const response = await axios({
    method,
    url,
    params: method === 'get' ? values : undefined,
    data: method === 'post' ? values : undefined,
    responseType: 'arraybuffer',
    headers: authHeader ? { Authorization: authHeader } : undefined,
    validateStatus: (status) => status >= 200 && status < 300,
    ...buildRequestAgentOptions(url),
  });

  const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
  const rawBuffer = Buffer.from(response.data);

  if (contentType.includes('application/pdf')) {
    return {
      pdfBase64: rawBuffer.toString('base64'),
      sourceType: 'pdf',
    };
  }

  const textPayload = rawBuffer.toString('utf8');

  if (reportService.isProbablyBase64(textPayload)) {
    return {
      pdfBase64: String(textPayload).trim(),
      sourceType: 'raw-base64',
    };
  }

  try {
    const parsed = JSON.parse(textPayload);
    const embeddedBase64 = parsed?.pdfBase64 || parsed?.base64Pdf || parsed?.data?.pdfBase64 || parsed?.data?.base64Pdf;
    if (embeddedBase64) {
      return {
        pdfBase64: embeddedBase64,
        sourceType: 'embedded-pdf',
      };
    }

    const parameterSummaryLines = parameters.map((parameter) =>
      formatPdfLine(parameter.displayName, values[parameter.paramName] ?? ''),
    );
    const reportLines = collectReportLines(parsed);

    return {
      pdfBase64: buildSimplePdfBase64({
        title: report.reportName,
        lines: [
          `Report Code: ${report.reportCode}`,
          `Company ID: ${report.companyId}`,
          'Parameters',
          ...parameterSummaryLines,
          '',
          'Data',
          ...reportLines,
        ],
      }),
      sourceType: 'generated-from-json',
    };
  } catch (_error) {
    return {
      pdfBase64: buildSimplePdfBase64({
        title: report.reportName,
        lines: [
          `Report Code: ${report.reportCode}`,
          'Response',
          textPayload.slice(0, 5000),
        ],
      }),
      sourceType: 'generated-from-text',
    };
  }
};

const runReport = async (payload, auth, authHeader) => {
  const reportId = toInt(payload?.reportId ?? payload?.ReportId);
  if (!reportId) {
    throw createHttpError(400, 'ReportId is required.');
  }

  const detail = await getReportById(reportId, auth);
  const values = {};

  detail.parameters.forEach((parameter) => {
    const inputValue = resolveSubmittedParameterValue(payload, parameter);
    const normalized = normalizeParameterInput(parameter, inputValue);
    if (parameter.isRequired && (normalized === '' || normalized == null)) {
      throw createHttpError(400, `${parameter.displayName} is required.`);
    }
    values[parameter.paramName] = normalized;
  });

  const execution = await executeReportSource({
    report: detail.report,
    parameters: detail.parameters,
    values,
    authHeader,
  });

  return {
    reportId: detail.report.reportId,
    reportName: detail.report.reportName,
    fileName: `${detail.report.reportCode || detail.report.reportName}.pdf`,
    pdfBase64: execution.pdfBase64,
    sourceType: execution.sourceType,
  };
};

module.exports = {
  ensureSchema,
  listReportMenus,
  listAuthorizedReportCodes,
  listReportCodeParameters,
  createReportMenu,
  createReport,
  addReportParameter,
  getReportById,
  runReport,
};
