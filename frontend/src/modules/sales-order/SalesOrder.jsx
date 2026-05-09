import React, { useEffect, useState, useCallback, useRef } from 'react';
import './styles/salesOrder.css';
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
import QualitySelectionModal from './components/QualitySelectionModal';
import PrintSalesOrderActions from './components/PrintSalesOrderActions';
import FreightChargesModal from '../../components/freight/FreightChargesModal';
import { summarizeFreightRows } from '../../components/freight/freightUtils';
import { determineTaxCode, recalculateAllTaxCodes, getGSTTypeLabel } from '../../utils/taxEngine';
import { filterWarehousesByBranch } from '../../utils/warehouseBranch';
import { getDefaultSeriesForCurrentYear } from '../../utils/seriesDefaults';
import {
    fetchSalesOrderByDocEntry,
    fetchSalesOrderCustomerDetails,
    fetchSalesOrderReferenceData,
    submitSalesOrder,
    updateSalesOrder,
    fetchDocumentSeries,
    fetchNextNumber,
    fetchStateFromAddress,
    fetchItemsForModal,
    fetchFreightCharges,
    createSalesOrderLookupValue,
    fetchOpenSalesQuotations,
    fetchOpenBlanketAgreements,
    fetchSalesQuotationForCopy,
    fetchBlanketAgreementForCopy,
} from '../../api/salesOrderApi';
import { fetchHSNCodes, fetchHSNCodeFromItem } from '../../api/hsnCodeApi';
import { SALES_ORDER_COMPANY_ID } from '../../config/appConfig';
import { salesOrderCopyFromApi, normaliseDocumentHeader, normaliseDocumentLine, BASE_TYPE } from '../../api/copyFromApi';
import {
    FORM_SETTINGS_STORAGE_KEY,
    HEADER_UDF_DEFINITIONS,
    ROW_UDF_DEFINITIONS,
    BASE_MATRIX_COLUMNS,
    createUdfState,
    readSavedFormSettings,
} from '../../config/salesOrderForm';

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
    itemServiceType: 'Item',
    itemNo: '', itemDescription: '',
    sellerQuality: '', buyerQuality: '',
    hsnCode: '', quantity: '', unitPrice: '',
    sellerPrice: '', buyerPrice: '',
    sellerDelivery: '', buyerDelivery: '',
    sellerBrokerageAmtPer: '', sellerBrokeragePercent: '',
    sellerBrokerage: '', buyerBrokerage: '',
    specialRebate: '', commission: '', sellerBrokeragePerQty: '', unitPriceUdf: '',
    buyerPaymentTerms: '', sellerPaymentTerms: '', buyerSpecialInstruction: '', sellerSpecialInstruction: '',
    buyerBillDiscount: '', sellerBillDiscount: '', sellerItem: '', sellerQty: '',
    freightPurchase: '', freightSales: '', freightProvider: '', freightProviderName: '',
    brokerageNumber: '',
    uomCode: '', stdDiscount: '', stcode: '', taxCode: '', total: '', whse: '',
    distRule: '', freeText: '', countryOfOrigin: '', sacCode: '',
    openQty: '', taxAmount: '',
    loc: '', branch: '', lineNum: undefined, baseEntry: null, baseType: null, baseLine: null,
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

const createInitialHeader = () => ({
    ...INIT_HEADER,
    postingDate: today(),
    documentDate: today(),
});

const INIT_ATTACH = Array.from({ length: 9 }, (_, i) => ({
    id: i + 1, targetPath: '', fileName: '', attachmentDate: '',
    freeText: '', copyToTargetDocument: '', documentType: '', atchDocDate: '', alert: '',
}));

