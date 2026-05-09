const db = require("../../services/dbService");

const queryRows = async (sql, params = {}) => {
  const result = await db.query(sql, params);
  return result.recordset || [];
};

const normalizeText = (value) => String(value || "").trim();
const buildLike = (value) => `%${normalizeText(value)}%`;

const formatDate = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatStatus = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "O") return "Open";
  if (normalized === "C") return "Closed";
  return normalized || "";
};

const buildCodeRangeCondition = (columnExpression, range, params, prefix) => {
  const clauses = [];
  const fromValue = normalizeText(range?.from);
  const toValue = normalizeText(range?.to);

  if (fromValue) {
    params[`${prefix}From`] = fromValue;
    clauses.push(`${columnExpression} >= @${prefix}From`);
  }

  if (toValue) {
    params[`${prefix}To`] = toValue;
    clauses.push(`${columnExpression} <= @${prefix}To`);
  }

  return clauses;
};

const buildDateRangeCondition = (columnExpression, range, params, prefix) => {
  const clauses = [];
  const fromValue = normalizeText(range?.from);
  const toValue = normalizeText(range?.to);

  if (fromValue) {
    params[`${prefix}From`] = fromValue;
    clauses.push(`${columnExpression} >= @${prefix}From`);
  }

  if (toValue) {
    params[`${prefix}To`] = toValue;
    clauses.push(`${columnExpression} <= @${prefix}To`);
  }

  return clauses;
};

const buildItemPropertyCondition = (criteria, alias = "I") => {
  if (criteria?.ignoreProperties || !criteria?.selectedPropertyNumbers?.length) {
    return "";
  }

  const selectedConditions = criteria.selectedPropertyNumbers.map(
    (propertyNumber) => `ISNULL(${alias}.QryGroup${propertyNumber}, 'N') = 'Y'`,
  );

  if (!selectedConditions.length) {
    return "";
  }

  if (criteria.exactlyMatch) {
    const nonSelectedConditions = [];
    for (let propertyNumber = 1; propertyNumber <= 64; propertyNumber += 1) {
      if (!criteria.selectedPropertyNumbers.includes(propertyNumber)) {
        nonSelectedConditions.push(`ISNULL(${alias}.QryGroup${propertyNumber}, 'N') = 'N'`);
      }
    }

    return `(${selectedConditions.join(" AND ")}${nonSelectedConditions.length ? ` AND ${nonSelectedConditions.join(" AND ")}` : ""})`;
  }

  return criteria.linkMode === "or"
    ? `(${selectedConditions.join(" OR ")})`
    : `(${selectedConditions.join(" AND ")})`;
};

const lookupItems = async (query = "") => {
  const hasQuery = Boolean(normalizeText(query));
  return queryRows(
    `
      SELECT TOP 100
        T0.ItemCode AS code,
        T0.ItemName AS name,
        CAST(ISNULL(T0.ItmsGrpCod, 0) AS NVARCHAR(50)) AS groupCode,
        ISNULL(T1.ItmsGrpNam, '') AS groupName
      FROM OITM T0
      LEFT JOIN OITB T1 ON T1.ItmsGrpCod = T0.ItmsGrpCod
      WHERE (
        @hasQuery = 0
        OR T0.ItemCode LIKE @query
        OR T0.ItemName LIKE @query
      )
      ORDER BY T0.ItemCode
    `,
    { hasQuery: hasQuery ? 1 : 0, query: buildLike(query) },
  );
};

const lookupVendors = async (query = "") => {
  const hasQuery = Boolean(normalizeText(query));
  return queryRows(
    `
      SELECT TOP 100
        T0.CardCode AS code,
        T0.CardName AS name,
        CAST(ISNULL(T0.GroupCode, 0) AS NVARCHAR(50)) AS groupCode,
        ISNULL(T1.GroupName, '') AS groupName
      FROM OCRD T0
      LEFT JOIN OCRG T1 ON T1.GroupCode = T0.GroupCode
      WHERE T0.CardType = 'S'
        AND (
          @hasQuery = 0
          OR T0.CardCode LIKE @query
          OR T0.CardName LIKE @query
        )
      ORDER BY T0.CardCode
    `,
    { hasQuery: hasQuery ? 1 : 0, query: buildLike(query) },
  );
};

