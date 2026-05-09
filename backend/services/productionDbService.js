const db = require("./dbService");
const masterDataDbService = require("./masterDataDbService");

const toInt = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatDate = (value) => (value ? String(value).split("T")[0] : "");
const yesNo = (value) => (String(value || "").toUpperCase() === "Y" ? "tYES" : "tNO");

const PRODUCTION_STATUS_TO_SL = {
  P: "boposPlanned",
  R: "boposReleased",
  L: "boposClosed",
  C: "boposCancelled",
};

const PRODUCTION_TYPE_TO_SL = {
  P: "bopotStandard",
  S: "bopotSpecial",
  D: "bopotDisassemble",
};

const ISSUE_METHOD_TO_SL = {
  B: "im_Backflush",
  M: "im_Manual",
};

const ITEM_TYPE_TO_SL = {
  4: "pit_Item",
  290: "pit_Resource",
};

const PRODUCTION_PRIORITY_OPTIONS = [
  { value: 50, label: "Low" },
  { value: 100, label: "Normal" },
  { value: 150, label: "High" },
];

const queryRows = async (sql, params = {}) => {
  const result = await db.query(sql, params);
  return result.recordset || [];
};

const queryOne = async (sql, params = {}) => {
  const rows = await queryRows(sql, params);
  return rows[0] || null;
};

const toProductionStatus = (value) => PRODUCTION_STATUS_TO_SL[String(value || "").toUpperCase()] || "boposPlanned";
const toProductionType = (value) => PRODUCTION_TYPE_TO_SL[String(value || "").toUpperCase()] || "bopotStandard";
const toIssueMethod = (value) => ISSUE_METHOD_TO_SL[String(value || "").toUpperCase()] || "im_Manual";
const toItemType = (value) => ITEM_TYPE_TO_SL[Number(value)] || "pit_Item";

const pagingParams = (top, skip) => ({
  top: Math.max(1, toInt(top, 50)),
  skip: Math.max(0, toInt(skip, 0)),
});

const mapSeriesRow = (row) => ({
  Series: row.Series,
  Name: row.SeriesName || `Series ${row.Series}`,
  Indicator: row.Indicator || "",
  NextNumber: row.NextNumber ?? row.InitialNum ?? null,
  BeginStr: row.BeginStr || "",
  EndStr: row.EndStr || "",
  Locked: yesNo(row.Locked),
  IsManual: yesNo(row.IsManual),
});

const lookupSeries = async (objectCode) => {
  const rows = await queryRows(
    `
      SELECT Series, SeriesName, Indicator, NextNumber, InitialNum, BeginStr, EndStr, Locked, IsManual
      FROM NNM1
      WHERE ObjectCode = @objectCode
        AND Locked <> 'Y'
      ORDER BY Series
    `,
    { objectCode: String(objectCode) }
  );

  return rows.map(mapSeriesRow);
};

const lookupProdWarehouses = async () => {
  const rows = await queryRows(`
    SELECT WhsCode, WhsName, BinActivat, RecBinEnab, DftBinAbs, AutoRecvMd
    FROM OWHS
    WHERE ISNULL(Inactive, 'N') <> 'Y'
    ORDER BY WhsCode
  `);

  return rows.map((row) => ({
    WarehouseCode: row.WhsCode,
    WarehouseName: row.WhsName || "",
    EnableBinLocations: yesNo(row.BinActivat),
    EnableReceivingBinLocations: yesNo(row.RecBinEnab),
    DefaultBin: row.DftBinAbs ?? null,
    AutoAllocOnReceipt: row.AutoRecvMd === 1 ? "tYES" : "tNO",
  }));
};

const lookupDistributionRules = async () =>
  queryRows(`
    SELECT TOP 200 OcrCode AS FactorCode, OcrName AS FactorDescription
    FROM OOCR
    WHERE Active <> 'N'
    ORDER BY OcrCode
  `);

