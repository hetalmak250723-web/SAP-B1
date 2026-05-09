/**
 * Receipt from Production Service
 *
 * SAP B1 endpoint: InventoryGenEntries (Type 59 = Receipt from Production)
 */
const sapService = require('./sapService');

const escapeOData = (v) => String(v || '').replace(/'/g, "''");
const formatDate = (v) => (v ? String(v).split('T')[0] : '');
const opt = (v) => v !== '' && v != null;
const isYes = (v) => v === 'tYES' || v === true || v === 'Y';
const EPSILON = 0.000001;

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

const toQty = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const mapBatchNumbers = (rows = []) =>
  (rows || []).map((row, idx) => ({
    batch_number: row.BatchNumber || '',
    quantity: toQty(row.Quantity),
    base_line_number: row.BaseLineNumber ?? idx,
  }));

const mapSerialNumbers = (rows = []) =>
  (rows || []).map((row, idx) => ({
    serial_number:
      row.InternalSerialNumber ||
      row.ManufacturerSerialNumber ||
      row.SerialNumber ||
      '',
    system_number: row.SystemSerialNumber ?? row.SystemNumber ?? null,
    base_line_number: row.BaseLineNumber ?? idx,
  }));

const mapBinAllocations = (rows = []) =>
  (rows || []).map((row) => ({
    bin_abs: row.BinAbsEntry ?? null,
    quantity: toQty(row.Quantity),
    serial_batch_base_line: row.SerialAndBatchNumbersBaseLine ?? null,
    allow_negative_quantity: isYes(row.AllowNegativeQuantity),
  }));

const mapToForm = (doc) => ({
  doc_entry: doc.DocEntry,
  doc_num: doc.DocNum,
  series: doc.Series != null ? String(doc.Series) : '',
  posting_date: formatDate(doc.DocDate),
  document_date: formatDate(doc.TaxDate),
  ref_2: doc.Reference2 || '',
  branch: doc.BPL_IDAssignedToInvoice != null ? String(doc.BPL_IDAssignedToInvoice) : '',
  uop: doc.U_UoP || '',
  remarks: doc.Comments || '',
  journal_remark: doc.JournalMemo || '',
  prod_order_entry:
    doc.U_BaseEntry ??
    doc.BaseEntry ??
    doc.DocumentLines?.find((line) => line.BaseEntry != null)?.BaseEntry ??
    null,
  lines: (doc.DocumentLines || []).map((line) => {
    const batchNumbers = mapBatchNumbers(line.BatchNumbers);
    const serialNumbers = mapSerialNumbers(line.SerialNumbers);
    const binAllocations = mapBinAllocations(line.DocumentLinesBinAllocations);

    return {
      _id: line.LineNum ?? Math.random(),
      line_num: line.LineNum ?? 0,
      item_code: line.ItemCode || '',
      item_name: line.ItemDescription || '',
      trans_type: line.U_TransType || 'Complete',
      quantity: line.Quantity ?? 0,
      unit_price: line.Price ?? 0,
      value: line.LineTotal ?? 0,
      item_cost: line.StockPrice ?? 0,
      planned: line.U_Planned ?? 0,
      completed: line.U_Completed ?? 0,
      inventory_uom: line.InventoryUOM || '',
      uom_code: line.UoMCode || line.MeasureUnit || '',
      uom_name: line.U_UoMName || line.MeasureUnit || '',
      items_per_unit: line.NumPerMsr ?? 1,
      warehouse: line.WarehouseCode || '',
      location: line.U_Location || '',
      branch: line.U_Branch || '',
      uom_group: line.UoMEntry || '',
      by_product: line.U_ByProduct === 'Y' || false,
      base_entry: line.BaseEntry ?? null,
      base_line: line.BaseLine ?? null,
      base_type: line.BaseType ?? 202,
      distribution_rule: line.DistributionRule || '',
      project: line.Project || '',
      order_no: line.U_OrderNo || '',
      series_no: line.U_SeriesNo || '',
      manage_batch: batchNumbers.length > 0,
      manage_serial: serialNumbers.length > 0,
      enable_bin_locations: binAllocations.length > 0,
      batch_numbers: batchNumbers,
      serial_numbers: serialNumbers,
      bin_allocations: binAllocations,
    };
  }),
});

const mapSummary = (doc) => ({
  doc_entry: doc.DocEntry,
  doc_num: doc.DocNum,
  posting_date: formatDate(doc.DocDate),
  remarks: doc.Comments || '',
  total_lines: Array.isArray(doc.DocumentLines) ? doc.DocumentLines.length : 0,
});

const getProductionOrderForReceipt = async (docEntry) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid production order DocEntry.');

  const resp = await sapService.request({
    method: 'GET',
    url: `/ProductionOrders(${n})`,
  });

  const po = resp.data;
  if (!po.AbsoluteEntry && !po.DocEntry) throw new Error('Production order not found.');

  if (po.ProductionOrderStatus !== 'boposReleased') {
    throw new Error(
      `Production order status is "${po.ProductionOrderStatus}". Only Released orders can be received. Please release the production order first.`
    );
  }

  const plannedQty = po.PlannedQuantity ?? 1;
  const completedQty = po.CompletedQuantity ?? 0;
  const remainingQty = Math.max(0, plannedQty - completedQty);

  if (remainingQty <= 0) {
    throw new Error('Production order is fully completed. No remaining quantity to receive.');
  }

  const [itemRes, warehouseRes] = await Promise.allSettled([
    po.ItemNo
      ? sapService.request({
          method: 'GET',
          url: `/Items('${encodeURIComponent(po.ItemNo)}')`,
        })
      : Promise.resolve({ data: null }),
    po.Warehouse
      ? sapService.request({
          method: 'GET',
          url: `/Warehouses('${encodeURIComponent(po.Warehouse)}')?$select=WarehouseCode,WarehouseName,EnableBinLocations,EnableReceivingBinLocations,DefaultBin,AutoAllocOnReceipt`,
        })
      : Promise.resolve({ data: null }),
  ]);

  const item = itemRes.status === 'fulfilled' ? itemRes.value.data || {} : {};
  const warehouseMeta = warehouseRes.status === 'fulfilled' ? warehouseRes.value.data || {} : {};

  const allLines = po.ProductionOrderLines || [];
  const getIssueMethod = (line) => line.ProductionOrderIssueType || line.IssueMethod || 'im_Manual';
  const backflushLines = allLines.filter((line) => getIssueMethod(line) === 'im_Backflush');
  const manualLines = allLines.filter((line) => getIssueMethod(line) !== 'im_Backflush');

  return {
    doc_entry: po.AbsoluteEntry || po.DocEntry,
    doc_num: po.DocumentNumber || po.DocNum,
    item_code: po.ItemNo || '',
    item_name: po.ProductDescription || '',
    planned_qty: plannedQty,
    completed_qty: completedQty,
    remaining_qty: remainingQty,
    status: po.ProductionOrderStatus || '',
    warehouse: po.Warehouse || '',
    due_date: formatDate(po.DueDate),
    inventory_uom: item.InventoryUOM || '',
    uom_code: item.InventoryUOM || '',
    uom_name: item.InventoryUOM || '',
    manage_batch: isYes(item.ManageBatchNumbers),
    manage_serial: isYes(item.ManageSerialNumbers),
    issue_primarily_by: item.IssuePrimarilyBy || '',
    enable_bin_locations: isYes(warehouseMeta.EnableBinLocations),
    enable_receiving_bin_locations: isYes(warehouseMeta.EnableReceivingBinLocations),
    default_bin: warehouseMeta.DefaultBin ?? null,
    auto_alloc_on_receipt: isYes(warehouseMeta.AutoAllocOnReceipt),
    backflush_lines: backflushLines.map((line) => ({
      _id: line.LineNumber ?? Math.random(),
      line_num: line.LineNumber ?? 0,
      item_code: line.ItemNo || '',
      item_name: line.ItemDescription || '',
      bom_qty: line.PlannedQuantity ?? 1,
      issued_qty: line.IssuedQuantity ?? 0,
      uom: line.UoMCode || line.MeasureUnit || '',
      warehouse: line.Warehouse || po.Warehouse || '',
      issue_method: 'im_Backflush',
    })),
    manual_lines_count: manualLines.length,
  };
};