const lookupItemGroups = async () => ([
  { code: "All", name: "All" },
  ...(await queryRows(`
    SELECT
      CAST(ItmsGrpCod AS NVARCHAR(50)) AS code,
      ItmsGrpNam AS name
    FROM OITB
    ORDER BY ItmsGrpNam
  `)),
]);

const lookupItemProperties = async () => {
  const rows = await queryRows(`
    SELECT
      ItmsTypCod,
      ItmsGrpNam
    FROM OITG
    ORDER BY ItmsTypCod
  `);

  const namesByNumber = rows.reduce((acc, row) => {
    acc[Number(row.ItmsTypCod)] = row.ItmsGrpNam || `Property ${row.ItmsTypCod}`;
    return acc;
  }, {});

  return Array.from({ length: 64 }, (_, index) => ({
    number: index + 1,
    name: namesByNumber[index + 1] || `Property ${index + 1}`,
  }));
};

const lookupBranches = async (query = "") => {
  const normalizedQuery = normalizeText(query);
  return queryRows(
    `
      SELECT TOP 100
        CAST(BPLId AS NVARCHAR(50)) AS code,
        BPLName AS name
      FROM OBPL
      WHERE @query = ''
        OR CAST(BPLId AS NVARCHAR(50)) LIKE @like
        OR ISNULL(BPLName, '') LIKE @like
      ORDER BY BPLId
    `,
    { query: normalizedQuery, like: buildLike(query) },
  );
};

const lookupDepartments = async (query = "") => {
  const normalizedQuery = normalizeText(query);
  return queryRows(
    `
      SELECT TOP 100
        CAST(Code AS NVARCHAR(50)) AS code,
        Name AS name
      FROM OUDP
      WHERE @query = ''
        OR CAST(Code AS NVARCHAR(50)) LIKE @like
        OR ISNULL(Name, '') LIKE @like
      ORDER BY Code
    `,
    { query: normalizedQuery, like: buildLike(query) },
  );
};

const lookupProjects = async (query = "") => {
  const normalizedQuery = normalizeText(query);
  return queryRows(
    `
      SELECT TOP 100
        PrjCode AS code,
        PrjName AS name
      FROM OPRJ
      WHERE @query = ''
        OR PrjCode LIKE @like
        OR ISNULL(PrjName, '') LIKE @like
      ORDER BY PrjCode
    `,
    { query: normalizedQuery, like: buildLike(query) },
  );
};

const lookupUsers = async (query = "") => {
  const normalizedQuery = normalizeText(query);
  return queryRows(
    `
      SELECT TOP 100
        CAST(USERID AS NVARCHAR(50)) AS code,
        COALESCE(NULLIF(U_NAME, ''), USER_CODE) AS name,
        USER_CODE AS userCode
      FROM OUSR
      WHERE @query = ''
        OR CAST(USERID AS NVARCHAR(50)) LIKE @like
        OR USER_CODE LIKE @like
        OR ISNULL(U_NAME, '') LIKE @like
      ORDER BY USERID
    `,
    { query: normalizedQuery, like: buildLike(query) },
  );
};

const lookupEmployees = async (query = "") => {
  const normalizedQuery = normalizeText(query);
  return queryRows(
    `
      SELECT TOP 100
        CAST(empID AS NVARCHAR(50)) AS code,
        LTRIM(RTRIM(CONCAT(
          ISNULL(firstName, ''),
          CASE WHEN ISNULL(middleName, '') = '' THEN '' ELSE CONCAT(' ', middleName) END,
          CASE WHEN ISNULL(lastName, '') = '' THEN '' ELSE CONCAT(' ', lastName) END
        ))) AS name
      FROM OHEM
      WHERE @query = ''
        OR CAST(empID AS NVARCHAR(50)) LIKE @like
        OR ISNULL(firstName, '') LIKE @like
        OR ISNULL(middleName, '') LIKE @like
        OR ISNULL(lastName, '') LIKE @like
      ORDER BY empID
    `,
    { query: normalizedQuery, like: buildLike(query) },
  );
};

const buildUserRequesterCondition = (params, selector, paramPrefix = "requesterUser") => {
  if (!selector?.code) {
    return "";
  }

  params[`${paramPrefix}Code`] = selector.code;
  return `
    EXISTS (
      SELECT 1
      FROM OUSR UX
      WHERE (
        CAST(UX.USERID AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
        OR UX.USER_CODE = CAST(H.Requester AS NVARCHAR(50))
      )
        AND (
          CAST(UX.USERID AS NVARCHAR(50)) = @${paramPrefix}Code
          OR UX.USER_CODE = @${paramPrefix}Code
        )
    )
  `;
};