const lookupProjects = async () =>
  queryRows(`
    SELECT TOP 200 PrjCode AS Code, PrjName AS Name
    FROM OPRJ
    ORDER BY PrjCode
  `);

const lookupBranches = async () => {
  const rows = await queryRows(`
    SELECT BPLId, BPLName
    FROM OBPL
    WHERE Disabled <> 'Y'
    ORDER BY BPLId
  `);

  return rows.map((row) => ({
    BPLID: row.BPLId,
    BPLName: row.BPLName || "",
  }));
};

const lookupRouteStages = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT TOP 200 AbsEntry, Code, [Desc]
      FROM ORST
      WHERE @query = ''
         OR Code LIKE @like
         OR [Desc] LIKE @like
      ORDER BY AbsEntry
    `,
    { query: trimmed, like: `%${trimmed}%` }
  );

  return rows.map((row) => ({
    InternalNumber: row.AbsEntry,
    Code: row.Code || "",
    Description: row.Desc || "",
  }));
};

const lookupCustomers = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT TOP 50 CardCode, CardName
      FROM OCRD
      WHERE CardType = 'C'
        AND (
          @query = ''
          OR CardCode LIKE @like
          OR CardName LIKE @like
        )
      ORDER BY CardCode
    `,
    { query: trimmed, like: `%${trimmed}%` }
  );

  return rows.map((row) => ({
    CardCode: row.CardCode,
    CardName: row.CardName || "",
  }));
};

const lookupProductionOrderItems = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT TOP 50 I.ItemCode, I.ItemName, I.InvntryUom, I.DfltWH AS DefaultWarehouse
      FROM OITM I
      INNER JOIN OITT T ON T.Code = I.ItemCode
      WHERE (
        @query = ''
        OR I.ItemCode LIKE @like
        OR I.ItemName LIKE @like
      )
      ORDER BY I.ItemCode
    `,
    { query: trimmed, like: `%${trimmed}%` }
  );

  return rows.map((row) => ({
    ItemCode: row.ItemCode,
    ItemName: row.ItemName || "",
    InventoryUOM: row.InvntryUom || "",
    DefaultWarehouse: row.DefaultWarehouse || "",
  }));
};

const lookupComponentItems = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT TOP 50 ItemCode, ItemName, InvntryUom, DfltWH AS DefaultWarehouse, ManSerNum, ManBtchNum
      FROM OITM
      WHERE InvntItem = 'Y'
        AND (
          @query = ''
          OR ItemCode LIKE @like
          OR ItemName LIKE @like
        )
      ORDER BY ItemCode
    `,
    { query: trimmed, like: `%${trimmed}%` }
  );

  return rows.map((row) => ({
    ItemCode: row.ItemCode,
    ItemName: row.ItemName || "",
    InventoryUOM: row.InvntryUom || "",
    DefaultWarehouse: row.DefaultWarehouse || "",
    ManageSerialNumbers: yesNo(row.ManSerNum),
    ManageBatchNumbers: yesNo(row.ManBtchNum),
  }));
};

