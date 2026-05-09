const sapService = require('./sapService');
const productionDbService = require('./productionDbService');

const escapeOData = (v) => String(v || '').replace(/'/g, "''");
const formatDate  = (v) => (v ? String(v).split('T')[0] : '');

// SAP B1 ProductionOrders fields to select
// Note: Some fields may not exist in all SAP B1 versions, so we'll fetch without $select first
const PROD_ORDER_SELECT = '*';
// Note: ProductionOrders entity includes lines by default, no need to expand

const toNum = (v) => {
  if (v === '' || v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const opt = (v) => v !== '' && v != null;

const normalizeBranches = (rows = []) =>
  (rows || [])
    .map((row) => ({
      BPLID: row.BPLID ?? row.Code ?? row.Branch ?? row.AbsEntry ?? '',
      BPLName: row.BPLName ?? row.Name ?? row.Description ?? '',
    }))
    .filter((row) => row.BPLID !== '' && row.BPLID != null);

const fetchBranches = async () => {
  const [businessPlacesRes, branchesRes] = await Promise.allSettled([
    sapService.request({ method: 'GET', url: '/BusinessPlaces?$select=BPLID,BPLName' }),
    sapService.request({ method: 'GET', url: '/Branches?$select=Code,Name,Description' }),
  ]);

  const businessPlaces =
    businessPlacesRes.status === 'fulfilled'
      ? normalizeBranches(businessPlacesRes.value.data?.value || businessPlacesRes.value.data || [])
      : [];

  if (businessPlaces.length > 0) return businessPlaces;

  return branchesRes.status === 'fulfilled'
    ? normalizeBranches(branchesRes.value.data?.value || branchesRes.value.data || [])
    : [];
};

// SAP B1 ProductionOrders enums (confirmed from Service Layer metadata)
const STATUS_MAP = {
  boposReleased:  'Released',
  boposPlanned:   'Planned',
  boposClosed:    'Closed',
  boposCancelled: 'Cancelled',
};

const TYPE_MAP = {
  bopotStandard:    'Standard',
  bopotSpecial:     'Special',
  bopotDisassembly: 'Disassembly',
  bopotDisassemble: 'Disassembly',
};

const TYPE_OPTIONS = [
  { value: 'bopotStandard', label: 'Standard' },
  { value: 'bopotSpecial', label: 'Special' },
  { value: 'bopotDisassembly', label: 'Disassembly' },
];

const PRIORITY_MAP = {
  boprLow:    'Low',
  boprNormal: 'Normal',
  boprHigh:   'High',
};

const ORIGIN_MAP = {
  bopooManual: 'Manual',
  bopooMRP: 'MRP',
  bopooSalesOrder: 'Sales Order',
  bopooProductionOrder: 'Production Order',
};

// Verified against the SAP Service Layer metadata in this environment on 2026-05-01.
// Only fields in these sets should be written to /ProductionOrders payloads.
const PROD_ORDER_HEADER_FIELDS = new Set([
  'ItemNo',
  'PlannedQuantity',
  'DueDate',
  'PostingDate',
  'StartDate',
  'Warehouse',
  'Priority',
  'CustomerCode',
  'ProductionOrderStatus',
  'ProductionOrderType',
  'DistributionRule',
  'Project',
  'JournalRemarks',
  'Remarks',
  'Series',
  'ProductionOrderLines',
]);

const PROD_ORDER_LINE_FIELDS = new Set([
  'PlannedQuantity',
  'ItemType',
  'LineNumber',
  'LineText',
  'ItemNo',
  'Warehouse',
  'ProductionOrderIssueType',
  'DistributionRule',
  'Project',
  'AdditionalQuantity',
  'StageID',
]);

const assignIfDefined = (target, field, value, allowedFields) => {
  if (value !== undefined && allowedFields.has(field)) {
    target[field] = value;
  }
};

const pickFirstDefined = (...values) =>
  values.find((value) => value !== undefined && value !== null && value !== '');

const normalizeProductionType = (value) =>
  value === 'bopotDisassemble' ? 'bopotDisassembly' : value;

const formatOrigin = (value) => ORIGIN_MAP[value] || value || '';

const mergeProductionOrderData = (primary = {}, fallback = {}) => {
  const mergedHeader = {};
  const headerKeys = new Set([...Object.keys(fallback), ...Object.keys(primary)]);
  for (const key of headerKeys) {
    if (key === 'lines') continue;
    mergedHeader[key] = pickFirstDefined(primary[key], fallback[key], '');
  }

  const primaryLinesByLineNum = new Map((primary.lines || []).map((line) => [Number(line.line_num ?? -1), line]));
  const fallbackLinesByLineNum = new Map((fallback.lines || []).map((line) => [Number(line.line_num ?? -1), line]));
  const mergedLineNums = Array.from(new Set([
    ...primaryLinesByLineNum.keys(),
    ...fallbackLinesByLineNum.keys(),
  ])).sort((a, b) => a - b);

  const lines = mergedLineNums
    .map((lineNum) => {
      const primaryLine = primaryLinesByLineNum.get(lineNum) || {};
      const fallbackLine = fallbackLinesByLineNum.get(lineNum) || {};
      const lineKeys = new Set([...Object.keys(fallbackLine), ...Object.keys(primaryLine)]);
      const mergedLine = {};
      for (const key of lineKeys) {
        mergedLine[key] = pickFirstDefined(primaryLine[key], fallbackLine[key], '');
      }
      return Object.keys(mergedLine).length > 0 ? mergedLine : null;
    })
    .filter(Boolean);

  return { ...mergedHeader, lines };
};

const enrichProductionOrderWithDbFallback = async (productionOrder) => {
  const docEntry = Number(productionOrder?.doc_entry);
  if (!Number.isInteger(docEntry) || docEntry <= 0) return productionOrder;

  try {
    const dbResult = await productionDbService.getProductionOrderByDocEntry(docEntry);
    const dbOrder = dbResult?.production_order;
    if (!dbOrder) return productionOrder;
    return mergeProductionOrderData(productionOrder, dbOrder);
  } catch (error) {
    console.warn('[ProductionOrder] DB fallback failed:', error.message);
    return productionOrder;
  }
};

const mapSummary = (o) => ({
  doc_entry:    o.AbsoluteEntry || o.DocEntry,
  doc_num:      o.DocumentNumber || o.DocNum,
  item_code:    o.ItemNo || '',
  item_name:    o.ProductDescription || '',
  planned_qty:  o.PlannedQuantity ?? 0,
  completed_qty:o.CompletedQuantity ?? 0,
  due_date:     formatDate(o.DueDate),
  posting_date: formatDate(o.PostingDate),
  status:       STATUS_MAP[o.ProductionOrderStatus] || o.ProductionOrderStatus || '',
  type:         TYPE_MAP[normalizeProductionType(o.ProductionOrderType)] || o.ProductionOrderType || '',
  warehouse:    o.Warehouse || '',
});

const mapToForm = (o) => {
  // Log the response to see what SAP is actually returning
  console.log('[ProductionOrder] Mapping SAP response:', JSON.stringify(o, null, 2));
  
  return {
    doc_entry:    o.AbsoluteEntry || o.DocEntry,
    doc_num:      o.DocumentNumber || o.DocNum,
    item_code:    o.ItemNo || '',
    item_name:    o.ProductDescription || '',
    planned_qty:  o.PlannedQuantity ?? 1,
    completed_qty:o.CompletedQuantity ?? 0,
    rejected_qty: o.RejectedQuantity ?? 0,
    due_date:     formatDate(o.DueDate),
    posting_date: formatDate(o.PostingDate),
    start_date:   formatDate(o.StartDate),
    order_date:   formatDate(o.CreationDate || o.PostingDate),
    status:       o.ProductionOrderStatus || 'boposPlanned',
    type:         normalizeProductionType(o.ProductionOrderType) || 'bopotStandard',
    warehouse:    o.Warehouse || '',
    priority:     o.Priority ?? 100,
    distribution_rule: o.DistributionRule || '',
    project:      o.Project || '',
    journal_remark: o.JournalRemarks || o.JournalMemo || '',
    remarks:      o.Remarks || '',
    series:       o.Series != null ? String(o.Series) : '',
    origin_num:   o.ProductionOrderOriginNumber != null ? String(o.ProductionOrderOriginNumber) : (o.OriginNum != null ? String(o.OriginNum) : ''),
    origin:       formatOrigin(o.ProductionOrderOrigin || o.OriginNumber || ''),
    linked_to:    o.ProductionOrderOriginEntry != null ? String(o.ProductionOrderOriginEntry) : '',
    linked_order: o.ProductionOrderOriginNumber != null ? String(o.ProductionOrderOriginNumber) : '',
    branch:       o.BPL_IDAssignedToInvoice != null ? String(o.BPL_IDAssignedToInvoice) : (o.BPLId != null ? String(o.BPLId) : ''),
    branch_name:  o.BPLName || '',
    customer_code:o.CustomerCode || '',
    customer_name:o.CustomerName || '',
    lines: (o.ProductionOrderLines || o.ProductionOrder_Lines || []).map((l) => ({
      _id:           l.LineNumber ?? Math.random(),
      line_num:      l.LineNumber ?? 0,
      item_code:     l.ItemNo || '',
      item_name:     l.ItemName || l.ItemDescription || l.LineText || '',
      line_text:     l.LineText || '',
      base_qty:      l.BaseQuantity ?? 1,
      planned_qty:   l.PlannedQuantity ?? 1,
      issued_qty:    l.IssuedQuantity ?? 0,
      uom:           l.UoMCode || l.MeasureUnit || '',
      warehouse:     l.Warehouse || '',
      issue_method:  l.ProductionOrderIssueType || l.IssueMethod || 'im_Manual',
      distribution_rule: l.DistributionRule || '',
      project:       l.Project || '',
      additional_qty:l.AdditionalQuantity ?? 0,
      stage_id:      l.StageID ?? '',
      component_type:l.ItemType || 'pit_Item',
    })),
  };
};

// ── Reference data ────────────────────────────────────────────────────────────
const getReferenceData = async () => {
  const warnings = [];

  const [whsRes, distRes, projRes, seriesRes, branchRes, routeStageRes] = await Promise.allSettled([
    sapService.request({ method: 'GET', url: '/Warehouses?$select=WarehouseCode,WarehouseName' }),
    sapService.request({ method: 'GET', url: '/DistributionRules?$select=FactorCode,FactorDescription&$top=200' }),
    sapService.request({ method: 'GET', url: '/Projects?$select=Code,Name&$top=200' }),
    sapService.request({ method: 'POST', url: '/SeriesService_GetDocumentSeries', data: { DocumentTypeParams: { Document: '202' } } }),
    fetchBranches(),
    sapService.request({ method: 'GET', url: '/RouteStages?$select=InternalNumber,Code,Description&$top=200' }),
  ]);

  const settle = (r, fn, msg) => {
    if (r.status === 'fulfilled') return fn(r.value?.data?.value || r.value?.data || r.value || []);
    warnings.push(msg + ': ' + (r.reason?.message || 'failed'));
    return [];
  };

  const warehouses       = settle(whsRes,  (d) => d, 'Warehouses');
  const distributionRules= settle(distRes, (d) => d, 'DistributionRules');
  const projects         = settle(projRes, (d) => d, 'Projects');
  const series           = settle(seriesRes, (d) => d, 'Series');
  const branches         = settle(branchRes, (d) => d, 'Branches');
  const routeStages      = settle(routeStageRes, (d) => d, 'RouteStages');

  return {
    warehouses,
    distribution_rules: distributionRules,
    projects,
    series,
    branches,
    route_stages: routeStages,
    production_order_statuses: Object.entries(STATUS_MAP).map(([value, label]) => ({ value, label })),
    production_order_types:    TYPE_OPTIONS,
    production_order_priorities: Object.entries(PRIORITY_MAP).map(([value, label]) => ({ value, label })),
    warnings,
  };
};

// ── List ──────────────────────────────────────────────────────────────────────
const getProductionOrders = async ({ query = '', top = 50, skip = 0, status } = {}) => {
  const parts = [];
  if (query) {
    const trimmed = String(query).trim();
    const escaped = escapeOData(trimmed);
    if (/^\d+$/.test(trimmed)) {
      parts.push(`(DocumentNumber eq ${trimmed} or contains(ItemNo,'${escaped}') or contains(ProductDescription,'${escaped}'))`);
    } else {
      parts.push(`(contains(ItemNo,'${escaped}') or contains(ProductDescription,'${escaped}'))`);
    }
  }
  if (status) parts.push(`ProductionOrderStatus eq '${escapeOData(status)}'`);
  const filter = parts.length ? `&$filter=${encodeURIComponent(parts.join(' and '))}` : '';

  const resp = await sapService.request({
    method: 'GET',
    url: `/ProductionOrders?$select=AbsoluteEntry,DocumentNumber,ItemNo,ProductDescription,PlannedQuantity,CompletedQuantity,DueDate,PostingDate,ProductionOrderStatus,ProductionOrderType,Warehouse${filter}&$top=${top}&$skip=${skip}`,
  });

  return { orders: (resp.data?.value || []).map(mapSummary) };
};

// ── Get single ────────────────────────────────────────────────────────────────
const getProductionOrderByDocEntry = async (docEntry) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid DocEntry.');

  console.log('[ProductionOrder] Fetching order with DocEntry:', n);
  const resp = await sapService.request({ 
    method: 'GET', 
    url: `/ProductionOrders(${n})` 
  });
  console.log('[ProductionOrder] SAP response received');
  return {
    production_order: await enrichProductionOrderWithDbFallback(mapToForm(resp.data || {})),
  };
};

// ── BOM explosion ─────────────────────────────────────────────────────────────
const explodeBOM = async (itemCode, qty = 1) => {
  const resp = await sapService.request({
    method: 'GET',
    url: `/ProductTrees('${encodeURIComponent(itemCode)}')`,
  });
  const bom = resp.data;
  const factor = Number(qty) / (bom.Quantity || 1);
  const resolvedHeaderWarehouse = await productionDbService.resolveProductionWarehouse(
    bom.Warehouse,
    (bom.ProductTreeLines || []).map((line) => line.Warehouse || '')
  );

  const lines = (bom.ProductTreeLines || []).map((l, idx) => ({
    _id:           Date.now() + idx + Math.random(),
    line_num:      idx,
    item_code:     l.ItemCode || '',
    item_name:     l.ItemName || '',
    base_qty:      l.Quantity ?? 1,
    planned_qty:   parseFloat(((l.Quantity ?? 1) * factor).toFixed(6)),
    issued_qty:    0,
    uom:           l.InventoryUOM || '',
    warehouse:     l.Warehouse || resolvedHeaderWarehouse || '',
    issue_method:  l.IssueMethod || 'im_Manual',
    distribution_rule: l.DistributionRule || '',
    project:       l.Project || '',
    additional_qty:0,
    stage_id:      l.StageID ?? '',
    component_type:l.ItemType || 'pit_Item',
    line_text:     l.LineText || '',
  }));

  return {
    item_code:   bom.TreeCode,
    item_name:   bom.ProductDescription || '',
    bom_qty:     bom.Quantity,
    warehouse:   resolvedHeaderWarehouse,
    lines,
  };
};

// ── Create ────────────────────────────────────────────────────────────────────
const createProductionOrder = async (body) => {
  console.log('[ProductionOrder] Create called with status:', body.status);
  
  // Validate that the item has a BOM before creating production order
  if (body.item_code) {
    let bomData;
    try {
      const bomResp = await sapService.request({
        method: 'GET',
        url: `/ProductTrees('${encodeURIComponent(body.item_code)}')`,
      });
      bomData = bomResp.data;
    } catch (err) {
      if (err.response?.status === 404 || err.response?.data?.error?.code === '-10') {
        throw new Error(
          `Item "${body.item_code}" does not have a Bill of Materials (BOM) defined. ` +
          `Please create a BOM for this item before creating a production order.`
        );
      }
      // Re-throw other errors
      throw err;
    }
    
    // Validate BOM lines for backflush + serial/batch conflict
    if (bomData?.ProductTreeLines) {
      for (const line of bomData.ProductTreeLines) {
        if (line.IssueMethod === 'im_Backflush') {
          // Check if this item is serial/batch managed
          try {
            const itemResp = await sapService.request({
              method: 'GET',
              url: `/Items('${encodeURIComponent(line.ItemCode)}')`,
            });
            const item = itemResp.data;
            
            if (item.ManageSerialNumbers === 'tYES' || item.ManageBatchNumbers === 'tYES') {
              throw new Error(
                `Cannot create production order: Component "${line.ItemCode}" (${line.ItemName || ''}) ` +
                `is set to backflush in the BOM but is managed by ${item.ManageSerialNumbers === 'tYES' ? 'serial' : 'batch'} numbers. ` +
                `Please update the BOM to use Manual issue method (im_Manual) for this component.`
              );
            }
          } catch (itemErr) {
            // If we can't fetch the item, let SAP handle the validation
            if (itemErr.message?.includes('Cannot create production order')) {
              throw itemErr;
            }
          }
        }
      }
    }
  }

  const sanitizedWarehouse = await productionDbService.resolveProductionWarehouse(
    body.warehouse,
    (body.lines || []).map((line) => line.warehouse || '')
  );
  const sanitizedBody = {
    ...body,
    warehouse: sanitizedWarehouse,
    lines: Array.isArray(body.lines)
      ? await Promise.all(
          body.lines.map(async (line) => ({
            ...line,
            warehouse: await productionDbService.resolveProductionWarehouse(
              line.warehouse,
              [sanitizedWarehouse]
            ),
          }))
        )
      : body.lines,
  };

  // Remember the desired status
  const desiredStatus = sanitizedBody.status;
  console.log('[ProductionOrder] Desired status:', desiredStatus);
  
  // SAP B1 requires production orders to be created as Planned
  const payload = _buildPayload(sanitizedBody, true); // Pass true to indicate creation
  console.log('[ProductionOrder] Payload status:', payload.ProductionOrderStatus);
  
  const resp = await sapService.request({ method: 'POST', url: '/ProductionOrders', data: payload });
  
  console.log('[ProductionOrder] Full response data:', JSON.stringify(resp.data, null, 2));
  console.log('[ProductionOrder] Response headers:', resp.headers);
  
  // SAP B1 Production Orders may return AbsoluteEntry/DocumentNumber or DocEntry/DocNum
  let docEntry = resp.data?.AbsoluteEntry || resp.data?.DocEntry;
  let docNum = resp.data?.DocumentNumber || resp.data?.DocNum;
  
  // If response doesn't contain the document details, try to extract from Location header
  if (!docEntry && resp.headers?.location) {
    const match = resp.headers.location.match(/ProductionOrders\((\d+)\)/);
    if (match) {
      docEntry = parseInt(match[1]);
      console.log('[ProductionOrder] Extracted DocEntry from Location header:', docEntry);
    }
  }
  
  // If we have docEntry but not docNum, fetch the created order to get the document number
  if (docEntry && !docNum) {
    try {
      const fetchResp = await sapService.request({
        method: 'GET',
        url: `/ProductionOrders(${docEntry})`,
      });
      docNum = fetchResp.data?.DocumentNumber || fetchResp.data?.DocNum;
      console.log('[ProductionOrder] Fetched DocNum from created order:', docNum);
    } catch (err) {
      console.warn('[ProductionOrder] Could not fetch document number:', err.message);
    }
  }
  
  console.log('[ProductionOrder] Created order - DocEntry:', docEntry, 'DocNum:', docNum);
  console.log('[ProductionOrder] Checking if should auto-release:', docEntry, '&&', desiredStatus, '===', 'boposReleased', '=', (docEntry && desiredStatus === 'boposReleased'));
  
  // If user selected Released or Closed status, automatically transition after creation
  if (docEntry && desiredStatus === 'boposReleased') {
    console.log('[ProductionOrder] Auto-releasing order...');
    try {
      await sapService.request({
        method: 'PATCH',
        url: `/ProductionOrders(${docEntry})`,
        data: { ProductionOrderStatus: 'boposReleased' },
      });
      return {
        message: docNum 
          ? `Production order #${docNum} created and released successfully.`
          : 'Production order created and released successfully.',
        doc_num: docNum,
        doc_entry: docEntry,
      };
    } catch (err) {
      // If release fails, return the planned order
      console.warn('Failed to auto-release production order:', err.message);
      return {
        message: docNum
          ? `Production order #${docNum} created as Planned (auto-release failed).`
          : 'Production order created as Planned (auto-release failed).',
        doc_num: docNum,
        doc_entry: docEntry,
      };
    }
  } else if (docEntry && desiredStatus === 'boposClosed') {
    console.log('[ProductionOrder] Auto-closing order...');
    try {
      // Must release first, then close
      await sapService.request({
        method: 'PATCH',
        url: `/ProductionOrders(${docEntry})`,
        data: { ProductionOrderStatus: 'boposReleased' },
      });
      await sapService.request({
        method: 'PATCH',
        url: `/ProductionOrders(${docEntry})`,
        data: { ProductionOrderStatus: 'boposClosed' },
      });
      return {
        message: docNum
          ? `Production order #${docNum} created and closed successfully.`
          : 'Production order created and closed successfully.',
        doc_num: docNum,
        doc_entry: docEntry,
      };
    } catch (err) {
      console.warn('Failed to auto-close production order:', err.message);
      return {
        message: docNum
          ? `Production order #${docNum} created as Planned (auto-close failed).`
          : 'Production order created as Planned (auto-close failed).',
        doc_num: docNum,
        doc_entry: docEntry,
      };
    }
  }
  
  return {
    message: docNum
      ? `Production order #${docNum} created successfully.`
      : 'Production order created successfully.',
    doc_num: docNum,
    doc_entry: docEntry,
  };
};

// ── Update ────────────────────────────────────────────────────────────────────
const updateProductionOrder = async (docEntry, body) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid DocEntry.');

  const sanitizedWarehouse = await productionDbService.resolveProductionWarehouse(
    body.warehouse,
    (body.lines || []).map((line) => line.warehouse || '')
  );
  const sanitizedBody = {
    ...body,
    warehouse: sanitizedWarehouse,
    lines: Array.isArray(body.lines)
      ? await Promise.all(
          body.lines.map(async (line) => ({
            ...line,
            warehouse: await productionDbService.resolveProductionWarehouse(
              line.warehouse,
              [sanitizedWarehouse]
            ),
          }))
        )
      : body.lines,
  };

  const payload = _buildPayload(sanitizedBody, false); // Pass false to indicate update
  await sapService.request({ method: 'PATCH', url: `/ProductionOrders(${n})`, data: payload });

  const updated = await sapService.request({ 
    method: 'GET', 
    url: `/ProductionOrders(${n})` 
  });
  return {
    message: 'Production order updated.',
    production_order: await enrichProductionOrderWithDbFallback(mapToForm(updated.data || {})),
  };
};

// ── Release ───────────────────────────────────────────────────────────────────
const releaseProductionOrder = async (docEntry) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid DocEntry.');

  // Update the status to Released
  await sapService.request({
    method: 'PATCH',
    url: `/ProductionOrders(${n})`,
    data: { ProductionOrderStatus: 'boposReleased' },
  });
  
  const updated = await sapService.request({ 
    method: 'GET', 
    url: `/ProductionOrders(${n})` 
  });
  return {
    message: 'Production order released.',
    production_order: await enrichProductionOrderWithDbFallback(mapToForm(updated.data || {})),
  };
};