const buildEmployeeRequesterCondition = (params, selector, paramPrefix = "requesterEmployee") => {
  if (!selector?.code) {
    return "";
  }

  params[`${paramPrefix}Code`] = selector.code;
  return `
    EXISTS (
      SELECT 1
      FROM OHEM EX
      WHERE (
        CAST(EX.empID AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
        OR CAST(ISNULL(EX.userId, -1) AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
      )
        AND (
          CAST(EX.empID AS NVARCHAR(50)) = @${paramPrefix}Code
          OR CAST(ISNULL(EX.userId, -1) AS NVARCHAR(50)) = @${paramPrefix}Code
        )
    )
  `;
};

const getPurchaseRequestReport = async (criteria = {}) => {
  const params = {};
  const headerWhere = ["ISNULL(H.CANCELED, 'N') <> 'Y'"];
  const lineWhere = ["1 = 1"];

  if (criteria.type === "Item") {
    headerWhere.push("ISNULL(H.DocType, 'I') = 'I'");
  } else if (criteria.type === "Service") {
    headerWhere.push("ISNULL(H.DocType, 'I') = 'S'");
  }

  if (criteria.type === "Item") {
    lineWhere.push(...buildCodeRangeCondition("ISNULL(L.ItemCode, '')", criteria.codeRange, params, "code"));
    lineWhere.push(
      ...buildCodeRangeCondition(
        "ISNULL(I.CardCode, '')",
        criteria.preferredVendorRange,
        params,
        "vendor",
      ),
    );

    if (criteria.itemGroup && criteria.itemGroup !== "All") {
      params.itemGroup = criteria.itemGroup;
      lineWhere.push("(CAST(ISNULL(I.ItmsGrpCod, 0) AS NVARCHAR(50)) = @itemGroup OR ISNULL(G.ItmsGrpNam, '') = @itemGroup)");
    }

    const itemPropertyCondition = buildItemPropertyCondition(criteria.properties, "I");
    if (itemPropertyCondition) {
      lineWhere.push(itemPropertyCondition);
    }
  } else {
    lineWhere.push(...buildCodeRangeCondition("ISNULL(L.AcctCode, '')", criteria.codeRange, params, "code"));
  }

  if (criteria.requesterType === "users") {
    const selectedUserCondition = buildUserRequesterCondition(params, criteria.requesterUser);
    headerWhere.push(selectedUserCondition || `
      EXISTS (
        SELECT 1
        FROM OUSR UX
        WHERE CAST(UX.USERID AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
           OR UX.USER_CODE = CAST(H.Requester AS NVARCHAR(50))
      )
    `);
  } else if (criteria.requesterType === "employees") {
    const selectedEmployeeCondition = buildEmployeeRequesterCondition(params, criteria.requesterEmployee);
    headerWhere.push(selectedEmployeeCondition || `
      EXISTS (
        SELECT 1
        FROM OHEM EX
        WHERE CAST(EX.empID AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
           OR CAST(ISNULL(EX.userId, -1) AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
      )
    `);
  } else {
    const combinedRequesterFilters = [
      buildUserRequesterCondition(params, criteria.requesterUser, "requesterUserAll"),
      buildEmployeeRequesterCondition(params, criteria.requesterEmployee, "requesterEmployeeAll"),
    ].filter(Boolean);

    if (combinedRequesterFilters.length) {
      headerWhere.push(`(${combinedRequesterFilters.join(" OR ")})`);
    }
  }

  if (criteria.branch?.enabled && criteria.branch.code) {
    params.branchCode = criteria.branch.code;
    headerWhere.push("CAST(ISNULL(NULLIF(H.Branch, ''), H.BPLId) AS NVARCHAR(50)) = @branchCode");
  }

  if (criteria.department?.enabled && criteria.department.code) {
    params.departmentCode = criteria.department.code;
    headerWhere.push("CAST(ISNULL(H.Department, '') AS NVARCHAR(50)) = @departmentCode");
  }

  if (criteria.project?.enabled && criteria.project.code) {
    params.projectCode = criteria.project.code;
    headerWhere.push("ISNULL(H.Project, '') = @projectCode");
  }

  if (normalizeText(criteria.documentNumberRange?.from)) {
    params.docNumFrom = Number(criteria.documentNumberRange.from);
    headerWhere.push("ISNULL(H.DocNum, 0) >= @docNumFrom");
  }
  if (normalizeText(criteria.documentNumberRange?.to)) {
    params.docNumTo = Number(criteria.documentNumberRange.to);
    headerWhere.push("ISNULL(H.DocNum, 0) <= @docNumTo");
  }
  headerWhere.push(...buildDateRangeCondition("H.DocDate", criteria.postingDateRange, params, "postingDate"));
  headerWhere.push(
    ...buildDateRangeCondition(
      "ISNULL(H.ToDate, H.DocDueDate)",
      criteria.validUntilRange,
      params,
      "validUntil",
    ),
  );
  headerWhere.push(...buildDateRangeCondition("H.TaxDate", criteria.documentDateRange, params, "documentDate"));
  headerWhere.push(
    ...buildDateRangeCondition(
      "ISNULL(H.ReqDate, H.DocDueDate)",
      criteria.requiredDateRange,
      params,
      "requiredDate",
    ),
  );

  if (criteria.displayOpenOnly) {
    headerWhere.push("ISNULL(H.DocStatus, 'O') = 'O'");
  }

  if (criteria.displayMrpOnly) {
    headerWhere.push(`
      (
        UPPER(CAST(ISNULL(H.OriginType, '') AS NVARCHAR(50))) IN ('MRP', 'M')
        OR ISNULL(H.Comments, '') LIKE '%Origin: MRP%'
      )
    `);
  }

  const rows = await queryRows(
    `
      WITH FilteredLines AS (
        SELECT
          L.DocEntry,
          COUNT(*) AS MatchingLineCount,
          SUM(ISNULL(L.Quantity, 0)) AS RequestedQuantity,
          SUM(ISNULL(L.OpenQty, 0)) AS OpenQuantity,
          MIN(ISNULL(L.ItemCode, '')) AS FirstItemCode,
          MIN(ISNULL(L.Dscription, '')) AS FirstItemName,
          MIN(ISNULL(L.AcctCode, '')) AS FirstAccountCode,
          MIN(ISNULL(I.CardCode, '')) AS PreferredVendorCode,
          MIN(ISNULL(V.CardName, '')) AS PreferredVendorName
        FROM PRQ1 L
        LEFT JOIN OITM I ON I.ItemCode = L.ItemCode
        LEFT JOIN OCRD V ON V.CardCode = I.CardCode
        LEFT JOIN OITB G ON G.ItmsGrpCod = I.ItmsGrpCod
        WHERE ${lineWhere.join("\n          AND ")}
        GROUP BY L.DocEntry
      )
      SELECT
        H.DocEntry,
        H.DocNum,
        H.DocStatus,
        H.DocType,
        H.DocDate,
        H.TaxDate,
        H.DocDueDate,
        H.ToDate,
        H.ReqDate,
        H.Requester,
        H.ReqName,
        H.Project,
        CAST(ISNULL(NULLIF(H.Branch, ''), H.BPLId) AS NVARCHAR(50)) AS BranchCode,
        CAST(ISNULL(H.Department, '') AS NVARCHAR(50)) AS DepartmentCode,
        CAST(ISNULL(H.OriginType, '') AS NVARCHAR(50)) AS OriginType,
        FL.MatchingLineCount,
        FL.RequestedQuantity,
        FL.OpenQuantity,
        FL.FirstItemCode,
        FL.FirstItemName,
        FL.FirstAccountCode,
        FL.PreferredVendorCode,
        FL.PreferredVendorName,
        ISNULL(B.BPLName, '') AS BranchName,
        ISNULL(D.Name, '') AS DepartmentName,
        ISNULL(P.PrjName, '') AS ProjectName,
        ISNULL(U.USER_CODE, '') AS UserCode,
        ISNULL(U.U_NAME, '') AS UserName,
        ISNULL(E.empID, 0) AS EmployeeId,
        LTRIM(RTRIM(CONCAT(
          ISNULL(E.firstName, ''),
          CASE WHEN ISNULL(E.middleName, '') = '' THEN '' ELSE CONCAT(' ', E.middleName) END,
          CASE WHEN ISNULL(E.lastName, '') = '' THEN '' ELSE CONCAT(' ', E.lastName) END
        ))) AS EmployeeName
      FROM OPRQ H
      INNER JOIN FilteredLines FL ON FL.DocEntry = H.DocEntry
      LEFT JOIN OBPL B ON B.BPLId = CASE
        WHEN ISNUMERIC(CAST(ISNULL(NULLIF(H.Branch, ''), H.BPLId) AS NVARCHAR(50))) = 1
          THEN CAST(CAST(ISNULL(NULLIF(H.Branch, ''), H.BPLId) AS NVARCHAR(50)) AS INT)
        ELSE NULL
      END
      LEFT JOIN OUDP D ON D.Code = CASE
        WHEN ISNUMERIC(CAST(H.Department AS NVARCHAR(50))) = 1
          THEN CAST(CAST(H.Department AS NVARCHAR(50)) AS INT)
        ELSE NULL
      END
      LEFT JOIN OPRJ P ON P.PrjCode = H.Project
      LEFT JOIN OUSR U
        ON CAST(U.USERID AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
        OR U.USER_CODE = CAST(H.Requester AS NVARCHAR(50))
      LEFT JOIN OHEM E
        ON CAST(E.empID AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
        OR CAST(ISNULL(E.userId, -1) AS NVARCHAR(50)) = CAST(H.Requester AS NVARCHAR(50))
      WHERE ${headerWhere.join("\n        AND ")}
      ORDER BY
        CASE WHEN ISNULL(H.DocType, 'I') = 'S' THEN FL.FirstAccountCode ELSE FL.FirstItemCode END,
        ISNULL(H.ReqDate, H.DocDueDate),
        H.DocNum,
        H.DocEntry
    `,
    params,
  );

  const reportRows = rows.map((row, index) => {
    const requesterName = normalizeText(row.ReqName)
      || normalizeText(row.UserName)
      || normalizeText(row.EmployeeName)
      || normalizeText(row.UserCode)
      || (row.EmployeeId ? String(row.EmployeeId) : "")
      || normalizeText(row.Requester);

    return {
      rowNo: index + 1,
      docEntry: row.DocEntry,
      docNum: row.DocNum,
      docType: String(row.DocType || "").trim().toUpperCase() === "S" ? "Service" : "Item",
      code: String(row.DocType || "").trim().toUpperCase() === "S"
        ? normalizeText(row.FirstAccountCode)
        : normalizeText(row.FirstItemCode),
      description: String(row.DocType || "").trim().toUpperCase() === "S"
        ? normalizeText(row.FirstItemName) || "Service"
        : normalizeText(row.FirstItemName),
      preferredVendorCode: normalizeText(row.PreferredVendorCode),
      preferredVendorName: normalizeText(row.PreferredVendorName),
      requester: requesterName,
      branchCode: normalizeText(row.BranchCode),
      branchName: normalizeText(row.BranchName),
      departmentCode: normalizeText(row.DepartmentCode),
      departmentName: normalizeText(row.DepartmentName),
      projectCode: normalizeText(row.Project),
      projectName: normalizeText(row.ProjectName),
      postingDate: formatDate(row.DocDate),
      validUntil: formatDate(row.ToDate || row.DocDueDate),
      documentDate: formatDate(row.TaxDate),
      requiredDate: formatDate(row.ReqDate || row.DocDueDate),
      matchingLineCount: Number(row.MatchingLineCount || 0),
      requestedQuantity: Number(row.RequestedQuantity || 0),
      openQuantity: Number(row.OpenQuantity || 0),
      status: formatStatus(row.DocStatus),
      originType: normalizeText(row.OriginType),
    };
  });

  return {
    rows: reportRows,
    totals: {
      documentCount: reportRows.length,
      matchingLineCount: reportRows.reduce((sum, row) => sum + Number(row.matchingLineCount || 0), 0),
      requestedQuantity: reportRows.reduce((sum, row) => sum + Number(row.requestedQuantity || 0), 0),
      openQuantity: reportRows.reduce((sum, row) => sum + Number(row.openQuantity || 0), 0),
    },
  };
};

module.exports = {
  getPurchaseRequestReport,
  lookupItems,
  lookupVendors,
  lookupItemGroups,
  lookupItemProperties,
  lookupBranches,
  lookupDepartments,
  lookupProjects,
  lookupUsers,
  lookupEmployees,
};