const lookupResources = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT TOP 50 ResCode, ResName, DfltWH
      FROM ORSC
      WHERE ProdRes = 'Y'
        AND (
          @query = ''
          OR ResCode LIKE @like
          OR ResName LIKE @like
        )
      ORDER BY ResCode
    `,
    { query: trimmed, like: `%${trimmed}%` }
  );

  return rows.map((row) => ({
    Code: row.ResCode,
    Name: row.ResName || "",
    DefaultWarehouse: row.DfltWH || "",
    IssueMethod: "rimManually",
  }));
};

const mapProductionOrderSummary = (row) => ({
  doc_entry: row.DocEntry,
  doc_num: row.DocNum,
  item_code: row.ItemCode || "",
  item_name: row.ProdName || "",
  planned_qty: row.PlannedQty ?? 0,
  completed_qty: row.CmpltQty ?? 0,
  due_date: formatDate(row.DueDate),
  posting_date: formatDate(row.PostDate),
  status: toProductionStatus(row.Status),
  type: toProductionType(row.Type),
  warehouse: row.Warehouse || "",
});

const buildProductionOrderWhere = (query = "", status = "") => {
  const trimmed = String(query || "").trim();
  const clauses = [
    `(@query = '' OR T0.ItemCode LIKE @like OR T0.ProdName LIKE @like OR CAST(T0.DocNum AS NVARCHAR(50)) LIKE @like)`,
  ];

  const statusCode =
    status === "boposPlanned"
      ? "P"
      : status === "boposReleased"
        ? "R"
        : status === "boposClosed"
          ? "L"
          : status === "boposCancelled"
            ? "C"
            : "";

  if (statusCode) clauses.push(`T0.Status = @statusCode`);

  return {
    where: clauses.join(" AND "),
    params: { query: trimmed, like: `%${trimmed}%`, statusCode },
  };
};

const getProductionOrders = async ({ query = "", top = 50, skip = 0, status = "" } = {}) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const where = buildProductionOrderWhere(query, status);
  const rows = await queryRows(
    `
      SELECT T0.DocEntry, T0.DocNum, T0.ItemCode, T0.ProdName, T0.PlannedQty, T0.CmpltQty,
             T0.DueDate, T0.PostDate, T0.Status, T0.Type, T0.Warehouse
      FROM OWOR T0
      WHERE ${where.where}
      ORDER BY T0.DocEntry DESC
      OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
    `,
    { ...where.params, top: limit, skip: offset }
  );

  return { orders: rows.map(mapProductionOrderSummary) };
};

const getProductionOrderByDocEntry = async (docEntry) => {
  const entry = toInt(docEntry, 0);
  const row = await queryOne(
    `
      SELECT T0.DocEntry, T0.DocNum, T0.ItemCode, T0.ProdName, T0.PlannedQty, T0.CmpltQty, T0.RjctQty,
             T0.DueDate, T0.PostDate, T0.StartDate, T0.Status, T0.Type, T0.Warehouse, T0.OcrCode,
             T0.Project, T0.JrnlMemo, T0.Comments, T0.Series, T0.OriginNum, T0.CardCode,
             BP.CardName
      FROM OWOR T0
      LEFT JOIN OCRD BP ON BP.CardCode = T0.CardCode
      WHERE T0.DocEntry = @docEntry
    `,
    { docEntry: entry }
  );

  if (!row) return null;

  const lines = await queryRows(
    `
      SELECT T1.DocEntry, T1.LineNum, T1.ItemCode, T1.ItemName, T1.LineText, T1.BaseQty, T1.PlannedQty,
             T1.IssuedQty, T1.UomCode, T1.wareHouse, T1.IssueType, T1.OcrCode, T1.Project,
             T1.AdditQty, T1.StageId, T1.ItemType, T1.VisOrder
      FROM WOR1 T1
      WHERE T1.DocEntry = @docEntry
      ORDER BY T1.LineNum
    `,
    { docEntry: entry }
  );

  return {
    production_order: {
      doc_entry: row.DocEntry,
      doc_num: row.DocNum,
      item_code: row.ItemCode || "",
      item_name: row.ProdName || "",
      planned_qty: row.PlannedQty ?? 1,
      completed_qty: row.CmpltQty ?? 0,
      rejected_qty: row.RjctQty ?? 0,
      due_date: formatDate(row.DueDate),
      posting_date: formatDate(row.PostDate),
      start_date: formatDate(row.StartDate),
      order_date: formatDate(row.PostDate),
      status: toProductionStatus(row.Status),
      type: toProductionType(row.Type),
      warehouse: row.Warehouse || "",
      priority: 100,
      distribution_rule: row.OcrCode || "",
      project: row.Project || "",
      journal_remark: row.JrnlMemo || "",
      remarks: row.Comments || "",
      series: row.Series != null ? String(row.Series) : "",
      origin_num: row.OriginNum != null ? String(row.OriginNum) : "",
      origin: "",
      branch: "",
      branch_name: "",
      customer_code: row.CardCode || "",
      customer_name: row.CardName || "",
      lines: lines.map((line) => ({
        _id: line.LineNum ?? Math.random(),
        line_num: line.LineNum ?? 0,
        item_code: line.ItemCode || "",
        item_name: line.ItemName || line.LineText || "",
        line_text: line.LineText || "",
        base_qty: line.BaseQty ?? 1,
        planned_qty: line.PlannedQty ?? 1,
        issued_qty: line.IssuedQty ?? 0,
        uom: line.UomCode || "",
        warehouse: line.wareHouse || "",
        issue_method: toIssueMethod(line.IssueType),
        distribution_rule: line.OcrCode || "",
        project: line.Project || "",
        additional_qty: line.AdditQty ?? 0,
        stage_id: line.StageId ?? "",
        component_type: toItemType(line.ItemType),
      })),
    },
  };
};

const explodeBOM = async (itemCode, qty = 1) => {
  const bom = await masterDataDbService.getBOM(itemCode);
  if (!bom) {
    const error = new Error(`No BOM found for item "${itemCode}".`);
    error.status = 404;
    throw error;
  }

  const factor = Number(qty) / (bom.Quantity || 1);
  return {
    item_code: bom.TreeCode,
    item_name: bom.ProductDescription || "",
    bom_qty: bom.Quantity ?? 1,
    warehouse: bom.Warehouse || "",
    lines: (bom.ProductTreeLines || []).map((line, idx) => ({
      _id: Date.now() + idx + Math.random(),
      line_num: idx,
      item_code: line.ItemCode || "",
      item_name: line.ItemName || "",
      line_text: line.Comment || "",
      base_qty: line.Quantity ?? 1,
      planned_qty: parseFloat((((line.Quantity ?? 1) * factor)).toFixed(6)),
      issued_qty: 0,
      uom: line.InventoryUOM || "",
      warehouse: line.Warehouse || bom.Warehouse || "",
      issue_method: line.IssueMethod || "im_Manual",
      distribution_rule: line.DistributionRule || "",
      project: line.Project || "",
      additional_qty: 0,
      stage_id: line.StageID ?? "",
      component_type: line.ItemType || "pit_Item",
    })),
  };
};

const getProductionOrderReferenceData = async () => ({
  warehouses: await lookupProdWarehouses(),
  distribution_rules: await lookupDistributionRules(),
  projects: await lookupProjects(),
  series: await lookupSeries("202"),
  branches: await lookupBranches(),
  route_stages: await lookupRouteStages(""),
  production_order_statuses: [
    { value: "boposPlanned", label: "Planned" },
    { value: "boposReleased", label: "Released" },
    { value: "boposClosed", label: "Closed" },
    { value: "boposCancelled", label: "Cancelled" },
  ],
  production_order_types: [
    { value: "bopotStandard", label: "Standard" },
    { value: "bopotSpecial", label: "Special" },
    { value: "bopotDisassemble", label: "Disassemble" },
  ],
  production_order_priorities: PRODUCTION_PRIORITY_OPTIONS,
  warnings: [],
});

const lookupOpenProductionOrders = async (query = "", releasedOnly = false) => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT TOP 50 DocEntry, DocNum, ItemCode, ProdName, PlannedQty, CmpltQty, Status, Warehouse, DueDate
      FROM OWOR
      WHERE Status IN (${releasedOnly ? `'R'` : `'P','R'`})
        AND (
          @query = ''
          OR ItemCode LIKE @like
          OR ProdName LIKE @like
          OR CAST(DocNum AS NVARCHAR(50)) LIKE @like
        )
      ORDER BY DocEntry DESC
    `,
    { query: trimmed, like: `%${trimmed}%` }
  );

  return rows.map((row) => ({
    DocEntry: row.DocEntry,
    DocNum: row.DocNum,
    ItemNo: row.ItemCode || "",
    ProductDescription: row.ProdName || "",
    PlannedQuantity: row.PlannedQty ?? 0,
    CompletedQuantity: row.CmpltQty ?? 0,
    ProductionOrderStatus: toProductionStatus(row.Status),
    Warehouse: row.Warehouse || "",
    DueDate: row.DueDate || null,
  }));
};

