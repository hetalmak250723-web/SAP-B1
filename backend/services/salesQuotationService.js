const sapService = require('./sapService');
const salesQuotationDb = require('./salesQuotationDbService');
const { buildDocumentAdditionalExpenses } = require('./freightPayloadUtils');

const normalizeBranchId = (branch) => {
  const normalized = String(branch || '').trim();
  return normalized === '' ? -1 : Number(normalized);
};

// ───────── HELPERS ─────────

const convertSalesEmployeeToCode = async (input, salesEmployees = []) => {
  if (!input || input === '-1' || input === -1 || String(input).trim() === '') return null;
  if (!isNaN(input) && Number(input) !== -1) return Number(input);

  const name = String(input).trim();
  const found = salesEmployees.find(emp =>
    String(emp.SlpName || '').trim().toLowerCase() === name.toLowerCase()
  );
  if (found) return found.SlpCode;

  const escapedName = name.replace(/'/g, "''");
  try {
    const searchResult = await sapService.request({
      method: 'get',
      url: `/SalesPersons?$filter=SalesEmployeeName eq '${escapedName}'&$select=SalesEmployeeCode,SalesEmployeeName`,
    });
    if (searchResult.data?.value?.length > 0) return searchResult.data.value[0].SalesEmployeeCode;

    const createResult = await sapService.request({
      method: 'post',
      url: '/SalesPersons',
      data: { SalesEmployeeName: name, Active: 'tYES' },
    });
    return createResult.data?.SalesEmployeeCode;
  } catch (error) {
    throw new Error(`Sales Employee '${name}' could not be resolved: ${error.message}`);
  }
};

const convertOwnerToCode = async (input, owners = []) => {
  if (!input || String(input).trim() === '') return null;
  if (!isNaN(input)) return Number(input);

  const name = String(input).trim();
  const found = owners.find(owner => {
    const fullName = String(owner.FullName || '').trim().toLowerCase();
    return fullName === name.toLowerCase() ||
      String(owner.firstName || '').trim().toLowerCase() === name.toLowerCase();
  });
  if (found) return found.empID;

  try {
    const escapedName = name.replace(/'/g, "''");
    const searchResult = await sapService.request({
      method: 'get',
      url: `/EmployeesInfo?$filter=FirstName eq '${escapedName}'&$select=EmployeeID,FirstName,LastName`,
    });
    if (searchResult.data?.value?.length > 0) return searchResult.data.value[0].EmployeeID;
  } catch (error) {
    console.warn('⚠️ Owner lookup failed:', error.message);
  }
  return null;
};

// ───────── REFERENCE DATA ─────────

const getReferenceData = async (companyId) => {
  try {
    return await salesQuotationDb.getReferenceData();
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to load reference data:', error);
    return {
      company: '', customers: [], vendors: [], items: [],
      warehouses: [], warehouse_addresses: [], payment_terms: [],
      shipping_types: [], branches: [], tax_codes: [], uom_groups: [],
      contacts: [], pay_to_addresses: [], company_address: {},
      decimal_settings: { QtyDec: 2, PriceDec: 2, SumDec: 2, RateDec: 2, PercentDec: 2 },
      warnings: [`Failed to load reference data: ${error.message}`],
    };
  }
};

// ───────── CUSTOMER DETAILS ─────────

const getCustomerDetails = async (customerCode) => {
  try {
    return await salesQuotationDb.getCustomerDetails(customerCode);
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to load customer details:', error);
    return { contacts: [], bill_to_addresses: [], pay_to_addresses: [] };
  }
};

// ───────── LIST ─────────

const getSalesQuotationList = async ({
  query = '',
  openOnly = false,
  docNum = '',
  customerCode = '',
  customerName = '',
  status = '',
  postingDateFrom = '',
  postingDateTo = '',
  page = 1,
  pageSize = 25,
} = {}) => {
  try {
    return await salesQuotationDb.getSalesQuotationList({
      query,
      openOnly,
      docNum,
      customerCode,
      customerName,
      status,
      postingDateFrom,
      postingDateTo,
      page,
      pageSize,
    });
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to load list:', error);
    return {
      quotations: [],
      pagination: {
        page: Math.max(1, Number(page) || 1),
        pageSize: Math.min(200, Math.max(1, Number(pageSize) || 25)),
        totalCount: 0,
        totalPages: 1,
      },
    };
  }
};

const getCustomerFilterOptions = async ({
  query = '',
  customerCode = '',
  customerName = '',
  top,
  display = 'code',
} = {}) => {
  try {
    const rows = await salesQuotationDb.searchCustomers({
      query,
      cardCode: customerCode,
      cardName: customerName,
      top,
      sortBy: display === 'name' ? 'name' : 'code',
    });

    return {
      options: rows.map((row) => ({
        code: display === 'name'
          ? String(row.CardName || '').trim()
          : String(row.CardCode || '').trim(),
        name: display === 'name'
          ? String(row.CardCode || '').trim()
          : String(row.CardName || '').trim(),
      })).filter((option) => option.code),
    };
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to load customer filter options:', error);
    return { options: [] };
  }
};

// ───────── GET SINGLE ─────────

const getSalesQuotation = async (docEntry) => {
  try {
    return await salesQuotationDb.getSalesQuotation(docEntry);
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to load quotation:', error);
    throw error;
  }
};

// ───────── CREATE (SERVICE LAYER) ─────────

const submitSalesQuotation = async (payload) => {
  try {
    const refData = await salesQuotationDb.getReferenceData();
    const salesEmployees = refData.sales_employees || [];
    const owners = refData.owners || [];

    let salesEmployeeInput = payload.header.salesEmployee;
    if (!salesEmployeeInput || salesEmployeeInput === '-1' || salesEmployeeInput === -1) {
      salesEmployeeInput = payload.header.purchaser;
    }

    const SlpCode = await convertSalesEmployeeToCode(salesEmployeeInput, salesEmployees);
    const OwnerCode = await convertOwnerToCode(payload.header.owner, owners);
    const Remarks = payload.header.otherInstruction || payload.header.remarks || '';
    const Freight = payload.header.freight ? Number(payload.header.freight) : 0;
    const documentAdditionalExpenses = buildDocumentAdditionalExpenses(payload.freightCharges);

    const sapPayload = {
      CardCode: payload.header.vendor.trim(),
      ...(payload.header.series && Number(payload.header.series) > 0
        ? { Series: Number(payload.header.series) } : {}),
      DocDate: payload.header.postingDate,
      DocDueDate: payload.header.deliveryDate,
      TaxDate: payload.header.documentDate,
      ContactPersonCode: payload.header.contactPerson ? Number(payload.header.contactPerson) : undefined,
      BPLId: normalizeBranchId(payload.header.branch),
      BPL_IDAssignedToInvoice: normalizeBranchId(payload.header.branch),
      PaymentGroupCode: payload.header.paymentTerms ? Number(payload.header.paymentTerms) : undefined,
      ...(SlpCode !== null && SlpCode !== undefined ? { SalesPersonCode: SlpCode } : {}),
      ...(OwnerCode !== null && OwnerCode !== undefined ? { DocumentsOwner: OwnerCode } : {}),
      ...(Remarks ? { Comments: Remarks } : {}),
      ...(Freight > 0 ? { TotalExpenses: Freight } : {}),
      DocumentAdditionalExpenses: documentAdditionalExpenses,
      NumAtCard: payload.header.customerRefNo || undefined,
      DocumentLines: payload.lines.map(l => {
        const line = {
          ItemCode: l.itemNo,
          Quantity: Number(l.quantity),
          Price: Number(l.unitPrice),
          WarehouseCode: l.whse || '01',
          TaxCode: l.taxCode || 'IGST5',
          MeasureUnit: l.uomCode || undefined,
        };
        if (l.stdDiscount && Number(l.stdDiscount) > 0) {
          line.DiscountPercent = Number(l.stdDiscount);
        }
        if (l.batches && l.batches.length > 0) {
          line.BatchNumbers = l.batches.map(b => ({
            BatchNumber: b.batchNumber,
            Quantity: Number(b.quantity),
          }));
        }
        return line;
      }),
    };

    if (payload.header.placeOfSupply) {
      sapPayload.U_PlaceOfSupply = payload.header.placeOfSupply;
    }

    console.log('🔥 SAP Quotation Payload:', JSON.stringify(sapPayload, null, 2));

    const response = await sapService.request({
      method: 'post',
      url: '/Quotations',
      data: sapPayload,
    });

    return {
      message: 'Sales quotation created successfully',
      doc_num: response.data?.DocNum,
      doc_entry: response.data?.DocEntry,
      DocNum: response.data?.DocNum,
      DocEntry: response.data?.DocEntry,
    };
  } catch (error) {
    console.error('❌ SAP Quotation Error:', error.response?.data || error.message);
    let errorMessage = 'Sales quotation submission failed.';
    if (error.response?.data?.error?.message?.value) errorMessage = error.response.data.error.message.value;
    else if (error.response?.data?.error?.message) errorMessage = error.response.data.error.message;
    else if (error.message) errorMessage = error.message;
    const sapError = new Error(errorMessage);
    sapError.response = error.response;
    throw sapError;
  }
};

// ───────── UPDATE (SERVICE LAYER) ─────────

const updateSalesQuotation = async (docEntry, payload) => {
  try {
    const refData = await salesQuotationDb.getReferenceData();
    const salesEmployees = refData.sales_employees || [];
    const owners = refData.owners || [];

    let salesInput = payload.header.salesEmployee;
    if (!salesInput || salesInput === '-1' || salesInput === -1) {
      salesInput = payload.header.purchaser;
    }

    const SlpCode = await convertSalesEmployeeToCode(salesInput, salesEmployees);
    const OwnerCode = await convertOwnerToCode(payload.header.owner, owners);
    const Remarks = payload.header.otherInstruction || payload.header.remarks || '';
    const Freight = Number(payload.header.freight) || 0;
    const documentAdditionalExpenses = buildDocumentAdditionalExpenses(payload.freightCharges);

    const sapPayload = {
      CardCode: payload.header.vendor?.trim(),
      DocDate: payload.header.postingDate,
      DocDueDate: payload.header.deliveryDate,
      TaxDate: payload.header.documentDate,
      ContactPersonCode: payload.header.contactPerson ? Number(payload.header.contactPerson) : undefined,
      BPL_IDAssignedToInvoice: payload.header.branch ? Number(payload.header.branch) : undefined,
      PaymentGroupCode: payload.header.paymentTerms ? Number(payload.header.paymentTerms) : undefined,
      ...(SlpCode !== null && SlpCode !== undefined && { SalesPersonCode: SlpCode }),
      ...(OwnerCode !== null && OwnerCode !== undefined && { DocumentsOwner: OwnerCode }),
      ...(Remarks && { Comments: Remarks }),
      ...(Freight > 0 && { TotalExpenses: Freight }),
      DocumentAdditionalExpenses: documentAdditionalExpenses,
      DocumentLines: payload.lines.map(l => ({
        ItemCode: l.itemNo,
        Quantity: Number(l.quantity),
        UnitPrice: Number(l.unitPrice),
        WarehouseCode: l.whse || '01',
        TaxCode: l.taxCode || 'IGST5',
      })),
    };

    if (payload.header.placeOfSupply) {
      sapPayload.U_PlaceOfSupply = payload.header.placeOfSupply;
    }

    await sapService.request({
      method: 'patch',
      url: `/Quotations(${docEntry})`,
      data: sapPayload,
    });

    return { message: 'Sales quotation updated successfully', doc_entry: docEntry };
  } catch (error) {
    console.error('❌ SAP Quotation Update Error:', error.response?.data || error.message);
    throw error;
  }
};

// ───────── DOCUMENT SERIES ─────────

const getDocumentSeries = async () => {
  try {
    const series = await salesQuotationDb.getDocumentSeries();
    return { series };
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to load document series:', error);
    return { series: [] };
  }
};

const getNextNumber = async (seriesParam) => {
  try {
    const series = Number(seriesParam);
    if (isNaN(series)) throw new Error('Invalid series number');
    return await salesQuotationDb.getNextNumber(series);
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to get next number:', error);
    throw error;
  }
};

const getStateFromAddress = async (cardCode, addressCode) => {
  try {
    return await salesQuotationDb.getStateFromAddress(cardCode, addressCode);
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to get state from address:', error);
    return { state: '' };
  }
};

const getItemsForModal = async () => {
  try {
    const items = await salesQuotationDb.getItemsForModal();
    return { items };
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to get items for modal:', error);
    return { items: [] };
  }
};

const getFreightCharges = async (docEntry) => {
  try {
    const freightCharges = await salesQuotationDb.getFreightCharges(docEntry);
    return { freightCharges };
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to get freight charges:', error);
    return { freightCharges: [] };
  }
};

// ───────── OPEN QUOTATIONS FOR COPY ─────────

const getOpenSalesQuotations = async () => {
  try {
    const documents = await salesQuotationDb.getOpenSalesQuotations();
    return { documents };
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to get open quotations:', error);
    return { documents: [] };
  }
};

const getSalesQuotationForCopy = async (docEntry) => {
  try {
    const quotation = await salesQuotationDb.getSalesQuotationForCopy(docEntry);
    return quotation;
  } catch (error) {
    console.error('[Sales Quotation Service] Failed to get quotation for copy:', error);
    throw error;
  }
};

module.exports = {
  getReferenceData,
  getCustomerDetails,
  getCustomerFilterOptions,
  getSalesQuotationList,
  getSalesQuotation,
  submitSalesQuotation,
  updateSalesQuotation,
  getDocumentSeries,
  getNextNumber,
  getStateFromAddress,
  getItemsForModal,
  getFreightCharges,
  getOpenSalesQuotations,
  getSalesQuotationForCopy,
};