// ── Close ─────────────────────────────────────────────────────────────────────
const closeProductionOrder = async (docEntry) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid DocEntry.');

  // SAP B1 closes production orders by updating the status to Closed
  await sapService.request({
    method: 'PATCH',
    url: `/ProductionOrders(${n})`,
    data: { ProductionOrderStatus: 'boposClosed' },
  });
  
  const updated = await sapService.request({ 
    method: 'GET', 
    url: `/ProductionOrders(${n})` 
  });
  return {
    message: 'Production order closed.',
    production_order: await enrichProductionOrderWithDbFallback(mapToForm(updated.data || {})),
  };
};

// ── Lookups ───────────────────────────────────────────────────────────────────
const lookupItems = async (query = '') => {
  // First, get all items that have BOMs (ProductTrees)
  const bomFilter = query
    ? `&$filter=contains(TreeCode,'${escapeOData(query)}') or contains(ProductDescription,'${escapeOData(query)}')`
    : '';
  
  const bomResp = await sapService.request({
    method: 'GET',
    url: `/ProductTrees?$select=TreeCode,ProductDescription${bomFilter}&$top=50`,
  });
  
  const bomsData = bomResp.data?.value || [];
  
  // Get full item details for each BOM item
  const itemCodes = bomsData.map(bom => bom.TreeCode);
  
  if (itemCodes.length === 0) {
    return [];
  }
  
  // Fetch item details for items that have BOMs
  const itemFilter = itemCodes.map(code => `ItemCode eq '${escapeOData(code)}'`).join(' or ');
  const itemResp = await sapService.request({
    method: 'GET',
    url: `/Items?$select=ItemCode,ItemName,InventoryUOM,InventoryItem&$filter=${encodeURIComponent(itemFilter)}&$top=50`,
  });
  
  return itemResp.data?.value || [];
};