const getProductionOrderForIssue = async (docEntry) => {
  const entry = toInt(docEntry, 0);
  const row = await queryOne(
    `
      SELECT DocEntry, DocNum, ItemCode, ProdName, PlannedQty, CmpltQty, Status, Warehouse, DueDate
      FROM OWOR
      WHERE DocEntry = @docEntry
    `,
    { docEntry: entry }
  );

  if (!row) return null;
  if (String(row.Status || "").toUpperCase() !== "R") {
    throw new Error("Production order must be Released before issuing components.");
  }

  const lines = await queryRows(
    `
      SELECT T1.LineNum, T1.ItemCode, T1.ItemName, T1.PlannedQty, T1.IssuedQty, T1.UomCode, T1.wareHouse,
             T1.IssueType, T1.OcrCode, T1.Project,
             I.ManBtchNum, I.ManSerNum
      FROM WOR1 T1
      LEFT JOIN OITM I ON I.ItemCode = T1.ItemCode
      WHERE T1.DocEntry = @docEntry
      ORDER BY T1.LineNum
    `,
    { docEntry: entry }
  );

  const manualLines = lines.filter((line) => toIssueMethod(line.IssueType) !== "im_Backflush");

  return {
    doc_entry: row.DocEntry,
    doc_num: row.DocNum,
    item_code: row.ItemCode || "",
    item_name: row.ProdName || "",
    planned_qty: row.PlannedQty ?? 1,
    completed_qty: row.CmpltQty ?? 0,
    status: toProductionStatus(row.Status),
    warehouse: row.Warehouse || "",
    due_date: formatDate(row.DueDate),
    lines_total_count: lines.length,
    lines: manualLines.map((line) => ({
      _id: line.LineNum ?? Math.random(),
      line_num: line.LineNum ?? 0,
      item_code: line.ItemCode || "",
      item_name: line.ItemName || "",
      planned_qty: line.PlannedQty ?? 0,
      issued_qty: line.IssuedQty ?? 0,
      remaining_qty: Math.max(0, (line.PlannedQty ?? 0) - (line.IssuedQty ?? 0)),
      issue_qty: Math.max(0, (line.PlannedQty ?? 0) - (line.IssuedQty ?? 0)),
      uom: line.UomCode || "",
      warehouse: line.wareHouse || row.Warehouse || "",
      issue_method: toIssueMethod(line.IssueType),
      distribution_rule: line.OcrCode || "",
      project: line.Project || "",
      base_entry: row.DocEntry,
      base_line: line.LineNum ?? 0,
      base_type: 202,
      manage_batch: String(line.ManBtchNum || "").toUpperCase() === "Y",
      manage_serial: String(line.ManSerNum || "").toUpperCase() === "Y",
      batch_numbers: [],
      serial_numbers: [],
    })),
  };
};

