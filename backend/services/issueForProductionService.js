/**
 * Issue for Production Service
 * SAP B1 endpoint: InventoryGenExits (Type 60 = Issue for Production)
 * Reduces stock from warehouse for production order components.
 * Backflush items (im_Backflush) are excluded — SAP handles them on receipt.
 * 
 * SAP B1 BaseType for InventoryGenExit:
 * - BaseType 202 = Production Order (OWOR)
 * - BaseType -1 or 0 = Manual (no base document)
 * 
 * Important Rules when BaseType = 202 (Production Order):
 * 1. TaxDate must be NULL/empty - SAP automatically sets it from production order
 * 2. ItemCode must be NULL/empty - SAP automatically populates from production order line
 * 3. Only Released production orders can be issued
 * 4. BaseEntry and BaseLine must reference the production order
 */
const sapService = require('./sapService');

const escapeOData = (v) => String(v || '').replace(/'/g, "''");
const formatDate  = (v) => (v ? String(v).split('T')[0] : '');
const opt         = (v) => v !== '' && v != null;

const PO_STATUS_LABEL = {
  boposReleased:  'Released',
  boposPlanned:   'Planned',
  boposClosed:    'Closed',
  boposCancelled: 'Cancelled',
};

// ── Map a single InventoryGenExit document to our form shape ─────────────────
const mapToForm = (doc) => ({
  doc_entry:      doc.DocEntry,
  doc_num:        doc.DocNum,
  series:         doc.Series != null ? String(doc.Series) : '',
  posting_date:   formatDate(doc.DocDate),
  document_date:  formatDate(doc.TaxDate),
  ref_2:          doc.Reference2 || '',
  remarks:        doc.Comments || '',
  journal_remark: doc.JournalMemo || '',
  prod_order_entry: doc.BaseEntry ?? null,   // linked production order DocEntry
  lines: (doc.DocumentLines || []).map((l) => ({
    _id:            l.LineNum ?? Math.random(),
    line_num:       l.LineNum ?? 0,
    item_code:      l.ItemCode || '',
    item_name:      l.ItemDescription || '',
    issue_qty:      l.Quantity ?? 0,
    uom:            l.UoMCode || l.MeasureUnit || '',
    warehouse:      l.WarehouseCode || '',
    base_entry:     l.BaseEntry ?? null,      // production order DocEntry
    base_line:      l.BaseLine ?? null,       // production order line number
    base_type:      l.BaseType ?? 202,        // 202 = Production Order
    distribution_rule: l.DistributionRule || '',
    project:        l.Project || '',
    account_code:   l.AccountCode || '',
  })),
});

const mapSummary = (doc) => ({
  doc_entry:    doc.DocEntry,
  doc_num:      doc.DocNum,
  posting_date: formatDate(doc.DocDate),
  remarks:      doc.Comments || '',
  total_lines:  Array.isArray(doc.DocumentLines) ? doc.DocumentLines.length : 0,
});

// ── Get production order with MANUAL lines only ───────────────────────────────
const getProductionOrderForIssue = async (docEntry) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid production order DocEntry.');

  const resp = await sapService.request({
    method: 'GET',
    url: `/ProductionOrders(${n})`,
  });

  const po = resp.data;

  // Support both property naming conventions
  const poDocEntry = po.AbsoluteEntry || po.DocEntry;
  const poDocNum = po.DocumentNumber || po.DocNum;

  if (!poDocEntry) throw new Error('Production order not found.');

  // SAP B1 Logic: Only Released production orders can be issued
  if (po.ProductionOrderStatus !== 'boposReleased') {
    throw new Error(
      `Production order must be Released before issuing components. Current status: ${PO_STATUS_LABEL[po.ProductionOrderStatus] || po.ProductionOrderStatus}`
    );
  }

  // Filter: only im_Manual lines — backflush lines are excluded per SAP logic
  const manualLines = (po.ProductionOrderLines || []).filter(
    (l) => (l.IssueMethod || 'im_Manual') !== 'im_Backflush'
  );

  // Fetch item details to get batch/serial management info and auto-select batches
  const itemCodes = [...new Set(manualLines.map(l => l.ItemNo).filter(Boolean))];
  const itemDetailsMap = {};
  
  if (itemCodes.length > 0) {
    try {
      const itemFilter = itemCodes.map(code => `ItemCode eq '${escapeOData(code)}'`).join(' or ');
      const itemResp = await sapService.request({
        method: 'GET',
        url: `/Items?$select=ItemCode,ManageSerialNumbers,ManageBatchNumbers&$filter=${encodeURIComponent(itemFilter)}`,
      });
      (itemResp.data?.value || []).forEach(item => {
        itemDetailsMap[item.ItemCode] = {
          manage_serial: item.ManageSerialNumbers === 'tYES',
          manage_batch: item.ManageBatchNumbers === 'tYES',
        };
      });
    } catch (err) {
      console.warn('[IssueForProd] Failed to fetch item batch/serial info:', err.message);
    }
  }

  // For each line, fetch available batches if item is batch-managed
  const linesWithBatches = await Promise.all(manualLines.map(async (l) => {
    const itemDetails = itemDetailsMap[l.ItemNo] || {};
    const issueQty = Math.max(0, (l.PlannedQuantity ?? 1) - (l.IssuedQuantity ?? 0));
    
    let batchNumbers = [];
    
    // Auto-fetch available batches for batch-managed items
    if (itemDetails.manage_batch && issueQty > 0) {
      try {
        const warehouse = l.Warehouse || po.Warehouse || '';
        if (warehouse) {
          const batchResp = await sapService.request({
            method: 'GET',
            url: `/BatchNumberDetails?$filter=ItemCode eq '${escapeOData(l.ItemNo)}' and WhsCode eq '${escapeOData(warehouse)}' and Quantity gt 0&$orderby=ExpDate asc&$top=50`,
          });
          
          const availableBatches = batchResp.data?.value || [];
          let remainingQty = issueQty;
          
          // Auto-select batches (FIFO by expiry date)
          for (const batch of availableBatches) {
            if (remainingQty <= 0) break;
            const batchQty = Math.min(batch.Quantity || 0, remainingQty);
            if (batchQty > 0) {
              batchNumbers.push({
                batch_number: batch.BatchNumber,
                quantity: batchQty,
              });
              remainingQty -= batchQty;
            }
          }
        }
      } catch (err) {
        console.warn(`[IssueForProd] Failed to fetch batches for ${l.ItemNo}:`, err.message);
      }
    }
    
    return {
      _id:            l.LineNumber ?? Math.random(),
      line_num:       l.LineNumber ?? 0,
      item_code:      l.ItemNo || '',
      item_name:      l.ItemDescription || '',
      planned_qty:    l.PlannedQuantity ?? 1,
      issued_qty:     l.IssuedQuantity ?? 0,
      remaining_qty:  issueQty,
      issue_qty:      issueQty,
      uom:            l.UoMCode || l.MeasureUnit || '',
      warehouse:      l.Warehouse || po.Warehouse || '',
      issue_method:   l.IssueMethod || 'im_Manual',
      distribution_rule: l.DistributionRule || '',
      project:        l.Project || '',
      base_entry:     poDocEntry,
      base_line:      l.LineNumber ?? 0,
      base_type:      202,
      manage_serial:  itemDetails.manage_serial || false,
      manage_batch:   itemDetails.manage_batch || false,
      batch_numbers:  batchNumbers,
      serial_numbers: [],
    };
  }));

  return {
    doc_entry:    poDocEntry,
    doc_num:      poDocNum,
    item_code:    po.ItemNo || '',
    item_name:    po.ProductDescription || '',
    planned_qty:  po.PlannedQuantity ?? 1,
    completed_qty:po.CompletedQuantity ?? 0,
    status:       po.ProductionOrderStatus || '',
    warehouse:    po.Warehouse || '',
    due_date:     formatDate(po.DueDate),
    lines_total_count: (po.ProductionOrderLines || []).length,
    lines:        linesWithBatches,
  };
};

