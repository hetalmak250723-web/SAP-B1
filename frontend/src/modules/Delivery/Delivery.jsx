import React, { useEffect, useState, useCallback, useRef } from 'react';
import './styles/Delivery.css';
import { useLocation, useNavigate } from 'react-router-dom';
import FormSettingsPanel from '../../components/purchase-order/FormSettingsPanel';
import HeaderUdfSidebar from '../../components/purchase-order/HeaderUdfSidebar';
import ContentsTab from './components/ContentsTab';
import LogisticsTab from './components/LogisticsTab';
import AccountingTab from './components/AccountingTab';
import TaxTab from './components/TaxTab';
import ElectronicDocumentsTab from './components/ElectronicDocumentsTab';
import AttachmentsTab from './components/AttachmentsTab';
import AddressModal from './components/AddressModal';
import TaxInfoModal from './components/TaxInfoModal';
import BatchAllocationModal from './components/BatchAllocationModal';
import BusinessPartnerModal from '../sales-order/components/BusinessPartnerModal';
import StateSelectionModal from '../sales-order/components/StateSelectionModal';
import HSNCodeModal from './components/HSNCodeModal';
import ItemSelectionModal from './components/ItemSelectionModal';
import QualitySelectionModal from '../sales-order/components/QualitySelectionModal';
import FreightChargesModal from '../../components/freight/FreightChargesModal';
import { summarizeFreightRows } from '../../components/freight/freightUtils';
import CopyFromModal from './components/CopyFromModal';
import CopyToModal from './components/CopyToModal';
import { filterWarehousesByBranch } from '../../utils/warehouseBranch';
import { getDefaultSeriesForCurrentYear } from '../../utils/seriesDefaults';
import {
  BATCH_QTY_TOLERANCE,
  getLineUomFactor,
  getRequiredBatchQty,
  sumBatchQty,
} from '../../utils/batchQuantity';
import { determineTaxCode, recalculateAllTaxCodes, getGSTTypeLabel } from '../../utils/taxEngine';
import {
  fetchDeliveryReferenceData,
  fetchDeliveryByDocEntry,
  fetchDeliveries,
  fetchDeliveryCustomerDetails,
  fetchItemsForModal,
  fetchUomConversionFactor,
  submitDelivery,
  updateDelivery,
  fetchDocumentSeries,
  fetchNextNumber,
  fetchStateFromWarehouse,
  fetchCompanyState,
  fetchOpenSalesOrders,
  fetchSalesOrderForCopy,
  fetchOpenSalesQuotationsForDelivery,
  fetchSalesQuotationForDeliveryCopy,
  fetchOpenReturnsForDelivery,
  fetchReturnForDeliveryCopy,
  fetchOpenBlanketAgreementsForDelivery,
  fetchBlanketAgreementForDeliveryCopy,
  fetchBatchesByItem,
  fetchItemManagementType,
  fetchFreightCharges,
  validateDeliveryDocument,
  createDeliveryLookupValue
} from '../../api/deliveryApi';
import { fetchHSNCodes, fetchHSNCodeFromItem } from '../../api/hsnCodeApi';
import { SALES_ORDER_COMPANY_ID } from '../../config/appConfig';
import { deliveryCopyFromApi, normaliseDocumentHeader, normaliseDocumentLine, BASE_TYPE } from '../../api/copyFromApi';
import {
  FORM_SETTINGS_STORAGE_KEY,
  HEADER_UDF_DEFINITIONS,
  ROW_UDF_DEFINITIONS,
  BASE_MATRIX_COLUMNS,
  createUdfState,
  readSavedFormSettings,
} from '../../config/deliveryForm';

// ─── helpers ─────────────────────────────────────────────────────────────────
const getErrMsg = (e, fb) => {
  const d = e?.response?.data?.detail;
  if (typeof d === 'string' && d.trim()) return d;
  if (d?.error?.message) return d.error.message;
  if (d?.message) return d.message;
  return e?.message || fb;
};
const today = () => new Date().toISOString().split('T')[0];
const parseNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const roundTo = (v, d) => { const f = 10 ** Math.max(d, 0); return Math.round((v + Number.EPSILON) * f) / f; };
const fmtDec = (v, d) => { if (v === '' || v == null) return ''; const n = Number(v); return Number.isNaN(n) ? '' : n.toFixed(Math.max(d, 0)); };
const sanitize = (v, d) => {
  const c = String(v ?? '').replace(/[^\d.-]/g, '').replace(/(?!^)-/g, '').replace(/^(-?)\./, '$10.').replace(/(\..*)\./g, '$1');
  if (!c) return '';
  if (!c.includes('.')) return c;
  const [w, f] = c.split('.');
  return `${w}.${(f || '').slice(0, Math.max(d, 0))}`;
};
const fmtAddr = (a) => {
  if (!a) return '';
  return [[a.Street, a.StreetNo], [a.Block, a.Building, a.Address2, a.Address3],
  [a.City, a.County, a.State, a.ZipCode], [a.Country]]
    .map(p => p.filter(Boolean).join(', ')).filter(Boolean).join('\n');
};
const isBatchManaged = (item) => {
  if (!item) return false;
  
  const batchManagedValue = item?.BatchManaged || item?.ManBtchNum || '';
  const isManaged = String(batchManagedValue).toUpperCase() === 'Y';
  
  console.log('🔍 [isBatchManaged] Item:', item?.ItemCode, 'BatchManaged field:', batchManagedValue, 'Is managed:', isManaged);
  console.log('🔍 [isBatchManaged] Full item data:', item);
  
  return isManaged;
};
// Check if batches are available for item in specific warehouse
const checkBatchAvailability = async (itemCode, whsCode) => {
  if (!itemCode || !whsCode) return false;
  
  try {
    console.log('🔍 [checkBatchAvailability] Checking batches for:', { itemCode, whsCode });
    const response = await fetchBatchesByItem(itemCode, whsCode);
    console.log('🔍 [checkBatchAvailability] API Response:', response);
    
    const batches = response.data?.batches || [];
    const hasBatches = batches.length > 0;
    
    console.log('🔍 [checkBatchAvailability] Found batches:', batches.length, 'Has batches:', hasBatches);
    console.log('🔍 [checkBatchAvailability] Batch details:', batches);
    
    return hasBatches;
  } catch (error) {
    console.error('❌ [checkBatchAvailability] Error:', error);
    // If there's an error, assume batches are available for batch-managed items
    // This prevents the button from being hidden due to API errors
    return true;
  }
};

// ─── static fallbacks ────────────────────────────────────────────────────────
const FALLBACK_PAYMENT_TERMS = [
  { value: '0', label: 'Immediate' },
  { value: '1', label: 'Net 30' },
  { value: '2', label: 'Net 60' },
  { value: '3', label: 'Net 90' },
];
const FALLBACK_SHIPPING = [
  { value: '1', label: 'Air' },
  { value: '2', label: 'Sea' },
  { value: '3', label: 'Road' },
  { value: '4', label: 'Courier' },
];
const FALLBACK_TAX = [
  { Code: 'GST5', Name: 'GST 5%', Rate: 5 },
  { Code: 'GST12', Name: 'GST 12%', Rate: 12 },
  { Code: 'GST18', Name: 'GST 18%', Rate: 18 },
  { Code: 'GST28', Name: 'GST 28%', Rate: 28 },
  { Code: 'IGST5', Name: 'IGST 5%', Rate: 5 },
  { Code: 'IGST12', Name: 'IGST 12%', Rate: 12 },
  { Code: 'IGST18', Name: 'IGST 18%', Rate: 18 },
  { Code: 'IGST28', Name: 'IGST 28%', Rate: 28 },
  { Code: 'EXEMPT', Name: 'Exempt', Rate: 0 },
];
const FALLBACK_UOM = ['EA', 'PCS', 'KG', 'LTR', 'MTR', 'BOX', 'SET', 'NOS', 'PKT', 'DZN'];
const FALLBACK_WAREHOUSES = [
  { WhsCode: 'WH01', WhsName: 'Main Warehouse' },
  { WhsCode: 'WH02', WhsName: 'Secondary Warehouse' },
];

// ─── constants ────────────────────────────────────────────────────────────────
const DEC = { QtyDec: 2, PriceDec: 2, SumDec: 2, RateDec: 2, PercentDec: 2 };
const TAB_NAMES = ['Contents', 'Logistics', 'Accounting', 'Tax', 'Electronic Documents', 'Attachments'];

const createLine = () => ({
  itemNo: '', itemDescription: '',
  sellerQuality: '', buyerQuality: '',
  hsnCode: '', quantity: '', unitPrice: '',
  sellerPrice: '', buyerPrice: '',
  sellerDelivery: '', buyerDelivery: '',
  sellerBrokerageAmtPer: '', sellerBrokeragePercent: '',
  sellerBrokerage: '', buyerBrokerage: '',
  specialRebate: '', commission: '', sellerBrokeragePerQty: '', unitPriceUdf: '',
  buyerPaymentTerms: '', buyerSpecialInstruction: '', sellerSpecialInstruction: '',
  buyerBillDiscount: '', sellerBillDiscount: '', sellerItem: '', sellerQty: '',
  freightPurchase: '', freightSales: '', freightProvider: '', freightProviderName: '',
  brokerageNumber: '',
  uomCode: '', stdDiscount: '', stcode: '', taxCode: '', total: '', taxAmount: '', whse: '',
  distRule: '', freeText: '', countryOfOrigin: '', sacCode: '',
  openQty: '', deliveredQty: '',
  loc: '', branch: '', lineNum: undefined, baseEntry: null, baseType: null, baseLine: null,
  batchManaged: false, batches: [],
  hasBatchesAvailable: false, // Track if batches are available for this item-warehouse combo
  inventoryUOM: '', // Base UoM from item master
  uomFactor: 1, // Conversion factor: Document UoM to Base UoM
  udf: createUdfState(ROW_UDF_DEFINITIONS),
});

const INIT_HEADER = {
  vendor: '', name: '', contactPerson: '', salesContractNo: '', branch: '', warehouse: '',
  docNo: '', status: 'Open', series: '', nextNumber: '',
  postingDate: today(), deliveryDate: '', documentDate: today(), contractDate: '',
  branchRegNo: '', shipTo: '', shipToCode: '', payTo: '', payToCode: '',
  shippingType: '', confirmed: false, journalRemark: '', paymentTerms: '',
  paymentMethod: '', otherInstruction: '', discount: '', freight: '', tax: '',
  totalPaymentDue: '', rounding: false, owner: '', purchaser: '',
  placeOfSupply: '', currency: 'INR', useBillToForTax: false,
  billToAddress: '', billToCode: '', shipToAddress: '', shipToCode: '',
};

const INIT_ATTACH = Array.from({ length: 9 }, (_, i) => ({
  id: i + 1, targetPath: '', fileName: '', attachmentDate: '',
  freeText: '', copyToTargetDocument: '', documentType: '', atchDocDate: '', alert: '',
}));

