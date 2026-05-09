const sapService = require('./sapService');
const salesOrderDb = require('./salesOrderDbService');
const { buildDocumentAdditionalExpenses } = require('./freightPayloadUtils');

const normalizeBranchId = (branch) => {
  const normalized = String(branch || '').trim();
  return normalized === '' ? -1 : Number(normalized);
};

// ───────── HELPERS ─────────

/**
 * Convert Sales Employee name to code using ODBC data
 * @param {string|number} input - Sales Employee name or code
 * @param {Array} salesEmployees - Sales employees from ODBC
 * @returns {Promise<number|null>} SlpCode or null if ignored
 */
const convertSalesEmployeeToCode = async (input, salesEmployees = []) => {
  console.log('🔍 convertSalesEmployeeToCode called with input:', input, 'Type:', typeof input);
  
  // Handle empty or -1 values
  if (!input || input === '-1' || input === -1 || String(input).trim() === '') {
    console.log('🔹 Sales Employee: Ignored (empty or -1)');
    return null;
  }

  // If numeric (and not -1), treat as SlpCode
  if (!isNaN(input) && Number(input) !== -1) {
    const code = Number(input);
    console.log('🔹 Sales Employee: Using existing code', code);
    return code;
  }

  // It's a name, search in ODBC data first
  const name = String(input).trim();
  
  console.log('🔍 Searching for Sales Employee in ODBC data:', name);
  console.log('🔍 Available Sales Employees:', salesEmployees.map(e => e.SlpName).join(', '));
  
  // Search in ODBC data (case-insensitive)
  const found = salesEmployees.find(emp => 
    String(emp.SlpName || '').trim().toLowerCase() === name.toLowerCase()
  );
  
  if (found) {
    console.log('✅ Sales Employee found in ODBC data:', name, '→ Code:', found.SlpCode);
    return found.SlpCode;
  }

  // Not found in ODBC data, try Service Layer API
  console.log('⚠️ Sales Employee not found in ODBC data, trying Service Layer API...');
  
  const escapedName = name.replace(/'/g, "''");

  try {
    const searchResult = await sapService.request({
      method: 'get',
      url: `/SalesPersons?$filter=SalesEmployeeName eq '${escapedName}'&$select=SalesEmployeeCode,SalesEmployeeName`,
    });

    console.log('🔍 Service Layer search result:', JSON.stringify(searchResult.data, null, 2));

    if (searchResult.data?.value?.length > 0) {
      const slpCode = searchResult.data.value[0].SalesEmployeeCode;
      console.log('✅ Sales Employee found via Service Layer:', name, '→ Code:', slpCode);
      return slpCode;
    }

    // Not found, create new one
    console.log('➕ Creating new Sales Employee:', name);
    
    const createResult = await sapService.request({
      method: 'post',
      url: '/SalesPersons',
      data: {
        SalesEmployeeName: name,
        Active: 'tYES',
      },
    });

    const newSlpCode = createResult.data?.SalesEmployeeCode;
    console.log('✅ Sales Employee created:', name, '→ Code:', newSlpCode);
    
    return newSlpCode;

  } catch (error) {
    console.error('❌ Failed to get/create Sales Employee:', name);
    console.error('Error:', error.response?.data || error.message);
    throw new Error(`Sales Employee '${name}' could not be created: ${error.message}`);
  }
};

/**
 * Convert Owner name to empID using ODBC data
 * @param {string|number} input - Owner name or empID
 * @param {Array} owners - Owners from ODBC
 * @returns {Promise<number|null>} empID or null if not found
 */
const convertOwnerToCode = async (input, owners = []) => {
  console.log('🔍 convertOwnerToCode called with input:', input, 'Type:', typeof input);
  
  // Handle empty values
  if (!input || String(input).trim() === '') {
    console.log('🔹 Owner: Ignored (empty)');
    return null;
  }

  // If numeric, treat as empID
  if (!isNaN(input)) {
    const code = Number(input);
    console.log('🔹 Owner: Using existing empID', code);
    return code;
  }

  // It's a name, search in ODBC data first
  const name = String(input).trim();
  
  // Search in ODBC data (check FullName, firstName, lastName)
  const found = owners.find(owner => {
    const fullName = String(owner.FullName || '').trim().toLowerCase();
    const firstName = String(owner.firstName || '').trim().toLowerCase();
    const lastName = String(owner.lastName || '').trim().toLowerCase();
    const searchName = name.toLowerCase();
    
    return fullName === searchName || 
           firstName === searchName || 
           lastName === searchName;
  });
  
  if (found) {
    console.log('✅ Owner found in ODBC data:', name, '→ empID:', found.empID);
    return found.empID;
  }

  // Not found in ODBC data, try Service Layer API
  console.log('⚠️ Owner not found in ODBC data, trying Service Layer API...');
  
  const escapedName = name.replace(/'/g, "''");

  try {
    const searchResult = await sapService.request({
      method: 'get',
      url: `/EmployeesInfo?$filter=FirstName eq '${escapedName}' or LastName eq '${escapedName}'&$select=EmployeeID,FirstName,LastName`,
    });

    console.log('🔍 Service Layer search result:', JSON.stringify(searchResult.data, null, 2));

    if (searchResult.data?.value?.length > 0) {
      const empID = searchResult.data.value[0].EmployeeID;
      console.log('✅ Owner found via Service Layer:', name, '→ empID:', empID);
      return empID;
    }

    console.log('⚠️ Owner not found:', name, '(Owner is optional, continuing without it)');
    return null;

  } catch (error) {
    console.warn('⚠️ Failed to search for Owner:', name);
    console.warn('Error:', error.response?.data || error.message);
    return null; // Owner is optional, don't fail the whole operation
  }
};

const formatDateForInput = (value) => {
  if (!value) return '';
  return String(value).split('T')[0];
};

const formatDocumentStatus = (value) => {
  const normalized = String(value || '').trim();
  if (normalized === 'bost_Open') return 'Open';
  if (normalized === 'bost_Close') return 'Closed';
  if (normalized === 'bost_Paid') return 'Paid';
  return normalized;
};

const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';

const toOptionalNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toRequiredNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toRequiredString = (value, fallback = '') => {
  const normalized = value == null ? '' : String(value).trim();
  return normalized || fallback;
};

const NUMBER_DATA_TYPES = new Set([
  'bigint',
  'decimal',
  'float',
  'int',
  'money',
  'numeric',
  'real',
  'smallint',
  'smallmoney',
  'tinyint',
]);

const DATE_DATA_TYPES = new Set([
  'date',
  'datetime',
  'datetime2',
  'datetimeoffset',
  'smalldatetime',
  'time',
]);

const SALES_ORDER_LINE_UDF_MAPPINGS = [
  { sapField: 'U_SPLRBT', getValue: (line) => line.specialRebate },
  { sapField: 'U_COMPRC', getValue: (line) => line.commission },
  { sapField: 'U_S_BrokPerQty', getValue: (line) => line.sellerBrokeragePerQty },
  { sapField: 'U_Unit_Price', getValue: (line) => line.unitPriceUdf ?? line.unitPrice },
  { sapField: 'U_Brok_Seller', getValue: (line) => line.sellerBrokerage },
  { sapField: 'U_Brok_Buyer', getValue: (line) => line.buyerBrokerage },
  { sapField: 'U_Buyer_Delivery', getValue: (line) => line.buyerDelivery },
  { sapField: 'U_Seller_Delivery', getValue: (line) => line.sellerDelivery },
  { sapField: 'U_Buyer_Payment_Terms', getValue: (line) => line.buyerPaymentTerms },
  { sapField: 'U_Seller_Payment_Terms', getValue: (line) => line.sellerPaymentTerms },
  { sapField: 'U_Buyer_Quality', getValue: (line) => line.buyerQuality },
  { sapField: 'U_Seller_Quality', getValue: (line) => line.sellerQuality },
  { sapField: 'U_Buyer_Price', getValue: (line) => line.buyerPrice },
  { sapField: 'U_Seller_Price', getValue: (line) => line.sellerPrice },
  { sapField: 'U_Buyer_SPINS', getValue: (line) => line.buyerSpecialInstruction },
  { sapField: 'U_Seller_SPINS', getValue: (line) => line.sellerSpecialInstruction },
  { sapField: 'U_Sel_Brok_AP', getValue: (line) => line.sellerBrokerageAmtPer },
  { sapField: 'U_Seller_Brok_Per', getValue: (line) => line.sellerBrokeragePercent },
  { sapField: 'U_Buyer_Bill_Disc', getValue: (line) => line.buyerBillDiscount },
  { sapField: 'U_Seller_Bill_Disc', getValue: (line) => line.sellerBillDiscount },
  { sapField: 'U_SELLTCODE', getValue: (line) => line.stcode },
  { sapField: 'U_S_Item', getValue: (line) => line.sellerItem },
  { sapField: 'U_S_Qty', getValue: (line) => line.sellerQty ?? line.quantity },
  { sapField: 'U_Freight_pur', getValue: (line) => line.freightPurchase },
  { sapField: 'U_Freight_sales', getValue: (line) => line.freightSales },
  { sapField: 'U_Fr_trans', getValue: (line) => line.freightProvider },
  { sapField: 'U_Fr_trans_name', getValue: (line) => line.freightProviderName },
  { sapField: 'U_BDNum', getValue: (line) => line.brokerageNumber },
];

const setOptionalString = (target, field, value) => {
  if (hasValue(value)) {
    target[field] = String(value).trim();
  }
};

const setOptionalNumber = (target, field, value) => {
  const parsed = toOptionalNumber(value);
  if (parsed !== undefined) {
    target[field] = parsed;
  }
};

const coerceValueForSqlType = (value, sqlDataType) => {
  if (!hasValue(value)) return undefined;

  const normalizedType = String(sqlDataType || '').trim().toLowerCase();

  if (NUMBER_DATA_TYPES.has(normalizedType)) {
    return toOptionalNumber(value);
  }

  if (DATE_DATA_TYPES.has(normalizedType)) {
    return formatDateForInput(value);
  }

  return String(value).trim();
};

const setValidatedRdr1Field = (target, fieldMetadata, fieldName, value) => {
  const sqlDataType = fieldMetadata?.[fieldName];
  if (!sqlDataType) return;

  const coercedValue = coerceValueForSqlType(value, sqlDataType);
  if (coercedValue !== undefined) {
    target[fieldName] = coercedValue;
  }
};

const buildDocumentLinePayload = async (line = {}, context = {}) => {
  const fieldMetadata = context.rdr1FieldMetadata || {};
  const documentLine = {
    ItemCode: toRequiredString(line.itemNo),
    Quantity: toRequiredNumber(line.quantity, 0),
    UnitPrice: toRequiredNumber(line.unitPrice, 0),
    WarehouseCode: toRequiredString(line.whse, '01'),
    TaxCode: toRequiredString(line.taxCode, 'IGST5'),
  };

  if (context.includeLineNum && line.lineNum != null && line.lineNum !== '') {
    documentLine.LineNum = Number(line.lineNum);
  }

  const resolvedUomEntry = await salesOrderDb.resolveSalesOrderLineUomEntry(
    documentLine.ItemCode,
    line.uomEntry ?? line.UoMEntry ?? line.uomCode,
  );
  if (resolvedUomEntry !== null && resolvedUomEntry !== undefined) {
    documentLine.UoMEntry = resolvedUomEntry;
  }

  if (hasValue(line.stdDiscount)) {
    const discountPercent = toOptionalNumber(line.stdDiscount);
    if (discountPercent !== undefined) {
      documentLine.DiscountPercent = discountPercent;
    }
  }

  if (hasValue(line.distRule)) {
    documentLine.CostingCode = String(line.distRule).trim();
  }

  if (hasValue(line.freeText)) {
    documentLine.FreeText = String(line.freeText).trim();
  }

  setValidatedRdr1Field(documentLine, fieldMetadata, 'CountryOrg', line.countryOfOrigin);

  const sacEntry = toOptionalNumber(line.sacCode);
  if (sacEntry !== undefined) {
    documentLine.SACEntry = sacEntry;
  }

  for (const mapping of SALES_ORDER_LINE_UDF_MAPPINGS) {
    setValidatedRdr1Field(documentLine, fieldMetadata, mapping.sapField, mapping.getValue(line));
  }

  if (hasValue(line.baseEntry) && hasValue(line.baseType) && line.baseLine !== undefined && line.baseLine !== null) {
    documentLine.BaseEntry = Number(line.baseEntry);
    documentLine.BaseType = Number(line.baseType);
    documentLine.BaseLine = Number(line.baseLine);
  }

  if (line.batches && line.batches.length > 0) {
    documentLine.BatchNumbers = line.batches.map((batch) => ({
      BatchNumber: batch.batchNumber,
      Quantity: Number(batch.quantity),
    }));
  }

  return documentLine;
};

const buildDocumentLinesPayload = async (lines = [], includeLineNum = false) => {
  const rdr1FieldMetadata = await salesOrderDb.getSalesOrderLineFieldMetadata();

  return Promise.all(
    (lines || []).map((line) => buildDocumentLinePayload(line, { rdr1FieldMetadata, includeLineNum }))
  );
};

// ───────── REFERENCE DATA (USING ODBC) ─────────

const getReferenceData = async (companyId) => {
  try {
    // Use ODBC/Direct SQL for GET operations
    const data = await salesOrderDb.getReferenceData();
    console.log("Reference data:",data.tax_codes);
    return data;
  } catch (error) {
    console.error('[Sales Order Service] Failed to load reference data via ODBC:', error);
    // Return empty structure with warnings
    return {
      company: '',
      customers: [],
      vendors: [],
      items: [],
      warehouses: [],
      warehouse_addresses: [],
      payment_terms: [],
      shipping_types: [],
      branches: [],
      countries: [],
      distribution_rules: [],
      tax_codes: [],
      uom_groups: [],
      quality_options: { buyer: [], seller: [] },
      price_options: { buyer: [], seller: [] },
      contacts: [],
      pay_to_addresses: [],
      company_address: {},
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
    const data = await salesOrderDb.getCustomerDetails(customerCode);
    return data;
  } catch (error) {
    console.error('[Sales Order Service] Failed to load customer details via ODBC:', error);
    return {
      contacts: [],
      bill_to_addresses: [],
      pay_to_addresses: [],
    };
  }
};

// ───────── SALES ORDER LIST (USING ODBC) ─────────

const getSalesOrderList = async ({
  query = '',
  openOnly = true,
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
    // Use ODBC for reading list
    const result = await salesOrderDb.getSalesOrderList({
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
    console.error('[Sales Order Service] Failed to load sales order list via ODBC:', error);
    return {
      orders: [],
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
  } catch (error) {
    console.error('[Sales Order Service] Failed to load customer filter options via ODBC:', error);
    return { options: [] };
  }
};

const getSalesOrderFilterOptions = async ({
  field = '',
  query = '',
  openOnly = true,
  docNum = '',
  customerCode = '',
  customerName = '',
  status = '',
  postingDateFrom = '',
  postingDateTo = '',
  top,
} = {}) => {
  try {
    return await salesOrderDb.getSalesOrderFilterOptions({
      field,
      query,
      openOnly,
      docNum,
      customerCode,
      customerName,
      status,
      postingDateFrom,
      postingDateTo,
      top,
    });
  } catch (error) {
    console.error('[Sales Order Service] Failed to load sales order filter options via ODBC:', error);
    return { options: [] };
  }
};

// ───────── GET SINGLE ORDER (USING ODBC) ─────────

const getSalesOrder = async (docEntry) => {
  try {
    // Use ODBC for reading single order
    const result = await salesOrderDb.getSalesOrder(docEntry);
    return result;
  } catch (error) {
    console.error('[Sales Order Service] Failed to load sales order via ODBC:', error);
    throw error;
  }
};

// ───────── CREATE ORDER (USING SERVICE LAYER) ─────────

const submitSalesOrder = async (payload) => {
  try {
    console.log("═══════════════════════════════════════════════════");
    console.log("🔥 CREATE - RECEIVED PAYLOAD FROM FRONTEND:");
    console.log("  salesEmployee:", payload.header.salesEmployee);
    console.log("  purchaser:", payload.header.purchaser);
    console.log("  owner:", payload.header.owner);
    console.log("═══════════════════════════════════════════════════");
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Load ODBC Master Data
    // ═══════════════════════════════════════════════════════════════
    const refData = await salesOrderDb.getReferenceData();
    const salesEmployees = refData.sales_employees || [];
    const owners = refData.owners || [];
    
    console.log('📚 ODBC Data Loaded:');
    console.log('  - Sales Employees:', salesEmployees.length);
    console.log('  - Owners:', owners.length);
    if (salesEmployees.length > 0) {
      console.log('  - Available Sales Employees:', salesEmployees.map(e => `${e.SlpName} (${e.SlpCode})`).join(', '));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Determine Final Sales Employee Input (Fallback Logic)
    // ═══════════════════════════════════════════════════════════════
    let salesEmployeeInput = payload.header.salesEmployee;
    
    // Apply fallback: if salesEmployee is -1 or empty, use purchaser
    if (!salesEmployeeInput || salesEmployeeInput === '-1' || salesEmployeeInput === -1) {
      console.log('⚠️  salesEmployee is empty or -1, falling back to purchaser');
      salesEmployeeInput = payload.header.purchaser;
    }
    
    console.log('🎯 Final Sales Employee Input:', salesEmployeeInput);
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Convert Name → SlpCode using ODBC Data
    // ═══════════════════════════════════════════════════════════════
    const SlpCode = await convertSalesEmployeeToCode(salesEmployeeInput, salesEmployees);
    console.log('✅ Resolved SlpCode:', SlpCode);

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Convert Owner Name → empID using ODBC Data
    // ═══════════════════════════════════════════════════════════════
    const OwnerCode = await convertOwnerToCode(payload.header.owner, owners);
    console.log('✅ Resolved OwnerCode:', OwnerCode);

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Extract Remarks and Freight
    // ═══════════════════════════════════════════════════════════════
    const Remarks = payload.header.otherInstruction || payload.header.remarks || '';
    const Freight = payload.header.freight ? Number(payload.header.freight) : 0;
    const documentAdditionalExpenses = buildDocumentAdditionalExpenses(payload.freightCharges);
    const documentLines = await buildDocumentLinesPayload(payload.lines);

    console.log("═══════════════════════════════════════════════════");
    console.log("🔥 FINAL CONVERTED VALUES:");
    console.log({
      SalesPersonCode: SlpCode,
      DocumentsOwner: OwnerCode,
      Comments: Remarks,
      HeaderFreightInput: Freight,
      DocumentAdditionalExpenses: documentAdditionalExpenses.length
    });
    console.log("═══════════════════════════════════════════════════");
    
    // Transform payload to SAP format
    const sapPayload = {
      CardCode: payload.header.vendor.trim(),

      // Series for auto-numbering - only include if explicitly provided and valid
      ...(payload.header.series && Number(payload.header.series) > 0 ? { Series: Number(payload.header.series) } : {}),

      DocDate: payload.header.postingDate,
      DocDueDate: payload.header.deliveryDate,
      TaxDate: payload.header.documentDate,

      ContactPersonCode: payload.header.contactPerson ? Number(payload.header.contactPerson) : undefined,
      
      // ✅ Branch mapping - try multiple field names
      BPLId: normalizeBranchId(payload.header.branch),
      BPL_IDAssignedToInvoice: normalizeBranchId(payload.header.branch),

      PaymentGroupCode: payload.header.paymentTerms ? Number(payload.header.paymentTerms) : undefined,

      // ✅ Add Sales Employee if present (converted from name to code)
      ...(SlpCode !== null && SlpCode !== undefined ? { SalesPersonCode: SlpCode } : {}),

      // ✅ Add Owner if present (converted from name to empID)
      ...(OwnerCode !== null && OwnerCode !== undefined ? { DocumentsOwner: OwnerCode } : {}),

      // ✅ Add Remarks
      ...(Remarks ? { Comments: Remarks } : {}),

      // ✅ Add Freight
      ...(documentAdditionalExpenses.length > 0 ? { DocumentAdditionalExpenses: documentAdditionalExpenses } : {}),

      // ✅ Add NumAtCard for customer reference
      NumAtCard: payload.header.customerRefNo || undefined,

      DocumentLines: documentLines
    };

    // ✅ Only add U_PlaceOfSupply if it has a value (optional UDF)
    if (payload.header.placeOfSupply) {
      sapPayload.U_PlaceOfSupply = payload.header.placeOfSupply;
    }

    Object.assign(sapPayload, payload.header_udfs || {});

    console.log("═══════════════════════════════════════════════════");
    console.log("🔥 SAP PAYLOAD TO BE SENT:");
    console.log(JSON.stringify(sapPayload, null, 2));
    console.log("═══════════════════════════════════════════════════");

    // Use Service Layer for POST operations
    const response = await sapService.request({
      method: 'post',
      url: '/Orders',
      data: sapPayload,
    });

    console.log("═══════════════════════════════════════════════════");
    console.log("✅ SAP RESPONSE:");
    console.log(JSON.stringify(response.data, null, 2));
    console.log("═══════════════════════════════════════════════════");

    return {
      message: 'Sales order created successfully',
      doc_num: response.data?.DocNum,
      doc_entry: response.data?.DocEntry,
      DocNum: response.data?.DocNum,
      DocEntry: response.data?.DocEntry,
    };
  } catch (error) {
    console.error('═══════════════════════════════════════════════════');
    console.error('❌ SAP ERROR RESPONSE:');
    console.error('Status:', error.response?.status);
    console.error('Status Text:', error.response?.statusText);
    console.error('Error Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('═══════════════════════════════════════════════════');
    
    // Extract meaningful error message from SAP
    let errorMessage = 'Sales order submission failed.';
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

// ───────── UPDATE ORDER (USING SERVICE LAYER) ─────────

const updateSalesOrder = async (docEntry, payload) => {
  try {
    console.log("═══════════════════════════════════════════════════");
    console.log("🔥 UPDATE - RECEIVED PAYLOAD FROM FRONTEND:");
    console.log("  DocEntry:", docEntry);
    console.log("  salesEmployee:", payload.header.salesEmployee);
    console.log("  purchaser:", payload.header.purchaser);
    console.log("  owner:", payload.header.owner);
    console.log("═══════════════════════════════════════════════════");

    // ═══════════════════════════════════════════════════════════════
    // STEP 1: Load ODBC Master Data
    // ═══════════════════════════════════════════════════════════════
    const refData = await salesOrderDb.getReferenceData();
    const salesEmployees = refData.sales_employees || [];
    const owners = refData.owners || [];
    
    console.log('📚 ODBC Data Loaded:');
    console.log('  - Sales Employees:', salesEmployees.length);
    console.log('  - Owners:', owners.length);
    if (salesEmployees.length > 0) {
      console.log('  - Available Sales Employees:', salesEmployees.map(e => `${e.SlpName} (${e.SlpCode})`).join(', '));
    }
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 2: Determine Final Sales Employee Input (Fallback Logic)
    // ═══════════════════════════════════════════════════════════════
    let salesInput = payload.header.salesEmployee;
    
    // Apply fallback: if salesEmployee is -1 or empty, use purchaser
    if (!salesInput || salesInput === '-1' || salesInput === -1) {
      console.log('⚠️  salesEmployee is empty or -1, falling back to purchaser');
      salesInput = payload.header.purchaser;
    }
    
    console.log('🎯 Final Sales Employee Input:', salesInput);
    
    // ═══════════════════════════════════════════════════════════════
    // STEP 3: Convert Name → SlpCode using ODBC Data
    // ═══════════════════════════════════════════════════════════════
    const SlpCode = await convertSalesEmployeeToCode(salesInput, salesEmployees);
    console.log('✅ Resolved SlpCode:', SlpCode);

    // ═══════════════════════════════════════════════════════════════
    // STEP 4: Convert Owner Name → empID using ODBC Data
    // ═══════════════════════════════════════════════════════════════
    const OwnerCode = await convertOwnerToCode(payload.header.owner, owners);
    console.log('✅ Resolved OwnerCode:', OwnerCode);

    // ═══════════════════════════════════════════════════════════════
    // STEP 5: Extract Remarks and Freight
    // ═══════════════════════════════════════════════════════════════
    const Remarks = payload.header.otherInstruction || payload.header.remarks || '';
    const Freight = Number(payload.header.freight) || 0;
    const documentAdditionalExpenses = buildDocumentAdditionalExpenses(payload.freightCharges);
    const documentLines = await buildDocumentLinesPayload(payload.lines, true);

    console.log("═══════════════════════════════════════════════════");
    console.log("🔥 FINAL CONVERTED VALUES:");
    console.log({
      SalesPersonCode: SlpCode,
      DocumentsOwner: OwnerCode,
      Comments: Remarks,
      HeaderFreightInput: Freight,
      DocumentAdditionalExpenses: documentAdditionalExpenses.length
    });
    console.log("═══════════════════════════════════════════════════");

    // =========================
    // ✅ BUILD PAYLOAD
    // =========================
    const sapPayload = {
      CardCode: payload.header.vendor?.trim(),

      DocDate: payload.header.postingDate,
      DocDueDate: payload.header.deliveryDate,
      TaxDate: payload.header.documentDate,

      ContactPersonCode: payload.header.contactPerson
        ? Number(payload.header.contactPerson)
        : undefined,

      BPL_IDAssignedToInvoice: payload.header.branch
        ? Number(payload.header.branch)
        : undefined,

      PaymentGroupCode: payload.header.paymentTerms
        ? Number(payload.header.paymentTerms)
        : undefined,

      ...(SlpCode !== null && SlpCode !== undefined && { SalesPersonCode: SlpCode }),
      ...(OwnerCode !== null && OwnerCode !== undefined && { DocumentsOwner: OwnerCode }),
      ...(Remarks && { Comments: Remarks }),
      ...(documentAdditionalExpenses.length > 0 ? { DocumentAdditionalExpenses: documentAdditionalExpenses } : {}),

      DocumentLines: documentLines
    };

    // =========================
    // ✅ OPTIONAL UDF
    // =========================
    if (payload.header.placeOfSupply) {
      sapPayload.U_PlaceOfSupply = payload.header.placeOfSupply;
    }

    Object.assign(sapPayload, payload.header_udfs || {});

    console.log("🔥 FINAL SAP PAYLOAD:", JSON.stringify(sapPayload, null, 2));

    // =========================
    // ✅ PATCH CALL
    // =========================
    const response = await sapService.request({
      method: 'patch',
      url: `/Orders(${docEntry})`,
      data: sapPayload,
    });

    console.log("═══════════════════════════════════════════════════");
    console.log("✅ SAP UPDATE RESPONSE:");
    console.log(JSON.stringify(response.data, null, 2));
    console.log("═══════════════════════════════════════════════════");

    return {
      message: 'Sales order updated successfully',
      doc_entry: docEntry,
    };

  } catch (error) {
    console.error("❌ UPDATE ERROR:", error.response?.data || error.message);
    throw error;
  }
};

// ───────── DOCUMENT SERIES ─────────

const getDocumentSeries = async (targetDate = null) => {
  try {
    const series = await salesOrderDb.getDocumentSeries(targetDate);
    return { series };
  } catch (error) {
    console.error('[Sales Order Service] Failed to load document series:', error);
    return { series: [] };
  }
};

const getNextNumber = async (seriesParam) => {
  try {
    const series = Number(seriesParam);
    if (isNaN(series)) {
      throw new Error('Invalid series number');
    }
    const result = await salesOrderDb.getNextNumber(series);
    return result;
  } catch (error) {
    console.error('[Sales Order Service] Failed to get next number:', error);
    throw error;
  }
};

const getStateFromAddress = async (cardCode, addressCode) => {
  try {
    const result = await salesOrderDb.getStateFromAddress(cardCode, addressCode);
    return result;
  } catch (error) {
    console.error('[Sales Order Service] Failed to get state from address:', error);
    return { state: '' };
  }
};

const getItemsForModal = async () => {
  try {
    const items = await salesOrderDb.getItemsForModal();
    return { items };
  } catch (error) {
    console.error('[Sales Order Service] Failed to get items for modal:', error);
    return { items: [] };
  }
};

const getFreightCharges = async (docEntry) => {
  try {
    const freightCharges = await salesOrderDb.getFreightCharges(docEntry);
    return { freightCharges };
  } catch (error) {
    console.error('[Sales Order Service] Failed to get freight charges:', error);
    return { freightCharges: [] };
  }
};

const getSalesOrderPrintLayouts = async () => {
  try {
    const layouts = await salesOrderDb.getSalesOrderPrintLayouts();
    return { layouts };
  } catch (error) {
    console.error('[Sales Order Service] Failed to get print layouts:', error);
    return { layouts: [] };
  }
};

const createLookupValue = async ({ field, value, description }) => {
  const fieldMap = {
    buyerQuality: 'U_Buyer_Quality',
    sellerQuality: 'U_Seller_Quality',
    buyerPrice: 'U_Buyer_Price',
    sellerPrice: 'U_Seller_Price',
  };

  const aliasId = fieldMap[String(field || '').trim()] || String(field || '').trim();
  if (!aliasId) {
    throw new Error('Lookup field is required.');
  }

  const option = await salesOrderDb.createLookupValue(aliasId, value, description);
  const options = await salesOrderDb.getLookupValues(aliasId);

  return { option, options };
};

module.exports = {
  getReferenceData,
  getCustomerDetails,
  getCustomerFilterOptions,
  getSalesOrderList,
  getSalesOrderFilterOptions,
  getSalesOrder,
  submitSalesOrder,
  updateSalesOrder,
  getDocumentSeries,
  getNextNumber,
  getStateFromAddress,
  getItemsForModal,
  getFreightCharges,
  getSalesOrderPrintLayouts,
  createLookupValue,
  getOpenSalesOrders:          async () => { try { return { documents: await salesOrderDb.getOpenSalesOrders() }; } catch(e) { return { documents: [] }; } },
  getSalesOrderForCopy:        async (d) => salesOrderDb.getSalesOrderForCopy(d),
  getOpenSalesQuotations:      async () => { try { const sq = require('./salesQuotationDbService'); return { documents: await sq.getOpenSalesQuotations() }; } catch(e) { return { documents: [] }; } },
  getSalesQuotationForCopy:    async (d) => { const sq = require('./salesQuotationDbService'); return sq.getSalesQuotationForCopy(d); },
};