const getReceiptList = async ({ query = '', top = 50, skip = 0 } = {}) => {
  const filterParts = [];
  if (query) {
    filterParts.push(`contains(Comments,'${escapeOData(query)}')`);
  }
  const filter = filterParts.length ? `&$filter=${filterParts.join(' and ')}` : '';

  const resp = await sapService.request({
    method: 'GET',
    url: `/InventoryGenEntries?$select=DocEntry,DocNum,DocDate,Comments,DocumentLines${filter}&$top=${top}&$skip=${skip}&$orderby=DocEntry desc`,
  });

  return { receipts: (resp.data?.value || []).map(mapSummary) };
};

const getReceiptByDocEntry = async (docEntry) => {
  const n = Number(docEntry);
  if (!Number.isInteger(n) || n <= 0) throw new Error('Invalid DocEntry.');

  const resp = await sapService.request({
    method: 'GET',
    url: `/InventoryGenEntries(${n})`,
  });

  return { receipt: mapToForm(resp.data || {}) };
};

const createReceipt = async (body) => {
  _validate(body);

  const payload = _buildPayload(body);

  const resp = await sapService.request({
    method: 'POST',
    url: '/InventoryGenEntries',
    data: payload,
  });

  return {
    message: 'Receipt from production posted successfully.',
    doc_num: resp.data?.DocNum,
    doc_entry: resp.data?.DocEntry,
  };
};

