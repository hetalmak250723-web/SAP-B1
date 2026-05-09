const sapService = require('./sapService');
const arInvoiceDb = require('./arInvoiceDbService');
const salesOrderDb = require('./salesOrderDbService');
const { buildDocumentAdditionalExpenses } = require('./freightPayloadUtils');

const normalizeBranchId = (branch) => {
  const normalized = String(branch || '').trim();
  return normalized === '' ? -1 : Number(normalized);
};

// ───────── REFERENCE DATA (USING ODBC) ─────────

const getReferenceData = async (companyId) => {
  try {
    // Use ODBC/Direct SQL for GET operations
    const data = await arInvoiceDb.getReferenceData();
    if (data.customers && !data.vendors) {
      data.vendors = data.customers;
      delete data.customers;
      console.warn("⚠️ AR Invoice service normalized customers->vendors");
    }
    console.log("✅ AR Invoice reference data loaded:", data.vendors?.length || 0, "vendors");
    console.log("🔍 AR Invoice refData keys:", Object.keys(data));
    return data;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to load reference data via ODBC:', error);
    return {
      company: '',
      vendors: [],
      contacts: [],
      pay_to_addresses: [],
      items: [],
      warehouses: [],
      warehouse_addresses: [],
      payment_terms: [],
      shipping_types: [],
      branches: [],
      tax_codes: [],
      uom_groups: [],
      decimal_settings: {
        QtyDec: 2,
        PriceDec: 2,
        SumDec: 2,
        RateDec: 2,
        PercentDec: 2
      },
      warnings: [`Failed to load reference data: ${error.message}`],
    };
  }
};

// ───────── CUSTOMER DETAILS (USING ODBC) ─────────

const getCustomerDetails = async (customerCode) => {
  try {
    // Use ODBC/Direct SQL for GET operations
    const data = await arInvoiceDb.getCustomerDetails(customerCode);
    return data;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to load customer details via ODBC:', error);
    return {
      customer: null,
      contacts: [],
      pay_to_addresses: [],
      ship_to_addresses: [],
    };
  }
};

// ───────── AR INVOICE LIST (USING ODBC) ─────────