// ── List issues ───────────────────────────────────────────────────────────────
const getIssueList = async ({ query = '', top = 50, skip = 0 } = {}) => {
  // SAP B1 SL: filter by Comments only when query provided (cast() not supported)
  const filterParts = [];
  if (query) {
    filterParts.push(`contains(Comments,'${escapeOData(query)}')`);
  }
  const filter = filterParts.length ? `&$filter=${filterParts.join(' and ')}` : '';

  const resp = await sapService.request({
    method: 'GET',
    url: `/InventoryGenExits?$select=DocEntry,DocNum,DocDate,Comments,DocumentLines${filter}&$top=${top}&$skip=${skip}&$orderby=DocEntry desc`,
  });

  return { issues: (resp.data?.value || []).map(mapSummary) };
};

// ── Get single issue ──────────────────────────────────────────────────────────
const getIssueByDocEntry = async (docEntry) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid DocEntry.');

  const resp = await sapService.request({
    method: 'GET',
    url: `/InventoryGenExits(${n})`,
  });

  return { issue: mapToForm(resp.data || {}) };
};

// ── Create issue (posts to SAP) ───────────────────────────────────────────────
const createIssue = async (body) => {
  _validate(body);

  const payload = _buildPayload(body);

  const resp = await sapService.request({
    method: 'POST',
    url: '/InventoryGenExits',
    data: payload,
  });

  return {
    message:   'Issue for production posted successfully.',
    doc_num:   resp.data?.DocNum,
    doc_entry: resp.data?.DocEntry,
  };
};