const getReferenceData = async () => {
  const warnings = [];

  const [whsRes, distRes, projRes, branchRes, seriesRes] = await Promise.allSettled([
    sapService.request({
      method: 'GET',
      url: '/Warehouses?$select=WarehouseCode,WarehouseName,EnableBinLocations,EnableReceivingBinLocations,DefaultBin,AutoAllocOnIssue,AutoAllocOnReceipt',
    }),
    sapService.request({ method: 'GET', url: '/DistributionRules?$select=FactorCode,FactorDescription&$top=200' }),
    sapService.request({ method: 'GET', url: '/Projects?$select=Code,Name&$top=200' }),
    fetchBranches(),
    sapService.request({
      method: 'POST',
      url: '/SeriesService_GetDocumentSeries',
      data: { DocumentTypeParams: { Document: '59' } },
    }),
  ]);

  const settle = (result, mapper, label) => {
    if (result.status === 'fulfilled') return mapper(result.value?.data?.value || result.value?.data || result.value || []);
    warnings.push(`${label}: ${result.reason?.message || 'failed'}`);
    return [];
  };

  return {
    warehouses: settle(whsRes, (data) => data, 'Warehouses'),
    distribution_rules: settle(distRes, (data) => data, 'DistributionRules'),
    projects: settle(projRes, (data) => data, 'Projects'),
    branches: settle(branchRes, (data) => data, 'Branches'),
    series: settle(seriesRes, (data) => data, 'Series'),
    warnings,
  };
};

const lookupProductionOrders = async (query = '') => {
  let filterStr = "ProductionOrderStatus eq 'boposReleased'";

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
    url: `/ProductionOrders?$select=AbsoluteEntry,DocumentNumber,ItemNo,ProductDescription,PlannedQuantity,CompletedQuantity,ProductionOrderStatus,Warehouse,DueDate&$filter=${encodeURIComponent(filterStr)}&$top=50&$orderby=AbsoluteEntry desc`,
  });

  const orders = (resp.data?.value || []).map((order) => ({
    DocEntry: order.AbsoluteEntry,
    DocNum: order.DocumentNumber,
    ItemNo: order.ItemNo,
    ProductDescription: order.ProductDescription,
    PlannedQuantity: order.PlannedQuantity,
    CompletedQuantity: order.CompletedQuantity,
    ProductionOrderStatus: order.ProductionOrderStatus,
    Warehouse: order.Warehouse,
    DueDate: order.DueDate,
  }));

  return orders;
};

function _assertManagedBinBreakdown(line, kind, expectedRows, binAllocations) {
  const totals = new Map();

  for (const allocation of binAllocations) {
    let baseLine = allocation.serial_batch_base_line;
    if ((baseLine === '' || baseLine == null) && expectedRows.length === 1) {
      baseLine = 0;
    }

    const normalizedBaseLine = Number(baseLine);
    if (!Number.isInteger(normalizedBaseLine) || normalizedBaseLine < 0 || normalizedBaseLine >= expectedRows.length) {
      throw new Error(`Item "${line.item_code}" requires ${kind} bin linkage. Choose a valid ${kind} row for each bin allocation.`);
    }

    totals.set(normalizedBaseLine, (totals.get(normalizedBaseLine) || 0) + toQty(allocation.quantity));
  }

  expectedRows.forEach((row, index) => {
    const expectedQty = kind === 'serial' ? 1 : toQty(row.quantity);
    const actualQty = totals.get(index) || 0;
    if (Math.abs(actualQty - expectedQty) > EPSILON) {
      throw new Error(
        `Item "${line.item_code}" bin allocations for ${kind} row ${index + 1} total ${actualQty}, but ${expectedQty} is required.`
      );
    }
  });
}