const getCustomerFilterOptions = async ({
  query = '',
  customerCode = '',
  customerName = '',
  top,
  display = 'code',
} = {}) => {
  try {
    const rows = await salesOrderDb.searchCustomers({
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
  } catch (_error) {
    return { options: [] };
  }
};

const getARInvoiceList = async ({
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
    const result = await arInvoiceDb.getARInvoiceList({
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
    return result;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to load AR invoice list via ODBC:', error);
    return {
      ar_invoices: [],
      pagination: {
        page: Math.max(1, Number(page) || 1),
        pageSize: Math.min(200, Math.max(1, Number(pageSize) || 25)),
        totalCount: 0,
        totalPages: 1,
      },
    };
  }
};

// ───────── GET SINGLE INVOICE (USING ODBC) ─────────

const getARInvoice = async (docEntry) => {
  try {
    // Use ODBC for reading single invoice
    const result = await arInvoiceDb.getARInvoice(docEntry);
    return result;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to load AR invoice via ODBC:', error);
    throw error;
  }
};

// ───────── CREATE INVOICE (USING SERVICE LAYER) ─────────

const submitARInvoice = async (payload) => {
  try {
    console.log("🔥 [ARInvoiceService] RECEIVED AR INVOICE PAYLOAD:", JSON.stringify(payload, null, 2));

    // Validate required fields
    if (!payload.header) {
      throw new Error('Header is required');
    }
    
    console.log("🔍 [ARInvoiceService] Header vendor:", payload.header.vendor);
    console.log("🔍 [ARInvoiceService] Header customerCode:", payload.header.customerCode);
    
    // Use vendor or customerCode (frontend sends vendor)
    const customerCode = payload.header.vendor || payload.header.customerCode || payload.header.customer;
    
    if (!customerCode) {
      throw new Error('Customer code is required');
    }
    
    console.log("🔍 [ARInvoiceService] Using customer code:", customerCode);
    const documentAdditionalExpenses = buildDocumentAdditionalExpenses(payload.freightCharges);

    // Transform payload to SAP format
    const sapPayload = {
      CardCode: String(customerCode).trim(),

      // Series for auto-numbering - only include if explicitly provided and valid
      ...(payload.header.series && Number(payload.header.series) > 0 ? { Series: Number(payload.header.series) } : {}),

      DocDate: payload.header.postingDate || payload.header.documentDate,
      DocDueDate: payload.header.deliveryDate || payload.header.dueDate,
      TaxDate: payload.header.documentDate || payload.header.postingDate,

      ContactPersonCode: payload.header.contactPerson ? Number(payload.header.contactPerson) : undefined,

      // Branch mapping
      BPLId: normalizeBranchId(payload.header.branch),
      BPL_IDAssignedToInvoice: normalizeBranchId(payload.header.branch),

      PaymentGroupCode: payload.header.paymentTerms ? Number(payload.header.paymentTerms) : undefined,

      // Customer reference
      NumAtCard: payload.header.salesContractNo || payload.header.customerRefNo || undefined,

      // Comments
      Comments: payload.header.otherInstruction || payload.header.comments || undefined,
      DocumentAdditionalExpenses: documentAdditionalExpenses,

      DocumentLines: payload.lines.map((l, index) => {
        console.log(`🔍 [ARInvoiceService] Processing line ${index}:`, l);
        
        const line = {
          ItemCode: l.itemNo,
          Quantity: Number(l.quantity),
          UnitPrice: Number(l.unitPrice),
          WarehouseCode: l.whse || l.warehouse || "01",
          TaxCode: l.taxCode || undefined,
          MeasureUnit: l.uomCode || undefined,
        };

        // Add discount if present
        if (l.stdDiscount && Number(l.stdDiscount) > 0) {
          line.DiscountPercent = Number(l.stdDiscount);
        } else if (l.discountPercent && Number(l.discountPercent) > 0) {
          line.DiscountPercent = Number(l.discountPercent);
        }

        // Base document integration
        if (l.baseType && l.baseEntry && l.baseLine !== undefined) {
          line.BaseType = Number(l.baseType);
          line.BaseEntry = Number(l.baseEntry);
          line.BaseLine = Number(l.baseLine);
        }

        console.log(`🔍 [ARInvoiceService] Transformed line ${index}:`, line);
        return line;
      })
    };

    console.log("🔥 [ARInvoiceService] SAP AR INVOICE PAYLOAD:", JSON.stringify(sapPayload, null, 2));

    // Use Service Layer for POST operations - Invoices endpoint
    const response = await sapService.request({
      method: 'post',
      url: '/Invoices',
      data: sapPayload,
    });

    console.log("✅ [ARInvoiceService] SAP AR INVOICE RESPONSE:", JSON.stringify(response.data, null, 2));

    return {
      message: 'AR Invoice created successfully',
      doc_num: response.data?.DocNum,
      doc_entry: response.data?.DocEntry,
      DocNum: response.data?.DocNum,
      DocEntry: response.data?.DocEntry,
    };
  } catch (error) {
    console.error('❌ [ARInvoiceService] Failed to create AR invoice:', error);
    console.error('❌ [ARInvoiceService] Error details:', error.response?.data);
    console.error('❌ [ARInvoiceService] Error stack:', error.stack);

    // Extract meaningful error message from SAP
    let errorMessage = 'AR Invoice submission failed.';
    if (error.response?.data?.error?.message?.value) {
      errorMessage = error.response.data.error.message.value;
    } else if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    } else if (error.message) {
      errorMessage = error.message;
    }

    // Create a new error with the SAP message
    const sapError = new Error(errorMessage);
    sapError.response = error.response;
    throw sapError;
  }
};

// ───────── UPDATE INVOICE (USING SERVICE LAYER) ─────────

const updateARInvoice = async (docEntry, payload) => {
  try {
    console.log("🔥 [ARInvoiceService] UPDATING AR INVOICE:", docEntry, JSON.stringify(payload, null, 2));

    // Use vendor or customerCode (frontend sends vendor)
    const customerCode = payload.header.vendor || payload.header.customerCode || payload.header.customer;
    const documentAdditionalExpenses = buildDocumentAdditionalExpenses(payload.freightCharges);

    // Transform payload to SAP format (similar to submit)
    const sapPayload = {
      CardCode: String(customerCode).trim(),
      DocDate: payload.header.postingDate || payload.header.documentDate,
      DocDueDate: payload.header.deliveryDate || payload.header.dueDate,
      TaxDate: payload.header.documentDate || payload.header.postingDate,
      ContactPersonCode: payload.header.contactPerson ? Number(payload.header.contactPerson) : undefined,
      PaymentGroupCode: payload.header.paymentTerms ? Number(payload.header.paymentTerms) : undefined,
      NumAtCard: payload.header.salesContractNo || payload.header.customerRefNo || undefined,
      Comments: payload.header.otherInstruction || payload.header.comments || undefined,
      DocumentAdditionalExpenses: documentAdditionalExpenses,

      DocumentLines: payload.lines.map((l) => ({
        ItemCode: l.itemNo,
        Quantity: Number(l.quantity),
        UnitPrice: Number(l.unitPrice),
        WarehouseCode: l.whse || l.warehouse || "01",
        TaxCode: l.taxCode || undefined,
        MeasureUnit: l.uomCode || undefined,
        DiscountPercent: l.stdDiscount ? Number(l.stdDiscount) : (l.discountPercent ? Number(l.discountPercent) : 0),
        BaseType: l.baseType ? Number(l.baseType) : undefined,
        BaseEntry: l.baseEntry ? Number(l.baseEntry) : undefined,
        BaseLine: l.baseLine !== undefined ? Number(l.baseLine) : undefined,
      }))
    };

    // Use Service Layer for PATCH operations
    const response = await sapService.request({
      method: 'patch',
      url: `/Invoices(${docEntry})`,
      data: sapPayload,
    });

    console.log("✅ [ARInvoiceService] AR INVOICE UPDATED:", response.data);

    return {
      message: 'AR Invoice updated successfully',
      doc_num: response.data?.DocNum,
      doc_entry: response.data?.DocEntry,
    };
  } catch (error) {
    console.error('❌ [ARInvoiceService] Failed to update AR invoice:', error);
    console.error('❌ [ARInvoiceService] Error details:', error.response?.data);
    throw error;
  }
};

// ───────── DOCUMENT SERIES ─────────

const getDocumentSeries = async () => {
  try {
    const result = await arInvoiceDb.getDocumentSeries();
    return { series: result };
  } catch (error) {
    console.error('[AR Invoice Service] Failed to load document series:', error);
    return { series: [] };
  }
};

// ───────── NEXT NUMBER ─────────

const getNextNumber = async (series) => {
  try {
    const result = await arInvoiceDb.getNextNumber(series);
    return result;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to get next number:', error);
    return { nextNumber: '' };
  }
};

// ───────── STATE FROM ADDRESS ─────────

const getStateFromAddress = async (cardCode, addressCode) => {
  try {
    const result = await arInvoiceDb.getStateFromAddress(cardCode, addressCode);
    return result;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to get state from address:', error);
    return { state: '' };
  }
};

const getWarehouseState = async (whsCode) => {
  try {
    const result = await arInvoiceDb.getWarehouseState(whsCode);
    return result;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to get warehouse state:', error);
    return { state: '' };
  }
};

const getBatchesByItem = async (itemCode, whsCode) => {
  try {
    const result = await arInvoiceDb.getBatchesByItem(itemCode, whsCode);
    return result;
  } catch (error) {
    console.error('[AR Invoice Service] Failed to get batches by item:', error);
    return { batches: [] };
  }
};

const getFreightCharges = async (docEntry) => {
  try {
    const result = await arInvoiceDb.getFreightCharges(docEntry);
    return { freightCharges: result };
  } catch (error) {
    console.error('[AR Invoice Service] Failed to get freight charges:', error);
    return { freightCharges: [] };
  }
};

const getItemsForModal = async () => {
  try {
    const items = await arInvoiceDb.getItemsForModal();
    return { items };
  } catch (error) {
    console.error('[AR Invoice] Failed to get items for modal:', error);
    return { items: [] };
  }
};
module.exports = {
  getReferenceData,
  getCustomerDetails,
  getCustomerFilterOptions,
  getARInvoiceList,
  getARInvoice,
  submitARInvoice,
  updateARInvoice,
  getDocumentSeries,
  getNextNumber,
  getStateFromAddress,
  getWarehouseState,
  getBatchesByItem,
  getFreightCharges,
  getItemsForModal,
  getOpenSalesOrders:      async (customerCode = null) => { 
    try { 
      return { documents: await arInvoiceDb.getOpenSalesOrders(customerCode) }; 
    } catch(e) { 
      return { documents: [] }; 
    } 
  },
  getSalesOrderForCopy:    async (d) => arInvoiceDb.getSalesOrderForCopy(d),
  getOpenDeliveries:       async (customerCode = null) => { 
    try { 
      return { documents: await arInvoiceDb.getOpenDeliveries(customerCode) }; 
    } catch(e) { 
      return { documents: [] }; 
    } 
  },
  getDeliveryForCopy:      async (d) => arInvoiceDb.getDeliveryForCopy(d),
  getOpenSalesQuotations:  async () => { try { return { documents: await arInvoiceDb.getOpenSalesQuotations() }; } catch(e) { return { documents: [] }; } },
  getSalesQuotationForCopy:async (d) => arInvoiceDb.getSalesQuotationForCopy(d),
};