// ── Reference data ────────────────────────────────────────────────────────────
const getReferenceData = async () => {
  const warnings = [];

  const [whsRes, distRes, projRes, seriesRes] = await Promise.allSettled([
    sapService.request({ method: 'GET', url: '/Warehouses?$select=WarehouseCode,WarehouseName' }),
    sapService.request({ method: 'GET', url: '/DistributionRules?$select=FactorCode,FactorDescription&$top=200' }),
    sapService.request({ method: 'GET', url: '/Projects?$select=Code,Name&$top=200' }),
    sapService.request({ method: 'POST', url: '/SeriesService_GetDocumentSeries', data: { DocumentTypeParams: { Document: '60' } } }),
  ]);

  const settle = (r, fn, msg) => {
    if (r.status === 'fulfilled') return fn(r.value.data?.value || r.value.data || []);
    warnings.push(msg + ': ' + (r.reason?.message || 'failed'));
    return [];
  };

  return {
    warehouses:         settle(whsRes,  (d) => d, 'Warehouses'),
    distribution_rules: settle(distRes, (d) => d, 'DistributionRules'),
    projects:           settle(projRes, (d) => d, 'Projects'),
    series:             settle(seriesRes, (d) => d, 'Series'),
    warnings,
  };
};

// ── Lookup production orders (Released only) ──────────────────────────────────
const lookupProductionOrders = async (query = '') => {
  // SAP B1 Logic: Issue for Production should only show Released production orders
  // Planned orders cannot be issued until they are released
  let filterStr = "ProductionOrderStatus eq 'boposReleased'";

  // Only add text search when query is provided — and only on safe string fields
  if (query && query.trim()) {
    const q = escapeOData(query.trim());
    if (/^\d+$/.test(query.trim())) {
      filterStr += ` and (DocumentNumber eq ${query.trim()} or contains(ItemNo,'${q}') or contains(ProductDescription,'${q}'))`;
    } else {
      filterStr += ` and (contains(ItemNo,'${q}') or contains(ProductDescription,'${q}'))`;
    }
  }

  const resp = await sapService.request({
    method: 'GET',
    url: `/ProductionOrders?$select=AbsoluteEntry,DocumentNumber,ItemNo,ProductDescription,PlannedQuantity,CompletedQuantity,ProductionOrderStatus,Warehouse&$filter=${encodeURIComponent(filterStr)}&$top=50&$orderby=AbsoluteEntry desc`,
  });
  
  // Map to consistent property names
  const orders = (resp.data?.value || []).map(o => ({
    DocEntry: o.AbsoluteEntry,
    DocNum: o.DocumentNumber,
    ItemNo: o.ItemNo,
    ProductDescription: o.ProductDescription,
    PlannedQuantity: o.PlannedQuantity,
    CompletedQuantity: o.CompletedQuantity,
    ProductionOrderStatus: o.ProductionOrderStatus,
    Warehouse: o.Warehouse,
  }));
  
  return orders;
};