function _validate(body) {
  if (!body.prod_order_entry) {
    throw new Error('Production order is required.');
  }
  if (!body.posting_date) {
    throw new Error('Posting date is required.');
  }

  const validLines = Array.isArray(body.lines)
    ? body.lines.filter((line) => line.item_code && toQty(line.quantity) > 0)
    : [];

  const mainLines = validLines.filter((line) => !line.by_product);
  const primaryLine = mainLines[0] || validLines[0];
  const itemCode = body.item_code || primaryLine?.item_code;
  const receiptQty = body.receipt_qty != null ? toQty(body.receipt_qty) : toQty(primaryLine?.quantity);

  if (!itemCode) {
    throw new Error('Finished goods item code is required.');
  }
  if (!receiptQty || receiptQty <= 0) {
    throw new Error('Receipt quantity must be greater than 0.');
  }
  if (validLines.length === 0 && (!body.item_code || !body.receipt_qty)) {
    throw new Error('At least one receipt line with a valid quantity is required.');
  }
  if (mainLines.length === 0) {
    throw new Error('Exactly one main finished goods line is required. Mark additional output lines as by-products.');
  }
  if (mainLines.length > 1) {
    throw new Error('Only one main finished goods line is allowed per receipt. Mark the other lines as by-products.');
  }

  const remainingQty = Number(body.remaining_qty ?? Infinity);
  if (remainingQty !== Infinity && receiptQty > remainingQty + EPSILON) {
    throw new Error(`Receipt quantity (${receiptQty}) exceeds remaining quantity (${remainingQty.toFixed(2)}).`);
  }

  for (const line of validLines) {
    if (!line.warehouse) {
      throw new Error(`Warehouse is required for item "${line.item_code}".`);
    }

    const lineQty = toQty(line.quantity);
    const batchNumbers = Array.isArray(line.batch_numbers) ? line.batch_numbers.filter((row) => row.batch_number && toQty(row.quantity) > 0) : [];
    const serialNumbers = Array.isArray(line.serial_numbers) ? line.serial_numbers.filter((row) => row.serial_number) : [];
    const binAllocations = Array.isArray(line.bin_allocations)
      ? line.bin_allocations.filter((row) => row.bin_abs != null && row.bin_abs !== '' && toQty(row.quantity) > 0)
      : [];

    if (line.manage_batch) {
      if (batchNumbers.length === 0) {
        throw new Error(`Item "${line.item_code}" requires batch numbers.`);
      }
      const batchTotal = batchNumbers.reduce((sum, row) => sum + toQty(row.quantity), 0);
      if (Math.abs(batchTotal - lineQty) > EPSILON) {
        throw new Error(`Item "${line.item_code}" batch quantities (${batchTotal}) must equal receipt quantity (${lineQty}).`);
      }
    }

    if (line.manage_serial) {
      if (serialNumbers.length === 0) {
        throw new Error(`Item "${line.item_code}" requires serial numbers.`);
      }
      if (serialNumbers.length !== Math.floor(lineQty)) {
        throw new Error(`Item "${line.item_code}" serial count (${serialNumbers.length}) must equal receipt quantity (${Math.floor(lineQty)}).`);
      }
    }

    if (!line.enable_bin_locations && binAllocations.length > 0) {
      throw new Error(`Item "${line.item_code}" has bin allocations, but warehouse "${line.warehouse}" is not bin-enabled.`);
    }

    if (line.enable_bin_locations) {
      if (binAllocations.length === 0) {
        throw new Error(`Bin allocations are required for item "${line.item_code}" in warehouse "${line.warehouse}".`);
      }

      const binTotal = binAllocations.reduce((sum, row) => sum + toQty(row.quantity), 0);
      if (Math.abs(binTotal - lineQty) > EPSILON) {
        throw new Error(`Item "${line.item_code}" bin quantities (${binTotal}) must equal receipt quantity (${lineQty}).`);
      }

      if (line.manage_batch) {
        _assertManagedBinBreakdown(line, 'batch', batchNumbers, binAllocations);
      } else if (line.manage_serial) {
        _assertManagedBinBreakdown(line, 'serial', serialNumbers, binAllocations);
      }
    }
  }
}

