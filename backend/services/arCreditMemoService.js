const sapService = require('./sapService');
const arCreditMemoDb = require('./arCreditMemoDbService');
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
    const data = await arCreditMemoDb.getReferenceData();
    if (data.customers && !data.vendors) {
      data.vendors = data.customers;
      delete data.customers;
    
    }
    return data;
  } catch (error) {
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
    const data = await arCreditMemoDb.getCustomerDetails(customerCode);
    return data;
  } catch (error) {
   return {
      customer: null,
      contacts: [],
      pay_to_addresses: [],
      ship_to_addresses: [],
    };
  }
};

// ───────── AR CREDIT MEMO LIST (USING ODBC) ─────────

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

const getARCreditMemoList = async ({
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
    const result = await arCreditMemoDb.getARCreditMemoList({
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
    return {
      ar_credit_memos: [],
      pagination: {
        page: Math.max(1, Number(page) || 1),
        pageSize: Math.min(200, Math.max(1, Number(pageSize) || 25)),
        totalCount: 0,
        totalPages: 1,
      },
    };
  }
};

const getOpenARCreditMemoDocuments = async () => {
  try {
    const result = await arCreditMemoDb.getARCreditMemoList({
      openOnly: true,
      page: 1,
      pageSize: 100,
    });

    return {
      creditMemos: (result.ar_credit_memos || []).map((row) => ({
        DocEntry: row.doc_entry,
        DocNum: row.doc_num,
        CardCode: row.customer_code,
        CardName: row.customer_name,
        DocDate: row.posting_date,
        DocDueDate: row.delivery_date,
        DocTotal: row.total_amount,
        DocumentStatus: row.status,
      })),
    };
  } catch (_error) {
    return { creditMemos: [] };
  }
};

// ───────── GET SINGLE CREDIT MEMO (USING ODBC) ─────────

const getARCreditMemo = async (docEntry) => {
  try {
    // Use ODBC for reading single credit memo
    const result = await arCreditMemoDb.getARCreditMemo(docEntry);
    return result;
  } catch (error) {
   throw error;
  }
};

// ───────── CREATE CREDIT MEMO (USING SERVICE LAYER) ─────────

const submitARCreditMemo = async (payload) => {
  try {
    console.log("🔥 [ARCreditMemoService] RECEIVED AR CREDIT MEMO PAYLOAD:", JSON.stringify(payload, null, 2));

    // Validate required fields
    if (!payload.header) {
      throw new Error('Header is required');
    }
    
    console.log("🔍 [ARCreditMemoService] Header vendor:", payload.header.vendor);
    console.log("🔍 [ARCreditMemoService] Header customerCode:", payload.header.customerCode);
    
    // Use vendor or customerCode (frontend sends vendor)
    const customerCode = payload.header.vendor || payload.header.customerCode || payload.header.customer;
    
    if (!customerCode) {
      throw new Error('Customer code is required');
    }
    
    console.log("🔍 [ARCreditMemoService] Using customer code:", customerCode);
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
        console.log(`🔍 [ARCreditMemoService] Processing line ${index}:`, l);
        
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

        console.log(`🔍 [ARCreditMemoService] Transformed line ${index}:`, line);
        return line;
      })
    };

    console.log("🔥 [ARCreditMemoService] SAP AR CREDIT MEMO PAYLOAD:", JSON.stringify(sapPayload, null, 2));

    // Use Service Layer for POST operations - Credit Memos endpoint
    const response = await sapService.request({
      method: 'post',
      url: '/CreditNotes',
      data: sapPayload,
    });

    console.log("✅ [ARCreditMemoService] SAP AR CREDIT MEMO RESPONSE:", JSON.stringify(response.data, null, 2));

    return {
      message: 'AR Credit Memo created successfully',
      doc_num: response.data?.DocNum,
      doc_entry: response.data?.DocEntry,
      DocNum: response.data?.DocNum,
      DocEntry: response.data?.DocEntry,
    };
  } catch (error) {
    console.error('❌ [ARCreditMemoService] Failed to create AR credit memo:', error);
    console.error('❌ [ARCreditMemoService] Error details:', error.response?.data);
    console.error('❌ [ARCreditMemoService] Error stack:', error.stack);

    // Extract meaningful error message from SAP
    let errorMessage = 'AR Credit Memo submission failed.';
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

// ───────── UPDATE CREDIT MEMO (USING SERVICE LAYER) ─────────

const updateARCreditMemo = async (docEntry, payload) => {
  try {
    console.log("🔥 [ARCreditMemoService] UPDATING AR CREDIT MEMO:", docEntry, JSON.stringify(payload, null, 2));

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
      url: `/CreditNotes(${docEntry})`,
      data: sapPayload,
    });

    console.log("✅ [ARCreditMemoService] AR CREDIT MEMO UPDATED:", response.data);

    return {
      message: 'AR Credit Memo updated successfully',
      doc_num: response.data?.DocNum,
      doc_entry: response.data?.DocEntry,
    };
  } catch (error) {
    console.error('❌ [ARCreditMemoService] Failed to update AR credit memo:', error);
    console.error('❌ [ARCreditMemoService] Error details:', error.response?.data);
    throw error;
  }
};