// ── Validation ────────────────────────────────────────────────────────────────
function _validate(body) {
  if (!body.prod_order_entry) {
    throw new Error('Production order is required.');
  }
  if (!body.posting_date) {
    throw new Error('Posting date is required.');
  }
  const validLines = (body.lines || []).filter(
    (l) => l.item_code && Number(l.issue_qty) > 0
  );
  if (validLines.length === 0) {
    throw new Error('At least one line with a valid issue quantity is required.');
  }
  for (const l of validLines) {
    const issueQty = Number(l.issue_qty);
    if (issueQty < 0) {
      throw new Error(`Issue quantity for item "${l.item_code}" cannot be negative.`);
    }
    if (!l.warehouse) {
      throw new Error(`Warehouse is required for item "${l.item_code}".`);
    }
    
    // Validate batch/serial numbers
    if (l.manage_batch) {
      const batchTotal = (l.batch_numbers || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0);
      if (Math.abs(batchTotal - issueQty) > 0.001) {
        throw new Error(`Item "${l.item_code}" requires batch numbers. Total batch quantity (${batchTotal}) must equal issue quantity (${issueQty}).`);
      }
    }
    if (l.manage_serial) {
      const serialCount = (l.serial_numbers || []).length;
      if (serialCount !== Math.floor(issueQty)) {
        throw new Error(`Item "${l.item_code}" requires serial numbers. Number of serials (${serialCount}) must equal issue quantity (${Math.floor(issueQty)}).`);
      }
    }
  }
}

// ── Payload builder ───────────────────────────────────────────────────────────
function _buildPayload(body) {
  const p = {
    DocDate:    body.posting_date,
    // SAP B1 Rule: TaxDate must be omitted when BaseType = 202 (Production Order)
    // When linked to production order, SAP automatically sets TaxDate
    Comments:   body.remarks       || '',
    JournalMemo:body.journal_remark|| '',
    DocumentLines: (body.lines || [])
      .filter((l) => l.item_code && Number(l.issue_qty) > 0)
      .map((l, idx) => {
        const line = {
          // SAP B1 Rule: ItemCode must be omitted when BaseType = 202 (Production Order)
          // SAP automatically populates ItemCode from the production order line
          Quantity:      Number(l.issue_qty),
          WarehouseCode: l.warehouse || undefined,
          // Link back to production order line
          BaseEntry: Number(body.prod_order_entry),
          BaseLine:  Number(l.base_line ?? idx),
          BaseType:  202,  // 202 = Production Order
        };
        if (opt(l.uom))               line.UoMCode          = l.uom;
        if (opt(l.distribution_rule)) line.DistributionRule = l.distribution_rule;
        if (opt(l.project))           line.Project          = l.project;
        if (opt(l.account_code))      line.AccountCode      = l.account_code;
        
        // Batch/Serial Numbers
        if (l.batch_numbers && Array.isArray(l.batch_numbers) && l.batch_numbers.length > 0) {
          line.BatchNumbers = l.batch_numbers.map(b => ({
            BatchNumber: b.batch_number,
            Quantity:    Number(b.quantity),
          }));
        }
        if (l.serial_numbers && Array.isArray(l.serial_numbers) && l.serial_numbers.length > 0) {
          line.SerialNumbers = l.serial_numbers.map(s => ({
            InternalSerialNumber: s.serial_number,
          }));
        }
        
        return line;
      }),
  };

  if (opt(body.series)) p.Series = Number(body.series);
  if (opt(body.ref_2))  p.Reference2 = body.ref_2;

  return p;
}

module.exports = {
  getReferenceData,
  getProductionOrderForIssue,
  getIssueList,
  getIssueByDocEntry,
  createIssue,
  lookupProductionOrders,
};