// ─── Main Component ───────────────────────────────────────────────────────────
function SalesOrder() {
    const location = useLocation();
    const navigate = useNavigate();
    const formRef = useRef(null);
    const [isCopyFromClick, setIsCopyFromClick] = useState(false);
    const [currentDocEntry, setCurrentDocEntry] = useState(null);
    const [header, setHeader] = useState(() => createInitialHeader());
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
        countries: [], distribution_rules: [], quality_options: { buyer: [], seller: [] }, price_options: { buyer: [], seller: [] },
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
    const [copyFromMode, setCopyFromMode] = useState(false);
    const [copyFromDocType, setCopyFromDocType] = useState('quotation'); // 'quotation' or 'blanket'
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

    const resolvePreferredSeries = (seriesList, postingDateValue, selectedSeries = '') => {
        if (!Array.isArray(seriesList) || !seriesList.length) return null;

        const normalizedSeries = String(selectedSeries || '').trim();
        const matchedSeries = normalizedSeries
            ? seriesList.find((series) => String(series.Series) === normalizedSeries)
            : null;

        if (matchedSeries) return matchedSeries;

        const seriesDate = postingDateValue ? new Date(`${postingDateValue}T00:00:00`) : new Date();
        return getDefaultSeriesForCurrentYear(seriesList, seriesDate) || seriesList[0];
    };

    useEffect(() => { localStorage.setItem(FORM_SETTINGS_STORAGE_KEY, JSON.stringify(formSettings)); }, [formSettings]);



    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (!e.target.closest('.so-dropdown')) {
                document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
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

    // Continue in next part...

    // ── load reference data ───────────────────────────────────────────────────
    useEffect(() => {
        let ignore = false;
        const load = async () => {
            setPageState(p => ({ ...p, loading: true, error: '', success: '' }));
            try {
                const [refDataRes, hsnRes] = await Promise.all([
                    fetchSalesOrderReferenceData(SALES_ORDER_COMPANY_ID),
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
                    setRefData(prev => ({
                        ...prev,
                        company: refDataRes.data.company || '',
                        vendors: refDataRes.data.vendors || [],
                        contacts: prev.contacts?.length ? prev.contacts : (refDataRes.data.contacts || []),
                        pay_to_addresses: prev.pay_to_addresses?.length ? prev.pay_to_addresses : (refDataRes.data.pay_to_addresses || []),
                        ship_to_addresses: prev.ship_to_addresses?.length ? prev.ship_to_addresses : (refDataRes.data.ship_to_addresses || []),
                        bill_to_addresses: prev.bill_to_addresses?.length ? prev.bill_to_addresses : (refDataRes.data.bill_to_addresses || []),
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
                        countries: refDataRes.data.countries || [],
                        distribution_rules: refDataRes.data.distribution_rules || [],
                        quality_options: refDataRes.data.quality_options || { buyer: [], seller: [] },
                        price_options: refDataRes.data.price_options || { buyer: [], seller: [] },
                        decimal_settings: { ...DEC, ...(refDataRes.data.decimal_settings || {}) },
                        warnings: refDataRes.data.warnings || [],
                    }));
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
        if (currentDocEntry) return;

        const seriesDate = String(header.postingDate || '').trim();
        if (!seriesDate) {
            setRefData(prev => ({ ...prev, series: [] }));
            setHeader(prev => ({ ...prev, series: '', nextNumber: '' }));
            return;
        }

        let ignore = false;

        const loadSeriesForPostingDate = async () => {
            try {
                const seriesResponse = await fetchDocumentSeries(seriesDate);
                const availableSeries = seriesResponse.data?.series || [];

                if (ignore) return;

                setRefData(prev => ({ ...prev, series: availableSeries }));

                if (!availableSeries.length) {
                    setHeader(prev => ({ ...prev, series: '', nextNumber: '' }));
                    return;
                }

                const currentSeries = String(header.series || '');
                const defaultSeries = resolvePreferredSeries(availableSeries, seriesDate, currentSeries);

                if (!defaultSeries?.Series) return;

                if (String(defaultSeries.Series) !== currentSeries || !String(header.nextNumber || '').trim()) {
                    handleSeriesChange(defaultSeries.Series);
                }
            } catch (e) {
                if (!ignore) {
                    setPageState(p => ({ ...p, error: getErrMsg(e, 'Failed to load document series.') }));
                }
            }
        };

        loadSeriesForPostingDate();

        return () => { ignore = true; };
    }, [currentDocEntry, header.postingDate]);

    useEffect(() => {
        const docEntry =
            location.state?.salesOrderDocEntry ||
            location.state?.docEntry ||
            location.state?.document?.docEntry ||
            location.state?.document?.DocEntry;
        if (!docEntry) return;
        let ignore = false;
        const load = async () => {
            setPageState(p => ({ ...p, loading: true, error: '', success: '' }));
            try {
                const r = await fetchSalesOrderByDocEntry(docEntry);
                const so = r.data.sales_order;
                let editSeries = [];
                try {
                    const seriesDate = so?.header?.documentDate || so?.header?.postingDate || '';
                    const seriesResponse = await fetchDocumentSeries(seriesDate);
                    editSeries = seriesResponse.data?.series || [];
                } catch (_seriesError) {
                    editSeries = [];
                }

                console.log('📥 Loaded Sales Order:', so);
                console.log('📥 Header data:', so.header);
                console.log('📥 Series:', so.header?.series);

                if (ignore || !so) return;
                setCurrentDocEntry(so.doc_entry || Number(docEntry));

                // Get warehouse from first line if available
                const firstLineWarehouse = so.lines && so.lines.length > 0 ? so.lines[0].whse : '';

                console.log('📥 EDIT DATA - Sales Employee:', so.header?.salesEmployee, 'Code:', so.header?.salesEmployee);
                console.log('📥 EDIT DATA - Purchaser:', so.header?.purchaser);
                console.log('📥 EDIT DATA - Owner:', so.header?.owner);
                console.log('📥 EDIT DATA - Remarks:', so.header?.remarks);
                console.log('📥 EDIT DATA - Other Instruction:', so.header?.otherInstruction);
                console.log('📥 EDIT DATA - Freight:', so.header?.freight);
                console.log('📥 EDIT DATA - refData.sales_employees:', refData.sales_employees?.length || 0);
                console.log('📥 EDIT DATA - refData.owners:', refData.owners?.length || 0);

                if (editSeries.length) {
                    setRefData(prev => ({
                        ...prev,
                        series: editSeries,
                    }));
                }

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
                    docNo: String(so.header?.docNum || ''),
                    nextNumber: String(so.header?.docNum || ''),
                    status: so.header?.status || '',
                    shippingType: so.header?.shippingType || '',
                    confirmed: so.header?.confirmed || false,
                    journalRemark: so.header?.journalRemark || '',
                    currency: so.header?.currency || 'INR',
                };

                console.log('📥 Final header state:', newHeader);
                setHeader(newHeader);
                setFreightModal({ open: false, freightCharges: [], loading: false });

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
                                lineNum: l.lineNum ?? l.LineNum ?? index,
                                hsnCode: hsnCode,
                                stcode: l.stcode || l.taxCode || '',
                                loc: l.loc || resolveLineLocation(l.whse, l.branch || so.header?.branch || header.branch),
                                udf: { ...createUdfState(ROW_UDF_DEFINITIONS), ...(l.udf || {}) }
                            };
                        })
                        : [createLine()]
                );
                setHeaderUdfs({ ...createUdfState(HEADER_UDF_DEFINITIONS), ...(so.header_udfs || {}) });

                if (so.header?.customerCode) {
                    loadVendorDetails(so.header.customerCode);
                }
                setPageState(p => ({ ...p, success: so.doc_num ? `Sales order ${so.doc_num} loaded.` : 'Sales order loaded.' }));
            } catch (e) {
                if (!ignore) setPageState(p => ({ ...p, error: getErrMsg(e, 'Failed to load sales order.') }));
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

    const getWarehouseLocation = (warehouseCode) => {
        if (!warehouseCode) return '';
        const warehouse = effectiveWarehouses.find(w => String(w.WhsCode || '') === String(warehouseCode || ''));
        return warehouse?.City || warehouse?.County || warehouse?.State || '';
    };

    const resolveLineLocation = (warehouseCode, branchId) => (
        getWarehouseLocation(warehouseCode) || getBranchName(branchId) || ''
    );

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
       if (copyFromMode || isCopyFromClick) return;
        if (header.branch) {
            console.log('🔄 Syncing branch to all lines:', header.branch);
            setLines(prev => {
                const updated = prev.map(l => ({
                    ...l,
                    branch: String(header.branch),
                    loc: resolveLineLocation(l.whse || header.warehouse, header.branch)
                }));
                console.log('✅ Lines updated with branch:', updated.map(l => ({ branch: l.branch, loc: l.loc })));
                return updated;
            });
        }
    }, [copyFromMode, header.branch, header.warehouse, isCopyFromClick, refData.warehouses.length]);

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
                ? { ...line, whse: '', loc: resolveLineLocation('', line.branch || header.branch) }
                : line
        )));
    }, [branchFilteredWarehouses, header.branch, refData.warehouses.length]);

    // Sync warehouse to all lines when header warehouse changes
    useEffect(() => {
        if (copyFromMode || isCopyFromClick) return;
        if (header.warehouse) {
            setLines(prev => prev.map(l => ({
                ...l,
                whse: header.warehouse,
                loc: resolveLineLocation(header.warehouse, l.branch || header.branch)
            })));

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
    }, [currentDocEntry, header.placeOfSupply, header.vendor, refData.company_address, selectedBranch]);

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
        if (currentDocEntry) return;
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
    }, [currentDocEntry, header.placeOfSupply, header.vendor]);

    // ── vendor details ────────────────────────────────────────────────────────
    const loadVendorDetails = async (code) => {
        if (!code) {
            setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [], ship_to_addresses: [], bill_to_addresses: [] }));
            return;
        }

        setPageState(p => ({ ...p, vendorLoading: true }));

        try {
            const r = await fetchSalesOrderCustomerDetails(code);

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
                        next.sellerItem = next.sellerItem || value;
                        next.uomCode = String(item.SalesUnit || item.InventoryUOM || '').trim();
                        next.countryOfOrigin = item.ItemCountryOrg || next.countryOfOrigin || '';
                        next.sacCode = item.SACEntry || next.sacCode || '';
                        next.distRule = next.distRule || item.DistributionRule || '';
                        next.whse = next.whse || item.DefaultWarehouse || header.warehouse || '';
                        next.loc = resolveLineLocation(next.whse, next.branch || header.branch);
                        next.openQty = next.openQty || '';

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
                            next.stcode = baseTaxCode || '';
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
                                next.stcode = determinedTaxCode;
                                console.log('✅ Tax Code Auto-Selected:', {
                                    gstType: getGSTTypeLabel(companyState, gstState),
                                    taxCode: determinedTaxCode
                                });
                            } else {
                                console.warn('⚠️ Could not determine tax code');
                                next.taxCode = '';
                                next.stcode = baseTaxCode || '';
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
                        next.sellerItem = next.sellerItem || value;
                        next.uomCode = String(item.SalesUnit || item.InventoryUOM || '').trim();
                        next.hsnCode = item.SWW || item.HSNCode || item.U_HSNCode || next.hsnCode || '';
                        next.countryOfOrigin = item.ItemCountryOrg || next.countryOfOrigin || '';
                        next.sacCode = item.SACEntry || next.sacCode || '';
                        next.distRule = next.distRule || item.DistributionRule || '';
                        next.whse = next.whse || item.DefaultWarehouse || header.warehouse || '';
                        next.loc = resolveLineLocation(next.whse, next.branch || header.branch);
                        next.stcode = next.stcode || item.TaxCodeAR || item.SalTaxCode || next.taxCode || '';
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
                if (name === 'quantity' && !String(next.sellerQty || '').trim()) next.sellerQty = next.quantity;
                if (name === 'unitPrice') next.unitPriceUdf = next.unitPrice;
                if (name === 'taxCode') next.stcode = String(next.taxCode || '');
                if (name === 'whse') next.loc = resolveLineLocation(next.whse, next.branch || header.branch);
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
        // 🚨 SKIP ALL VALIDATION DURING COPY MODE
        if (copyFromMode) {
            setLines(p => [...p, {
                ...createLine(),
                branch: header.branch || '',
                loc: resolveLineLocation(header.warehouse, header.branch),
                whse: header.warehouse || ''
            }]);
            return;
        }
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
            loc: resolveLineLocation(header.warehouse, header.branch),
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

        setLines(prev => prev.map((line, idx) => {
            if (idx !== qualityModal.lineIndex) return line;

            return { ...line, [qualityModal.field]: option?.value || '' };
        }));
    };

    const handleQualityCreate = async ({ value, description }) => {
        const field = qualityModal.field;
        if (!field) return null;

        const response = await createSalesOrderLookupValue(field, value, description);
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

    const openItemModalSafe = async (lineIndex) => {
        const fallbackItems = Array.isArray(refData.items) ? refData.items : [];

        setItemModal({
            open: true,
            lineIndex,
            items: fallbackItems,
            loading: fallbackItems.length === 0
        });

        try {
            const response = await fetchItemsForModal();
            const payload = response?.data;
            const normalizedItems = Array.isArray(payload?.items)
                ? payload.items
                : Array.isArray(payload)
                    ? payload
                    : [];

            setItemModal((prev) => ({
                ...prev,
                items: normalizedItems.length > 0 ? normalizedItems : fallbackItems,
                loading: false,
            }));
        } catch (error) {
            console.error('Failed to load items for Sales Order modal:', error);
            setItemModal((prev) => ({
                ...prev,
                items: prev.items.length > 0 ? prev.items : fallbackItems,
                loading: false,
            }));
        }
    };

    const handleItemSelect = async (item) => {
        if (itemModal.lineIndex < 0) return;

        const lineIndex = itemModal.lineIndex;
        const itemMaster = (refData.items || []).find(
            (candidate) => String(candidate.ItemCode || '') === String(item.ItemCode || '')
        ) || {};
        const mergedItem = { ...itemMaster, ...item };

        try {
            // Fetch HSN code from database
            const hsnResponse = await fetchHSNCodeFromItem(mergedItem.ItemCode);
            const hsnData = hsnResponse.data;

            setLines(prev => prev.map((line, idx) => {
                if (idx !== lineIndex) return line;

                const next = { ...line };
                next.itemNo = mergedItem.ItemCode;
                next.itemDescription = mergedItem.ItemName || '';
                next.sellerItem = next.sellerItem || mergedItem.ItemCode;
                next.uomCode = mergedItem.SalesUnit || mergedItem.InventoryUOM || '';
                next.hsnCode = hsnData.hsnCode || mergedItem.HSNCode || '';
                next.countryOfOrigin = mergedItem.ItemCountryOrg || next.countryOfOrigin || '';
                next.sacCode = mergedItem.SACEntry || next.sacCode || '';
                next.distRule = next.distRule || mergedItem.DistributionRule || '';
                next.whse = next.whse || mergedItem.DefaultWarehouse || header.warehouse || '';
                next.loc = resolveLineLocation(next.whse, next.branch || header.branch);

                // Auto-determine tax code
                const gstState = header.placeOfSupply;
                const companyState = refData.company_address?.State || selectedBranch?.State || '';

                if (gstState && companyState) {
                    const determinedTaxCode = determineTaxCode(
                        mergedItem,
                        gstState,
                        gstState,
                        false,
                        companyState,
                        effectiveTaxCodes
                    );

                    if (determinedTaxCode) {
                        next.taxCode = determinedTaxCode;
                        next.stcode = determinedTaxCode;
                    }
                }

                if (!next.stcode) {
                    next.stcode = mergedItem.TaxCodeAR || mergedItem.SalTaxCode || next.taxCode || '';
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
                    itemNo: mergedItem.ItemCode,
                    itemDescription: mergedItem.ItemName || '',
                    sellerItem: line.sellerItem || mergedItem.ItemCode,
                    uomCode: mergedItem.SalesUnit || mergedItem.InventoryUOM || '',
                    hsnCode: mergedItem.HSNCode || '',
                    countryOfOrigin: mergedItem.ItemCountryOrg || line.countryOfOrigin || '',
                    sacCode: mergedItem.SACEntry || line.sacCode || '',
                    distRule: line.distRule || mergedItem.DistributionRule || '',
                    whse: line.whse || mergedItem.DefaultWarehouse || header.warehouse || '',
                    loc: resolveLineLocation(line.whse || mergedItem.DefaultWarehouse || header.warehouse || '', line.branch || header.branch),
                    stcode: line.stcode || mergedItem.TaxCodeAR || mergedItem.SalTaxCode || line.taxCode || '',
                    total: fmtDec(calcLineTotal({
                        ...line,
                        itemNo: mergedItem.ItemCode,
                        itemDescription: mergedItem.ItemName || '',
                        uomCode: mergedItem.SalesUnit || mergedItem.InventoryUOM || '',
                        hsnCode: mergedItem.HSNCode || '',
                        whse: line.whse || mergedItem.DefaultWarehouse || header.warehouse || '',
                    }), numDec.total)
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
    const handleCopyFrom = (data, docType) => {
        const baseType = BASE_TYPE[docType] || 23;
        const normHeader = normaliseDocumentHeader(data);

        setHeader(prev => ({ ...prev, ...normHeader }));

        const rawLines = data.DocumentLines || data.lines || [];
        const copiedLines = rawLines.map((line, idx) => ({
            ...createLine(),
            ...normaliseDocumentLine(line, idx, data.DocEntry || data.docEntry, baseType, normHeader.branch),
            stcode: line.STCODE || line.STACode || line.TaxCode || line.VatGroup || '',
            loc: line.loc || resolveLineLocation(line.WarehouseCode || line.WhsCode || line.whse || '', normHeader.branch),
        }));
        setLines(copiedLines.length > 0 ? copiedLines : [createLine()]);
        setFreightModal({ open: false, freightCharges: [], loading: false });

        if (normHeader.vendor) loadVendorDetails(normHeader.vendor);

        setCopyFromModal(false);
        setCopyFromMode(false);
    };

    // ── Copy From Modal Handlers ───────────────────────────────────────────────
    const openCopyFromModal = (docType) => {
        console.log('🟢 Copy From Clicked');

        // ✅ ONLY BUYER VALIDATION
        if (!header.vendor) {
            setValErrors({
                header: { vendor: 'Select Buyer first' },
                lines: {},
                form: ''
            });
            return;
        }

        // ✅ ENABLE COPY MODE
        setCopyFromMode(true);

        // ✅ CLEAR ALL ERRORS
        setValErrors({ header: {}, lines: {}, form: '' });
        setPageState(p => ({ ...p, error: '', success: '' }));

        setCopyFromDocType(docType);
        setCopyFromModal(true);
    };
    const fetchCopyFromDocuments = async (docType) => {
        try {
            return await salesOrderCopyFromApi.fetchOpenDocuments(docType);
        } catch (error) {
            console.error('Error fetching documents:', error);
            throw error;
        }
    };

    const fetchCopyFromDocumentDetails = async (docType, docEntry) => {
        try {
            return await salesOrderCopyFromApi.fetchDocumentForCopy(docType, docEntry);
        } catch (error) {
            console.error('Error fetching document details:', error);
            throw error;
        }
    };

    // ── Copy To Handler ────────────────────────────────────────────────────────
    const handleCopyTo = (targetType) => {
        if (!currentDocEntry) return;

        const copyState = {
            copyFrom: {
                type: 'salesOrder',
                docEntry: currentDocEntry,
                header: { ...header },
                lines: lines.map((l, idx) => ({ ...l, lineNum: idx })),
                baseDocument: {
                    baseType: 17, // Sales Order
                    baseEntry: currentDocEntry,
                },
            }
        };

        if (targetType === 'delivery') {
            navigate('/delivery', { state: copyState });
        } else if (targetType === 'ar-invoice') {
            navigate('/ar-invoice', { state: copyState });
        } else if (targetType === 'ar-dpm-request') {
            navigate('/ar-invoice', { state: { ...copyState, dpmRequest: true } });
        } else if (targetType === 'ar-dpm-invoice') {
            navigate('/ar-invoice', { state: { ...copyState, dpmInvoice: true } });
        }
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
        // 🚨 GLOBAL BYPASS FOR COPY MODE
        if (copyFromMode) {
            console.log('🚫 Validation skipped (Copy Mode)');
            return { header: {}, lines: {}, form: '' };
        }

        let errors = { header: {}, lines: {}, form: '' };
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
        if (copyFromMode) {
            console.log('⚠️ Submit blocked in Copy Mode');
            return;
        }
        ev.preventDefault();

        // 🚨 Don't submit if in copy mode
        if (copyFromMode) {
            console.log('⚠️ Form submission blocked - Copy From mode is active');
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
                lineNum: line.lineNum,
                itemServiceType: line.itemServiceType,
                itemNo: line.itemNo,
                itemDescription: line.itemDescription,
                sellerQuality: line.sellerQuality,
                buyerQuality: line.buyerQuality,
                hsnCode: line.hsnCode,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                sellerPrice: line.sellerPrice,
                buyerPrice: line.buyerPrice,
                sellerDelivery: line.sellerDelivery,
                buyerDelivery: line.buyerDelivery,
                sellerBrokerageAmtPer: line.sellerBrokerageAmtPer,
                sellerBrokeragePercent: line.sellerBrokeragePercent,
                sellerBrokerage: line.sellerBrokerage,
                buyerBrokerage: line.buyerBrokerage,
                specialRebate: line.specialRebate,
                commission: line.commission,
                sellerBrokeragePerQty: line.sellerBrokeragePerQty,
                unitPriceUdf: line.unitPriceUdf,
                buyerPaymentTerms: line.buyerPaymentTerms,
                sellerPaymentTerms: line.sellerPaymentTerms,
                buyerSpecialInstruction: line.buyerSpecialInstruction,
                sellerSpecialInstruction: line.sellerSpecialInstruction,
                buyerBillDiscount: line.buyerBillDiscount,
                sellerBillDiscount: line.sellerBillDiscount,
                sellerItem: line.sellerItem,
                sellerQty: line.sellerQty,
                freightPurchase: line.freightPurchase,
                freightSales: line.freightSales,
                freightProvider: line.freightProvider,
                freightProviderName: line.freightProviderName,
                brokerageNumber: line.brokerageNumber,
                uomCode: line.uomCode,
                stdDiscount: line.stdDiscount,
                stcode: line.stcode,
                taxCode: line.taxCode,
                total: line.total,
                whse: line.whse,
                distRule: line.distRule,
                freeText: line.freeText,
                countryOfOrigin: line.countryOfOrigin,
                sacCode: line.sacCode,
                loc: line.loc,
                branch: line.branch,
                baseEntry: line.baseEntry,
                baseType: line.baseType,
                baseLine: line.baseLine,
                udf: line.udf,
            }));

            const payload = { company_id: SALES_ORDER_COMPANY_ID, header: prep, lines: cleanedLines, freightCharges: freightModal.freightCharges, header_udfs: headerUdfs };

            // ═══ LOGGING: Payload Before Submit ═══
            console.log('═══════════════════════════════════════════════════');
            console.log('📤 SUBMITTING SALES ORDER:');
            console.log('Header:', prep);
            console.log('Lines:', cleanedLines);
            console.log('Header UDFs:', headerUdfs);
            console.log('═══════════════════════════════════════════════════');

            const r = currentDocEntry ? await updateSalesOrder(currentDocEntry, payload) : await submitSalesOrder(payload);
            const dn = r.data.doc_num ? ` Doc No: ${r.data.doc_num}.` : '';
            const resetHeader = createInitialHeader();
            setCurrentDocEntry(null); setHeader(resetHeader); setLines([createLine()]);
            setFreightModal({ open: false, freightCharges: [], loading: false });
            setHeaderUdfs(createUdfState(HEADER_UDF_DEFINITIONS)); setActiveTab('Contents');
            setRefData(p => ({ ...p, contacts: [], pay_to_addresses: [] }));
            setValErrors({ header: {}, lines: {}, form: '' });

            const defaultSeries = resolvePreferredSeries(refData.series, resetHeader.postingDate);
            if (defaultSeries?.Series != null) {
                handleSeriesChange(defaultSeries.Series);
            }

            setPageState(p => ({ ...p, success: `${r.data.message || 'Sales order saved.'}${dn}` }));
        } catch (e) {
            console.error('❌ Sales Order Submission Error:', e);
            console.error('Error Response:', e.response?.data);
            setPageState(p => ({ ...p, error: getErrMsg(e, 'Sales order submission failed.') }));
        } finally {
            setPageState(p => ({ ...p, posting: false }));
        }
    };

    const resetForm = () => {
        const resetHeader = createInitialHeader();
        setCurrentDocEntry(null); setHeader(resetHeader); setLines([createLine()]);
        setFreightModal({ open: false, freightCharges: [], loading: false });
        setHeaderUdfs(createUdfState(HEADER_UDF_DEFINITIONS)); setActiveTab('Contents');
        setValErrors({ header: {}, lines: {}, form: '' });
        setPageState(p => ({ ...p, error: '', success: '' }));

        const defaultSeries = resolvePreferredSeries(refData.series, resetHeader.postingDate);
        if (defaultSeries?.Series != null) {
            handleSeriesChange(defaultSeries.Series);
        }
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
        <form ref={formRef} className={`so-page${sidebarOpen ? ' so-page--sidebar-open' : ''}`} onSubmit={handleSubmit}>

            {/* toolbar */}
            <div className="so-toolbar">
                <span className="so-toolbar__title">Sales Order{currentDocEntry ? ` — #${header.docNo || currentDocEntry}` : ''}</span>
                <button type="submit" className="so-btn so-btn--primary" disabled={pageState.posting || !isDocumentEditable} title={primaryActionLabel}>
                    {primaryActionLabel}
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
                <PrintSalesOrderActions
                    docEntry={currentDocEntry}
                    docNumber={header.docNo}
                    disabled={pageState.posting}
                    onSuccess={(message) => setPageState(p => ({ ...p, error: '', success: message }))}
                    onError={(message) => setPageState(p => ({ ...p, success: '', error: message }))}
                />

                {/* Copy From Dropdown */}
                <div className="so-dropdown">
                    <button
                        type="button"
                        className="so-btn"
                        disabled={!isDocumentEditable}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            console.log('🔵 Copy From dropdown clicked');

                            setIsCopyFromClick(true);   // 🚀 ADD THIS
                            // // ✅ FIRST: Activate copy mode to disable all validation
                            // setCopyFromMode(true);

                            // ✅ SECOND: Clear all validation errors immediately
                            setValErrors({ header: {}, lines: {}, form: '' });
                            setPageState({ error: '', success: '', loading: false, posting: false, vendorLoading: false, seriesLoading: false });

                            // ✅ THIRD: Force re-render by toggling dropdown
                            const dropdown = e.currentTarget.parentElement;
                            const isActive = dropdown.classList.contains('active');
                            // Close all other dropdowns
                            document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                            if (!isActive) {
                                dropdown.classList.add('active');
                            }
                        }}
                    >
                        Copy From ▼
                    </button>
                    <div className="so-dropdown-menu">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                console.log('📋 Sales Quotations clicked');

                                // Clear everything before opening modal
                                // setCopyFromMode(true);
                                setValErrors({ header: {}, lines: {}, form: '' });
                                setPageState({ error: '', success: '', loading: false, posting: false, vendorLoading: false, seriesLoading: false });

                                // Small delay to ensure state is updated
                                setTimeout(() => {
                                    openCopyFromModal('quotation');
                                    document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                                }, 10);
                            }}
                        >
                            Sales Quotations
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                console.log('📋 Blanket Agreements clicked');

                                // Clear everything before opening modal
                                // setCopyFromMode(true);
                                setValErrors({ header: {}, lines: {}, form: '' });
                                setPageState({ error: '', success: '', loading: false, posting: false, vendorLoading: false, seriesLoading: false });

                                // Small delay to ensure state is updated
                                setTimeout(() => {
                                    openCopyFromModal('blanket');
                                    document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                                }, 10);
                            }}
                        >
                            Blanket Agreements
                        </button>
                    </div>
                </div>
                <div className="so-dropdown">
                    <button
                        type="button"
                        className="so-btn"
                        disabled={!currentDocEntry}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!currentDocEntry) return;
                            const dropdown = e.currentTarget.parentElement;
                            const isActive = dropdown.classList.contains('active');
                            document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                            if (!isActive) dropdown.classList.add('active');
                        }}
                        style={{ opacity: !currentDocEntry ? 0.5 : 1 }}
                    >
                        Copy To ▼
                    </button>
                    <div className="so-dropdown-menu">
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('delivery'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                            Delivery
                        </button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('ar-invoice'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                            A/R Invoice
                        </button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('ar-dpm-request'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                            A/R DPM Request
                        </button>
                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('ar-dpm-invoice'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                            A/R DPM Invoice
                        </button>
                    </div>
                </div>

                <button type="button" className="so-btn" onClick={() => navigate('/sales-order/find')}>Find</button>
                <button type="button" className="so-btn" onClick={resetForm}>New</button>
            </div>

            {/* alerts */}
            {pageState.loading && <div className="so-alert so-alert--success" style={{ marginTop: 0 }}>Loading…</div>}
            {!copyFromMode && pageState.error && <div className="so-alert so-alert--error">{pageState.error}</div>}
            {pageState.success && <div className="so-alert so-alert--success">{pageState.success}</div>}
            {refData.warnings?.length > 0 && (
                <div className="so-alert so-alert--warning">
                    <strong>SAP warnings:</strong>
                    {refData.warnings.map((w, i) => <div key={i}>{w}</div>)}
                    <div style={{ marginTop: 4, color: '#555' }}>Dropdowns are showing fallback values. Connect to SAP to load live data.</div>
                    <div style={{ marginTop: 4, color: '#d00', fontWeight: 600 }}>⚠️ Tax codes shown are examples only. Use actual SAP tax codes to avoid submission errors.</div>
                </div>
            )}

            <fieldset className="so-fieldset" disabled={!isDocumentEditable} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <div className={`so-layout${sidebarOpen ? ' is-sidebar-open' : ''}`}>
                <div className="so-layout__main">

                        {/* ══ HEADER CARD ══════════════════════════════════════════════ */}
                        <div className="so-header-card">
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
                                {/* LEFT COLUMN */}
                                <div style={{ flex: '1 1 45%', minWidth: '300px', maxWidth: '100%' }}>
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

                                        <fieldset
                                            className="so-fieldset"
                                            disabled={!hasBuyerCode}
                                            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
                                        >
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
                                                style={{ border: (!copyFromMode && valErrors.header.branch) ? '1px solid #c00' : undefined }}
                                            >
                                                <option value="">Select Branch</option>
                                                {refData.branches.map(b => (
                                                    <option key={b.BPLId} value={b.BPLId}>
                                                        {b.BPLName}
                                                    </option>
                                                ))}
                                            </select>
                                            {!copyFromMode && valErrors.header.branch && (
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
                                                style={{ border: (!copyFromMode && valErrors.header.warehouse) ? '1px solid #c00' : undefined }}
                                                title={header.branch ? `Showing warehouses for selected branch` : 'Select a branch first to filter warehouses'}
                                            >
                                                <option value="">Select Warehouse</option>
                                                {branchFilteredWarehouses.map(w => (
                                                    <option key={w.WhsCode} value={w.WhsCode}>
                                                        {w.WhsCode} - {w.WhsName}
                                                    </option>
                                                ))}
                                            </select>
                                            {!copyFromMode && valErrors.header.warehouse && (
                                                <div style={{ color: '#c00', fontSize: 10 }}>
                                                    {valErrors.header.warehouse}
                                                </div>
                                            )}
                                        </div>
                                        </fieldset>

                                    </div>
                                </div>

                                {/* RIGHT COLUMN */}
                                <div style={{ flex: '1 1 45%', minWidth: '300px', maxWidth: '100%' }}>
                                    <fieldset
                                        className="so-fieldset"
                                        disabled={!hasBuyerCode}
                                        style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
                                    >
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
                                                value={currentDocEntry ? (header.docNo || header.nextNumber || '') : (header.nextNumber || '')}
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
                                            {!copyFromMode && valErrors.header.documentDate && (
                                                <div style={{ color: '#c00', fontSize: 10, marginTop: 2 }}>{valErrors.header.documentDate}</div>
                                            )}
                                        </div>

                                    </div>
                                    </fieldset>
                                </div>
                            </div>
                        </div>

                        {/* ══ TABS ══════════════════════════════════════════════════════ */}
                        <fieldset
                            className="so-fieldset"
                            disabled={!hasBuyerCode}
                            style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
                        >
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
                                distributionRules={refData.distribution_rules || []}
                                countries={refData.countries || []}
                                onOpenHSNModal={openHSNModal}
                                onOpenItemModal={openItemModalSafe}
                                onOpenQualityModal={openQualityModal}
                                getBranchName={getBranchName}
                                copyFromMode={copyFromMode}
                                formSettings={formSettings}
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
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', minWidth: 0, maxWidth: '100%' }}>
                                <div style={{ flex: '1 1 45%', minWidth: '300px', maxWidth: '100%' }}>
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
                                <div style={{ flex: '1 1 45%', minWidth: '300px', maxWidth: '100%' }}>
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
                                <div className="so-dropdown">
                                    <button
                                      type="button"
                                      className="so-btn"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setCopyFromMode(true);
                                        setValErrors({ header: {}, lines: {}, form: '' });
                                        setPageState({ error: '', success: '', loading: false, posting: false, vendorLoading: false, seriesLoading: false });
                                        const dropdown = e.currentTarget.parentElement;
                                        const isActive = dropdown.classList.contains('active');
                                        document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                                        if (!isActive) dropdown.classList.add('active');
                                      }}
                                    >
                                      Copy From ▼
                                    </button>
                                    <div className="so-dropdown-menu">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setCopyFromMode(true);
                                            setValErrors({ header: {}, lines: {}, form: '' });
                                            setPageState({ error: '', success: '', loading: false, posting: false, vendorLoading: false, seriesLoading: false });
                                            setTimeout(() => {
                                              openCopyFromModal('quotation');
                                              document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                                            }, 10);
                                          }}
                                        >
                                            Sales Quotations
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setCopyFromMode(true);
                                            setValErrors({ header: {}, lines: {}, form: '' });
                                            setPageState({ error: '', success: '', loading: false, posting: false, vendorLoading: false, seriesLoading: false });
                                            setTimeout(() => {
                                              openCopyFromModal('blanket');
                                              document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                                            }, 10);
                                          }}
                                        >
                                            Blanket Agreements
                                        </button>
                                    </div>
                                </div>
                                {/* Copy To Dropdown - SAP B1 style */}
                                <div className="so-dropdown">
                                    <button
                                        type="button"
                                        className="so-btn"
                                        disabled={!currentDocEntry}
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (!currentDocEntry) return;
                                            const dropdown = e.currentTarget.parentElement;
                                            const isActive = dropdown.classList.contains('active');
                                            document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active'));
                                            if (!isActive) dropdown.classList.add('active');
                                        }}
                                        style={{ opacity: !currentDocEntry ? 0.5 : 1 }}
                                    >
                                        Copy To ▼
                                    </button>
                                    <div className="so-dropdown-menu">
                                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('delivery'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                                            Delivery
                                        </button>
                                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('ar-invoice'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                                            A/R Invoice
                                        </button>
                                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('ar-dpm-request'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                                            A/R DPM Request
                                        </button>
                                        <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyTo('ar-dpm-invoice'); document.querySelectorAll('.so-dropdown').forEach(d => d.classList.remove('active')); }}>
                                            A/R DPM Invoice
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}
                        </fieldset>

                    </div>

                    <fieldset
                        className="so-fieldset"
                        disabled={!hasBuyerCode}
                        style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}
                    >
                        <HeaderUdfSidebar
                            className="so-layout__sidebar"
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
                onCreateNew={() => {
                    closeBpModal();
                    navigate('/business-partner');
                }}
                businessPartners={refData.vendors || []}
            />

            {/* Copy From Modal */}
            <CopyFromModal
                isOpen={copyFromModal}
                onClose={() => {
                    setCopyFromModal(false);
                    setCopyFromMode(false);
                     setIsCopyFromClick(false); 
                }}
                onCopy={handleCopyFrom}
                documentType={copyFromDocType}
                onFetchDocuments={fetchCopyFromDocuments}
                onFetchDocumentDetails={fetchCopyFromDocumentDetails}
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

            {/* Freight Charges Modal */}
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