// ─── Main Component ───────────────────────────────────────────────────────────
function Delivery() {
  const location = useLocation();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const isHydratingDocumentRef = useRef(false);

  const [currentDocEntry, setCurrentDocEntry] = useState(null);
  const [header, setHeader] = useState(INIT_HEADER);
  const [lines, setLines] = useState([createLine()]);
  const [attachments] = useState(INIT_ATTACH);
  const [activeTab, setActiveTab] = useState('Contents');
  const [headerUdfs, setHeaderUdfs] = useState(() => createUdfState(HEADER_UDF_DEFINITIONS));
  const [formSettings, setFormSettings] = useState(() => readSavedFormSettings());
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [formSettingsOpen, setFormSettingsOpen] = useState(false);
  const [refData, setRefData] = useState({
    company: '', vendors: [], contacts: [], pay_to_addresses: [], items: [],
    warehouses: [], warehouse_addresses: [], company_address: {}, tax_codes: [],
    payment_terms: [], shipping_types: [], branches: [], uom_groups: [],
    distribution_rules: [], quality_options: { buyer: [], seller: [] }, price_options: { buyer: [], seller: [] },
    decimal_settings: DEC, warnings: [], series: [], states: [],
  });
  const [pageState, setPageState] = useState({ loading: false, vendorLoading: false, posting: false, error: '', success: '', seriesLoading: false });
  const [valErrors, setValErrors] = useState({ header: {}, lines: {}, form: '' });
  const [addressModal, setAddressModal] = useState(null);
  const [taxInfoModal, setTaxInfoModal] = useState(false);
  const [batchModal, setBatchModal] = useState({ open: false, lineIndex: null, availableBatches: [], loading: false, error: '' });
  const [bpModal, setBpModal] = useState(false);
  const [stateModal, setStateModal] = useState(false);
  const [hsnModal, setHsnModal] = useState({ open: false, lineIndex: -1 });
  const [itemModal, setItemModal] = useState({ open: false, lineIndex: -1, items: [], loading: false });
  const [qualityModal, setQualityModal] = useState({
    open: false,
    lineIndex: -1,
    field: '',
    title: 'List of User-Defined Values',
    options: [],
    searchPlaceholder: 'Search values',
    emptyMessage: 'No values found',
    allowCreate: true,
  });
  const [freightModal, setFreightModal] = useState({ open: false, freightCharges: [], loading: false });
  const [copyFromModal, setCopyFromModal] = useState(false);
  const [copyFromDocType, setCopyFromDocType] = useState('salesOrder');
  const [copyToModal, setCopyToModal] = useState(false);
  const [addressForm, setAddressForm] = useState({
    streetNo: '', buildingFloorRoom: '', block: '', city: '', zipCode: '', county: '',
    state: '', countryRegion: '', addressName2: '', addressName3: '', gln: '', gstin: ''
  });
  const [taxInfoForm, setTaxInfoForm] = useState({
    panNo: '', panCircleNo: '', panWardNo: '', panAssessingOfficer: '', deducteeRefNo: '',
    lstVatNo: '', cstNo: '', tanNo: '', serviceTaxNo: '', companyType: '', natureOfBusiness: '',
    assesseeType: '', tinNo: '', itrFiling: '', gstType: '', gstin: ''
  });

  useEffect(() => { localStorage.setItem(FORM_SETTINGS_STORAGE_KEY, JSON.stringify(formSettings)); }, [formSettings]);

  // Close Copy From dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('.del-dropdown')) {
        document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // decimal config
  const dec = { ...DEC, ...(refData.decimal_settings || {}) };
  const numDec = {
    quantity: Number(dec.QtyDec), unitPrice: Number(dec.PriceDec),
    stdDiscount: Number(dec.PercentDec), total: Number(dec.SumDec),
    discount: Number(dec.PercentDec), freight: Number(dec.SumDec),
    tax: Number(dec.SumDec), totalPaymentDue: Number(dec.SumDec),
  };
  const isDocumentEditable = !currentDocEntry || String(header.status || '').toLowerCase() === 'open';
  const hasBuyerCode = Boolean(String(header.vendor || '').trim());
  const isUpdateMode = Boolean(currentDocEntry);
  const primaryActionLabel = pageState.posting
    ? 'Saving...'
    : isUpdateMode
      ? 'Update (Alt+U)'
      : 'Add (Alt+A)';
  const hydrateLoadedLine = useCallback((line) => {
    const itemCode = String(line?.itemNo || line?.ItemCode || line?.itemCode || '').trim();
    const item = refData.items.find(i => String(i.ItemCode || '').trim() === itemCode);
    const rawUomCode = String(
      line?.uomCode ||
      line?.UoMCode ||
      line?.UomCode ||
      line?.unitMsr ||
      item?.SalesUnit ||
      item?.InventoryUOM ||
      ''
    ).trim();
    const numericFactor = parseFloat(rawUomCode);
    const explicitFactor = Number(line?.uomFactor);
    const uomFactor = Number.isFinite(explicitFactor) && explicitFactor > 0
      ? explicitFactor
      : Number.isFinite(numericFactor) && numericFactor > 0
        ? numericFactor
        : 1;
    const inventoryUOM = String(line?.inventoryUOM || line?.InventoryUOM || item?.InventoryUOM || '').trim();
    const batches = Array.isArray(line?.batches)
      ? line.batches
          .filter(batch => String(batch?.batchNumber || '').trim())
          .map(batch => ({
            batchNumber: String(batch.batchNumber || '').trim(),
            quantity: String(batch.quantity ?? ''),
            expiryDate: batch.expiryDate || '',
          }))
      : [];
    const batchManaged = line?.batchManaged != null ? !!line.batchManaged : isBatchManaged(item);

    return {
      ...createLine(),
      ...line,
      itemNo: itemCode,
      itemDescription: line?.itemDescription || line?.ItemDescription || line?.Dscription || item?.ItemName || '',
      hsnCode: line?.hsnCode || line?.HSNCode || item?.HSNCode || item?.SWW || item?.U_HSNCode || '',
      quantity: String(line?.quantity ?? line?.Quantity ?? ''),
      openQty: String(line?.openQty ?? line?.OpenQuantity ?? line?.OpenQty ?? ''),
      unitPrice: String(line?.unitPrice ?? line?.UnitPrice ?? line?.Price ?? ''),
      sellerPrice: String(line?.sellerPrice ?? line?.SellerPrice ?? ''),
      buyerPrice: String(line?.buyerPrice ?? line?.BuyerPrice ?? ''),
      sellerDelivery: line?.sellerDelivery || line?.SellerDelivery || '',
      buyerDelivery: line?.buyerDelivery || line?.BuyerDelivery || '',
      sellerBrokerageAmtPer: line?.sellerBrokerageAmtPer || line?.SellerBrokerageAmtPer || '',
      sellerBrokeragePercent: String(line?.sellerBrokeragePercent ?? line?.SellerBrokeragePercent ?? ''),
      sellerBrokerage: String(line?.sellerBrokerage ?? line?.SellerBrokerage ?? ''),
      buyerBrokerage: String(line?.buyerBrokerage ?? line?.BuyerBrokerage ?? ''),
      specialRebate: String(line?.specialRebate ?? line?.SpecialRebate ?? ''),
      commission: String(line?.commission ?? line?.Commission ?? ''),
      sellerBrokeragePerQty: String(line?.sellerBrokeragePerQty ?? line?.SellerBrokeragePerQty ?? ''),
      unitPriceUdf: String(line?.unitPriceUdf ?? line?.UnitPriceUdf ?? ''),
      buyerPaymentTerms: line?.buyerPaymentTerms || line?.BuyerPaymentTerms || '',
      buyerSpecialInstruction: line?.buyerSpecialInstruction || line?.BuyerSpecialInstruction || '',
      sellerSpecialInstruction: line?.sellerSpecialInstruction || line?.SellerSpecialInstruction || '',
      buyerBillDiscount: String(line?.buyerBillDiscount ?? line?.BuyerBillDiscount ?? ''),
      sellerBillDiscount: String(line?.sellerBillDiscount ?? line?.SellerBillDiscount ?? ''),
      sellerItem: line?.sellerItem || line?.SellerItem || '',
      sellerQty: String(line?.sellerQty ?? line?.SellerQty ?? ''),
      freightPurchase: String(line?.freightPurchase ?? line?.FreightPurchase ?? ''),
      freightSales: String(line?.freightSales ?? line?.FreightSales ?? ''),
      freightProvider: line?.freightProvider || line?.FreightProvider || '',
      freightProviderName: line?.freightProviderName || line?.FreightProviderName || '',
      brokerageNumber: line?.brokerageNumber || line?.BrokerageNumber || '',
      uomCode: rawUomCode,
      stdDiscount: String(line?.stdDiscount ?? line?.DiscountPercent ?? line?.DiscPrcnt ?? ''),
      stcode: line?.stcode || line?.STCode || line?.TaxCode || '',
      taxCode: line?.taxCode || line?.TaxCode || '',
      total: String(line?.total ?? line?.LineTotal ?? ''),
      taxAmount: String(line?.taxAmount ?? line?.LineTaxAmount ?? line?.VatSum ?? ''),
      whse: line?.whse || line?.Warehouse || line?.WarehouseCode || line?.WhsCode || '',
      distRule: line?.distRule || line?.DistributionRule || line?.OcrCode || '',
      freeText: line?.freeText || line?.FreeText || '',
      countryOfOrigin: line?.countryOfOrigin || line?.CountryOfOrigin || '',
      sacCode: line?.sacCode || line?.SACCode || '',
      deliveredQty: String(line?.deliveredQty ?? line?.DeliveredQty ?? ''),
      loc: String(line?.loc ?? line?.Loc ?? ''),
      branch: String(line?.branch ?? line?.Branch ?? ''),
      lineNum: line?.lineNum ?? line?.LineNum,
      baseEntry: line?.baseEntry ?? line?.BaseEntry ?? null,
      baseType: line?.baseType ?? line?.BaseType ?? null,
      baseLine: line?.baseLine ?? line?.BaseLine ?? null,
      inventoryUOM,
      uomFactor,
      batchManaged,
      batches,
      hasBatchesAvailable: batchManaged ? true : false,
      udf: { ...createUdfState(ROW_UDF_DEFINITIONS), ...(line?.udf || {}) },
    };
  }, [refData.items]);

  // Continue in next part...

  // ── load reference data ───────────────────────────────────────────────────
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setPageState(p => ({ ...p, loading: true, error: '', success: '' }));
      try {
        const [refDataRes, seriesRes] = await Promise.all([
          fetchDeliveryReferenceData(SALES_ORDER_COMPANY_ID),
          fetchDocumentSeries(),
        ]);
        
        if (!ignore) {
          const vendorRows = refDataRes.data.vendors || refDataRes.data.customers || [];
          setRefData({
            company: refDataRes.data.company || '',
            vendors: vendorRows,
            contacts: refDataRes.data.contacts || [],
            pay_to_addresses: refDataRes.data.pay_to_addresses || [],
            items: refDataRes.data.items || [],
            warehouses: refDataRes.data.warehouses || [],
            warehouse_addresses: refDataRes.data.warehouse_addresses || [],
            company_address: refDataRes.data.company_address || {},
            tax_codes: refDataRes.data.tax_codes || [],
            payment_terms: refDataRes.data.payment_terms || [],
            shipping_types: refDataRes.data.shipping_types || [],
            branches: refDataRes.data.branches || [],
            states: refDataRes.data.states || [],
            uom_groups: refDataRes.data.uom_groups || [],
            distribution_rules: refDataRes.data.distribution_rules || [],
            quality_options: refDataRes.data.quality_options || { buyer: [], seller: [] },
            price_options: refDataRes.data.price_options || { buyer: [], seller: [] },
            decimal_settings: { ...DEC, ...(refDataRes.data.decimal_settings || {}) },
            warnings: refDataRes.data.warnings || [],
            series: seriesRes.data.series || [],
          });
          
          if (seriesRes.data.series && seriesRes.data.series.length > 0 && !currentDocEntry) {
            const defaultSeries = getDefaultSeriesForCurrentYear(seriesRes.data.series);
            if (defaultSeries?.Series != null) {
              handleSeriesChange(defaultSeries.Series);
            }
          }
        }
      } catch (e) {
        if (!ignore) setPageState(p => ({ ...p, error: getErrMsg(e, 'Failed to load reference data.') }));
      } finally {
        if (!ignore) setPageState(p => ({ ...p, loading: false }));
      }
    };
    load();
    return () => { ignore = true; };
  }, []);

  // ── load existing order ───────────────────────────────────────────────────
  useEffect(() => {
    const docEntry =
      location.state?.deliveryDocEntry ||
      location.state?.docEntry ||
      location.state?.document?.docEntry ||
      location.state?.document?.DocEntry ||
      location.state?.salesOrderDocEntry;
    if (!docEntry) return;
    let ignore = false;
    let hydrationTimer = null;
    const load = async () => {
      setPageState(p => ({ ...p, loading: true, error: '', success: '' }));
      try {
        isHydratingDocumentRef.current = true;
        const r = await fetchDeliveryByDocEntry(docEntry);
        const so = r.data.delivery;
        const loadedLines = Array.isArray(so?.lines) && so.lines.length
          ? so.lines
          : Array.isArray(so?.DocumentLines) && so.DocumentLines.length
            ? so.DocumentLines
            : [];
        const firstLineWarehouse = loadedLines.length > 0
          ? String(
              loadedLines[0]?.whse ||
              loadedLines[0]?.Warehouse ||
              loadedLines[0]?.WarehouseCode ||
              loadedLines[0]?.WhsCode ||
              ''
            )
          : '';
        console.log('📦 [Delivery] Loaded delivery data:', so);
        console.log('📦 [Delivery] Header:', so.header);
        console.log('📦 [Delivery] Lines:', so.lines);
        
        if (ignore || !so) return;
        setCurrentDocEntry(so.doc_entry || Number(docEntry));
        setActiveTab('Contents');
        setHeader(prev => ({
          ...prev,
          ...INIT_HEADER,
          ...(so.header || {}),
          vendor: so.header?.customerCode || so.header?.customer || '',
          contactPerson: so.header?.contactPerson || '',
          name: so.header?.customerName || so.header?.name || '',
          paymentTerms: so.header?.paymentTermsCode || so.header?.paymentTerms || '',
          placeOfSupply: so.header?.placeOfSupply || '',
          branch: so.header?.branch || '',
          warehouse: firstLineWarehouse || so.header?.warehouse || '',
          series: so.header?.series || '',
          nextNumber: so.header?.docNo || '',
        }));
        
        setLines(
          loadedLines.length
            ? loadedLines.map(l => hydrateLoadedLine(l))
            : [createLine()]
        );
        
        console.log('📦 [Delivery] Lines after mapping:', lines);
        
        setHeaderUdfs({ ...createUdfState(HEADER_UDF_DEFINITIONS), ...(so.header_udfs || {}) });
        if (so.header?.customerCode || so.header?.customer) {
          loadVendorDetails(so.header?.customerCode || so.header?.customer);
        }
        
        // Call handleSeriesChange to populate next number
        if (so.header?.series) {
          handleSeriesChange(so.header.series);
        }
        
        setPageState(p => ({ ...p, success: so.doc_num ? `Delivery ${so.doc_num} loaded.` : 'Delivery loaded.' }));
      } catch (e) {
        if (!ignore) setPageState(p => ({ ...p, error: getErrMsg(e, 'Failed to load delivery.') }));
      } finally {
        hydrationTimer = setTimeout(() => {
          isHydratingDocumentRef.current = false;
        }, 0);
        if (!ignore) {
          setPageState(p => ({ ...p, loading: false }));
          navigate(location.pathname, { replace: true, state: null });
        }
      }
    };
    load();
    return () => {
      ignore = true;
      isHydratingDocumentRef.current = false;
      if (hydrationTimer) clearTimeout(hydrationTimer);
    };
  }, [hydrateLoadedLine, location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!currentDocEntry) {
      setFreightModal(prev => (
        prev.freightCharges.length || prev.loading
          ? { ...prev, freightCharges: [], loading: false }
          : prev
      ));
      return;
    }

    let ignore = false;
    const loadSavedFreightCharges = async () => {
      try {
        const response = await fetchFreightCharges(currentDocEntry);
        const savedFreightCharges = response.data.freightCharges || [];
        const savedFreightTotal = savedFreightCharges.reduce((sum, charge) => (
          sum + parseNum(charge.netAmount ?? charge.LineTotal ?? charge.NetAmount ?? charge.DefaultAmount)
        ), 0);
        if (!ignore) {
          setFreightModal(prev => ({
            ...prev,
            freightCharges: savedFreightCharges,
            loading: false,
          }));
          setHeader(prev => ({ ...prev, freight: fmtDec(savedFreightTotal, numDec.freight) }));
        }
      } catch (_error) {
        if (!ignore) {
          setFreightModal(prev => ({ ...prev, freightCharges: [], loading: false }));
        }
      }
    };

    loadSavedFreightCharges();
    return () => { ignore = true; };
  }, [currentDocEntry]);

  useEffect(() => {
    if (!currentDocEntry || !refData.items.length) return;

    setLines(prevLines => prevLines.map(line => hydrateLoadedLine(line)));
  }, [currentDocEntry, hydrateLoadedLine, refData.items.length]);

  // ── Copy To: populate form from Sales Order / other source ────────────────
  useEffect(() => {
    const copyFrom = location.state?.copyFrom;
    if (!copyFrom) return;

    const { header: srcHeader, lines: srcLines, baseDocument } = copyFrom;

    // Populate header
    setHeader(prev => ({
      ...prev,
      vendor:           srcHeader.vendor        || srcHeader.CardCode  || '',
      name:             srcHeader.name          || srcHeader.CardName  || '',
      contactPerson:    srcHeader.contactPerson || srcHeader.CntctCode || '',
      branch:           srcHeader.branch        || srcHeader.BPL_IDAssignedToInvoice || '',
      paymentTerms:     srcHeader.paymentTerms  || srcHeader.GroupNum  || '',
      placeOfSupply:    srcHeader.placeOfSupply || '',
      otherInstruction: srcHeader.otherInstruction || srcHeader.Comments || '',
    }));

    // Populate lines with base document linking
    if (Array.isArray(srcLines) && srcLines.length > 0) {
      setLines(srcLines.map((l, idx) => ({
        ...createLine(),
        itemNo:          l.itemNo          || l.ItemCode        || '',
        itemDescription: l.itemDescription || l.ItemDescription || l.Dscription || '',
        quantity:        String(l.quantity || l.Quantity || l.OpenQty || 0),
        unitPrice:       String(l.unitPrice || l.UnitPrice || l.Price || 0),
        uomCode:         l.uomCode         || l.UomCode         || l.unitMsr || '',
        hsnCode:         l.hsnCode         || l.HSNCode         || '',
        taxCode:         '',
        whse:            l.whse            || l.WarehouseCode   || l.WhsCode || '',
        stdDiscount:     String(l.stdDiscount || l.discount || l.DiscountPercent || l.DiscPrcnt || 0),
        baseEntry:       baseDocument?.baseEntry || copyFrom.docEntry,
        baseType:        baseDocument?.baseType  || 17,
        baseLine:        l.lineNum         ?? l.LineNum         ?? idx,
        branch:          l.branch          || srcHeader.branch  || '',
      })));
    }

    // Load vendor details to populate contacts/addresses
    const cardCode = srcHeader.vendor || srcHeader.CardCode;
    if (cardCode) loadVendorDetails(cardCode);

    setPageState(p => ({ ...p, success: `Copied from Sales Order. Please review and save.` }));

    // Clear state so refresh doesn't re-populate
    navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived / computed ────────────────────────────────────────────────────
  const vendorContacts = refData.contacts.filter(c => String(c.CardCode || '') === String(header.vendor || ''));
  const vendorOptions = header.vendor && !refData.vendors.some(v => String(v.CardCode || '') === String(header.vendor || ''))
    ? [{ CardCode: header.vendor, CardName: header.name || header.vendor }, ...refData.vendors]
    : refData.vendors;
  const contactOptions = header.contactPerson && !vendorContacts.some(c => String(c.CntctCode || '') === String(header.contactPerson || ''))
    ? [{ CardCode: header.vendor, CntctCode: header.contactPerson, Name: header.contactPerson }, ...vendorContacts]
    : vendorContacts;
  const vendorPayToAddresses = refData.pay_to_addresses.filter(a => String(a.CardCode || '') === String(header.vendor || ''));
  const vendorShipToAddresses = refData.ship_to_addresses?.filter(a => String(a.CardCode || '') === String(header.vendor || '')) || [];
  const vendorBillToAddresses = refData.bill_to_addresses?.filter(a => String(a.CardCode || '') === String(header.vendor || '')) || [];
  const vendorEffectiveShipToAddresses = vendorShipToAddresses.length ? vendorShipToAddresses : vendorPayToAddresses;
  const vendorEffectiveBillToAddresses = vendorBillToAddresses.length ? vendorBillToAddresses : vendorPayToAddresses;
  const selectedBranch = refData.branches.find(b => String(b.BPLId || '') === String(header.branch || ''));
  const firstLineWhse = String(lines[0]?.whse || '').trim();
  const selectedWhseAddr = refData.warehouse_addresses.find(w => String(w.WhsCode || '') === firstLineWhse);
  const defaultShipTo = fmtAddr(refData.company_address);
  const uomGroupMap = (refData.uom_groups || []).reduce((acc, g) => { acc[g.AbsEntry] = g.uomCodes || []; return acc; }, {});

  const effectiveTaxCodes = refData.tax_codes.length ? refData.tax_codes : FALLBACK_TAX;
  const effectiveWarehouses = refData.warehouses.length ? refData.warehouses : FALLBACK_WAREHOUSES;
  const branchFilteredWarehouses = filterWarehousesByBranch(effectiveWarehouses, header.branch);
  const freightTotals = summarizeFreightRows(freightModal.freightCharges, effectiveTaxCodes);
  const effectiveWhseAddrs = refData.warehouse_addresses.length ? refData.warehouse_addresses : FALLBACK_WAREHOUSES;
  const payTermOpts = refData.payment_terms.length
    ? refData.payment_terms.map(t => ({ value: String(t.GroupNum), label: t.PymntGroup }))
    : FALLBACK_PAYMENT_TERMS;
  const shipTypeOpts = refData.shipping_types.length
    ? refData.shipping_types.map(s => ({ value: String(s.TrnspCode), label: s.TrnspName }))
    : FALLBACK_SHIPPING;

  const getUomOptions = useCallback((line) => {
    const item = refData.items.find(i => String(i.ItemCode || '') === String(line.itemNo || ''));
    if (item) {
      const codes = uomGroupMap[item.UoMGroupEntry];
      if (codes && codes.length) return codes;
      const fb = String(item.SalesUnit || item.InventoryUOM || '').trim();
      if (fb) return [fb];
    }
    return FALLBACK_UOM;
  }, [refData.items, uomGroupMap]);

  const lineItemOptions = lines.reduce((acc, line, i) => {
    const code = String(line.itemNo || '').trim();
    const exists = refData.items.some(it => String(it.ItemCode || '') === code);
    acc[i] = code && !exists ? [{ ItemCode: code, ItemName: line.itemDescription || code }, ...refData.items] : refData.items;
    return acc;
  }, {});

  const fmtTaxLabel = (t) => {
    const code = String(t?.Code || '').trim();
    const name = String(t?.Name || '').trim();
    const up = `${code} ${name}`.toUpperCase();
    let type = '';
    if (up.includes('IGST')) type = 'IGST';
    else if (up.includes('CGST') && up.includes('SGST')) type = 'CGST+SGST';
    else if (up.includes('CGST')) type = 'CGST';
    else if (up.includes('SGST')) type = 'SGST';
    else if (up.includes('GST')) type = 'GST';
    const rate = t?.Rate != null ? `${Number(t.Rate)}%` : '';
    if (type && rate) return `${code} - ${type} ${rate}`;
    if (type) return `${code} - ${type}`;
    return name ? `${code} - ${name}` : code;
  };

  const getBranchName = (branchId) => {
    if (!branchId) return '';
    const branch = refData.branches.find(b => String(b.BPLId) === String(branchId));
    return branch ? branch.BPLName : branchId;
  };

  // ── calculations ──────────────────────────────────────────────────────────
  const calcLineTotal = (line) => {
    const qty = parseNum(line.quantity), price = parseNum(line.unitPrice), disc = parseNum(line.stdDiscount);
    return roundTo(qty * price * (1 - disc / 100), numDec.total);
  };

  const calcTotals = () => {
    const taxRateMap = new Map(effectiveTaxCodes.map(t => [String(t.Code || ''), parseNum(t.Rate)]));
    const subtotal = lines.reduce((s, l) => s + calcLineTotal(l), 0);
    const discPct = parseNum(header.discount);
    const discAmt = roundTo(subtotal * discPct / 100, numDec.total);
    const discSub = Math.max(0, subtotal - discAmt);
    const freight = roundTo(parseNum(header.freight), numDec.total);
    const freightTaxAmt = roundTo(parseNum(freightTotals.totalTax), numDec.tax);
    let taxAmt = 0;
    const taxMap = new Map();
    if (subtotal > 0) {
      lines.forEach(l => {
        const net = calcLineTotal(l);
        if (net <= 0 || !l.taxCode) return;
        const rate = taxRateMap.get(String(l.taxCode || '')) || 0;
        const base = discSub * (net / subtotal);
        const lineTax = roundTo(base * rate / 100, numDec.tax);
        taxAmt += lineTax;
        const ex = taxMap.get(l.taxCode) || { taxCode: l.taxCode, taxRate: rate, taxableAmount: 0, taxAmount: 0 };
        ex.taxableAmount = roundTo(ex.taxableAmount + base, numDec.total);
        ex.taxAmount = roundTo(ex.taxAmount + lineTax, numDec.tax);
        taxMap.set(l.taxCode, ex);
      });
    }
    taxAmt = roundTo(taxAmt, numDec.tax);
    if (taxAmt === 0) { const lt = roundTo(parseNum(header.tax), numDec.tax); if (lt > 0) taxAmt = lt; }
    taxAmt = roundTo(taxAmt + freightTaxAmt, numDec.tax);
    return { subtotal, discAmt, discSub, freight, freightTaxAmt, taxAmt, total: roundTo(discSub + freight + taxAmt, numDec.totalPaymentDue), taxBreakdown: Array.from(taxMap.values()) };
  };

  const totals = calcTotals();

  // Continue in next part...

  // ── address sync ──────────────────────────────────────────────────────────
  useEffect(() => {
    setHeader(prev => {
      if (prev.shipToCode) return prev;
      const next = selectedWhseAddr ? fmtAddr(selectedWhseAddr) : defaultShipTo;
      if (!next || prev.shipTo === next) return prev;
      return { ...prev, shipToCode: selectedWhseAddr ? selectedWhseAddr.WhsCode : 'COMPANY', shipTo: next };
    });
  }, [selectedWhseAddr, defaultShipTo]);

  useEffect(() => {
    if (!header.vendor) return;
    setHeader(prev => {
      const existing = vendorPayToAddresses.find(a => String(a.Address || '') === String(prev.payToCode || ''));
      if (existing) return prev;
      const def = vendorPayToAddresses[0];
      if (!def) return prev;
      const fmt = fmtAddr(def);
      if (prev.payToCode === def.Address && prev.payTo === fmt) return prev;
      return { ...prev, payToCode: def.Address || '', payTo: fmt };
    });
  }, [header.vendor, vendorPayToAddresses]);

  // ── vendor details ────────────────────────────────────────────────────────
  const loadVendorDetails = async (code) => {
    if (!code) {
      setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [] }));
      setHeader(prev => ({ ...prev, placeOfSupply: '' }));
      return;
    }

    setPageState(p => ({ ...p, vendorLoading: true }));

    try {
      const r = await fetchDeliveryCustomerDetails(code);
      const contacts = r.data.contacts || [];
      const payToAddresses = r.data.pay_to_addresses || [];
      
      setRefData(p => ({
        ...p,
        contacts: contacts,
        pay_to_addresses: payToAddresses
      }));

      if (contacts.length > 0) {
        setHeader(prev => ({
          ...prev,
          contactPerson: contacts[0].CntctCode
        }));
      }

      // Auto-populate Place of Supply from customer's default address
      if (payToAddresses.length > 0) {
        const defaultAddress = payToAddresses[0];
        if (defaultAddress.State) {
          console.log('🌍 Auto-setting Place of Supply from customer address:', defaultAddress.State);
          
          // Find the state code that matches the state name
          const stateMatch = refData.states.find(st => 
            st.Name === defaultAddress.State || st.Code === defaultAddress.State
          );
          const stateCode = stateMatch ? stateMatch.Code : defaultAddress.State;
          
          setHeader(prev => ({
            ...prev,
            placeOfSupply: stateCode,
            shipToCode: defaultAddress.Address || '',
            shipToAddress: fmtAddr(defaultAddress)
          }));
        }
      }

    } catch (err) {
      console.error('Error loading customer details:', err);
      setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [] }));
    } finally {
      setPageState(p => ({ ...p, vendorLoading: false }));
    }
  };

  const syncVendor = (code, hdr) => {
    const m = refData.vendors.find(v => String(v.CardCode || '') === String(code || ''));
    if (!m) return { nextHeader: hdr };
    return {
      nextHeader: { ...hdr, name: m.CardName || hdr.name, paymentTerms: m.PayTermsGrpCode != null ? String(m.PayTermsGrpCode) : hdr.paymentTerms, contactPerson: '' },
    };
  };

  // ── handlers ──────────────────────────────────────────────────────────────
  const handleHeaderChange = (e) => {
    const { name, value, type, checked } = e.target;
    setValErrors(p => ({ ...p, header: { ...p.header, [name]: '' }, form: '' }));
    setPageState(p => ({ ...p, error: '', success: '' }));
    
    console.log('🔧 [Delivery] handleHeaderChange called:', { name, value, type });
    
    if (name === 'series') {
      handleSeriesChange(value);
      return;
    }
    
    if (name === 'shipToCode') {
      handleShipToChange(value);
      return;
    }
    
    if (name === 'vendor') {
      setHeader(prev => {
        const prep = { ...prev, [name]: value };
        const { nextHeader } = syncVendor(value, prep);
        nextHeader.contactPerson = '';
        // Reset address fields when vendor changes
        nextHeader.billToCode = '';
        nextHeader.billToAddress = '';
        nextHeader.shipToCode = '';
        nextHeader.shipToAddress = '';
        nextHeader.placeOfSupply = '';
        return nextHeader;
      });
      loadVendorDetails(value);
      return;
    }

    if (name === 'billToCode') {
      handleBillToChange(value);
      return;
    }

    if (name === 'shipToCode') {
      handleShipToChange(value);
      return;
    }
    if (numDec[name] !== undefined && type !== 'checkbox') {
      setHeader(p => ({ ...p, [name]: sanitize(value, numDec[name]) }));
      return;
    }
    
    if (name === 'branch') {
      console.log('🏢 [Delivery] Branch changing to:', value);
      // Clear warehouse when branch changes since it might not belong to the new branch
      setHeader(p => ({ ...p, [name]: value, warehouse: '' }));
      return;
    }
    
    setHeader(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };
  
  const handleShipToChange = (addressCode) => {
    if (!addressCode || !header.vendor) {
      setHeader(p => ({ ...p, shipToCode: addressCode, shipToAddress: '', placeOfSupply: '' }));
      return;
    }

    const addr = vendorEffectiveShipToAddresses.find(a => String(a.Address || '') === addressCode)
      || vendorEffectiveBillToAddresses.find(a => String(a.Address || '') === addressCode);
    if (addr) {
      // Find the state code that matches the state name
      const stateMatch = refData.states.find(st => 
        st.Name === addr.State || st.Code === addr.State
      );
      const stateCode = stateMatch ? stateMatch.Code : (addr.State || '');
      
      setHeader(p => ({
        ...p,
        shipToCode: addressCode,
        shipToAddress: fmtAddr(addr),
        placeOfSupply: stateCode
      }));
    }
  };

  const handleBillToChange = (addressCode) => {
    if (!addressCode || !header.vendor) {
      setHeader(p => ({ ...p, billToCode: addressCode, billToAddress: '' }));
      return;
    }

    const addr = vendorEffectiveBillToAddresses.find(a => String(a.Address || '') === addressCode)
      || vendorEffectiveShipToAddresses.find(a => String(a.Address || '') === addressCode);
    if (addr) {
      setHeader(p => ({
        ...p,
        billToCode: addressCode,
        billToAddress: fmtAddr(addr)
      }));
    }
  };
  
  const handleSeriesChange = async (seriesValue) => {
    if (!seriesValue) return;
    
    setPageState(p => ({ ...p, seriesLoading: true }));
    setHeader(p => ({ ...p, series: seriesValue, nextNumber: '...' }));
    
    try {
      const res = await fetchNextNumber(seriesValue);
      setHeader(p => ({ ...p, nextNumber: String(res.data.nextNumber || '') }));
    } catch (err) {
      setHeader(p => ({ ...p, nextNumber: 'Error' }));
      setPageState(p => ({ ...p, error: 'Failed to get next document number' }));
    } finally {
      setPageState(p => ({ ...p, seriesLoading: false }));
    }
  };

  const handleLineChange = async (i, e) => {
    const { name, value } = e.target;
    setValErrors(p => ({ ...p, lines: { ...p.lines, [i]: { ...(p.lines[i] || {}), [name]: '' } }, form: '' }));
    setPageState(p => ({ ...p, error: '', success: '' }));
    
    if (name === 'itemNo' && value) {
      // Fetch HSN code from database via API
      try {
        const item = refData.items.find(it => String(it.ItemCode || '') === String(value || ''));
        
        if (item) {
          // Fetch HSN code from OCHP table via JOIN query
          const hsnResponse = await fetchHSNCodeFromItem(value);
          const hsnData = hsnResponse.data;
          
          console.log('🔍 Item Selected - HSN Data:', {
            itemCode: value,
            hsnCode: hsnData.hsnCode,
            hsnDescription: hsnData.hsnDescription,
            hsn_sww: hsnData.hsn_sww,
          });
          
          setLines(prev => prev.map((line, idx) => {
            if (idx !== i) return line;
            const next = { ...line, itemNo: value };
            
            // Reset batches
            next.batches = [];
            next.batchManaged = isBatchManaged(item);
            
            // Step 1: Set Item Details
            next.itemDescription = item.ItemName || next.itemDescription;
            next.uomCode = String(item.SalesUnit || item.InventoryUOM || '').trim();
            
            // Step 2: Set HSN Code from API response (OCHP.ChapterID via JOIN)
            next.hsnCode = hsnData.hsnCode || hsnData.hsn_sww || '';
            
            // Step 3: Get Base Tax Code from Item Master
            const baseTaxCode = item.TaxCodeAR || item.SalTaxCode || '';
            
            console.log('🔍 Item Selected:', {
              itemCode: item.ItemCode,
              itemName: item.ItemName,
              hsnCode: next.hsnCode,
              baseTaxCode: baseTaxCode,
              placeOfSupply: header.placeOfSupply,
            });
            
            // Step 4: Determine GST State (Place of Supply)
            const gstState = header.placeOfSupply;
            const companyState = refData.company_address?.State || selectedBranch?.State || '';
            
            // Step 5: Validate States
            if (!gstState || !companyState) {
              console.warn('⚠️ Missing state information for tax determination');
              next.taxCode = '';
              next.total = fmtDec(calcLineTotal(next), numDec.total);
              return next;
            }
            
            // Step 6: Auto-Determine Tax Code using Tax Engine
            const determinedTaxCode = determineTaxCode(
              item,
              gstState,  // shipToState
              gstState,  // billToState (using same as shipTo)
              false,     // useBillToForTax
              companyState,
              effectiveTaxCodes
            );
            
            if (determinedTaxCode) {
              next.taxCode = determinedTaxCode;
              console.log(`✅ Auto-assigned tax code: ${determinedTaxCode} (${getGSTTypeLabel(companyState, gstState)})`);
            } else {
              console.warn('⚠️ Could not determine tax code automatically');
              next.taxCode = '';
            }
            
            next.total = fmtDec(calcLineTotal(next), numDec.total);
            return next;
          }));
        }
      } catch (error) {
        console.error('❌ Error fetching HSN code:', error);
        // Fallback to basic item selection without HSN
        setLines(prev => prev.map((line, idx) => {
          if (idx !== i) return line;
          const next = { ...line, itemNo: value };
          const item = refData.items.find(it => String(it.ItemCode || '') === String(value || ''));
          next.batches = [];
          next.batchManaged = isBatchManaged(item);
          next.hasBatchesAvailable = false; // Reset batch availability
          
          // Check batch availability if item is batch-managed and warehouse is selected
          if (item && next.batchManaged && next.whse) {
            checkBatchAvailability(next.itemNo, next.whse).then(hasBatches => {
              setLines(prevLines => prevLines.map((l, lIdx) => 
                lIdx === i ? { ...l, hasBatchesAvailable: hasBatches } : l
              ));
            });
          }
          
          if (item) {
            next.itemDescription = item.ItemName || next.itemDescription;
            next.uomCode = String(item.SalesUnit || item.InventoryUOM || '').trim();
            next.hsnCode = item.SWW || item.HSNCode || item.U_HSNCode || next.hsnCode || '';
          }
          next.total = fmtDec(calcLineTotal(next), numDec.total);
          return next;
        }));
      }
      return;
    }
    
    setLines(prev => prev.map((line, idx) => {
      if (idx !== i) return line;
      const next = { ...line, [name]: numDec[name] !== undefined ? sanitize(value, numDec[name]) : value };
      
      // Handle warehouse change
      if (name === 'whse') {
        next.batches = [];
        next.hasBatchesAvailable = false; // Reset batch availability
        
        // Check batch availability if item is batch-managed and warehouse is selected
        if (next.batchManaged && value) {
          checkBatchAvailability(next.itemNo, value).then(hasBatches => {
            setLines(prevLines => prevLines.map((l, lIdx) => 
              lIdx === i ? { ...l, hasBatchesAvailable: hasBatches } : l
            ));
          });
        }
      }
      
      // Handle UoM change - fetch conversion factor
      if (name === 'uomCode' && value && next.itemNo) {
        // Fetch UoM conversion factor asynchronously
        fetchUomConversionFactor(next.itemNo, value)
          .then(response => {
            const { factor, inventoryUOM: invUoM } = response.data;
            console.log('🔄 UoM Conversion:', {
              itemCode: next.itemNo,
              documentUoM: value,
              inventoryUOM: invUoM,
              factor,
              docQty: next.quantity,
              baseQty: parseNum(next.quantity) * factor
            });
            
            setLines(prevLines => prevLines.map((l, lIdx) => 
              lIdx === i ? { 
                ...l, 
                uomFactor: factor,
                inventoryUOM: invUoM
              } : l
            ));
          })
          .catch(error => {
            console.error('❌ Failed to fetch UoM conversion factor:', error);
            // Default to factor 1 if fetch fails
            setLines(prevLines => prevLines.map((l, lIdx) => 
              lIdx === i ? { ...l, uomFactor: 1 } : l
            ));
          });
      }
      
      next.total = fmtDec(calcLineTotal(next), numDec.total);
      return next;
    }));
  };

  const handleNumBlur = (field, target = 'line', i = null) => {
    const d = numDec[field];
    if (d === undefined) return;
    if (target === 'header') { setHeader(p => ({ ...p, [field]: fmtDec(p[field], d) })); return; }
    setLines(p => p.map((l, idx) => {
      if (idx !== i) return l;
      if (field === 'quantity' && l.batchManaged && Array.isArray(l.batches) && l.batches.length > 0) {
        return { ...l, [field]: String(roundTo(parseNum(l[field]), Math.max(d, 6))) };
      }
      return { ...l, [field]: fmtDec(l[field], d) };
    }));
  };

  const addLine = () => {
    // Validate the last line before adding a new one
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1];
      const lastIndex = lines.length - 1;
      const errors = {};
      
      // Check if last line has an item
      if (!String(lastLine.itemNo || '').trim()) {
        errors.itemNo = 'Item is required before adding a new line';
      }
      
      // Check if last line has HSN Code
      if (!String(lastLine.hsnCode || '').trim()) {
        errors.hsnCode = 'HSN Code is required before adding a new line';
      }
      
      // Check if last line has quantity
      if (!lastLine.quantity || Number(lastLine.quantity) <= 0) {
        errors.quantity = 'Quantity is required before adding a new line';
      }
      
      // Check if last line has unit price
      if (!lastLine.unitPrice || Number(lastLine.unitPrice) <= 0) {
        errors.unitPrice = 'Unit Price is required before adding a new line';
      }
      
      // Check if last line has Tax Code
      if (!String(lastLine.taxCode || '').trim()) {
        errors.taxCode = 'Tax Code is required before adding a new line';
      }
      
      // Check if last line has Warehouse
      if (!String(lastLine.whse || '').trim()) {
        errors.whse = 'Warehouse is required before adding a new line';
      }
      
      // If there are errors, show them and don't add new line
      if (Object.keys(errors).length > 0) {
        setValErrors(p => ({
          ...p,
          lines: { ...p.lines, [lastIndex]: errors },
          form: 'Please complete the current line before adding a new one.'
        }));
        setPageState(p => ({ 
          ...p, 
          error: 'Please complete the current line before adding a new one.' 
        }));
        return;
      }
    }
    
    // Clear errors and add new line with current header values
    setValErrors(p => ({ ...p, form: '' }));
    setPageState(p => ({ ...p, error: '' }));
    
    console.log('➕ [Delivery] Adding new line with header values:', {
      branch: header.branch,
      loc: header.branch,
      whse: header.warehouse
    });
    
    setLines(p => [...p, { 
      ...createLine(), 
      branch: header.branch || '', 
      loc: header.branch || '',
      whse: header.warehouse || ''
    }]);
  };

  const removeLine = (i) => {
    setValErrors(p => { const nl = { ...p.lines }; delete nl[i]; return { ...p, lines: nl, form: '' }; });
    setLines(p => p.filter((_, idx) => idx !== i));
  };

  const handleHeaderUdfChange = (k, v) => setHeaderUdfs(p => ({ ...p, [k]: v }));
  const handleRowUdfChange = (i, k, v) => setLines(p => p.map((l, idx) => idx === i ? { ...l, udf: { ...(l.udf || {}), [k]: v } } : l));
  const updateFormSetting = (g, k, prop, val) => setFormSettings(p => ({ ...p, [g]: { ...p[g], [k]: { ...p[g][k], [prop]: val } } }));

  // ── Address Modal handlers ────────────────────────────────────────────────
  const openAddressModal = (type) => {
    setAddressForm({
      streetNo: '', buildingFloorRoom: '', block: '', city: '', zipCode: '', county: '',
      state: '', countryRegion: '', addressName2: '', addressName3: '', gln: '', gstin: ''
    });
    setAddressModal({ type });
  };

  const closeAddressModal = () => {
    setAddressModal(null);
  };

  const saveAddressModal = () => {
    const formatted = [
      [addressForm.streetNo, addressForm.buildingFloorRoom].filter(Boolean).join(', '),
      [addressForm.block, addressForm.city].filter(Boolean).join(', '),
      [addressForm.county, addressForm.state, addressForm.zipCode].filter(Boolean).join(', '),
      addressForm.countryRegion
    ].filter(Boolean).join('\n');

    if (addressModal.type === 'shipTo') {
      setHeader(p => ({ ...p, shipTo: formatted }));
    } else {
      setHeader(p => ({ ...p, payTo: formatted }));
    }
    closeAddressModal();
  };

  const handleAddressFormChange = (e) => {
    const { name, value } = e.target;
    setAddressForm(p => ({ ...p, [name]: value }));
  };

  // ── Tax Info Modal handlers ───────────────────────────────────────────────
  const openTaxInfoModal = () => {
    setTaxInfoModal(true);
  };

  const closeTaxInfoModal = () => {
    setTaxInfoModal(false);
  };

  const saveTaxInfoModal = () => {
    closeTaxInfoModal();
  };

  // ── BP Modal handlers ─────────────────────────────────────────────────────
  const openBpModal = () => {
    setBpModal(true);
  };

  const closeBpModal = () => {
    setBpModal(false);
  };

  
  // ── State Modal handlers ──────────────────────────────────────────────────
  const openStateModal = () => {
    setStateModal(true);
  };

  const closeStateModal = () => {
    setStateModal(false);
  };

  const handleStateSelect = (state) => {
    setHeader(p => ({ ...p, placeOfSupply: state.Name || state.Code || '' }));
  };

  // ── BP Modal handlers ─────────────────────────────────────────────────────
  const handleBpSelect = (bp) => {
    const code = bp.CardCode;
    setHeader(prev => {
      const prep = { ...prev, vendor: code };
      const { nextHeader } = syncVendor(code, prep);
      nextHeader.contactPerson = '';
      // Reset address fields when vendor changes
      nextHeader.billToCode = '';
      nextHeader.billToAddress = '';
      nextHeader.shipToCode = '';
      nextHeader.shipToAddress = '';
      nextHeader.placeOfSupply = '';
      return nextHeader;
    });
    loadVendorDetails(code);
  };

  const handleTaxInfoFormChange = (e) => {
    const { name, value } = e.target;
    setTaxInfoForm(p => ({ ...p, [name]: value }));
  };

  // ── Browse Attachment handler ─────────────────────────────────────────────
  const handleBrowseAttachment = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from(e.target.files);
      alert(`Selected ${files.length} file(s). Upload functionality to be implemented.`);
    };
    input.click();
  };

  const openBatchModal = (lineIndex) => {
    const line = lines[lineIndex];
    if (!line?.itemNo) {
      setPageState(p => ({ ...p, error: 'Select an item before allocating batches.' }));
      return;
    }
    if (!line?.whse) {
      setPageState(p => ({ ...p, error: 'Select a warehouse before allocating batches.' }));
      return;
    }

    setBatchModal({ open: true, lineIndex, availableBatches: [], loading: true, error: '' });
    window.setTimeout(async () => {
      try {
        const response = await fetchBatchesByItem(line.itemNo, line.whse);
        setBatchModal(current => (
          current.open && current.lineIndex === lineIndex
            ? {
              open: true,
              lineIndex,
              availableBatches: response.data.batches || [],
              loading: false,
              error: '',
            }
            : current
        ));
      } catch (error) {
        setBatchModal(current => (
          current.open && current.lineIndex === lineIndex
            ? {
              open: true,
              lineIndex,
              availableBatches: [],
              loading: false,
              error: getErrMsg(error, 'Failed to load available batches.'),
            }
            : current
        ));
      }
    }, 0);
  };

  const closeBatchModal = () => {
    setBatchModal({ open: false, lineIndex: null, availableBatches: [], loading: false, error: '' });
  };

  const saveLineBatches = (nextBatches) => {
    if (batchModal.lineIndex == null) return;
    setLines(prev => prev.map((line, index) => {
      if (index !== batchModal.lineIndex) return line;

      const assignedBaseQty = sumBatchQty(nextBatches);
      const uomFactor = getLineUomFactor(line);
      const nextDocumentQty = uomFactor > 0
        ? roundTo(assignedBaseQty / uomFactor, 6)
        : roundTo(assignedBaseQty, 6);
      const updatedLine = {
        ...line,
        batches: nextBatches,
        quantity: String(nextDocumentQty),
      };

      return {
        ...updatedLine,
        total: fmtDec(calcLineTotal(updatedLine), numDec.total),
      };
    }));
    setValErrors(prev => ({
      ...prev,
      lines: {
        ...prev.lines,
        [batchModal.lineIndex]: {
          ...(prev.lines[batchModal.lineIndex] || {}),
          batches: '',
          quantity: '',
        },
      },
      form: '',
    }));
    closeBatchModal();
  };

  // ── HSN Modal handlers ────────────────────────────────────────────────────
  const openHSNModal = (lineIndex) => {
    setHsnModal({ open: true, lineIndex });
  };

  const closeHSNModal = () => {
    setHsnModal({ open: false, lineIndex: -1 });
  };

  const handleHSNSelect = (hsn) => {
    if (hsnModal.lineIndex >= 0) {
      setLines(prev => prev.map((line, idx) => 
        idx === hsnModal.lineIndex 
          ? { ...line, hsnCode: hsn.code || '' }
          : line
      ));
    }
    closeHSNModal();
  };

  // ── Item Selection Modal handlers ─────────────────────────────────────────
  const openQualityModal = (field, lineIndex) => {
    const optionMap = {
      buyerQuality: {
        title: 'List of Buyer Quality Values',
        options: refData.quality_options?.buyer || [],
        searchPlaceholder: 'Search buyer quality values',
        emptyMessage: 'No buyer quality values found',
      },
      sellerQuality: {
        title: 'List of Seller Quality Values',
        options: refData.quality_options?.seller || [],
        searchPlaceholder: 'Search seller quality values',
        emptyMessage: 'No seller quality values found',
      },
      buyerPrice: {
        title: 'List of Buyer Price Values',
        options: refData.price_options?.buyer || [],
        searchPlaceholder: 'Search buyer price values',
        emptyMessage: 'No buyer price values found',
      },
      sellerPrice: {
        title: 'List of Seller Price Values',
        options: refData.price_options?.seller || [],
        searchPlaceholder: 'Search seller price values',
        emptyMessage: 'No seller price values found',
      },
    };

    const nextConfig = optionMap[field] || {
      title: 'List of User-Defined Values',
      options: [],
      searchPlaceholder: 'Search values',
      emptyMessage: 'No values found',
      allowCreate: true,
    };

    setQualityModal({
      open: true,
      lineIndex,
      field,
      title: nextConfig.title,
      options: nextConfig.options,
      searchPlaceholder: nextConfig.searchPlaceholder,
      emptyMessage: nextConfig.emptyMessage,
      allowCreate: nextConfig.allowCreate !== false,
    });
  };

  const closeQualityModal = () => {
    setQualityModal({
      open: false,
      lineIndex: -1,
      field: '',
      title: 'List of User-Defined Values',
      options: [],
      searchPlaceholder: 'Search values',
      emptyMessage: 'No values found',
      allowCreate: true,
    });
  };

  const handleQualitySelect = (option) => {
    if (qualityModal.lineIndex < 0 || !qualityModal.field) return;

    setLines(prev => prev.map((line, idx) => (
      idx === qualityModal.lineIndex
        ? { ...line, [qualityModal.field]: option?.value || '' }
        : line
    )));
  };

  const handleQualityCreate = async ({ value, description }) => {
    const field = qualityModal.field;
    if (!field) return null;

    const response = await createDeliveryLookupValue(field, value, description);
    const createdOption = response?.data?.option || {
      value,
      description: description || value,
      label: description && description !== value ? `${value} - ${description}` : value,
    };
    const nextOptions = response?.data?.options || [];

    setRefData((prev) => {
      const next = { ...prev };

      if (field === 'buyerQuality' || field === 'sellerQuality') {
        next.quality_options = {
          ...(prev.quality_options || { buyer: [], seller: [] }),
          [field === 'buyerQuality' ? 'buyer' : 'seller']: nextOptions,
        };
      }

      if (field === 'buyerPrice' || field === 'sellerPrice') {
        next.price_options = {
          ...(prev.price_options || { buyer: [], seller: [] }),
          [field === 'buyerPrice' ? 'buyer' : 'seller']: nextOptions,
        };
      }

      return next;
    });

    setQualityModal((prev) => ({
      ...prev,
      options: nextOptions,
    }));

    return createdOption;
  };

  const openItemModal = async (lineIndex) => {
    console.log('🔍 Opening item modal for line:', lineIndex);
    setItemModal({ open: true, lineIndex, items: [], loading: true });
    
    try {
      console.log('📡 Fetching items from API...');
      const response = await fetchItemsForModal();
      console.log('✅ Items received:', response.data);
      console.log('📊 Items count:', response.data.items?.length || 0);
      
      setItemModal(prev => ({
        ...prev,
        items: response.data.items || [],
        loading: false,
      }));
    } catch (error) {
      console.error('❌ Failed to load items:', error);
      console.error('Error details:', error.response?.data || error.message);
      setItemModal(prev => ({
        ...prev,
        items: [],
        loading: false,
      }));
    }
  };

  const closeItemModal = () => {
    setItemModal({ open: false, lineIndex: -1, items: [], loading: false });
  };

  const handleItemSelect = async (item) => {
    if (itemModal.lineIndex < 0) return;
    
    const lineIndex = itemModal.lineIndex;
    
    console.log('🎯 [handleItemSelect] Item selected:', {
      ItemCode: item.ItemCode,
      ItemName: item.ItemName,
      BatchManaged: item.BatchManaged,
      ManBtchNum: item.ManBtchNum,
      isBatchManaged: isBatchManaged(item),
      SalesUnit: item.SalesUnit,
      InventoryUOM: item.InventoryUOM
    });
    
    try {
      const hsnRes = await fetchHSNCodeFromItem(item.ItemCode);
      const hsnData = hsnRes.data;
      
      // Get the current line to check warehouse
      const currentLine = lines[lineIndex];
      const itemIsBatchManaged = isBatchManaged(item);
      
      // Get UoM - prefer SalesUnit, fallback to InventoryUOM
      // Note: UoM codes can be numeric (e.g., "5.6" meaning 5.6BOX)
      const selectedUoM = item.SalesUnit || item.InventoryUOM || '';
      const displayUoM = selectedUoM;
      
      console.log('🔍 [handleItemSelect] Selected UoM:', {
        SalesUnit: item.SalesUnit,
        InventoryUOM: item.InventoryUOM,
        selectedUoM,
        displayUoM,
        UoMGroupEntry: item.UoMGroupEntry
      });
      
      // Log available UoMs for this item from UoM Group
      if (item.UoMGroupEntry && refData.uom_groups) {
        const uomGroup = refData.uom_groups.find(g => g.AbsEntry === item.UoMGroupEntry);
        if (uomGroup) {
          console.log('📦 [handleItemSelect] UoM Group Info:', {
            groupName: uomGroup.Name,
            availableUoMs: uomGroup.uomCodes,
            conversions: uomGroup.conversions
          });
        } else {
          console.warn('⚠️ [handleItemSelect] UoM Group not found:', item.UoMGroupEntry);
        }
      }
      
      // Fetch UoM conversion factor
      let uomFactor = 1;
      let inventoryUOM = item.InventoryUOM || '';
      
      if (selectedUoM && item.ItemCode) {
        try {
          console.log('🔍 [handleItemSelect] Fetching UoM conversion for:', {
            itemCode: item.ItemCode,
            selectedUoM,
            itemInventoryUOM: item.InventoryUOM
          });
          
          const uomRes = await fetchUomConversionFactor(item.ItemCode, selectedUoM);
          
          console.log('📦 [handleItemSelect] UoM API Response:', uomRes.data);
          
          uomFactor = uomRes.data.factor || 1;
          inventoryUOM = uomRes.data.inventoryUOM || item.InventoryUOM || '';
          
          const docQty = parseNum(currentLine.quantity);
          
          console.log('🔄 [handleItemSelect] UoM Conversion Applied:', {
            itemCode: item.ItemCode,
            documentUoM: selectedUoM,
            inventoryUOM,
            factor: uomFactor,
            documentQty: docQty,
            baseQty: docQty * uomFactor,
            calculation: `${docQty} ${selectedUoM} × ${uomFactor} = ${docQty * uomFactor} ${inventoryUOM}`
          });
        } catch (uomError) {
          console.error('❌ [handleItemSelect] Failed to fetch UoM conversion:', uomError);
          console.error('❌ [handleItemSelect] Error details:', {
            message: uomError.message,
            response: uomError.response?.data,
            status: uomError.response?.status
          });
        }
      } else {
        console.warn('⚠️ [handleItemSelect] Skipping UoM conversion - missing data:', {
          hasSelectedUoM: !!selectedUoM,
          hasItemCode: !!item.ItemCode
        });
      }
      
      // Check batch availability BEFORE updating state if item is batch-managed
      let hasBatchesAvailable = false;
      if (itemIsBatchManaged && currentLine.whse) {
        console.log('🔍 [handleItemSelect] Checking batch availability for:', {
          itemCode: item.ItemCode,
          warehouse: currentLine.whse
        });
        hasBatchesAvailable = await checkBatchAvailability(item.ItemCode, currentLine.whse);
        console.log('✅ [handleItemSelect] Batch availability result:', hasBatchesAvailable);
      }
      
      setLines(prev => prev.map((line, idx) => {
        if (idx === lineIndex) {
          const updatedLine = {
            ...line,
            itemNo: item.ItemCode || '',
            itemDescription: item.ItemName || '',
            sellerItem: line.sellerItem || item.ItemCode || '',
            uomCode: displayUoM, // Use the validated UoM for display
            hsnCode: hsnData.hsnCode || item.HSNCode || '',
            countryOfOrigin: item.ItemCountryOrg || line.countryOfOrigin || '',
            sacCode: item.SACEntry || line.sacCode || '',
            distRule: line.distRule || item.DistributionRule || '',
            whse: line.whse || item.DefaultWarehouse || '',
            stcode: line.stcode || item.TaxCodeAR || line.taxCode || '',
            batches: [],
            batchManaged: itemIsBatchManaged,
            hasBatchesAvailable: itemIsBatchManaged ? hasBatchesAvailable : false,
            inventoryUOM: inventoryUOM,
            uomFactor: uomFactor,
          };
          
          console.log('📝 [handleItemSelect] Updated line:', {
            itemNo: updatedLine.itemNo,
            batchManaged: updatedLine.batchManaged,
            hasBatchesAvailable: updatedLine.hasBatchesAvailable,
            warehouse: updatedLine.whse,
            uomCode: updatedLine.uomCode,
            inventoryUOM: updatedLine.inventoryUOM,
            uomFactor: updatedLine.uomFactor
          });
          
          // Auto-determine tax code
          const gstState = header.placeOfSupply;
          const companyState = refData.company_address?.State || selectedBranch?.State || '';
          
          if (gstState && companyState) {
            const determinedTaxCode = determineTaxCode(
              item,
              gstState,
              gstState,
              false,
              companyState,
              effectiveTaxCodes
            );
            
            if (determinedTaxCode) {
              updatedLine.taxCode = determinedTaxCode;
            }
          }
          
          updatedLine.total = fmtDec(calcLineTotal(updatedLine), numDec.total);
          return updatedLine;
        }
        return line;
      }));
      
      closeItemModal();
    } catch (error) {
      console.error('❌ [handleItemSelect] Error selecting item:', error);
      // Still set basic item info even if HSN fetch fails
      const currentLine = lines[lineIndex];
      const itemIsBatchManaged = isBatchManaged(item);
      const selectedUoM = item.SalesUnit || item.InventoryUOM || '';
      
      // Try to get UoM conversion in error case
      let uomFactor = 1;
      let inventoryUOM = item.InventoryUOM || '';
      
      if (selectedUoM && item.ItemCode) {
        try {
          const uomRes = await fetchUomConversionFactor(item.ItemCode, selectedUoM);
          uomFactor = uomRes.data.factor || 1;
          inventoryUOM = uomRes.data.inventoryUOM || item.InventoryUOM || '';
        } catch (uomError) {
          console.error('❌ [handleItemSelect] Failed to fetch UoM conversion in error handler:', uomError);
        }
      }
      
      // Check batch availability in error case too
      let hasBatchesAvailable = false;
      if (itemIsBatchManaged && currentLine.whse) {
        try {
          hasBatchesAvailable = await checkBatchAvailability(item.ItemCode, currentLine.whse);
        } catch (batchError) {
          console.error('❌ [handleItemSelect] Error checking batch availability:', batchError);
        }
      }
      
      setLines(prev => prev.map((line, idx) => {
        if (idx === lineIndex) {
          const updatedLine = {
            ...line,
            itemNo: item.ItemCode || '',
            itemDescription: item.ItemName || '',
            sellerItem: line.sellerItem || item.ItemCode || '',
            uomCode: selectedUoM,
            hsnCode: item.HSNCode || '',
            countryOfOrigin: item.ItemCountryOrg || line.countryOfOrigin || '',
            sacCode: item.SACEntry || line.sacCode || '',
            distRule: line.distRule || item.DistributionRule || '',
            whse: line.whse || item.DefaultWarehouse || '',
            stcode: line.stcode || item.TaxCodeAR || line.taxCode || '',
            batches: [],
            batchManaged: itemIsBatchManaged,
            hasBatchesAvailable: itemIsBatchManaged ? hasBatchesAvailable : false,
            inventoryUOM: inventoryUOM,
            uomFactor: uomFactor,
            total: fmtDec(calcLineTotal(line), numDec.total)
          };
          
          return updatedLine;
        }
        return line;
      }));
      closeItemModal();
    }
  };

  // ── Freight Selection Modal handlers ──────────────────────────────────────
  const openFreightModal = async () => {
    console.log('🚚 Opening freight modal, docEntry:', currentDocEntry);
    if (freightModal.freightCharges.length > 0) {
      setFreightModal(prev => ({ ...prev, open: true, loading: false }));
      return;
    }
    setFreightModal(prev => ({ ...prev, open: true, loading: true }));
    
    try {
      console.log('📡 Fetching freight charges from API...');
      const response = await fetchFreightCharges(currentDocEntry);
      console.log('✅ Freight charges received:', response.data);
      console.log('📊 Freight charges count:', response.data.freightCharges?.length || 0);
      
      setFreightModal({
        open: true,
        freightCharges: response.data.freightCharges || [],
        loading: false
      });
    } catch (error) {
      console.error('❌ Failed to load freight charges:', error);
      console.error('Error details:', error.response?.data || error.message);
      setFreightModal({
        open: true,
        freightCharges: [],
        loading: false
      });
    }
  };

  const closeFreightModal = () => {
    setFreightModal(prev => ({ ...prev, open: false, loading: false }));
  };

  const handleFreightApply = (summary) => {
    console.log('🚚 Applied freight charges:', summary);
    setFreightModal(prev => ({
      ...prev,
      open: false,
      loading: false,
      freightCharges: summary.rows || [],
    }));
    setHeader(prev => ({
      ...prev,
      freight: fmtDec(summary.totalNet || 0, numDec.freight),
    }));
  };

  // ── Sync warehouse and branch from header to lines ────────────────────────
  // Sync branch to all lines when header branch changes
  useEffect(() => {
    if (isHydratingDocumentRef.current) return;
    console.log('🔄 [Delivery] Branch sync useEffect triggered');
    console.log('🔄 [Delivery] header.branch value:', header.branch);
    console.log('🔄 [Delivery] header.branch type:', typeof header.branch);
    console.log('🔄 [Delivery] Current lines count:', lines.length);
    
    if (header.branch) {
      console.log('🔄 [Delivery] Syncing branch to all lines:', header.branch);
      setLines(prev => {
        console.log('🔄 [Delivery] Previous lines:', prev.map(l => ({ itemNo: l.itemNo, branch: l.branch, loc: l.loc })));
        const updated = prev.map(l => ({ 
          ...l, 
          branch: String(header.branch), 
          loc: String(header.branch)
        }));
        console.log('✅ [Delivery] Updated lines:', updated.map(l => ({ itemNo: l.itemNo, branch: l.branch, loc: l.loc })));
        return updated;
      });
    } else {
      console.log('⚠️ [Delivery] Branch is empty, skipping sync');
    }
  }, [header.branch]);
  
  // Initial sync: Set branch on existing lines when branch is first loaded
  useEffect(() => {
    if (isHydratingDocumentRef.current) return;
    if (header.branch && lines.length > 0) {
      const needsSync = lines.some(l => !l.branch || l.branch !== String(header.branch));
      if (needsSync) {
        console.log('🔄 [Delivery] Initial branch sync needed');
        setLines(prev => prev.map(l => ({ 
          ...l, 
          branch: String(header.branch), 
          loc: String(header.branch)
        })));
      }
    }
  }, [refData.branches]); // Trigger when branches are loaded

  // Debug: Log when lines change
  useEffect(() => {
    console.log('📝 [Delivery] Lines state changed:', lines.map(l => ({ itemNo: l.itemNo, branch: l.branch, loc: l.loc, whse: l.whse })));
  }, [lines]);
  
  // Debug: Log header.branch value
  useEffect(() => {
    console.log('🏢 [Delivery] Header branch value:', header.branch);
  }, [header.branch]);

  useEffect(() => {
    if (isHydratingDocumentRef.current) return;
    if (!header.branch || !refData.warehouses.length) return;

    const allowedWarehouseCodes = new Set(
      branchFilteredWarehouses.map(w => String(w.WhsCode || ''))
    );

    setLines(prev => prev.map(line => (
      line.whse && !allowedWarehouseCodes.has(String(line.whse))
        ? { ...line, whse: '', hasBatchesAvailable: false, batches: [] }
        : line
    )));
  }, [branchFilteredWarehouses, header.branch, refData.warehouses.length]);

  // Sync warehouse to all lines when header warehouse changes and refresh batch availability
  useEffect(() => {
    if (isHydratingDocumentRef.current) return;
    if (!header.warehouse) {
      setLines(prev => prev.map(l => ({ ...l, whse: '', hasBatchesAvailable: false, batches: [] })));
      return;
    }

    setLines(prev => prev.map((line, index) => {
      const next = { ...line, whse: header.warehouse };

      if (next.itemNo && next.batchManaged) {
        next.hasBatchesAvailable = false;
        next.batches = [];

        checkBatchAvailability(next.itemNo, header.warehouse).then(hasBatches => {
          setLines(prevLines => prevLines.map((l, idx) => (
            idx === index ? { ...l, hasBatchesAvailable: hasBatches } : l
          )));
        });
      } else {
        next.hasBatchesAvailable = false;
        next.batches = [];
      }

      return next;
    }));
  }, [header.warehouse]);

  // ── Recalculate Tax Codes on State/Address Changes ────────────────────────
  useEffect(() => {
    if (currentDocEntry) return;
    if (!header.vendor || !header.placeOfSupply) return;

    const companyState = refData.company_address?.State || selectedBranch?.State || '';
    
    if (!companyState) {
      console.warn('⚠️ Company state not available for tax recalculation');
      return;
    }

    console.log('🔄 Recalculating Tax Codes for All Lines:', {
      placeOfSupply: header.placeOfSupply,
      companyState,
      gstType: getGSTTypeLabel(companyState, header.placeOfSupply),
    });

    // Recalculate tax codes for all lines with items using functional update
    setLines(prevLines => {
      return recalculateAllTaxCodes(
        prevLines,
        refData.items,
        header.placeOfSupply,  // shipToState
        header.placeOfSupply,  // billToState
        false,                 // useBillToForTax
        companyState,
        effectiveTaxCodes
      );
    });
  }, [currentDocEntry, header.placeOfSupply, header.vendor, refData.company_address, selectedBranch, refData.items, effectiveTaxCodes]);

  // Continue in next part...

  // ── validation ────────────────────────────────────────────────────────────
  const validate = async () => {
    const isUpdate = !!currentDocEntry;
    const e = { header: {}, lines: {}, form: '' };
    
    // Frontend basic validation first
    if (!isUpdate) {
      const vc = String(header.vendor || '').trim();
      if (!vc) { e.header.vendor = 'Select a customer.'; e.form = 'Please correct the highlighted fields.'; return e; }
      if (!String(header.placeOfSupply || '').trim()) { e.header.placeOfSupply = 'Place of supply is required.'; e.form = 'Please correct the highlighted fields.'; return e; }
    }
    
    if (!String(header.postingDate || '').trim()) { e.header.postingDate = 'Posting date is required.'; e.form = 'Please correct the highlighted fields.'; return e; }
    if (!String(header.documentDate || '').trim()) { e.header.documentDate = 'Document date is required.'; e.form = 'Please correct the highlighted fields.'; return e; }
    if (!String(header.warehouse || '').trim()) { e.header.warehouse = 'Warehouse is required.'; e.form = 'Please correct the highlighted fields.'; return e; }

    const pop = lines.filter(l => String(l.itemNo || '').trim());
    if (!pop.length) { e.form = 'Add at least one item line.'; return e; }
    
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!String(l.itemNo || '').trim()) continue;

      if (!l.itemNo) {
        e.lines[i] = { ...(e.lines[i] || {}), itemNo: 'Item is required' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }

      if (!l.quantity || Number(l.quantity) <= 0) {
        e.lines[i] = { ...(e.lines[i] || {}), quantity: 'Quantity must be > 0' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }

      if (!l.hsnCode && !isUpdate) {
        e.lines[i] = { ...(e.lines[i] || {}), hsnCode: 'HSN Code is required' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }

      if ((!l.unitPrice || Number(l.unitPrice) <= 0) && !isUpdate) {
        e.lines[i] = { ...(e.lines[i] || {}), unitPrice: 'Unit Price must be > 0' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }

      if (!l.uomCode && !isUpdate) {
        e.lines[i] = { ...(e.lines[i] || {}), uomCode: 'UoM is required' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }

      if (!l.whse && !isUpdate) {
        e.lines[i] = { ...(e.lines[i] || {}), whse: 'Warehouse is required' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }

      // Enhanced tax code validation
      if (!l.taxCode || l.taxCode === 'Select' || l.taxCode === '') {
        e.lines[i] = { ...(e.lines[i] || {}), taxCode: 'Please select a valid Tax Code' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }

      // Enhanced batch validation with UoM conversion
      if (l.batchManaged && l.hasBatchesAvailable !== false) {
        if (!Array.isArray(l.batches) || l.batches.length === 0) {
          e.lines[i] = { ...(e.lines[i] || {}), batches: 'Batch selection is mandatory for batch-managed item' };
          e.form = 'Please correct the highlighted fields.';
          return e;
        }
        
        const baseQty = getRequiredBatchQty(l);
        const batchQty = sumBatchQty(l.batches);
        const inventoryUOM = l.inventoryUOM || l.uomCode || '';
        
        if (Math.abs(batchQty - baseQty) > BATCH_QTY_TOLERANCE) {
          e.lines[i] = { ...(e.lines[i] || {}), batches: `Batch quantity (${batchQty.toFixed(2)} ${inventoryUOM}) must match base quantity (${baseQty.toFixed(2)} ${inventoryUOM})` };
          e.form = 'Please correct the highlighted fields.';
          return e;
        }
      }
      
      const hasTaxCode = String(l.taxCode || '').trim();
      const taxCodeExists = !hasTaxCode || effectiveTaxCodes.some(t => String(t.Code) === String(l.taxCode));
      if (!taxCodeExists) {
        e.lines[i] = { ...(e.lines[i] || {}), taxCode: `Tax code '${l.taxCode}' is not valid in SAP B1` };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }
    }
    
    // If frontend validation passes, call backend validation
    try {
      const validationPayload = {
        header: {
          customerCode: header.vendor,
          postingDate: header.postingDate,
          documentDate: header.documentDate,
          branch: header.branch,
          series: header.series
        },
        lines: lines.filter(l => String(l.itemNo || '').trim()).map(l => ({
          itemNo: l.itemNo,
          quantity: l.quantity,
          whse: l.whse,
          taxCode: l.taxCode,
          uomCode: l.uomCode,
          uomFactor: l.uomFactor,
          inventoryUOM: l.inventoryUOM,
          batchManaged: l.batchManaged,
          batches: l.batches || []
        }))
      };

      const backendValidation = await validateDeliveryDocument(validationPayload);
      
      if (!backendValidation.data.success) {
        // Map backend validation errors to frontend format
        const backendErrors = backendValidation.data.errors;
        
        for (const error of backendErrors) {
          if (error.includes('Customer Code')) {
            e.header.vendor = error;
          } else if (error.includes('Posting Date')) {
            e.header.postingDate = error;
          } else if (error.includes('Document Date')) {
            e.header.documentDate = error;
          } else if (error.includes('Branch')) {
            e.header.branch = error;
          } else if (error.includes('Tax Code')) {
            // Find the line number for tax code error
            const lineMatch = error.match(/line (\d+)/);
            if (lineMatch) {
              const lineIndex = parseInt(lineMatch[1]) - 1;
              e.lines[lineIndex] = { ...(e.lines[lineIndex] || {}), taxCode: 'Please select a valid Tax Code' };
            }
          } else if (
            error.includes('batch-managed') ||
            error.includes('Batch quantity') ||
            error.includes('exceeds available quantity')
          ) {
            // Find the line for batch error
            const itemMatch = error.match(/item ([^.,]+)/i);
            if (itemMatch) {
              const itemCode = itemMatch[1].trim();
              const lineIndex = lines.findIndex(l => l.itemNo === itemCode);
              if (lineIndex >= 0) {
                e.lines[lineIndex] = {
                  ...(e.lines[lineIndex] || {}),
                  batches: error.includes('batch-managed')
                    ? 'Batch selection is mandatory for batch-managed item'
                    : error
                };
              }
            }
          } else if (error.includes('Insufficient stock')) {
            // Find the line for stock error
            const itemMatch = error.match(/item ([A-Z0-9]+)/);
            if (itemMatch) {
              const itemCode = itemMatch[1];
              const lineIndex = lines.findIndex(l => l.itemNo === itemCode);
              if (lineIndex >= 0) {
                e.lines[lineIndex] = { ...(e.lines[lineIndex] || {}), quantity: error };
              }
            }
          } else if (error.includes('Warehouse') && error.includes('branch')) {
            // Find the line for warehouse-branch error
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].whse) {
                e.lines[i] = { ...(e.lines[i] || {}), whse: 'Warehouse does not belong to selected branch' };
                break;
              }
            }
          } else if (error.includes('Series')) {
            e.header.series = error;
          } else {
            // Generic error
            e.form = error;
          }
        }
        
        e.form = e.form || 'Please correct the highlighted fields.';
      }
    } catch (validationError) {
      console.error('Backend validation error:', validationError);
      // Don't fail submission if backend validation fails, just log it
      // Frontend validation already passed
    }
    
    // Validate GST tax code combinations (after loop)
    const taxCodesUsed = new Set(pop.map(l => l.taxCode).filter(Boolean));
    const sgstCodes = Array.from(taxCodesUsed).filter(code => String(code || '').toUpperCase().includes('SGST'));
    const cgstCodes = Array.from(taxCodesUsed).filter(code => String(code || '').toUpperCase().includes('CGST'));

    if (sgstCodes.length > 0 && cgstCodes.length === 0) {
      e.form = 'SGST requires CGST to be applied as well. Please check tax codes in line items.';
      return e;
    }
    if (cgstCodes.length > 0 && sgstCodes.length === 0) {
      e.form = 'CGST requires SGST to be applied as well. Please check tax codes in line items.';
      return e;
    }
    if (sgstCodes.length > 0 && cgstCodes.length > 0) {
      const sgstRates = sgstCodes.map(code => {
        const tax = effectiveTaxCodes.find(t => t.Code === code);
        return tax ? parseNum(tax.Rate) : 0;
      });
      const cgstRates = cgstCodes.map(code => {
        const tax = effectiveTaxCodes.find(t => t.Code === code);
        return tax ? parseNum(tax.Rate) : 0;
      });
      if (sgstRates[0] !== cgstRates[0]) {
        e.form = 'SGST and CGST rates must be equal. Please check tax codes in line items.';
        return e;
      }
    }

    // Prevent save if total is 0
    const currentTotals = calcTotals();
    if (currentTotals.total <= 0) {
      e.form = 'Total amount must be greater than 0. Please add items with valid prices.';
      return e;
    }

    return e;
  };

  // ── Copy From handler ─────────────────────────────────────────────────────
  const handleCopyFrom = (data, sourceType) => {
    const baseType = BASE_TYPE[sourceType] || 17;
    const normHeader = normaliseDocumentHeader(data);

    setHeader(prev => ({ ...prev, ...normHeader }));

    const rawLines = data.DocumentLines || data.lines || [];
    const newLines = rawLines.map((line, idx) =>
      ({ ...createLine(), ...normaliseDocumentLine(line, idx, data.DocEntry || data.docEntry, baseType, normHeader.branch) })
    );
    setLines(newLines.length > 0 ? newLines : [createLine()]);

    const cardCode = normHeader.vendor;
    if (cardCode && cardCode !== header.vendor) loadVendorDetails(cardCode);

    const labels = { salesOrder: 'Sales Order', salesQuotation: 'Sales Quotation', delivery: 'Delivery', returns: 'Return', blanket: 'Blanket Agreement' };
    setPageState(p => ({ ...p, success: `Copied from ${labels[sourceType] || sourceType}` }));
  };

  // ── Copy From Modal Handlers ───────────────────────────────────────────────
  const openCopyFromModal = (docType) => {
    console.log('🟢 Copy From Clicked');

    // ✅ ONLY BUYER VALIDATION
    if (!header.vendor) {
      setValErrors({
        header: { vendor: 'Select Customer first' },
        lines: {},
        form: ''
      });
      return;
    }

    // ✅ CLEAR ALL ERRORS
    setValErrors({ header: {}, lines: {}, form: '' });
    setPageState(p => ({ ...p, error: '', success: '' }));

    setCopyFromDocType(docType);
    setCopyFromModal(true);
  };

  // ── Copy From fetch handlers ───────────────────────────────────────────────
  const fetchCopyFromDocuments = async (docType) => {
    try {
      // Sales Quotations: use dedicated API
      if (docType === 'salesQuotation') {
        const res = await fetchOpenSalesQuotationsForDelivery();
        return res?.data?.quotations || [];
      }
      // Sales Orders: filter by current customer for relevance
      if (docType === 'salesOrder') {
        const res = await fetchOpenSalesOrders(header.vendor || null);
        return res?.data?.orders || [];
      }
      // Returns (AR Credit Memo): use dedicated API
      if (docType === 'returns') {
        const res = await fetchOpenReturnsForDelivery();
        return res?.data?.creditMemos || [];
      }
      // Blanket Agreements: use dedicated API
      if (docType === 'blanket') {
        const res = await fetchOpenBlanketAgreementsForDelivery();
        return res?.data?.agreements || [];
      }
      return await deliveryCopyFromApi.fetchOpenDocuments(docType);
    } catch (err) {
      console.error('Error fetching documents:', err);
      throw err;
    }
  };

  const fetchCopyFromDocumentDetails = async (docType, docEntry) => {
    try {
      if (docType === 'salesQuotation') {
        const res = await fetchSalesQuotationForDeliveryCopy(docEntry);
        return res.data;
      }
      if (docType === 'salesOrder') {
        const res = await fetchSalesOrderForCopy(docEntry);
        return res.data;
      }
      if (docType === 'returns') {
        const res = await fetchReturnForDeliveryCopy(docEntry);
        return res.data;
      }
      if (docType === 'blanket') {
        const res = await fetchBlanketAgreementForDeliveryCopy(docEntry);
        return res.data;
      }
      return await deliveryCopyFromApi.fetchDocumentForCopy(docType, docEntry);
    } catch (err) {
      console.error('Error fetching document details:', err);
      throw err;
    }
  };

  // ── Copy To handler ───────────────────────────────────────────────────────
  const handleCopyTo = (targetType) => {
    if (!currentDocEntry) {
      setPageState(p => ({ ...p, error: 'Please save the delivery first before copying to another document.' }));
      return;
    }

    // Build the copyFrom state that target pages expect
    const copyState = {
      copyFrom: {
        type: 'delivery',
        docEntry: currentDocEntry,
        header: { ...header },
        lines: lines.map((l, idx) => ({ ...l, lineNum: idx })),
        baseDocument: {
          baseType:  15, // Delivery
          baseEntry: currentDocEntry,
        },
      }
    };

    if (targetType === 'ar-invoice') {
      navigate('/ar-invoice', { state: copyState });
    } else if (targetType === 'ar-credit-memo') {
      navigate('/ar-credit-memo', { state: copyState });
    } else if (targetType === 'return') {
      navigate('/ar-credit-memo', { state: { ...copyState, isReturn: true } });
    }
  };

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!isDocumentEditable) {
      setPageState(p => ({ ...p, error: 'This document is closed and cannot be edited.', success: '' }));
      return;
    }
    const e = await validate(); // Make validate async
    if (e.form || Object.values(e.header).some(Boolean) || Object.values(e.lines).some(le => Object.values(le || {}).some(Boolean))) {
      setValErrors(e);
      setPageState(p => ({ ...p, error: e.form || 'Please correct the highlighted fields.', success: '' }));
      return;
    }
    setValErrors({ header: {}, lines: {}, form: '' });
    setPageState(p => ({ ...p, posting: true, error: '', success: '' }));
    try {
      const prep = { 
        ...header, 
        deliveryDate: header.deliveryDate || header.postingDate || header.documentDate,
        placeOfSupply: header.placeOfSupply,
        branch: header.branch,
        contactPerson: header.contactPerson,
        series: header.series ? Number(header.series) : undefined,
      };
      
      const payload = { company_id: SALES_ORDER_COMPANY_ID, header: prep, lines, freightCharges: freightModal.freightCharges, header_udfs: headerUdfs };
      const r = currentDocEntry ? await updateDelivery(currentDocEntry, payload) : await submitDelivery(payload);
      const dn = r.data.doc_num ? ` Doc No: ${r.data.doc_num}.` : '';
      setCurrentDocEntry(null); setHeader(INIT_HEADER); setLines([createLine()]);
      setHeaderUdfs(createUdfState(HEADER_UDF_DEFINITIONS)); setActiveTab('Contents');
      setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [] }));
      setValErrors({ header: {}, lines: {}, form: '' });
      
      if (refData.series.length > 0) {
        handleSeriesChange(refData.series[0].Series);
      }
      
      setPageState(p => ({ ...p, success: `${r.data.message || 'Sales order saved.'}${dn}` }));
    } catch (e) {
      setPageState(p => ({ ...p, error: getErrMsg(e, 'Sales order submission failed.') }));
    } finally {
      setPageState(p => ({ ...p, posting: false }));
    }
  };

  const resetForm = () => {
    setCurrentDocEntry(null); setHeader(INIT_HEADER); setLines([createLine()]);
    setHeaderUdfs(createUdfState(HEADER_UDF_DEFINITIONS)); setActiveTab('Contents');
    setValErrors({ header: {}, lines: {}, form: '' });
    setPageState(p => ({ ...p, error: '', success: '' }));
  };

  const visHdrUdfs = HEADER_UDF_DEFINITIONS.filter(f => formSettings.headerUdfs?.[f.key]?.visible !== false);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
      if (pageState.posting || !isDocumentEditable) return;

      const key = String(event.key || '').toLowerCase();
      const shouldSubmit = (!isUpdateMode && key === 'a') || (isUpdateMode && key === 'u');
      if (!shouldSubmit) return;

      event.preventDefault();
      formRef.current?.requestSubmit();
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [isDocumentEditable, isUpdateMode, pageState.posting]);

  // Continue in next part with render...

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <form ref={formRef} className="del-page" onSubmit={handleSubmit}>

      {/* toolbar */}
      <div className="del-toolbar">
        <span className="del-toolbar__title">Delivery{currentDocEntry ? ` — #${header.docNo || currentDocEntry}` : ''}</span>
        <button type="submit" className="del-btn del-btn--primary" disabled={pageState.posting || !isDocumentEditable} title={primaryActionLabel}>
          {primaryActionLabel}
        </button>
        <button type="button" className="del-btn" disabled={pageState.posting || !isDocumentEditable}>
          Add Draft & New
        </button>
        <button type="button" className="del-btn" onClick={resetForm}>
          Cancel
        </button>
      
        <button
          type="button"
          className="del-btn"
          onClick={() => {
            setSidebarOpen(p => !p);
          }}
        >
          {sidebarOpen ? 'Hide UDFs' : 'Show UDFs'}
        </button>
        <button type="button" className="del-btn" onClick={() => setFormSettingsOpen(p => !p)}>
          Form Settings
        </button>
        <div className="del-dropdown" style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="del-btn"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setValErrors({ header: {}, lines: {}, form: '' });
              setPageState(p => ({ ...p, error: '', success: '' }));
              const dropdown = e.currentTarget.parentElement;
              const isActive = dropdown.classList.contains('active');
              document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
              if (!isActive) dropdown.classList.add('active');
            }}
          >
            Copy From ▼
          </button>
          <div className="del-dropdown-menu">
            {[
              { key: 'salesQuotation', label: 'Sales Quotations' },
              { key: 'salesOrder',     label: 'Sales Orders' },
              { key: 'returns',        label: 'Returns' },
              { key: 'blanket',        label: 'Blanket Agreement' },
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCopyFromModal(opt.key);
                  document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="del-dropdown" style={{ position: 'relative', display: 'inline-block' }}>
          <button
            type="button"
            className="del-btn"
            disabled={!currentDocEntry}
            style={{ opacity: !currentDocEntry ? 0.5 : 1 }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!currentDocEntry) return;
              const dropdown = e.currentTarget.parentElement;
              const isActive = dropdown.classList.contains('active');
              document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
              if (!isActive) dropdown.classList.add('active');
            }}
          >
            Copy To ▼
          </button>
          <div className="del-dropdown-menu">
            {[
              { key: 'return',         label: 'Return Request' },
              { key: 'ar-invoice',     label: 'A/R Invoice' },
              { key: 'ar-credit-memo', label: 'A/R Credit Memo' },
            ].map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleCopyTo(opt.key);
                  document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="del-btn" onClick={() => navigate('/delivery/find')}>Find</button>
        <button type="button" className="del-btn" onClick={resetForm}>New</button>
      </div>

      {/* alerts */}
      {pageState.loading && <div className="del-alert del-alert--success" style={{ marginTop: 0 }}>Loading…</div>}
      {pageState.error && <div className="del-alert del-alert--error">{pageState.error}</div>}
      {pageState.success && <div className="del-alert del-alert--success">{pageState.success}</div>}
      {refData.warnings?.length > 0 && (
        <div className="alert alert-warning py-2" style={{ fontSize: 11 }}>
          <strong>SAP warnings:</strong>
          {refData.warnings.map((w, i) => <div key={i}>{w}</div>)}
          <div style={{ marginTop: 4, color: '#555' }}>Dropdowns are showing fallback values. Connect to SAP to load live data.</div>
          <div style={{ marginTop: 4, color: '#d00', fontWeight: 600 }}>⚠️ Tax codes shown are examples only. Use actual SAP tax codes to avoid submission errors.</div>
        </div>
      )}

      <fieldset disabled={!isDocumentEditable} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <div className={`del-layout${sidebarOpen ? ' is-sidebar-open' : ''}`} style={{ padding: '0 12px', overflow: 'visible', minWidth: 0 }}>

          <div className="del-layout__main" style={{ minWidth: 0, overflow: 'visible' }}>

            {/* ══ HEADER CARD ══════════════════════════════════════════════ */}
            <div className="del-header-card">
              <div className="row g-2">
                {/* LEFT COLUMN */}
                <div className="col-md-6">
                  <div className="del-field-grid" style={{ gridTemplateColumns: '1fr' }}>
                    
                    {/* Buyer's Code */}
                    <div className="del-field">
                      <label className="del-field__label">Buyer's Code *</label>
                      <div style={{ display: 'flex', gap: '3px', flex: 1 }}>
                         <input
                          name="vendor"
                          className={`so-field__input${valErrors.header.vendor ? ' so-field__input--error' : ''}`}
                          value={header.vendor}
                          onChange={handleHeaderChange}
                          disabled={!!currentDocEntry}
                          placeholder="Customer code"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={openBpModal}
                          disabled={!!currentDocEntry}
                          style={{
                            padding: '0 8px',
                            fontSize: 11,
                            border: '1px solid #a0aab4',
                            background: 'linear-gradient(180deg, #fff 0%, #e8ecf0 100%)',
                            minWidth: '28px'
                          }}
                          title="Select Business Partner"
                        >
                          ...
                        </button>
                      </div>
                    </div>

                    {/* Buyer's Name */}
                    <div className="del-field">
                      <label className="del-field__label">Buyer's Name</label>
                      <input name="name" className="del-field__input" value={header.name} readOnly />
                    </div>

                    <fieldset disabled={!hasBuyerCode} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                    {/* Contact Person */}
                    <div className="del-field">
                      <label className="del-field__label">Contact Person</label>
                      <select
                        name="contactPerson"
                        className="del-field__select"
                        value={header.contactPerson || ''}
                        onChange={handleHeaderChange}
                        disabled={pageState.vendorLoading || !header.vendor || !!currentDocEntry}
                      >
                        <option value="">Select</option>
                        {contactOptions.map(c => (
                          <option key={c.CntctCode} value={c.CntctCode}>
                            {c.Name || `${c.FirstName || ''} ${c.LastName || ''}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Place of Supply */}
                    <div className="del-field">
                      <label className="del-field__label">Place of Supply *</label>
                      <div style={{ display: 'flex', gap: '3px', flex: 1 }}>
                        <input
                          name="placeOfSupply"
                          className={`so-field__input${valErrors.header.placeOfSupply ? ' so-field__input--error' : ''}`}
                          value={header.placeOfSupply || ''}
                          onChange={handleHeaderChange}
                          placeholder="State code"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={openStateModal}
                          style={{
                            padding: '0 8px',
                            fontSize: 11,
                            border: '1px solid #a0aab4',
                            background: 'linear-gradient(180deg, #fff 0%, #e8ecf0 100%)',
                            minWidth: '28px'
                          }}
                          title="Select State"
                        >
                          ...
                        </button>
                      </div>
                    </div>

                    {/* Payment Terms */}
                    <div className="del-field">
                      <label className="del-field__label">Payment Terms</label>
                      <select name="paymentTerms" className="del-field__select" value={header.paymentTerms} onChange={handleHeaderChange}>
                        <option value="">Select</option>
                        {payTermOpts.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>

                    {/* Branch */}
                    <div className="del-field">
                      <label className="del-field__label">Branch</label>
                      <select name="branch" className={`del-field__select${valErrors.header.branch ? ' del-field__select--error' : ''}`} value={header.branch} onChange={handleHeaderChange} disabled={!!currentDocEntry}>
                        <option value="">Select Branch</option>
                        {refData.branches.map(b => (
                          <option key={b.BPLId} value={b.BPLId}>
                            {b.BPLName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Warehouse */}
                    <div className="del-field">
                      <label className="del-field__label">Warehouse *</label>
                      <select 
                        name="warehouse" 
                        className={`del-field__select${valErrors.header.warehouse ? ' del-field__select--error' : ''}`}
                        value={header.warehouse || ''} 
                        onChange={handleHeaderChange}
                      >
                        <option value="">Select Warehouse</option>
                        {branchFilteredWarehouses.map(w => (
                          <option key={w.WhsCode} value={w.WhsCode}>
                            {w.WhsCode} - {w.WhsName}
                          </option>
                        ))}
                      </select>
                    </div>
                    </fieldset>

                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="col-md-6">
                  <fieldset disabled={!hasBuyerCode} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                  <div className="del-field-grid" style={{ gridTemplateColumns: '1fr' }}>

                    {/* Series */}
                    <div className="del-field">
                      <label className="del-field__label">Series</label>
                      <select 
                        name="series"
                        className="del-field__select" 
                        value={header.series}
                        onChange={handleHeaderChange}
                        disabled={!!currentDocEntry || pageState.seriesLoading}
                      >
                        <option value="">Select Series</option>
                        {refData.series.map(s => (
                          <option key={s.Series} value={s.Series}>
                            {s.SeriesName} ({s.Indicator})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto Number */}
                    <div className="del-field">
                      <label className="del-field__label">Number</label>
                      <input 
                        name="nextNumber" 
                        className="del-field__input" 
                        value={pageState.seriesLoading ? '...' : header.nextNumber} 
                        readOnly 
                        style={{ background: '#f0f2f5' }}
                        title="Number will be assigned after saving"
                      />
                    </div>

                    {/* Customer Ref. No. */}
                    <div className="del-field">
                      <label className="del-field__label">Customer Ref. No.</label>
                      <input name="salesContractNo" className="del-field__input" value={header.salesContractNo} onChange={handleHeaderChange} />
                    </div>

                    {/* Status */}
                    <div className="del-field">
                      <label className="del-field__label">Status</label>
                      <input name="status" className="del-field__input" value={header.status} readOnly style={{ background: '#f0f2f5', color: header.status === 'Open' ? '#1a7a30' : '#c00', fontWeight: 600 }} />
                    </div>

                    {/* Posting Date */}
                    <div className="del-field">
                      <label className="del-field__label">Posting Date *</label>
                      <input type="date" name="postingDate" className={`del-field__input${valErrors.header.postingDate ? ' del-field__input--error' : ''}`} value={header.postingDate} onChange={handleHeaderChange} />
                    </div>

                    {/* Delivery Date */}
                    <div className="del-field">
                      <label className="del-field__label">Delivery Date</label>
                      <input type="date" name="deliveryDate" className="del-field__input" value={header.deliveryDate} onChange={handleHeaderChange} />
                    </div>

                    {/* Document Date */}
                    <div className="del-field">
                      <label className="del-field__label">Document Date *</label>
                      <input type="date" name="documentDate" className={`del-field__input${valErrors.header.documentDate ? ' del-field__input--error' : ''}`} value={header.documentDate} onChange={handleHeaderChange} />
                    </div>

                  </div>
                  </fieldset>
                </div>
              </div>
            </div>

            {/* ══ TABS ══════════════════════════════════════════════════════ */}
            <fieldset disabled={!hasBuyerCode} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <div className="del-tabs">
              {TAB_NAMES.map(t => (
                <button 
                  key={t}
                  type="button" 
                  className={`del-tab${activeTab === t ? ' del-tab--active' : ''}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* ══ TAB CONTENT ═══════════════════════════════════════════════ */}
            {activeTab === 'Contents' && (
              <ContentsTab
                lines={lines}
                onLineChange={handleLineChange}
                onNumBlur={handleNumBlur}
                onAddLine={addLine}
                onRemoveLine={removeLine}
                onOpenBatchModal={openBatchModal}
                onOpenHSNModal={openHSNModal}
                onOpenItemModal={openItemModal}
                lineItemOptions={lineItemOptions}
                getUomOptions={getUomOptions}
                effectiveTaxCodes={effectiveTaxCodes}
                effectiveWarehouses={branchFilteredWarehouses}
                fmtTaxLabel={fmtTaxLabel}
                getBranchName={getBranchName}
                valErrors={valErrors}
                distributionRules={refData.distribution_rules || []}
                onOpenQualityModal={openQualityModal}
                formSettings={formSettings}
              />
            )}

            {activeTab === 'Logistics' && (
              <LogisticsTab
                header={header}
                onHeaderChange={handleHeaderChange}
                effectiveWhseAddrs={effectiveWhseAddrs}
                vendorPayToAddresses={vendorPayToAddresses}
                shipTypeOpts={shipTypeOpts}
                onOpenAddressModal={openAddressModal}
              />
            )}

            {activeTab === 'Accounting' && (
              <AccountingTab
                header={header}
                onHeaderChange={handleHeaderChange}
                payTermOpts={payTermOpts}
              />
            )}

            {activeTab === 'Tax' && (
              <TaxTab onOpenTaxInfoModal={openTaxInfoModal} />
            )}

            {activeTab === 'Electronic Documents' && (
              <ElectronicDocumentsTab />
            )}

            {activeTab === 'Attachments' && (
              <AttachmentsTab
                attachments={attachments}
                onBrowseAttachment={handleBrowseAttachment}
              />
            )}

            {/* Continue in next part... */}

            {/* ══ TOTALS FOOTER ═════════════════════════════════════════════ */}
            <div className="del-header-card">
              <div className="del-field-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <div className="del-field">
                    <label className="del-field__label">Sales Employee</label>
                    <select name="purchaser" className="del-field__select" value={header.purchaser || ''} onChange={handleHeaderChange}>
                      <option value="">No Sales Employee / Buyer</option>
                      <option value="ASM">ASM</option>
                      <option value="Deepak Kothari">Deepak Kothari</option>
                      <option value="Dhaval">Dhaval</option>
                      <option value="Mala Garma">Mala Garma</option>
                      <option value="OM">OM</option>
                      <option value="Rajkumar Munjal">Rajkumar Munjal</option>
                      <option value="Zach Ibarra">Zach Ibarra</option>
                      <option value="Define New">Define New</option>
                    </select>
                  </div>
                  <div className="del-field">
                    <label className="del-field__label">Owner</label>
                    <input name="owner" className="del-field__input" value={header.owner || ''} onChange={handleHeaderChange} />
                  </div>
                  <div className="del-field">
                    <label className="del-field__label">Remarks</label>
                    <textarea className="del-textarea" rows={3} name="otherInstruction" value={header.otherInstruction} onChange={handleHeaderChange} />
                  </div>
                </div>
                <div>
                  <div className="del-section-title">Tax Summary</div>
                  {totals.taxBreakdown.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      {totals.taxBreakdown.map(t => (
                        <div key={t.taxCode} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                          <span>{t.taxCode} ({t.taxRate}%)</span>
                          <span>{fmtDec(t.taxAmount, numDec.tax)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="del-grid-wrap">
                    <table className="del-grid" style={{ marginTop: '8px' }}>
                      <tbody>
                        <tr>
                          <td>Total Before Discount</td>
                          <td className="del-grid__cell--num"><input className="del-grid__input" value={fmtDec(totals.subtotal, numDec.total)} readOnly /></td>
                        </tr>
                        <tr>
                          <td>Discount %</td>
                          <td className="del-grid__cell--num"><input className="del-grid__input" name="discount" value={header.discount} onChange={handleHeaderChange} onBlur={() => handleNumBlur('discount', 'header')} /></td>
                        </tr>
                        <tr>
                          <td>Freight</td>
                          <td className="del-grid__cell--num" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input 
                              className="del-grid__input" 
                              name="freight" 
                              value={header.freight} 
                              onChange={handleHeaderChange} 
                              onBlur={() => handleNumBlur('freight', 'header')} 
                              style={{ flex: 1 }}
                            />
                            <button
                              type="button"
                              onClick={openFreightModal}
                              style={{
                                padding: '2px 8px',
                                fontSize: '11px',
                                border: '1px solid #d0d7de',
                                borderRadius: '3px',
                                background: 'linear-gradient(180deg, #f6f8fa 0%, #e9ecef 100%)',
                                cursor: 'pointer',
                                minWidth: '24px'
                              }}
                              title="Select Freight Charge"
                            >
                              ...
                            </button>
                          </td>
                        </tr>
                        <tr>
                          <td><input type="checkbox" className="" name="rounding" checked={header.rounding} onChange={handleHeaderChange} style={{ marginRight: 6 }} /><span>Rounding</span></td>
                          <td></td>
                        </tr>
                        <tr>
                          <td>Tax</td>
                          <td className="del-grid__cell--num"><input className="del-grid__input" value={fmtDec(totals.taxAmt, numDec.tax)} readOnly /></td>
                        </tr>
                        <tr style={{ borderTop: '2px solid #a0aab4' }}>
                          <td style={{ fontWeight: 700, color: '#003366' }}>Total</td>
                          <td className="del-grid__cell--num" style={{ fontWeight: 700, color: '#003366' }}><input className="del-grid__input" style={{ fontWeight: 700, color: '#003366' }} value={fmtDec(totals.total, numDec.totalPaymentDue)} readOnly /></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>

            {/* ══ ACTION BUTTONS ════════════════════════════════════════════ */}
            {false && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', marginBottom: '12px', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="submit" className="del-btn del-btn--primary" disabled={pageState.posting}>
                  {pageState.posting ? 'Saving…' : currentDocEntry ? 'Update' : 'Add & New'}
                </button>
                <button type="button" className="del-btn" disabled={pageState.posting}>
                  Add Draft & New
                </button>
                <button type="button" className="del-btn" onClick={resetForm}>
                  Cancel
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {/* Copy From Dropdown - SAP B1 style, same as Sales Order */}
                <div className="del-dropdown">
                  <button
                    type="button"
                    className="del-btn"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setValErrors({ header: {}, lines: {}, form: '' });
                      setPageState(p => ({ ...p, error: '', success: '' }));
                      const dropdown = e.currentTarget.parentElement;
                      const isActive = dropdown.classList.contains('active');
                      document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
                      if (!isActive) dropdown.classList.add('active');
                    }}
                  >
                    Copy From ▼
                  </button>
                  <div className="del-dropdown-menu">
                    {[
                      { key: 'salesQuotation', label: 'Sales Quotations' },
                      { key: 'salesOrder',     label: 'Sales Orders' },
                      { key: 'returns',        label: 'Returns' },
                      { key: 'blanket',        label: 'Blanket Agreement' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          openCopyFromModal(opt.key);
                          document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Copy To Dropdown - SAP B1 style */}
                <div className="del-dropdown">
                  <button
                    type="button"
                    className="del-btn"
                    disabled={!currentDocEntry}
                    style={{ opacity: !currentDocEntry ? 0.5 : 1 }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!currentDocEntry) return;
                      const dropdown = e.currentTarget.parentElement;
                      const isActive = dropdown.classList.contains('active');
                      document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
                      if (!isActive) dropdown.classList.add('active');
                    }}
                  >
                    Copy To ▼
                  </button>
                  <div className="del-dropdown-menu">
                    {[
                      { key: 'return',        label: 'Return Request' },
                      { key: 'ar-invoice',    label: 'A/R Invoice' },
                      { key: 'ar-credit-memo',label: 'A/R Credit Memo' },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleCopyTo(opt.key);
                          document.querySelectorAll('.del-dropdown').forEach(d => d.classList.remove('active'));
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            )}

          </fieldset>

          </div>{/* end main col */}

          <fieldset className="del-layout__sidebar" disabled={!hasBuyerCode} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <HeaderUdfSidebar
                className="del-layout__sidebar"
                isOpen={sidebarOpen}
                fields={visHdrUdfs}
                formSettings={formSettings}
                values={headerUdfs}
                onFieldChange={handleHeaderUdfChange}
              />
          </fieldset>
        </div>
      </fieldset>

      {/* Form Settings Panel */}
      <FormSettingsPanel
        isOpen={formSettingsOpen}
        onClose={() => setFormSettingsOpen(false)}
        matrixFields={BASE_MATRIX_COLUMNS}
        headerUdfFields={HEADER_UDF_DEFINITIONS}
        rowUdfFields={ROW_UDF_DEFINITIONS}
        formSettings={formSettings}
        onSettingChange={updateFormSetting}
      />

      {/* Address Component Modal */}
      <AddressModal
        isOpen={!!addressModal}
        onClose={closeAddressModal}
        onSave={saveAddressModal}
        addressForm={addressForm}
        onFormChange={handleAddressFormChange}
        states={refData.states}
      />

      {/* Tax Information Modal */}
      <TaxInfoModal
        isOpen={taxInfoModal}
        onClose={closeTaxInfoModal}
        onSave={saveTaxInfoModal}
        taxInfoForm={taxInfoForm}
        onFormChange={handleTaxInfoFormChange}
      />

      <BatchAllocationModal
        isOpen={batchModal.open}
        line={batchModal.lineIndex != null ? lines[batchModal.lineIndex] : null}
        availableBatches={batchModal.availableBatches}
        loading={batchModal.loading}
        error={batchModal.error}
        onClose={closeBatchModal}
        onSave={saveLineBatches}
      />

      {/* State Selection Modal */}
      <StateSelectionModal
        isOpen={stateModal}
        onClose={closeStateModal}
        onSelect={handleStateSelect}
        states={refData.states || []}
      />

      {/* Business Partner Selection Modal */}
      <BusinessPartnerModal
        isOpen={bpModal}
        onClose={closeBpModal}
        onSelect={handleBpSelect}
        businessPartners={refData.vendors || []}
      />

      {/* HSN Code Selection Modal */}
      <HSNCodeModal
        isOpen={hsnModal.open}
        onClose={closeHSNModal}
        onSelect={handleHSNSelect}
      />

      {/* Item Selection Modal */}
      <ItemSelectionModal
        isOpen={itemModal.open}
        onClose={closeItemModal}
        onSelect={handleItemSelect}
        items={itemModal.items}
        loading={itemModal.loading}
      />

      <QualitySelectionModal
        isOpen={qualityModal.open}
        onClose={closeQualityModal}
        onSelect={handleQualitySelect}
        onCreate={handleQualityCreate}
        options={qualityModal.options}
        title={qualityModal.title}
        searchPlaceholder={qualityModal.searchPlaceholder}
        emptyMessage={qualityModal.emptyMessage}
        allowCreate={qualityModal.allowCreate}
      />

      {/* Copy From Modal */}
      <CopyFromModal
        isOpen={copyFromModal}
        onClose={() => setCopyFromModal(false)}
        onCopy={handleCopyFrom}
        documentType={copyFromDocType}
        onFetchDocuments={fetchCopyFromDocuments}
        onFetchDocumentDetails={fetchCopyFromDocumentDetails}
      />

      {/* Freight Selection Modal */}
      <FreightChargesModal
        isOpen={freightModal.open}
        onClose={closeFreightModal}
        onApply={handleFreightApply}
        freightCharges={freightModal.freightCharges}
        taxCodes={effectiveTaxCodes}
        loading={freightModal.loading}
      />
    </form>
  );
}

export default Delivery;
