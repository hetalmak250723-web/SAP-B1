import React, { useEffect, useState, useCallback } from 'react';
import './styles/SalesQuotation.css';
import '../../modules/item-master/styles/itemMaster.css';
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
import EWayBillModal from './components/EWayBillModal';
import TaxInfoModal from './components/TaxInfoModal';
import StateSelectionModal from './components/StateSelectionModal';
import BusinessPartnerModal from './components/BusinessPartnerModal';
import CopyFromModal from './components/CopyFromModal';
import CopyToModal from './components/CopyToModal';
import HSNCodeModal from './components/HSNCodeModal';
import ItemSelectionModal from './components/ItemSelectionModal';
import FreightChargesModal from '../../components/freight/FreightChargesModal';
import { summarizeFreightRows } from '../../components/freight/freightUtils';
import { determineTaxCode, recalculateAllTaxCodes, getGSTTypeLabel } from '../../utils/taxEngine';
import { filterWarehousesByBranch } from '../../utils/warehouseBranch';
import { getDefaultSeriesForCurrentYear } from '../../utils/seriesDefaults';
import {
  fetchSalesQuotationByDocEntry,
  fetchSalesQuotationCustomerDetails,
  fetchSalesQuotationReferenceData,
  submitSalesQuotation,
  updateSalesQuotation,
  fetchDocumentSeries,
  fetchNextNumber,
  fetchStateFromAddress,
  fetchItemsForModal,
  fetchFreightCharges,
} from '../../api/salesQuotationApi';
import { fetchHSNCodes, fetchHSNCodeFromItem } from '../../api/hsnCodeApi';
import { SALES_ORDER_COMPANY_ID } from '../../config/appConfig';
import {
  FORM_SETTINGS_STORAGE_KEY,
  HEADER_UDF_DEFINITIONS,
  ROW_UDF_DEFINITIONS,
  createUdfState,
  readSavedFormSettings,
} from '../../config/purchaseOrderForm';

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
  itemNo: '', itemDescription: '', hsnCode: '', quantity: '', unitPrice: '',
  uomCode: '', stdDiscount: '', taxCode: '', total: '', whse: '',
  loc: '', branch: '',
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
function SalesOrder() {
  const location = useLocation();
  const navigate = useNavigate();

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
    company: '', vendors: [], contacts: [], pay_to_addresses: [], ship_to_addresses: [], bill_to_addresses: [], items: [],
    warehouses: [], warehouse_addresses: [], company_address: {}, tax_codes: [], hsn_codes: [],
    payment_terms: [], shipping_types: [], branches: [], uom_groups: [], sales_employees: [], owners: [],
    decimal_settings: DEC, warnings: [], series: [], states: [],
  });
  const [pageState, setPageState] = useState({ loading: false, vendorLoading: false, posting: false, error: '', success: '', seriesLoading: false });
  const [valErrors, setValErrors] = useState({ header: {}, lines: {}, form: '' });
  const [addressModal, setAddressModal] = useState(null);
  const [eWayBillModal, setEWayBillModal] = useState(false);
  const [eWayBillData, setEWayBillData] = useState({});
  const [taxInfoModal, setTaxInfoModal] = useState(false);
  const [stateModal, setStateModal] = useState(false);
  const [bpModal, setBpModal] = useState(false);
  const [hsnModal, setHsnModal] = useState({ open: false, lineIndex: -1 });
  const [itemModal, setItemModal] = useState({ open: false, lineIndex: -1, items: [], loading: false });
  const [freightModal, setFreightModal] = useState({ open: false, freightCharges: [], loading: false });
  const [copyFromModal, setCopyFromModal] = useState(false);
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

  // decimal config
  const dec = { ...DEC, ...(refData.decimal_settings || {}) };
  const numDec = {
    quantity: Number(dec.QtyDec), unitPrice: Number(dec.PriceDec),
    stdDiscount: Number(dec.PercentDec), total: Number(dec.SumDec),
    discount: Number(dec.PercentDec), freight: Number(dec.SumDec),
    tax: Number(dec.SumDec), totalPaymentDue: Number(dec.SumDec),
  };
  const isDocumentEditable = !currentDocEntry || String(header.status || '').toLowerCase() === 'open';

  // Continue in next part...

  // ── load reference data ───────────────────────────────────────────────────
  useEffect(() => {
    let ignore = false;
    const load = async () => {
      setPageState(p => ({ ...p, loading: true, error: '', success: '' }));
      try {
        const [refDataRes, seriesRes, hsnRes] = await Promise.all([
          fetchSalesQuotationReferenceData(SALES_ORDER_COMPANY_ID),
          fetchDocumentSeries(),
          fetchHSNCodes(),
        ]);
        
        // ═══ LOGGING: Reference Data ═══
        console.log('═══════════════════════════════════════════════════');
        console.log('📚 Reference Data Loaded:');
        console.log('  - Vendors/Customers:', refDataRes.data.vendors?.length || 0);
        console.log('  - Items:', refDataRes.data.items?.length || 0);
        console.log('  - Tax Codes:', refDataRes.data.tax_codes?.length || 0);
        console.log('  - Warehouses:', refDataRes.data.warehouses?.length || 0);
        console.log('  - Payment Terms:', refDataRes.data.payment_terms?.length || 0);
        console.log('  - Shipping Types:', refDataRes.data.shipping_types?.length || 0);
        console.log('  - Branches:', refDataRes.data.branches?.length || 0);
        console.log('  - States:', refDataRes.data.states?.length || 0);
        console.log('  - Series:', seriesRes.data.series?.length || 0);
        console.log('  - HSN Codes:', hsnRes.data?.length || 0);
        console.log('  - Sales Employees:', refDataRes.data.sales_employees?.length || 0);
        console.log('  - Owners:', refDataRes.data.owners?.length || 0);
        console.log('───────────────────────────────────────────────────');
        console.log('🏢 Company Address:', refDataRes.data.company_address);
        console.log('⚙️  Decimal Settings:', refDataRes.data.decimal_settings);
        console.log('⚠️  Warnings:', refDataRes.data.warnings);
        console.log('───────────────────────────────────────────────────');
        console.log('💰 TAX CODES LOADED:');
        (refDataRes.data.tax_codes || []).forEach(tc => {
          console.log(`  ${tc.Code} - ${tc.Name} (Rate: ${tc.Rate}%, Type: ${tc.GSTType || 'N/A'})`);
        });
        if (refDataRes.data.sales_employees && refDataRes.data.sales_employees.length > 0) {
          console.log('👥 SALES EMPLOYEES LOADED:');
          refDataRes.data.sales_employees.forEach(emp => {
            console.log(`  ${emp.SlpName} (Code: ${emp.SlpCode})`);
          });
        }
        if (refDataRes.data.owners && refDataRes.data.owners.length > 0) {
          console.log('👤 OWNERS LOADED:');
          refDataRes.data.owners.forEach(owner => {
            console.log(`  ${owner.FullName} (empID: ${owner.empID})`);
          });
        }
        console.log('═══════════════════════════════════════════════════');
        
        if (!ignore) {
          setRefData({
            company: refDataRes.data.company || '',
            vendors: refDataRes.data.vendors || [],
            contacts: refDataRes.data.contacts || [],
            pay_to_addresses: refDataRes.data.pay_to_addresses || [],
            ship_to_addresses: refDataRes.data.ship_to_addresses || [],
            bill_to_addresses: refDataRes.data.bill_to_addresses || [],
            items: refDataRes.data.items || [],
            warehouses: refDataRes.data.warehouses || [],
            warehouse_addresses: refDataRes.data.warehouse_addresses || [],
            company_address: refDataRes.data.company_address || {},
            tax_codes: refDataRes.data.tax_codes || [],
            hsn_codes: hsnRes.data || [],
            payment_terms: refDataRes.data.payment_terms || [],
            shipping_types: refDataRes.data.shipping_types || [],
            branches: refDataRes.data.branches || [],
            states: refDataRes.data.states || [],
            uom_groups: refDataRes.data.uom_groups || [],
            sales_employees: refDataRes.data.sales_employees || [],
            owners: refDataRes.data.owners || [],
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
        console.error('❌ Error loading reference data:', e);
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
    const docEntry = location.state?.salesQuotationDocEntry || location.state?.salesOrderDocEntry;
    if (!docEntry) return;
    let ignore = false;
    const load = async () => {
      setPageState(p => ({ ...p, loading: true, error: '', success: '' }));
      try {
        const r = await fetchSalesQuotationByDocEntry(docEntry);
        const so = r.data.sales_quotation;
        
        
        if (ignore || !so) return;
        setCurrentDocEntry(so.doc_entry || Number(docEntry));
        
        // Get warehouse from first line if available
        const firstLineWarehouse = so.lines && so.lines.length > 0 ? so.lines[0].whse : '';
        
        
        const newHeader = {
          ...INIT_HEADER,
          vendor: so.header?.customerCode || '',
          contactPerson: so.header?.contactPerson || '',
          name: so.header?.customerName || '',
          paymentTerms: so.header?.paymentTermsCode || so.header?.paymentTerms || '',
          placeOfSupply: so.header?.placeOfSupply || '',
          branch: so.header?.branch || '',
          series: so.header?.series || '',
          warehouse: firstLineWarehouse || so.header?.warehouse || '',
          discount: so.header?.discount || '',
          freight: so.header?.freight || '',
          tax: so.header?.tax || '',
          // Sales Employee - use CODE not name
          salesEmployee: so.header?.salesEmployee || '',
          purchaser: so.header?.purchaser || '',  // This is the NAME for display
          // Owner - use name (frontend uses name in dropdown)
          owner: so.header?.owner || '',
          // Remarks - map to otherInstruction
          remarks: so.header?.remarks || '',
          otherInstruction: so.header?.otherInstruction || so.header?.remarks || '',
          // Map backend address field names to frontend field names
          shipToCode: so.header?.shipToCode || '',
          shipToAddress: so.header?.shipTo || '',
          billToCode: so.header?.payToCode || '',
          billToAddress: so.header?.payTo || '',
          // Copy all other fields from backend
          postingDate: so.header?.postingDate || '',
          deliveryDate: so.header?.deliveryDate || '',
          documentDate: so.header?.documentDate || '',
          customerRefNo: so.header?.customerRefNo || '',
          docNum: so.header?.docNum || '',
          status: so.header?.status || '',
          shippingType: so.header?.shippingType || '',
          confirmed: so.header?.confirmed || false,
          journalRemark: so.header?.journalRemark || '',
          currency: so.header?.currency || 'INR',
        };
        
        console.log('📥 Final header state:', newHeader);
        setHeader(newHeader);

        // If series is loaded, fetch the next number for display
        if (so.header?.series) {
          handleSeriesChange(so.header.series);
        }

        setLines(
          Array.isArray(so.lines) && so.lines.length
            ? so.lines.map((l, index) => {
                // If HSN is empty, try to get it from item master
                let hsnCode = l.hsnCode || '';
                if (!hsnCode && l.itemNo) {
                  const item = refData.items.find(it => String(it.ItemCode) === String(l.itemNo));
                  if (item) {
                    hsnCode = item.SWW || item.HSNCode || '';
                  }
                }
                
                return { 
                  ...createLine(), 
                  ...l, 
                  hsnCode: hsnCode,
                  udf: { ...createUdfState(ROW_UDF_DEFINITIONS), ...(l.udf || {}) } 
                };
              })
            : [createLine()]
        );
        setHeaderUdfs({ ...createUdfState(HEADER_UDF_DEFINITIONS), ...(so.header_udfs || {}) });
        
        if (so.header?.customerCode) {
          loadVendorDetails(so.header.customerCode);
        }
        setPageState(p => ({ ...p, success: so.doc_num ? `Sales Quatation ${so.doc_num} loaded.` : 'Sales Quatation loaded.' }));
      } catch (e) {
        if (!ignore) setPageState(p => ({ ...p, error: getErrMsg(e, 'Failed to load Sales Quatation.') }));
      } finally {
        if (!ignore) {
          setPageState(p => ({ ...p, loading: false }));
          navigate(location.pathname, { replace: true, state: null });
        }
      }
    };
    load();
    return () => { ignore = true; };
  }, [location.pathname, location.state, navigate]);

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

  // ── derived / computed ────────────────────────────────────────────────────
  const vendorContacts = refData.contacts.filter(c => String(c.CardCode || '') === String(header.vendor || ''));
  const vendorOptions = header.vendor && !refData.vendors.some(v => String(v.CardCode || '') === String(header.vendor || ''))
    ? [{ CardCode: header.vendor, CardName: header.name || header.vendor }, ...refData.vendors]
    : refData.vendors;
  const contactOptions = header.contactPerson && !vendorContacts.some(c => String(c.CntctCode || '') === String(header.contactPerson || ''))
    ? [{ CardCode: header.vendor, CntctCode: header.contactPerson, Name: header.contactPerson }, ...vendorContacts]
    : vendorContacts;
  const vendorPayToAddresses = refData.pay_to_addresses.filter(a => String(a.CardCode || '') === String(header.vendor || ''));
  const vendorShipToAddresses = refData.ship_to_addresses.filter(a => String(a.CardCode || '') === String(header.vendor || ''));
  const vendorBillToAddresses = refData.bill_to_addresses.filter(a => String(a.CardCode || '') === String(header.vendor || ''));
  const vendorEffectiveShipToAddresses = vendorShipToAddresses.length ? vendorShipToAddresses : vendorPayToAddresses;
  const vendorEffectiveBillToAddresses = vendorBillToAddresses.length ? vendorBillToAddresses : vendorPayToAddresses;
  const selectedBranch = refData.branches.find(b => String(b.BPLId || '') === String(header.branch || ''));
  const uomGroupMap = (refData.uom_groups || []).reduce((acc, g) => { acc[g.AbsEntry] = g.uomCodes || []; return acc; }, {});

  const effectiveTaxCodes = refData.tax_codes.length ? refData.tax_codes : FALLBACK_TAX;
  const effectiveWarehouses = refData.warehouses.length ? refData.warehouses : FALLBACK_WAREHOUSES;
  const freightTotals = summarizeFreightRows(freightModal.freightCharges, effectiveTaxCodes);
  
  // Filter warehouses by selected branch
  const branchFilteredWarehouses = filterWarehousesByBranch(effectiveWarehouses, header.branch);
  
  // NOTE: no warehouse-based fast fill for Ship-To here
  const effectiveWhseAddrs = refData.warehouse_addresses.length ? refData.warehouse_addresses : [];
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

  // ── GST determination logic ───────────────────────────────────────────────
  const determineGSTState = () => {
    if (!header.vendor) return '';

    const shipToAddr = vendorEffectiveShipToAddresses.find(a => String(a.Address || '') === String(header.shipToCode || ''))
      || vendorEffectiveBillToAddresses.find(a => String(a.Address || '') === String(header.shipToCode || ''));
    const billToAddr = vendorEffectiveBillToAddresses.find(a => String(a.Address || '') === String(header.billToCode || ''))
      || vendorEffectiveShipToAddresses.find(a => String(a.Address || '') === String(header.billToCode || ''));

    if (header.useBillToForTax) {
      return billToAddr?.State || shipToAddr?.State || '';
    }

    return shipToAddr?.State || billToAddr?.State || '';
  };

  const determineGSTType = (gstState) => {
    if (!gstState) return 'IGST';

    // Get company state (assuming it's stored in refData.company or we need to get it)
    const companyState = refData.company_address?.State || '';

    if (gstState === companyState) {
      return 'CGST_SGST'; // CGST + SGST
    } else {
      return 'IGST';
    }
  };

  const getApplicableTaxCodes = (gstType) => {
    const taxCodes = effectiveTaxCodes.filter(code => {
      const codeStr = String(code.Code || '').toUpperCase();
      if (gstType === 'CGST_SGST') {
        return codeStr.includes('CGST') || codeStr.includes('SGST');
      } else if (gstType === 'IGST') {
        return codeStr.includes('IGST');
      }
      return false;
    });

    // Return tax codes sorted by rate
    return taxCodes.sort((a, b) => (a.Rate || 0) - (b.Rate || 0));
  };

  // New GST logic based on Place of Supply
  const determineGSTTypeFromPOS = () => {
    if (!header.vendor || !header.placeOfSupply) return 'IGST';

    // Get company state from company address or first branch
    const companyState = refData.company_address?.State || selectedBranch?.State || '';
    const customerState = header.placeOfSupply;

    console.log('GST Determination:', {
      companyState,
      customerState,
      match: companyState === customerState
    });

    if (companyState === customerState) {
      return 'CGST_SGST'; // Intra-state: CGST + SGST
    } else {
      return 'IGST'; // Inter-state: IGST
    }
  };

  const getApplicableTaxCode = (gstType, itemTaxRate = 18) => {
    // Find tax codes based on GST type
    const taxCodes = effectiveTaxCodes.filter(code => {
      const codeStr = String(code.Code || '').toUpperCase();
      const rate = Number(code.Rate || 0);
      
      if (gstType === 'CGST_SGST') {
        // For CGST+SGST, we need CGST or SGST with half the rate
        const halfRate = itemTaxRate / 2;
        return (codeStr.includes('CGST') || codeStr.includes('SGST')) && Math.abs(rate - halfRate) < 0.01;
      } else if (gstType === 'IGST') {
        // For IGST, we need IGST with full rate
        return codeStr.includes('IGST') && Math.abs(rate - itemTaxRate) < 0.01;
      }
      return false;
    });

    // Return the first matching tax code
    return taxCodes.length > 0 ? taxCodes[0].Code : '';
  };

  // ── address sync ──────────────────────────────────────────────────────────
  // Sync branch to all lines when header branch changes
  useEffect(() => {
    if (header.branch) {
      console.log('🔄 Syncing branch to all lines:', header.branch);
      setLines(prev => {
        const updated = prev.map(l => ({ 
          ...l, 
          branch: String(header.branch), 
          loc: String(header.branch)
        }));
        console.log('✅ Lines updated with branch:', updated.map(l => ({ branch: l.branch, loc: l.loc })));
        return updated;
      });
    }
  }, [header.branch]);

  useEffect(() => {
    if (!header.branch || !refData.warehouses.length) return;

    const allowedWarehouseCodes = new Set(
      branchFilteredWarehouses.map(w => String(w.WhsCode || ''))
    );

    setHeader(prev => (
      prev.warehouse && !allowedWarehouseCodes.has(String(prev.warehouse))
        ? { ...prev, warehouse: '' }
        : prev
    ));

    setLines(prev => prev.map(line => (
      line.whse && !allowedWarehouseCodes.has(String(line.whse))
        ? { ...line, whse: '' }
        : line
    )));
  }, [branchFilteredWarehouses, header.branch, refData.warehouses.length]);

  // Sync warehouse to all lines when header warehouse changes
  useEffect(() => {
    if (header.warehouse) {
      setLines(prev => prev.map(l => ({ ...l, whse: header.warehouse })));
      
      // Validate warehouse-branch assignment
      if (header.branch) {
        const selectedWarehouse = refData.warehouses.find(w => w.WhsCode === header.warehouse);
        if (selectedWarehouse && selectedWarehouse.BranchID && 
            String(selectedWarehouse.BranchID) !== String(header.branch)) {
          console.warn(`⚠️ Warehouse "${header.warehouse}" is assigned to Branch ${selectedWarehouse.BranchID}, but document is for Branch ${header.branch}`);
          setPageState(p => ({ 
            ...p, 
            error: `Warning: Warehouse "${header.warehouse}" is assigned to a different branch. This may cause submission errors.` 
          }));
        }
      }
    }
  }, [header.warehouse, header.branch, refData.warehouses]);

  // ── Recalculate Tax Codes on State/Address Changes ────────────────────────
  useEffect(() => {
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
      lineCount: lines.filter(l => l.itemNo).length
    });

    // Recalculate tax codes for all lines with items
    const updatedLines = recalculateAllTaxCodes(
      lines,
      refData.items,
      header.placeOfSupply,  // shipToState
      header.placeOfSupply,  // billToState
      false,                 // useBillToForTax
      companyState,
      effectiveTaxCodes
    );

    setLines(updatedLines);
  }, [header.placeOfSupply, header.vendor, refData.company_address, selectedBranch]);

  useEffect(() => {
    if (!header.vendor) return;
    
    // Only run once when vendor changes or addresses are loaded
    if (header.billToCode || header.shipToCode) return; // Already set

    setHeader(prev => {
      let updates = {};

      const billToList = vendorEffectiveBillToAddresses;
      const shipToList = vendorEffectiveShipToAddresses;
      
      // Skip if no addresses available yet
      if (billToList.length === 0 && shipToList.length === 0) return prev;

      // Set default Bill-To address
      const defaultBillTo = billToList.find(a => String((a.AddressType || a.AdresType || '').toUpperCase()).includes('B')) || billToList[0];
      if (defaultBillTo && !prev.billToCode) {
        updates.billToCode = defaultBillTo.Address || '';
        updates.billToAddress = fmtAddr(defaultBillTo);
      }

      // Set default Ship-To address
      const defaultShipTo = shipToList.find(a => String((a.AddressType || a.AdresType || '').toUpperCase()).includes('S')) || shipToList[0];
      if (defaultShipTo && !prev.shipToCode) {
        updates.shipToCode = defaultShipTo.Address || '';
        updates.shipToAddress = fmtAddr(defaultShipTo);
      } else if (defaultBillTo && !prev.shipToCode) {
        // If no dedicated ship-to present, use bill-to as ship-to fallback
        updates.shipToCode = defaultBillTo.Address || '';
        updates.shipToAddress = fmtAddr(defaultBillTo);
      }

      // Update Place of Supply from Ship-To (or Bill-To fallback)
      const posAddress = defaultShipTo || defaultBillTo;
      if (posAddress && !prev.placeOfSupply) {
        updates.placeOfSupply = posAddress.State || '';
      }

      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }
      return prev;
    });
  }, [header.vendor, refData.pay_to_addresses, refData.ship_to_addresses, refData.bill_to_addresses]);

  // Update GST when addresses or place of supply changes
  useEffect(() => {
    if (!header.vendor || !header.placeOfSupply) return;

    const gstType = determineGSTType();
    console.log('Auto-updating tax codes based on GST type:', gstType);

    // Update tax codes for all lines that have items
    setLines(prevLines =>
      prevLines.map(line => {
        if (!line.itemNo) return line; // Skip empty lines
        
        // Get item's default tax rate (assume 18% if not specified)
        const item = refData.items.find(it => String(it.ItemCode || '') === String(line.itemNo || ''));
        const itemTaxRate = item?.TaxRate || 18;
        
        const applicableTaxCode = getApplicableTaxCode(gstType, itemTaxRate);
        
        return {
          ...line,
          taxCode: applicableTaxCode || line.taxCode
        };
      })
    );
  }, [header.placeOfSupply, header.vendor]);

  // ── vendor details ────────────────────────────────────────────────────────
  const loadVendorDetails = async (code) => {
    if (!code) {
      setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [], ship_to_addresses: [], bill_to_addresses: [] }));
      return;
    }

    setPageState(p => ({ ...p, vendorLoading: true }));

    try {
      const r = await fetchSalesQuotationCustomerDetails(code);
    
      const contacts = r.data.contacts || [];
      setRefData(p => ({
        ...p,
        contacts: contacts,
        pay_to_addresses: r.data.pay_to_addresses || [],
        ship_to_addresses: r.data.ship_to_addresses || [],
        bill_to_addresses: r.data.bill_to_addresses || []
      }));

      if (contacts.length > 0) {
        setHeader(prev => ({
          ...prev,
          contactPerson: contacts[0].CntctCode
        }));
      }

    } catch (err) {
      console.error('❌ Error loading vendor details:', err);
      console.error('Error response:', err.response?.data);
      setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [], ship_to_addresses: [], bill_to_addresses: [] }));
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
    
    // ✅ FIX: When purchaser (Sales Employee name) changes, update salesEmployee (code) too
    if (name === 'purchaser') {
      // Find the SlpCode for the selected name
      const selectedEmployee = (refData.sales_employees || []).find(
        emp => emp.SlpName === value
      );
      
      setHeader(p => ({
        ...p,
        purchaser: value,
        salesEmployee: selectedEmployee ? String(selectedEmployee.SlpCode) : '-1'
      }));
      
      console.log('🔄 Sales Employee changed:', {
        name: value,
        code: selectedEmployee ? selectedEmployee.SlpCode : '-1'
      });
      
      return;
    }
    
    if (numDec[name] !== undefined && type !== 'checkbox') {
      setHeader(p => ({ ...p, [name]: sanitize(value, numDec[name]) }));
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
      setHeader(p => ({
        ...p,
        shipToCode: addressCode,
        shipToAddress: fmtAddr(addr),
        placeOfSupply: addr.State || p.placeOfSupply || ''
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
        billToAddress: fmtAddr(addr),
        placeOfSupply: header.useBillToForTax ? addr.State || header.placeOfSupply : header.placeOfSupply
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
            } else {
              // Step 6: Determine Tax Code using Tax Engine
              const determinedTaxCode = determineTaxCode(
                { ...item, TaxCodeAR: baseTaxCode },
                gstState,        // shipToState (using Place of Supply)
                gstState,        // billToState (same as POS for now)
                false,           // useBillToForTax (not used in current flow)
                companyState,
                effectiveTaxCodes
              );
              
              if (determinedTaxCode) {
                next.taxCode = determinedTaxCode;
                console.log('✅ Tax Code Auto-Selected:', {
                  gstType: getGSTTypeLabel(companyState, gstState),
                  taxCode: determinedTaxCode
                });
              } else {
                console.warn('⚠️ Could not determine tax code');
                next.taxCode = '';
              }
            }
            
            next.total = fmtDec(calcLineTotal(next), numDec.total);
            return next;
          }));
        }
      } catch (error) {
        console.error('❌ Error fetching HSN code:', error);
        // Fallback to reference data if API fails
        setLines(prev => prev.map((line, idx) => {
          if (idx !== i) return line;
          const next = { ...line, itemNo: value };
          const item = refData.items.find(it => String(it.ItemCode || '') === String(value || ''));
          if (item) {
            next.itemDescription = item.ItemName || next.itemDescription;
            next.uomCode = String(item.SalesUnit || item.InventoryUOM || '').trim();
            next.hsnCode = item.SWW || item.HSNCode || item.U_HSNCode || next.hsnCode || '';
          }
          next.total = fmtDec(calcLineTotal(next), numDec.total);
          return next;
        }));
      }
    } else {
      // For non-itemNo changes, update synchronously
      setLines(prev => prev.map((line, idx) => {
        if (idx !== i) return line;
        const next = { ...line, [name]: numDec[name] !== undefined ? sanitize(value, numDec[name]) : value };
        next.total = fmtDec(calcLineTotal(next), numDec.total);
        return next;
      }));
    }
  };

  const handleNumBlur = (field, target = 'line', i = null) => {
    const d = numDec[field];
    if (d === undefined) return;
    if (target === 'header') { setHeader(p => ({ ...p, [field]: fmtDec(p[field], d) })); return; }
    setLines(p => p.map((l, idx) => idx === i ? { ...l, [field]: fmtDec(l[field], d) } : l));
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
      
      // Check if last line has quantity
      if (!lastLine.quantity || Number(lastLine.quantity) <= 0) {
        errors.quantity = 'Quantity is required before adding a new line';
      }
      
      // Check if last line has unit price
      if (!lastLine.unitPrice || Number(lastLine.unitPrice) <= 0) {
        errors.unitPrice = 'Unit Price is required before adding a new line';
      }
      
      // Check if last line has UoM
      if (!String(lastLine.uomCode || '').trim()) {
        errors.uomCode = 'UoM is required before adding a new line';
      }
      
      // Check if last line has HSN Code
      if (!String(lastLine.hsnCode || '').trim()) {
        errors.hsnCode = 'HSN Code is required before adding a new line';
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
      setHeader(p => ({ ...p, shipToAddress: formatted, shipTo: formatted }));
    } else {
      setHeader(p => ({ ...p, billToAddress: formatted, payTo: formatted }));
    }
    closeAddressModal();
  };

  const handleAddressFormChange = (e) => {
    const { name, value } = e.target;
    setAddressForm(p => ({ ...p, [name]: value }));
  };

  // ── E-Way Bill Modal handlers ──────────────────────────────────────────────
  const openEWayBillModal = () => {
    setEWayBillModal(true);
  };

  const closeEWayBillModal = () => {
    setEWayBillModal(false);
  };

  const saveEWayBillModal = (data) => {
    setEWayBillData(data);
    console.log('E-Way Bill Data saved:', data);
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

  const handleTaxInfoFormChange = (e) => {
    const { name, value } = e.target;
    setTaxInfoForm(p => ({ ...p, [name]: value }));
  };

  // ── State Selection Modal handlers ────────────────────────────────────────
  const openStateModal = () => {
    setStateModal(true);
  };

  const closeStateModal = () => {
    setStateModal(false);
  };

  const handleStateSelect = (state) => {
    setHeader(p => ({ ...p, placeOfSupply: state.Name || state.Code || '' }));
  };

  // ── Business Partner Modal handlers ───────────────────────────────────────
  const openBpModal = () => {
    setBpModal(true);
  };

  const closeBpModal = () => {
    setBpModal(false);
  };

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

  // ── HSN Code Modal handlers ───────────────────────────────────────────────
  const openHSNModal = (lineIndex) => {
    setHsnModal({ open: true, lineIndex });
  };

  const closeHSNModal = () => {
    setHsnModal({ open: false, lineIndex: -1 });
  };

  const handleHSNSelect = (hsn) => {
    if (hsnModal.lineIndex >= 0) {
      setLines(prev => prev.map((line, idx) => {
        if (idx === hsnModal.lineIndex) {
          return { ...line, hsnCode: hsn.code || '' };
        }
        return line;
      }));
    }
  };

  // ── Item Selection Modal handlers ─────────────────────────────────────────
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
        loading: false
      }));
    } catch (error) {
      console.error('❌ Failed to load items:', error);
      console.error('Error details:', error.response?.data || error.message);
      setItemModal(prev => ({
        ...prev,
        items: [],
        loading: false
      }));
    }
  };

  const closeItemModal = () => {
    setItemModal({ open: false, lineIndex: -1, items: [], loading: false });
  };

  const handleItemSelect = async (item) => {
    if (itemModal.lineIndex < 0) return;
    
    const lineIndex = itemModal.lineIndex;
    
    try {
      // Fetch HSN code from database
      const hsnResponse = await fetchHSNCodeFromItem(item.ItemCode);
      const hsnData = hsnResponse.data;
      
      setLines(prev => prev.map((line, idx) => {
        if (idx !== lineIndex) return line;
        
        const next = { ...line };
        next.itemNo = item.ItemCode;
        next.itemDescription = item.ItemName || '';
        next.uomCode = item.SalesUnit || item.InventoryUOM || '';
        next.hsnCode = hsnData.hsnCode || item.HSNCode || '';
        
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
            next.taxCode = determinedTaxCode;
          }
        }
        
        next.total = fmtDec(calcLineTotal(next), numDec.total);
        return next;
      }));
      
      closeItemModal();
    } catch (error) {
      console.error('Error selecting item:', error);
      // Still set basic item info even if HSN fetch fails
      setLines(prev => prev.map((line, idx) => {
        if (idx !== lineIndex) return line;
        return {
          ...line,
          itemNo: item.ItemCode,
          itemDescription: item.ItemName || '',
          uomCode: item.SalesUnit || item.InventoryUOM || '',
          hsnCode: item.HSNCode || '',
          total: fmtDec(calcLineTotal(line), numDec.total)
        };
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

  // ── Copy From Handler ──────────────────────────────────────────────────────
  const handleCopyFrom = (documentData, docType) => {
    console.log('📋 Copying from:', docType, documentData);
    
    // Copy header
    setHeader(prev => ({
      ...prev,
      vendor: documentData.header.vendor,
      name: documentData.header.name,
      contactPerson: documentData.header.contactPerson,
      placeOfSupply: documentData.header.placeOfSupply,
      paymentTerms: documentData.header.paymentTerms,
      branch: documentData.header.branch,
    }));

    // Copy lines WITHOUT tax codes (will be recalculated)
    const copiedLines = documentData.lines.map(line => ({
      ...createLine(),
      ...line,
      taxCode: '', // DO NOT copy tax code - will be auto-determined
      baseType: documentData.baseDocument.baseType,
      baseEntry: documentData.baseDocument.baseEntry,
      baseLine: line.lineNum,
    }));

    setLines(copiedLines);
    
    // Load vendor details to trigger address and tax recalculation
    if (documentData.header.vendor) {
      loadVendorDetails(documentData.header.vendor);
    }
    
    setCopyFromModal(false);
  };

  // ── Copy To Handler ────────────────────────────────────────────────────────
  const handleCopyTo = (copyData) => {
    console.log('📤 Copying to:', copyData.targetType);
    
    // Navigate to target document with data
    if (copyData.targetType === 'delivery') {
      navigate('/delivery/new', {
        state: {
          copyFrom: {
            type: 'salesOrder',
            docEntry: currentDocEntry,
            header: copyData.header,
            lines: copyData.lines,
            baseDocument: copyData.baseDocument,
          }
        }
      });
    } else if (copyData.targetType === 'invoice') {
      navigate('/ar-invoice/new', {
        state: {
          copyFrom: {
            type: 'salesOrder',
            docEntry: currentDocEntry,
            header: copyData.header,
            lines: copyData.lines,
            baseDocument: copyData.baseDocument,
          }
        }
      });
    }
    
    setCopyToModal(false);
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

  // Continue in next part...

  // ── validation ────────────────────────────────────────────────────────────
  const validate = () => {
    const isUpdate = !!currentDocEntry;
    const e = { header: {}, lines: {}, form: '' };
    
    if (!isUpdate) {
      const vc = String(header.vendor || '').trim();
      if (!vc) { e.header.vendor = 'Select a customer.'; e.form = 'Please correct the highlighted fields.'; return e; }
      
      // Validate Ship-To address (required for GST determination)
      if (!String(header.shipToCode || '').trim()) { 
        e.header.shipToCode = 'Ship-To address is required.'; 
        e.form = 'Please correct the highlighted fields.'; 
        return e; 
      }
      
      // Validate Bill-To address if GST override is enabled
      if (header.useBillToForTax && !String(header.billToCode || '').trim()) { 
        e.header.billToCode = 'Bill-To address is required when using Bill-To for tax.'; 
        e.form = 'Please correct the highlighted fields.'; 
        return e; 
      }
      
      // Validate Place of Supply (derived from addresses but required)
      if (!String(header.placeOfSupply || '').trim()) { 
        e.header.placeOfSupply = 'Place of supply is required.'; 
        e.form = 'Please correct the highlighted fields.'; 
        return e; 
      }
    }
    
    // Validate Warehouse (always required)
    if (!String(header.warehouse || '').trim()) { 
      e.header.warehouse = 'Warehouse is required.'; 
      e.form = 'Please correct the highlighted fields.'; 
      return e; 
    }
    

    
    if (!String(header.postingDate || '').trim()) { e.header.postingDate = 'Posting date is required.'; e.form = 'Please correct the highlighted fields.'; return e; }
    if (!String(header.documentDate || '').trim()) { e.header.documentDate = 'Document date is required.'; e.form = 'Please correct the highlighted fields.'; return e; }

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

      if (!l.taxCode || !String(l.taxCode).trim()) {
        e.lines[i] = { ...(e.lines[i] || {}), taxCode: 'Tax Code is required' };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }
      
      const taxCodeExists = effectiveTaxCodes.some(t => String(t.Code) === String(l.taxCode));
      if (!taxCodeExists) {
        e.lines[i] = { ...(e.lines[i] || {}), taxCode: `Tax code '${l.taxCode}' is not valid in SAP B1` };
        e.form = 'Please correct the highlighted fields.';
        return e;
      }
      
      const taxCodesUsed = new Set(pop.map(l => l.taxCode).filter(Boolean));
      const sgstCodes = Array.from(taxCodesUsed).filter(code => code.toUpperCase().includes('SGST'));
      const cgstCodes = Array.from(taxCodesUsed).filter(code => code.toUpperCase().includes('CGST'));

      if (sgstCodes.length > 0 && cgstCodes.length === 0) {
        e.form = 'SGST requires CGST to be applied as well';
        return e;
      }
      if (cgstCodes.length > 0 && sgstCodes.length === 0) {
        e.form = 'CGST requires SGST to be applied as well';
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
          e.form = 'SGST and CGST rates must be equal';
          return e;
        }
      }
    }

    return e;
  };

  // ── submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!isDocumentEditable) {
      setPageState(p => ({ ...p, error: 'This document is closed and cannot be edited.', success: '' }));
      return;
    }
    const e = validate();
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
      
      // Clean lines - remove any readonly/computed fields
      const cleanedLines = lines.map(line => ({
        itemNo: line.itemNo,
        itemDescription: line.itemDescription,
        hsnCode: line.hsnCode,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        uomCode: line.uomCode,
        stdDiscount: line.stdDiscount,
        taxCode: line.taxCode,
        total: line.total,
        whse: line.whse,
        loc: line.loc,
        branch: line.branch,
        udf: line.udf,
      }));
      
      const payload = { company_id: SALES_ORDER_COMPANY_ID, header: prep, lines: cleanedLines, freightCharges: freightModal.freightCharges, header_udfs: headerUdfs };
      
      const r = currentDocEntry ? await updateSalesQuotation(currentDocEntry, payload) : await submitSalesQuotation(payload);
      const dn = r.data.doc_num ? ` Doc No: ${r.data.doc_num}.` : '';
      setCurrentDocEntry(null); setHeader(INIT_HEADER); setLines([createLine()]);
      setHeaderUdfs(createUdfState(HEADER_UDF_DEFINITIONS)); setActiveTab('Contents');
      setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [] }));
      setValErrors({ header: {}, lines: {}, form: '' });
      
      if (refData.series.length > 0) {
        handleSeriesChange(refData.series[0].Series);
      }
      
      setPageState(p => ({ ...p, success: `${r.data.message || 'Sales Quatation saved.'}${dn}` }));
    } catch (e) {
      console.error('❌ Sales Quatation Submission Error:', e);
      console.error('Error Response:', e.response?.data);
      setPageState(p => ({ ...p, error: getErrMsg(e, 'Sales Quatation submission failed.') }));
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

  // Continue in next part with render...

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <form className="so-page" onSubmit={handleSubmit}>

      {/* toolbar */}
      <div className="so-toolbar">
        <span className="so-toolbar__title">Sales Quatation{currentDocEntry ? ` — #${header.docNo || currentDocEntry}` : ''}</span>
        <button type="submit" className="so-btn so-btn--primary" disabled={pageState.posting}>
          {pageState.posting ? 'Saving…' : currentDocEntry ? 'Update' : 'Add'}
        </button>
        <button type="button" className="so-btn" disabled={pageState.posting}>
          Add Draft & New
        </button>
        <button type="button" className="so-btn" onClick={resetForm}>
          Cancel
        </button>
        <button type="button" className="so-btn" onClick={() => setSidebarOpen(p => !p)}>
          {sidebarOpen ? 'Hide UDFs' : 'Show UDFs'}
        </button>
        <button type="button" className="so-btn" onClick={() => setFormSettingsOpen(p => !p)}>
          Form Settings
        </button>
        <button type="button" className="so-btn" onClick={() => setCopyFromModal(true)}>
          Copy From
        </button>
        <button 
          type="button" 
          className="so-btn" 
          onClick={() => setCopyToModal(true)}
          disabled={!currentDocEntry}
        >
          Copy To
        </button>
        <button type="button" className="so-btn" onClick={() => navigate('/sales-order/find')}>Find</button>
        <button type="button" className="so-btn" onClick={resetForm}>New</button>
      </div>

      {/* alerts */}
      {pageState.loading && <div className="so-alert so-alert--success" style={{ marginTop: 0 }}>Loading…</div>}
      {pageState.error && <div className="so-alert so-alert--error">{pageState.error}</div>}
      {pageState.success && <div className="so-alert so-alert--success">{pageState.success}</div>}
      {refData.warnings?.length > 0 && (
        <div className="so-alert so-alert--warning">
          <strong>SAP warnings:</strong>
          {refData.warnings.map((w, i) => <div key={i}>{w}</div>)}
          <div style={{ marginTop: 4, color: '#555' }}>Dropdowns are showing fallback values. Connect to SAP to load live data.</div>
          <div style={{ marginTop: 4, color: '#d00', fontWeight: 600 }}>⚠️ Tax codes shown are examples only. Use actual SAP tax codes to avoid submission errors.</div>
        </div>
      )}

      <fieldset disabled={!isDocumentEditable} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <div style={{ padding: '0 12px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ flex: sidebarOpen ? '0 0 calc(75% - 6px)' : '1' }}>

            {/* ══ HEADER CARD ══════════════════════════════════════════════ */}
            <div className="so-header-card">
              <div className="row g-2">
                {/* LEFT COLUMN */}
                <div className="col-md-6">
                  <div className="so-field-grid" style={{ gridTemplateColumns: '1fr' }}>
                    
                    {/* Buyer's Code */}
                    <div className="so-field">
                      <label className="so-field__label">Buyer's Code *</label>
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
                    <div className="so-field">
                      <label className="so-field__label">Buyer's Name</label>
                      <input name="name" className="so-field__input" value={header.name} readOnly />
                    </div>

                    {/* Contact Person */}
                    <div className="so-field">
                      <label className="so-field__label">Contact Person</label>
                      <select
                        name="contactPerson"
                        className="so-field__select"
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
                    <div className="so-field">
                      <label className="so-field__label">Place of Supply *</label>
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
                    <div className="so-field">
                      <label className="so-field__label">Payment Terms</label>
                      <select name="paymentTerms" className="so-field__select" value={header.paymentTerms} onChange={handleHeaderChange}>
                        <option value="">Select</option>
                        {payTermOpts.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>

                    {/* Branch */}
                    <div className="so-field">
                      <label className="so-field__label">Branch</label>
                      <select 
                        name="branch" 
                        className="so-field__select" 
                        value={header.branch || ''} 
                        onChange={handleHeaderChange}
                        style={{ border: valErrors.header.branch ? '1px solid #c00' : undefined }}
                      >
                        <option value="">Select Branch</option>
                        {refData.branches.map(b => (
                          <option key={b.BPLId} value={b.BPLId}>
                            {b.BPLName}
                          </option>
                        ))}
                      </select>
                      {valErrors.header.branch && (
                        <div style={{ color: '#c00', fontSize: 10, marginTop: 2 }}>{valErrors.header.branch}</div>
                      )}
                    </div>

                    {/* Warehouse */}
                    <div className="so-field">
                      <label className="so-field__label">Warehouse *</label>
                      <select 
                        name="warehouse" 
                        className="so-field__select" 
                        value={header.warehouse || ''} 
                        onChange={handleHeaderChange}
                        style={{ border: valErrors.header.warehouse ? '1px solid #c00' : undefined }}
                        title={header.branch ? `Showing warehouses for selected branch` : 'Select a branch first to filter warehouses'}
                      >
                        <option value="">Select Warehouse</option>
                        {branchFilteredWarehouses.map(w => (
                          <option key={w.WhsCode} value={w.WhsCode}>
                            {w.WhsCode} - {w.WhsName}
                          </option>
                        ))}
                      </select>
                      {valErrors.header.warehouse && (
                        <div style={{ color: '#c00', fontSize: 10, marginTop: 2 }}>{valErrors.header.warehouse}</div>
                      )}
                    </div>

                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="col-md-6">
                  <div className="so-field-grid" style={{ gridTemplateColumns: '1fr' }}>

                    {/* Series */}
                    <div className="so-field">
                      <label className="so-field__label">Series</label>
                      <select 
                        name="series" 
                        className="so-field__select" 
                        value={header.series || ''} 
                        onChange={handleHeaderChange}
                        disabled={!!currentDocEntry || pageState.seriesLoading}
                      >
                        <option value="">Select Series</option>
                        {refData.series.map(s => (
                          <option key={s.Series} value={s.Series}>
                            {s.SeriesName}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Auto Number */}
                    <div className="so-field">
                      <label className="so-field__label">Number</label>
                      <input 
                        name="nextNumber" 
                        className="so-field__input" 
                        value={header.nextNumber || ''} 
                        readOnly 
                        style={{ background: '#f0f2f5' }}
                      />
                    </div>

                    {/* Customer Ref. No. */}
                    <div className="so-field">
                      <label className="so-field__label">Customer Ref. No.</label>
                      <input name="salesContractNo" className="so-field__input" value={header.salesContractNo} onChange={handleHeaderChange} />
                    </div>

                    {/* Status */}
                    <div className="so-field">
                      <label className="so-field__label">Status</label>
                      <input name="status" className="so-field__input" value={header.status} readOnly style={{ background: '#f0f2f5', color: header.status === 'Open' ? '#1a7a30' : '#c00', fontWeight: 600 }} />
                    </div>

                    {/* Posting Date */}
                    <div className="so-field">
                      <label className="so-field__label">Posting Date *</label>
                      <input type="date" name="postingDate" className="so-field__input" value={header.postingDate} onChange={handleHeaderChange} />
                    </div>

                    {/* Delivery Date */}
                    <div className="so-field">
                      <label className="so-field__label">Delivery Date</label>
                      <input type="date" name="deliveryDate" className="so-field__input" value={header.deliveryDate} onChange={handleHeaderChange} />
                    </div>

                    {/* Document Date */}
                    <div className="so-field">
                      <label className="so-field__label">Document Date *</label>
                      <input 
                        type="date" 
                        name="documentDate" 
                        className="so-field__input" 
                        value={header.documentDate} 
                        onChange={handleHeaderChange}
                        style={{ border: valErrors.header.documentDate ? '1px solid #c00' : undefined }}
                      />
                      {valErrors.header.documentDate && (
                        <div style={{ color: '#c00', fontSize: 10, marginTop: 2 }}>{valErrors.header.documentDate}</div>
                      )}
                    </div>

                  </div>
                </div>
              </div>
            </div>

            {/* ══ TABS ══════════════════════════════════════════════════════ */}
            <div className="so-tabs">
              {TAB_NAMES.map(t => (
                <button
                  key={t}
                  type="button"
                  className={`so-tab${activeTab === t ? ' so-tab--active' : ''}`}
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
                lineItemOptions={lineItemOptions}
                getUomOptions={getUomOptions}
                effectiveTaxCodes={effectiveTaxCodes}
                effectiveWarehouses={branchFilteredWarehouses}
                fmtTaxLabel={fmtTaxLabel}
                valErrors={valErrors}
                branches={refData.branches}
                onOpenHSNModal={openHSNModal}
                onOpenItemModal={openItemModal}
                getBranchName={getBranchName}
              />
            )}

            {activeTab === 'Logistics' && (
              <LogisticsTab
                header={header}
                onHeaderChange={handleHeaderChange}
                vendorPayToAddresses={vendorPayToAddresses}
                vendorShipToAddresses={vendorShipToAddresses}
                vendorBillToAddresses={vendorBillToAddresses}
                shipTypeOpts={shipTypeOpts}
                onOpenAddressModal={openAddressModal}
                onOpenEWayBillModal={openEWayBillModal}
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

            {/* ══ TOTALS FOOTER ═════════════════════════════════════════════ */}
            <div className="so-header-card">
              <div className="so-field-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div>
                  <div className="so-field">
                    <label className="so-field__label">Sales Employee</label>
                    <select 
                      name="purchaser" 
                      className="so-field__select" 
                      value={header.purchaser || ''} 
                      onChange={handleHeaderChange}
                      disabled={!refData.sales_employees || refData.sales_employees.length === 0}
                    >
                      <option value="">No Sales Employee / Buyer</option>
                      {(refData.sales_employees || []).map(emp => (
                        <option key={emp.SlpCode} value={emp.SlpName}>
                          {emp.SlpName}
                        </option>
                      ))}
                    </select>
                    {/* Debug info */}
                    <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                      {header.purchaser ? (
                        <span>Selected: {header.purchaser} | Available: {(refData.sales_employees || []).length} employees</span>
                      ) : (
                        <span>No selection | Available: {(refData.sales_employees || []).length} employees</span>
                      )}
                    </div>
                  </div>
                  <div className="so-field">
                    <label className="so-field__label">Owner</label>
                    <select 
                      name="owner" 
                      className="so-field__select" 
                      value={header.owner || ''} 
                      onChange={handleHeaderChange}
                      disabled={!refData.owners || refData.owners.length === 0}
                    >
                      <option value="">No Owner</option>
                      {(refData.owners || []).map(owner => (
                        <option key={owner.empID} value={owner.FullName}>
                          {owner.FullName}
                        </option>
                      ))}
                    </select>
                    {/* Debug info */}
                    <div style={{ fontSize: 10, color: '#666', marginTop: 4 }}>
                      {header.owner ? (
                        <span>Selected: {header.owner} | Available: {(refData.owners || []).length} owners</span>
                      ) : (
                        <span>No selection | Available: {(refData.owners || []).length} owners</span>
                      )}
                    </div>
                  </div>
                  <div className="so-field">
                    <label className="so-field__label">Remarks</label>
                    <textarea className="so-textarea" rows={3} name="otherInstruction" value={header.otherInstruction || ''} onChange={handleHeaderChange} />
                  </div>
                </div>
                <div>
                  <div className="so-section-title">Tax Summary</div>
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
                  <div className="so-grid-wrap">
                    <table className="so-grid" style={{ marginTop: '8px' }}>
                      <tbody>
                        <tr>
                          <td>Total Before Discount</td>
                          <td className="so-grid__cell--num"><input className="so-grid__input" value={fmtDec(totals.subtotal, numDec.total)} readOnly /></td>
                        </tr>
                        <tr>
                          <td>Discount %</td>
                          <td className="so-grid__cell--num"><input className="so-grid__input" name="discount" value={header.discount} onChange={handleHeaderChange} onBlur={() => handleNumBlur('discount', 'header')} /></td>
                        </tr>
                        <tr>
                          <td>Freight</td>
                          <td className="so-grid__cell--num" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <input 
                              className="so-grid__input" 
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
                          <td>Tax</td>
                          <td className="so-grid__cell--num"><input className="so-grid__input" value={fmtDec(totals.taxAmt, numDec.tax)} readOnly /></td>
                        </tr>
                        <tr style={{ borderTop: '2px solid #a0aab4' }}>
                          <td style={{ fontWeight: 700, color: '#003366' }}>Total</td>
                          <td className="so-grid__cell--num" style={{ fontWeight: 700, color: '#003366' }}><input className="so-grid__input" style={{ fontWeight: 700, color: '#003366' }} value={fmtDec(totals.total, numDec.totalPaymentDue)} readOnly /></td>
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
                <button type="submit" className="so-btn so-btn--primary" disabled={pageState.posting}>
                  {pageState.posting ? 'Saving…' : currentDocEntry ? 'Update' : 'Add & New'}
                </button>
                <button type="button" className="so-btn" disabled={pageState.posting}>
                  Add Draft & New
                </button>
                <button type="button" className="so-btn" onClick={resetForm}>
                  Cancel
                </button>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="so-btn" onClick={() => setCopyFromModal(true)}>
                  Copy From
                </button>
                <button 
                  type="button" 
                  className="so-btn" 
                  onClick={() => setCopyToModal(true)}
                  disabled={!currentDocEntry}
                >
                  Copy To
                </button>
              </div>
            </div>
            )}

          </div>{/* end main col */}

          <HeaderUdfSidebar
            isOpen={sidebarOpen}
            fields={visHdrUdfs}
            formSettings={formSettings}
            values={headerUdfs}
            onFieldChange={handleHeaderUdfChange}
            style={{ flex: sidebarOpen ? '0 0 calc(25% - 6px)' : '0' }}
          />
        </div>
      </div>

      </fieldset>

      {/* Form Settings Panel */}
      <FormSettingsPanel
        isOpen={formSettingsOpen}
        onClose={() => setFormSettingsOpen(false)}
        matrixFields={[]}
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

      {/* E-Way Bill Modal */}
      <EWayBillModal
        isOpen={eWayBillModal}
        onClose={closeEWayBillModal}
        onSave={saveEWayBillModal}
        eWayBillData={eWayBillData}
      />

      {/* Tax Information Modal */}
      <TaxInfoModal
        isOpen={taxInfoModal}
        onClose={closeTaxInfoModal}
        onSave={saveTaxInfoModal}
        taxInfoForm={taxInfoForm}
        onFormChange={handleTaxInfoFormChange}
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

      {/* Copy From Modal */}
      <CopyFromModal
        isOpen={copyFromModal}
        onClose={() => setCopyFromModal(false)}
        onCopy={handleCopyFrom}
        documentType="quotation"
      />

      {/* Copy To Modal */}
      <CopyToModal
        isOpen={copyToModal}
        onClose={() => setCopyToModal(false)}
        onCopyTo={handleCopyTo}
        currentDocument={{
          docEntry: currentDocEntry,
          header: header,
          lines: lines,
        }}
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

export default SalesOrder;