function _buildPayload(body) {
  const payload = {
    DocDate: body.posting_date,
    TaxDate: body.document_date || body.posting_date,
    Comments: body.remarks || '',
    JournalMemo: body.journal_remark || '',
  };

  if (opt(body.series)) payload.Series = Number(body.series);
  if (opt(body.ref_2)) payload.Reference2 = body.ref_2;
  if (opt(body.branch)) payload.BPL_IDAssignedToInvoice = Number(body.branch);
  if (opt(body.uop)) payload.U_UoP = body.uop;

  if (Array.isArray(body.lines) && body.lines.length > 0) {
    payload.DocumentLines = body.lines
      .filter((line) => line.item_code && toQty(line.quantity) > 0)
      .map((line, idx) => {
        const batchNumbers = Array.isArray(line.batch_numbers)
          ? line.batch_numbers.filter((row) => row.batch_number && toQty(row.quantity) > 0)
          : [];
        const serialNumbers = Array.isArray(line.serial_numbers)
          ? line.serial_numbers.filter((row) => row.serial_number)
          : [];
        const binAllocations = Array.isArray(line.bin_allocations)
          ? line.bin_allocations.filter((row) => row.bin_abs != null && row.bin_abs !== '' && toQty(row.quantity) > 0)
          : [];

        const docLine = {
          ItemCode: line.item_code,
          Quantity: toQty(line.quantity),
          WarehouseCode: line.warehouse || undefined,
          LineNum: idx,
        };

        const baseEntry = opt(line.base_entry) ? Number(line.base_entry) : Number(body.prod_order_entry);
        if (Number.isFinite(baseEntry) && baseEntry > 0) {
          docLine.BaseEntry = baseEntry;
          docLine.BaseLine = opt(line.base_line) ? Number(line.base_line) : 0;
          docLine.BaseType = opt(line.base_type) ? Number(line.base_type) : 202;
        }

        if (opt(line.uom_code)) docLine.UoMCode = line.uom_code;
        if (opt(line.distribution_rule)) docLine.DistributionRule = line.distribution_rule;
        if (opt(line.project)) docLine.Project = line.project;
        if (opt(line.unit_price)) docLine.Price = Number(line.unit_price);
        if (opt(line.trans_type)) docLine.U_TransType = line.trans_type;
        if (opt(line.location)) docLine.U_Location = line.location;
        if (opt(line.order_no)) docLine.U_OrderNo = line.order_no;
        if (opt(line.series_no)) docLine.U_SeriesNo = line.series_no;
        if (line.by_product) docLine.U_ByProduct = 'Y';

        if (batchNumbers.length > 0) {
          docLine.BatchNumbers = batchNumbers.map((row) => ({
            BatchNumber: row.batch_number,
            Quantity: toQty(row.quantity),
          }));
        }

        if (serialNumbers.length > 0) {
          docLine.SerialNumbers = serialNumbers.map((row) => ({
            InternalSerialNumber: row.serial_number,
            Quantity: 1,
          }));
        }

        if (binAllocations.length > 0) {
          docLine.DocumentLinesBinAllocations = binAllocations.map((row) => {
            const binLine = {
              BinAbsEntry: Number(row.bin_abs),
              Quantity: toQty(row.quantity),
              BaseLineNumber: idx,
            };

            if ((line.manage_batch || line.manage_serial) && opt(row.serial_batch_base_line)) {
              binLine.SerialAndBatchNumbersBaseLine = Number(row.serial_batch_base_line);
            } else if ((line.manage_batch && batchNumbers.length === 1) || (line.manage_serial && serialNumbers.length === 1)) {
              binLine.SerialAndBatchNumbersBaseLine = 0;
            }

            if (row.allow_negative_quantity) {
              binLine.AllowNegativeQuantity = 'tYES';
            }

            return binLine;
          });
        }

        return docLine;
      });
  } else {
    const receiptQty = toQty(body.receipt_qty);
    const fgLine = {
      ItemCode: body.item_code,
      Quantity: receiptQty,
      WarehouseCode: body.warehouse || undefined,
      BaseEntry: Number(body.prod_order_entry),
      BaseLine: 0,
      BaseType: 202,
    };

    if (opt(body.uom)) fgLine.UoMCode = body.uom;
    if (opt(body.distribution_rule)) fgLine.DistributionRule = body.distribution_rule;
    if (opt(body.project)) fgLine.Project = body.project;

    payload.DocumentLines = [fgLine];
  }

  return payload;
}

module.exports = {
  getReferenceData,
  getProductionOrderForReceipt,
  getReceiptList,
  getReceiptByDocEntry,
  createReceipt,
  lookupProductionOrders,
};