// ───────── DOCUMENT SERIES ─────────

const getDocumentSeries = async () => {
  try {
    const result = await arCreditMemoDb.getDocumentSeries();
    return { series: result };
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to load document series:', error);
    return { series: [] };
  }
};

// ───────── NEXT NUMBER ─────────

const getNextNumber = async (series) => {
  try {
    const result = await arCreditMemoDb.getNextNumber(series);
    return result;
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to get next number:', error);
    return { nextNumber: '' };
  }
};

// ───────── STATE FROM ADDRESS ─────────

const getStateFromAddress = async (cardCode, addressCode) => {
  try {
    const result = await arCreditMemoDb.getStateFromAddress(cardCode, addressCode);
    return result;
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to get state from address:', error);
    return { state: '' };
  }
};

const getWarehouseState = async (whsCode) => {
  try {
    const result = await arCreditMemoDb.getWarehouseState(whsCode);
    return result;
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to get warehouse state:', error);
    return { state: '' };
  }
};

const getFreightCharges = async (docEntry) => {
  try {
    const result = await arCreditMemoDb.getFreightCharges(docEntry);
    return { freightCharges: result };
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to get freight charges:', error);
    return { freightCharges: [] };
  }
};

const getItemsForModal = async () => {
  try {
    const result = await arCreditMemoDb.getItemsForModal();
    return { items: result };
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to get items for modal:', error);
    return { items: [] };
  }
};

const getBatchesByItem = async (itemCode, whsCode) => {
  try {
    const result = await arCreditMemoDb.getBatchesByItem(itemCode, whsCode);
    return result;
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to get batches:', error);
    return { batches: [] };
  }
};

const getUomConversionFactor = async (itemCode, uomCode) => {
  try {
    const result = await arCreditMemoDb.getUomConversionFactor(itemCode, uomCode);
    return result;
  } catch (error) {
    console.error('[AR Credit Memo Service] Failed to get UoM conversion factor:', error);
    return {
      inventoryUOM: '',
      uomCode: uomCode,
      baseQty: 1,
      altQty: 1,
      factor: 1
    };
  }
};

module.exports = {
  getReferenceData,
  getCustomerDetails,
  getCustomerFilterOptions,
  getARCreditMemoList,
  getOpenARCreditMemoDocuments,
  getARCreditMemo,
  submitARCreditMemo,
  updateARCreditMemo,
  getDocumentSeries,
  getNextNumber,
  getStateFromAddress,
  getWarehouseState,
  getFreightCharges,
  getItemsForModal,
  getBatchesByItem,
  getUomConversionFactor,
  // getOpenDeliveries:       async () => ({ documents: await arCreditMemoDb.getOpenDeliveries() }),
  // getDeliveryForCopy:      (d) => arCreditMemoDb.getDeliveryForCopy(d),
  getOpenARInvoices:       async (customerCode = null) => ({ documents: await arCreditMemoDb.getOpenARInvoices(customerCode) }),
  // getARInvoiceForCopy:     (d) => arCreditMemoDb.getARInvoiceForCopy(d),
  // getOpenSalesOrders:      async () => ({ documents: await arCreditMemoDb.getOpenSalesOrders() }),
  // getSalesOrderForCopy:    (d) => arCreditMemoDb.getSalesOrderForCopy(d),
  // getOpenReturns:          async (customerCode = null) => ({ documents: await arCreditMemoDb.getOpenReturns(customerCode) }),
  // getReturnForCopy:        (d) => arCreditMemoDb.getReturnForCopy(d),
  // getOpenReturnRequests:   async (customerCode = null) => ({ documents: await arCreditMemoDb.getOpenReturnRequests(customerCode) }),
  // getReturnRequestForCopy: (d) => arCreditMemoDb.getReturnRequestForCopy(d),
  // getOpenDownPayments:     async (customerCode = null) => ({ documents: await arCreditMemoDb.getOpenDownPayments(customerCode) }),
  // getDownPaymentForCopy:   (d) => arCreditMemoDb.getDownPaymentForCopy(d),
};