const lookupComponentItems = async (query = '') => {
  const filterParts = [`InventoryItem eq 'tYES'`];
  if (query) {
    const q = escapeOData(query);
    filterParts.push(`(contains(ItemCode,'${q}') or contains(ItemName,'${q}'))`);
  }
  const resp = await sapService.request({
    method: 'GET',
    url: `/Items?$select=ItemCode,ItemName,InventoryUOM,DefaultWarehouse,ManageSerialNumbers,ManageBatchNumbers&$filter=${encodeURIComponent(filterParts.join(' and '))}&$top=50`,
  });
  return resp.data?.value || [];
};

const lookupResources = async (query = '') => {
  const filter = query
    ? `&$filter=contains(Code,'${escapeOData(query)}') or contains(Name,'${escapeOData(query)}')`
    : '';
  const resp = await sapService.request({
    method: 'GET',
    url: `/Resources?$select=Code,Name,DefaultWarehouse,IssueMethod${filter}&$top=50`,
  });
  return resp.data?.value || [];
};

const lookupRouteStages = async (query = '') => {
  const filter = query
    ? `&$filter=contains(Code,'${escapeOData(query)}') or contains(Description,'${escapeOData(query)}')`
    : '';
  const resp = await sapService.request({
    method: 'GET',
    url: `/RouteStages?$select=InternalNumber,Code,Description${filter}&$top=100`,
  });
  return resp.data?.value || [];
};

