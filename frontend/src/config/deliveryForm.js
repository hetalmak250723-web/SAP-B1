const FORM_SETTINGS_STORAGE_KEY = 'sapb1.delivery.formSettings.v1';

const HEADER_UDF_DEFINITIONS = [
  { key: 'U_SCharge', label: 'SaudaCharge', type: 'text', defaultValue: '' },
  { key: 'U_TRNS', label: 'Transporter', type: 'text', defaultValue: '' },
  { key: 'U_LRNO', label: 'LR No', type: 'text', defaultValue: '' },
  { key: 'U_LRDT', label: 'LR Date', type: 'date', defaultValue: '' },
  { key: 'U_DSTN', label: 'Destination', type: 'text', defaultValue: '' },
  { key: 'U_DSTNADD', label: 'Destination Address', type: 'text', defaultValue: '' },
  { key: 'U_FDSTN', label: 'Final Destination', type: 'text', defaultValue: '' },
  { key: 'U_VEHNO', label: 'Vehicle No', type: 'text', defaultValue: '' },
  { key: 'U_DOCTHR', label: 'Dispatch Through', type: 'text', defaultValue: '' },
  { key: 'U_UOM', label: 'UOM', type: 'text', defaultValue: '' },
  { key: 'U_Price', label: 'Price', type: 'text', defaultValue: '' },
  { key: 'U_SAmount', label: 'Sauda Amount', type: 'text', defaultValue: '' },
  { key: 'U_B_FromDate', label: 'B_FromDate', type: 'date', defaultValue: '' },
  { key: 'U_B_ToDate', label: 'B_ToDate', type: 'date', defaultValue: '' },
  { key: 'U_Seller_Code', label: 'Seller Code', type: 'text', defaultValue: '' },
  { key: 'U_Seller_Name', label: 'Seller Name', type: 'text', defaultValue: '' },
  { key: 'U_Seller_AddressId', label: 'Seller Address Id (Ship From)', type: 'text', defaultValue: '' },
  { key: 'U_Seller_Address', label: 'Seller Address', type: 'textarea', defaultValue: '' },
  { key: 'U_Old_Soda_Nodh_No', label: 'Old Soda Nodh No.', type: 'text', defaultValue: '' },
  { key: 'U_Old_Soda_Nodh_Date', label: 'Old Soda Nodh Date', type: 'date', defaultValue: '' },
  {
    key: 'U_Canceled',
    label: 'Canceled IRN',
    type: 'select',
    defaultValue: '',
    options: [
      { value: '', label: '' },
      { value: 'Y', label: 'Yes' },
      { value: 'N', label: 'No' },
    ],
  },
  { key: 'U_TrfId', label: 'Transporter ID', type: 'text', defaultValue: '' },
  { key: 'U_TrfName', label: 'Transporter Name', type: 'text', defaultValue: '' },
  { key: 'U_TrfVehi', label: 'Vehicle No', type: 'text', defaultValue: '' },
  { key: 'U_TrfDist', label: 'Distance', type: 'text', defaultValue: '' },
  {
    key: 'U_TrfMode',
    label: 'Transporter Mode',
    type: 'select',
    defaultValue: '',
    options: [
      { value: '', label: '' },
      { value: '1', label: 'Road' },
      { value: '2', label: 'Rail' },
      { value: '3', label: 'Air' },
      { value: '4', label: 'Ship' },
    ],
  },
  {
    key: 'U_TrfVType',
    label: 'Transporter Vehicle Type',
    type: 'select',
    defaultValue: '',
    options: [
      { value: '', label: '' },
      { value: 'R', label: 'Regular' },
      { value: 'O', label: 'ODC' },
    ],
  },
  { key: 'U_AckNo', label: 'Acknowledgement No', type: 'text', defaultValue: '' },
  { key: 'U_AckDt', label: 'Acknowledgement Dt', type: 'text', defaultValue: '' },
  { key: 'U_CanDt', label: 'Cancel Dt', type: 'text', defaultValue: '' },
  { key: 'U_QrCode', label: 'Signed QRCode', type: 'textarea', defaultValue: '' },
  { key: 'U_SigInv', label: 'Signed Invoice', type: 'textarea', defaultValue: '' },
  { key: 'U_EwbDt', label: 'E-Way Date.', type: 'text', defaultValue: '' },
  { key: 'U_EwbVliDt', label: 'E-Way ValidTill Date.', type: 'text', defaultValue: '' },
  {
    key: 'U_EWayBCan',
    label: 'Canceled EWayBill',
    type: 'select',
    defaultValue: '',
    options: [
      { value: '', label: '' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
  },
  { key: 'U_TrfCode', label: 'Transporter Code', type: 'text', defaultValue: '' },
  {
    key: 'U_MultiVeh',
    label: 'Multiple Vehicle',
    type: 'select',
    defaultValue: '',
    options: [
      { value: '', label: '' },
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ],
  },
];

const ROW_UDF_DEFINITIONS = [
  { key: 'U_Loc', label: 'Loc', type: 'text', defaultValue: '' },
  { key: 'U_Branch', label: 'Branch', type: 'text', defaultValue: '' },
  { key: 'U_PackingStatus', label: 'Packing Status', type: 'select', defaultValue: 'Pending', options: ['Pending', 'Packed', 'Shipped'] },
];

const BASE_MATRIX_COLUMNS = [
  { key: 'itemNo', label: 'Item No.', visible: true },
  { key: 'itemDescription', label: 'Item Description', visible: true },
  { key: 'sellerQuality', label: 'Seller - Quality', visible: true },
  { key: 'buyerQuality', label: 'Buyer - Quality', visible: true },
  { key: 'quantity', label: 'Quantity', visible: true },
  { key: 'unitPrice', label: 'Unit Price', visible: true },
  { key: 'uomCode', label: 'UoM', visible: true },
  { key: 'sellerPrice', label: 'Seller - Price', visible: true },
  { key: 'buyerPrice', label: 'Buyer - Price', visible: true },
  { key: 'sellerDelivery', label: 'Seller - Delivery', visible: true },
  { key: 'buyerDelivery', label: 'Buyer - Delivery', visible: true },
  { key: 'sellerBrokerageAmtPer', label: 'Seller Brokerage(Amt./Per)', visible: true },
  { key: 'sellerBrokeragePercent', label: 'Seller Brokerage in Percentage', visible: true },
  { key: 'sellerBrokerage', label: 'Seller Brokerage', visible: true },
  { key: 'buyerBrokerage', label: 'Buyer Brokerage', visible: true },
  { key: 'deliveredQty', label: 'Delivered Qty', visible: true },
  { key: 'stdDiscount', label: 'Discount %', visible: true },
  { key: 'stcode', label: 'STCODE', visible: true },
  { key: 'taxCode', label: 'Tax Code', visible: true },
  { key: 'taxAmount', label: 'Tax Amount (LC)', visible: true },
  { key: 'totalLC', label: 'Total (LC)', visible: true },
  { key: 'whse', label: 'Whse', visible: true },
  { key: 'distRule', label: 'Distr. Rule', visible: true },
  { key: 'openQty', label: 'Open Qty', visible: true },
  { key: 'loc', label: 'Loc.', visible: true },
  { key: 'branch', label: 'Branch', visible: true },
  { key: 'hsnCode', label: 'HSN', visible: true },
  { key: 'unitPriceRepeat', label: 'Unit Price', visible: true },
  { key: 'sacCode', label: 'SAC', visible: true },
  { key: 'specialRebate', label: 'Special Rebate', visible: false },
  { key: 'commission', label: 'Commision', visible: false },
  { key: 'sellerBrokeragePerQty', label: 'BrokPerQty', visible: false },
  { key: 'buyerPaymentTerms', label: 'Buyer - Terms of Payment', visible: false },
  { key: 'buyerSpecialInstruction', label: 'Buyer - Special Instruction', visible: false },
  { key: 'sellerSpecialInstruction', label: 'Seller - Special Instruction', visible: false },
  { key: 'buyerBillDiscount', label: 'Buyer Bill Discount', visible: false },
  { key: 'sellerBillDiscount', label: 'Seller Bill Discount', visible: false },
  { key: 'sellerItem', label: 'S_Item', visible: false },
  { key: 'sellerQty', label: 'S_Qty', visible: false },
  { key: 'freightPurchase', label: 'Freight Purchase', visible: false },
  { key: 'freightSales', label: 'Freight Sales', visible: false },
  { key: 'freightProvider', label: 'Freight Provider', visible: false },
  { key: 'freightProviderName', label: 'Freight Provider Name', visible: false },
  { key: 'brokerageNumber', label: 'Brokerage Number', visible: false },
  { key: 'batch', label: 'Batch', visible: true },
];

const createUdfState = (definitions) =>
  definitions.reduce((acc, field) => {
    acc[field.key] = field.defaultValue;
    return acc;
  }, {});

const buildVisibilitySettings = (definitions) =>
  definitions.reduce((acc, field) => {
    acc[field.key] = { visible: field.visible !== undefined ? field.visible : true, active: true };
    return acc;
  }, {});

const createDefaultFormSettings = () => ({
  headerUdfs: buildVisibilitySettings(HEADER_UDF_DEFINITIONS),
  matrixColumns: buildVisibilitySettings(BASE_MATRIX_COLUMNS),
  rowUdfs: buildVisibilitySettings(ROW_UDF_DEFINITIONS),
});

const mergeNestedSettings = (defaults, saved = {}) =>
  Object.keys(defaults).reduce((acc, groupKey) => {
    acc[groupKey] = {
      ...defaults[groupKey],
      ...(saved[groupKey] || {}),
    };
    return acc;
  }, {});

const readSavedFormSettings = () => {
  const defaults = createDefaultFormSettings();

  try {
    const raw = localStorage.getItem(FORM_SETTINGS_STORAGE_KEY);
    if (!raw) return defaults;
    return mergeNestedSettings(defaults, JSON.parse(raw));
  } catch (error) {
    return defaults;
  }
};

export {
  BASE_MATRIX_COLUMNS,
  FORM_SETTINGS_STORAGE_KEY,
  HEADER_UDF_DEFINITIONS,
  ROW_UDF_DEFINITIONS,
  createDefaultFormSettings,
  createUdfState,
  readSavedFormSettings,
};