const getIssueReferenceData = async () => ({
  warehouses: await lookupProdWarehouses(),
  distribution_rules: await lookupDistributionRules(),
  projects: await lookupProjects(),
  series: await lookupSeries("60"),
  warnings: [],
});

const getIssueList = async ({ query = "", top = 50, skip = 0 } = {}) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT T0.DocEntry, T0.DocNum, T0.DocDate, T0.Comments, COUNT(T1.LineNum) AS TotalLines
      FROM OIGE T0
      INNER JOIN IGE1 T1 ON T1.DocEntry = T0.DocEntry
      WHERE EXISTS (
        SELECT 1
        FROM IGE1 X
        WHERE X.DocEntry = T0.DocEntry
          AND X.BaseType = 202
      )
        AND (
          @query = ''
          OR CAST(T0.DocNum AS NVARCHAR(50)) LIKE @like
          OR ISNULL(T0.Comments, '') LIKE @like
        )
      GROUP BY T0.DocEntry, T0.DocNum, T0.DocDate, T0.Comments
      ORDER BY T0.DocEntry DESC
      OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
    `,
    { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset }
  );

  return {
    issues: rows.map((row) => ({
      doc_entry: row.DocEntry,
      doc_num: row.DocNum,
      posting_date: formatDate(row.DocDate),
      remarks: row.Comments || "",
      total_lines: row.TotalLines ?? 0,
    })),
  };
};

const getIssueByDocEntry = async (docEntry) => {
  const entry = toInt(docEntry, 0);
  const row = await queryOne(
    `
      SELECT DocEntry, DocNum, Series, DocDate, TaxDate, Ref2, Comments, JrnlMemo
      FROM OIGE
      WHERE DocEntry = @docEntry
    `,
    { docEntry: entry }
  );

  if (!row) return null;

  const lines = await queryRows(
    `
      SELECT LineNum, ItemCode, Dscription, Quantity, UomCode, unitMsr, WhsCode, BaseEntry, BaseLine, BaseType, OcrCode, Project, AcctCode
      FROM IGE1
      WHERE DocEntry = @docEntry
      ORDER BY LineNum
    `,
    { docEntry: entry }
  );

  const prodBaseEntry = lines.find((line) => line.BaseType === 202)?.BaseEntry ?? null;

  return {
    issue: {
      doc_entry: row.DocEntry,
      doc_num: row.DocNum,
      series: row.Series != null ? String(row.Series) : "",
      posting_date: formatDate(row.DocDate),
      document_date: formatDate(row.TaxDate),
      ref_2: row.Ref2 || "",
      remarks: row.Comments || "",
      journal_remark: row.JrnlMemo || "",
      prod_order_entry: prodBaseEntry,
      lines: lines.map((line) => ({
        _id: line.LineNum ?? Math.random(),
        line_num: line.LineNum ?? 0,
        item_code: line.ItemCode || "",
        item_name: line.Dscription || "",
        issue_qty: line.Quantity ?? 0,
        uom: line.UomCode || line.unitMsr || "",
        warehouse: line.WhsCode || "",
        base_entry: line.BaseEntry ?? null,
        base_line: line.BaseLine ?? null,
        base_type: line.BaseType ?? 202,
        distribution_rule: line.OcrCode || "",
        project: line.Project || "",
        account_code: line.AcctCode || "",
      })),
    },
  };
};

const getProductionOrderForReceipt = async (docEntry) => {
  const entry = toInt(docEntry, 0);
  const row = await queryOne(
    `
      SELECT T0.DocEntry, T0.DocNum, T0.ItemCode, T0.ProdName, T0.PlannedQty, T0.CmpltQty,
             T0.Status, T0.Warehouse, T0.DueDate,
             I.InvntryUom, I.ManBtchNum, I.ManSerNum,
             W.BinActivat, W.RecBinEnab, W.DftBinAbs, W.AutoRecvMd
      FROM OWOR T0
      LEFT JOIN OITM I ON I.ItemCode = T0.ItemCode
      LEFT JOIN OWHS W ON W.WhsCode = T0.Warehouse
      WHERE T0.DocEntry = @docEntry
    `,
    { docEntry: entry }
  );

  if (!row) return null;
  if (String(row.Status || "").toUpperCase() !== "R") {
    throw new Error("Production order must be Released before receipt from production.");
  }

  const remainingQty = Math.max(0, (row.PlannedQty ?? 0) - (row.CmpltQty ?? 0));
  if (remainingQty <= 0) {
    throw new Error("Production order is fully completed. No remaining quantity to receive.");
  }

  const lines = await queryRows(
    `
      SELECT LineNum, ItemCode, ItemName, PlannedQty, IssuedQty, UomCode, wareHouse, IssueType
      FROM WOR1
      WHERE DocEntry = @docEntry
      ORDER BY LineNum
    `,
    { docEntry: entry }
  );

  const backflushLines = lines.filter((line) => toIssueMethod(line.IssueType) === "im_Backflush");
  const manualLines = lines.filter((line) => toIssueMethod(line.IssueType) !== "im_Backflush");

  return {
    doc_entry: row.DocEntry,
    doc_num: row.DocNum,
    item_code: row.ItemCode || "",
    item_name: row.ProdName || "",
    planned_qty: row.PlannedQty ?? 1,
    completed_qty: row.CmpltQty ?? 0,
    remaining_qty: remainingQty,
    status: toProductionStatus(row.Status),
    warehouse: row.Warehouse || "",
    due_date: formatDate(row.DueDate),
    inventory_uom: row.InvntryUom || "",
    uom_code: row.InvntryUom || "",
    uom_name: row.InvntryUom || "",
    manage_batch: String(row.ManBtchNum || "").toUpperCase() === "Y",
    manage_serial: String(row.ManSerNum || "").toUpperCase() === "Y",
    issue_primarily_by: "",
    enable_bin_locations: yesNo(row.BinActivat),
    enable_receiving_bin_locations: yesNo(row.RecBinEnab),
    default_bin: row.DftBinAbs ?? null,
    auto_alloc_on_receipt: row.AutoRecvMd === 1 ? "tYES" : "tNO",
    backflush_lines: backflushLines.map((line) => ({
      _id: line.LineNum ?? Math.random(),
      line_num: line.LineNum ?? 0,
      item_code: line.ItemCode || "",
      item_name: line.ItemName || "",
      bom_qty: line.PlannedQty ?? 0,
      issued_qty: line.IssuedQty ?? 0,
      uom: line.UomCode || "",
      warehouse: line.wareHouse || row.Warehouse || "",
      issue_method: "im_Backflush",
    })),
    manual_lines_count: manualLines.length,
  };
};

const getReceiptReferenceData = async () => ({
  warehouses: await lookupProdWarehouses(),
  distribution_rules: await lookupDistributionRules(),
  projects: await lookupProjects(),
  branches: await lookupBranches(),
  series: await lookupSeries("59"),
  warnings: [],
});

const getReceiptList = async ({ query = "", top = 50, skip = 0 } = {}) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(
    `
      SELECT T0.DocEntry, T0.DocNum, T0.DocDate, T0.Comments, COUNT(T1.LineNum) AS TotalLines
      FROM OIGN T0
      INNER JOIN IGN1 T1 ON T1.DocEntry = T0.DocEntry
      WHERE EXISTS (
        SELECT 1
        FROM IGN1 X
        WHERE X.DocEntry = T0.DocEntry
          AND X.BaseType = 202
      )
        AND (
          @query = ''
          OR CAST(T0.DocNum AS NVARCHAR(50)) LIKE @like
          OR ISNULL(T0.Comments, '') LIKE @like
        )
      GROUP BY T0.DocEntry, T0.DocNum, T0.DocDate, T0.Comments
      ORDER BY T0.DocEntry DESC
      OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
    `,
    { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset }
  );

  return {
    receipts: rows.map((row) => ({
      doc_entry: row.DocEntry,
      doc_num: row.DocNum,
      posting_date: formatDate(row.DocDate),
      remarks: row.Comments || "",
      total_lines: row.TotalLines ?? 0,
    })),
  };
};

const getReceiptByDocEntry = async (docEntry) => {
  const entry = toInt(docEntry, 0);
  const row = await queryOne(
    `
      SELECT DocEntry, DocNum, Series, DocDate, TaxDate, Ref2, Comments, JrnlMemo, BPLId
      FROM OIGN
      WHERE DocEntry = @docEntry
    `,
    { docEntry: entry }
  );

  if (!row) return null;

  const lines = await queryRows(
    `
      SELECT L.LineNum, L.ItemCode, L.Dscription, L.Quantity, L.UomCode, L.unitMsr, L.WhsCode,
             L.BaseEntry, L.BaseLine, L.BaseType, L.OcrCode, L.Project,
             I.InvntryUom, I.ManBtchNum, I.ManSerNum,
             W.BinActivat
      FROM IGN1 L
      LEFT JOIN OITM I ON I.ItemCode = L.ItemCode
      LEFT JOIN OWHS W ON W.WhsCode = L.WhsCode
      WHERE L.DocEntry = @docEntry
      ORDER BY L.LineNum
    `,
    { docEntry: entry }
  );

  const prodBaseEntry = lines.find((line) => line.BaseType === 202)?.BaseEntry ?? null;

  return {
    receipt: {
      doc_entry: row.DocEntry,
      doc_num: row.DocNum,
      series: row.Series != null ? String(row.Series) : "",
      posting_date: formatDate(row.DocDate),
      document_date: formatDate(row.TaxDate),
      ref_2: row.Ref2 || "",
      branch: row.BPLId != null ? String(row.BPLId) : "",
      uop: "",
      remarks: row.Comments || "",
      journal_remark: row.JrnlMemo || "",
      prod_order_entry: prodBaseEntry,
      lines: lines.map((line) => ({
        _id: line.LineNum ?? Math.random(),
        line_num: line.LineNum ?? 0,
        item_code: line.ItemCode || "",
        item_name: line.Dscription || "",
        trans_type: "Complete",
        quantity: line.Quantity ?? 0,
        unit_price: 0,
        value: 0,
        item_cost: 0,
        planned: 0,
        completed: 0,
        inventory_uom: line.InvntryUom || "",
        uom_code: line.UomCode || line.unitMsr || "",
        uom_name: line.UomCode || line.unitMsr || "",
        items_per_unit: 1,
        warehouse: line.WhsCode || "",
        location: "",
        branch: "",
        uom_group: "",
        by_product: false,
        distribution_rule: line.OcrCode || "",
        project: line.Project || "",
        base_entry: line.BaseEntry ?? null,
        base_line: line.BaseLine ?? null,
        base_type: line.BaseType ?? 202,
        order_no: "",
        series_no: "",
        manage_batch: String(line.ManBtchNum || "").toUpperCase() === "Y",
        manage_serial: String(line.ManSerNum || "").toUpperCase() === "Y",
        issue_primarily_by: "",
        enable_bin_locations: String(line.BinActivat || "").toUpperCase() === "Y",
        batch_numbers: [],
        serial_numbers: [],
        bin_allocations: [],
      })),
    },
  };
};

const lookupBinLocations = async (warehouse) => {
  const rows = await queryRows(
    `
      SELECT AbsEntry, BinCode, WhsCode AS Warehouse
      FROM OBIN
      WHERE WhsCode = @warehouse
        AND ISNULL(Disabled, 'N') <> 'Y'
        AND ISNULL(Deleted, 'N') <> 'Y'
      ORDER BY BinCode
    `,
    { warehouse: String(warehouse || "").trim() }
  );

  return { value: rows };
};

const lookupBatchesByItem = async (itemCode, warehouse) => {
  const rows = await queryRows(
    `
      SELECT BatchNum AS BatchNumber, Quantity, ExpDate
      FROM OIBT
      WHERE ItemCode = @itemCode
        AND WhsCode = @warehouse
        AND Quantity > 0
      ORDER BY ExpDate, BatchNum
    `,
    { itemCode, warehouse }
  );

  return { value: rows };
};

module.exports = {
  getProductionOrderReferenceData,
  getIssueReferenceData,
  getReceiptReferenceData,
  getProductionOrders,
  getProductionOrderByDocEntry,
  explodeBOM,
  lookupProductionOrderItems,
  lookupComponentItems,
  lookupResources,
  lookupRouteStages,
  lookupProdWarehouses,
  lookupDistributionRules,
  lookupProjects,
  lookupBranches,
  lookupCustomers,
  lookupOpenProductionOrders,
  getProductionOrderForIssue,
  getIssueList,
  getIssueByDocEntry,
  getProductionOrderForReceipt,
  getReceiptList,
  getReceiptByDocEntry,
  lookupBinLocations,
  lookupBatchesByItem,
  lookupSeries,
};