const lookupWarehouses = async () => {
  const resp = await sapService.request({ method: 'GET', url: '/Warehouses?$select=WarehouseCode,WarehouseName' });
  return resp.data?.value || [];
};

const lookupDistributionRules = async () => {
  const resp = await sapService.request({ method: 'GET', url: '/DistributionRules?$select=FactorCode,FactorDescription&$top=200' });
  return resp.data?.value || [];
};

const lookupProjects = async () => {
  const resp = await sapService.request({ method: 'GET', url: '/Projects?$select=Code,Name&$top=200' });
  return resp.data?.value || [];
};

const lookupBranches = async () => {
  return fetchBranches();
};

const lookupCustomers = async (query = '') => {
  const filter = query
    ? `&$filter=contains(CardCode,'${escapeOData(query)}') or contains(CardName,'${escapeOData(query)}')`
    : '';
  const resp = await sapService.request({
    method: 'GET',
    url: `/BusinessPartners?$select=CardCode,CardName&$filter=CardType eq 'cCustomer'${filter}&$top=50`,
  });
  return resp.data?.value || [];
};

// ── Payload builder ───────────────────────────────────────────────────────────
function _buildPayload(body, isCreate = false) {
  const p = {};

  if (opt(body.branch)) {
    console.warn('[ProductionOrder] Ignoring branch in write payload because SAP metadata for ProductionOrder does not expose a writable branch field.');
  }

  assignIfDefined(p, 'ItemNo', opt(body.item_code) ? body.item_code : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'PlannedQuantity', opt(body.planned_qty) ? Number(body.planned_qty) : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'DueDate', opt(body.due_date) ? body.due_date : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'PostingDate', opt(body.posting_date) ? body.posting_date : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'StartDate', opt(body.start_date) ? body.start_date : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'Warehouse', opt(body.warehouse) ? body.warehouse : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'Priority', opt(body.priority) ? Number(body.priority) : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'CustomerCode', opt(body.customer_code) ? body.customer_code : undefined, PROD_ORDER_HEADER_FIELDS);
  
  // SAP B1 Rule: Production orders can only be created in Planned status
  // To release, you must create as Planned first, then call the Release action
  // Force status to Planned ONLY on creation, allow status updates during PATCH
  if (isCreate) {
    assignIfDefined(p, 'ProductionOrderStatus', 'boposPlanned', PROD_ORDER_HEADER_FIELDS);
  } else if (opt(body.status)) {
    // During update, allow status changes (Planned -> Released -> Closed)
    assignIfDefined(p, 'ProductionOrderStatus', body.status, PROD_ORDER_HEADER_FIELDS);
  }
  
  assignIfDefined(
    p,
    'ProductionOrderType',
    opt(body.type) ? normalizeProductionType(body.type) : undefined,
    PROD_ORDER_HEADER_FIELDS
  );
  assignIfDefined(p, 'DistributionRule', opt(body.distribution_rule) ? body.distribution_rule : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'Project', opt(body.project) ? body.project : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'JournalRemarks', opt(body.journal_remark) ? body.journal_remark : undefined, PROD_ORDER_HEADER_FIELDS);
  assignIfDefined(p, 'Remarks', opt(body.remarks) ? body.remarks : undefined, PROD_ORDER_HEADER_FIELDS);
  
  // Only include Series if explicitly provided and valid
  // SAP B1 will auto-assign series if not provided
  // Series must be a valid positive integer
  const seriesNum = Number(body.series);
  if (body.series && body.series !== '' && Number.isInteger(seriesNum) && seriesNum > 0) {
    assignIfDefined(p, 'Series', seriesNum, PROD_ORDER_HEADER_FIELDS);
  }

  if (Array.isArray(body.lines) && body.lines.length > 0) {
    const lines = body.lines
      .filter((l) => (l.component_type === 'pit_Text' ? (l.line_text || l.item_name) : l.item_code))
      .map((l, idx) => {
        const line = {
          PlannedQuantity:  Number(l.planned_qty) || 1,
          ItemType:         l.component_type || 'pit_Item',
          LineNumber:       idx,
        };
        if (l.component_type === 'pit_Text') {
          line.LineText = l.line_text || l.item_name || '';
        } else if (opt(l.item_code)) {
          line.ItemNo = l.item_code;
        }
        if (opt(l.warehouse))          line.Warehouse = l.warehouse;
        if (opt(l.issue_method))       line.ProductionOrderIssueType = l.issue_method;
        if (opt(l.distribution_rule))  line.DistributionRule = l.distribution_rule;
        if (opt(l.project))            line.Project = l.project;
        if (opt(l.additional_qty))     line.AdditionalQuantity = Number(l.additional_qty);
        if (opt(l.stage_id))           line.StageID = Number(l.stage_id);

        return Object.fromEntries(
          Object.entries(line).filter(([field, value]) => value !== undefined && PROD_ORDER_LINE_FIELDS.has(field))
        );
      });

    if (lines.length > 0) {
      assignIfDefined(p, 'ProductionOrderLines', lines, PROD_ORDER_HEADER_FIELDS);
    }
  }

  return p;
}

module.exports = {
  getReferenceData,
  getProductionOrders,
  getProductionOrderByDocEntry,
  createProductionOrder,
  updateProductionOrder,
  releaseProductionOrder,
  closeProductionOrder,
  explodeBOM,
  lookupItems,
  lookupComponentItems,
  lookupResources,
  lookupRouteStages,
  lookupWarehouses,
  lookupDistributionRules,
  lookupProjects,
  lookupBranches,
  lookupCustomers,
};
