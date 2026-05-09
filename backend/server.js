require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const env     = require('./config/env');
const { authenticateAccessToken } = require('./middleware/authMiddleware');

const authRoutes            = require('./routes/authRoutes');
const menuRoutes            = require('./routes/menuRoutes');
const sapRoutes             = require('./routes/sapRoutes');
const itemRoutes            = require('./routes/itemRoutes');
const businessPartnerRoutes = require('./routes/businessPartnerRoutes');
const warehouseRoutes       = require('./routes/warehouseRoutes');
const priceListRoutes       = require('./routes/priceListRoutes');
const taxCodeRoutes         = require('./routes/taxCodeRoutes');
const uomGroupRoutes        = require('./routes/uomGroupRoutes');
const paymentTermsRoutes    = require('./routes/paymentTermsRoutes');
const shippingTypeRoutes    = require('./routes/shippingTypeRoutes');
const branchRoutes          = require('./routes/branchRoutes');
const chartOfAccountsRoutes = require('./routes/chartOfAccountsRoutes');
const purchaseOrderRoutes   = require('./routes/purchaseOrder');
const purchaseQuotationRoutes = require('./routes/purchaseQuotation');
const purchaseRequestRoutes = require('./routes/purchaseRequest');
const salesOrderRoutes      = require('./routes/salesOrder');
const salesQuotationRoutes  = require('./routes/salesQuotation');
const blanketAgreementRoutes = require('./routes/blanketAgreement');
const printRoutes           = require('./routes/printRoutes');
const reportLayoutRoutes    = require('./routes/reportLayoutRoutes');
const salesAnalysisRoutes   = require('./routes/salesAnalysisRoutes');
const bomRoutes             = require('./routes/bomRoutes');
const productionOrderRoutes    = require('./routes/productionOrder');
const issueForProductionRoutes   = require('./routes/issueForProduction');
const receiptFromProductionRoutes = require('./routes/receiptFromProduction');
const grpoRoutes                 = require('./routes/grpo');
const deliveryRoutes             = require('./routes/delivery');
const apInvoiceRoutes            = require('./routes/apInvoice');
const arInvoiceRoutes            = require('./routes/arInvoice');
const apCreditMemoRoutes         = require('./routes/apCreditMemo');
const arCreditMemoRoutes         = require('./routes/arCreditMemo');
const hsnCodeRoutes              = require('./routes/hsnCodeRoutes');
const goodsReceiptRoutes         = require('./routes/goodsReceipt');
const goodsReceiptController     = require('./controllers/goodsReceiptController');
const goodsIssueRoutes           = require('./routes/goodsIssue');
const inventoryTransferRequestRoutes = require('./routes/inventoryTransferRequest');
const inventoryTransferRoutes    = require('./routes/inventoryTransfer');
const purchaseAnalysisRoutes     = require('./routes/reports/purchaseAnalysis.routes');
const purchaseRequestReportRoutes = require('./routes/reports/purchaseRequestReport.routes');
const reportStudioRoutes         = require('./routes/reportStudioRoutes');
const reportLookupsRoutes        = require('./routes/reportLookups');

const app = express();


const redactSensitiveFields = (value) => {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map(redactSensitiveFields);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => {
      if (/(password|token|secret)/i.test(key)) {
        return [key, '[REDACTED]'];
      }

      return [key, redactSensitiveFields(fieldValue)];
    }),
  );
};

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED_REJECTION]', reason);
});

process.on('uncaughtException', (error, origin) => {
  console.error('[UNCAUGHT_EXCEPTION]', origin || 'unknown');
  console.error(error?.stack || error?.message || error);
});

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST' || req.method === 'PATCH') {
    console.log('Request body:', JSON.stringify(redactSensitiveFields(req.body), null, 2));
  }
  next();
});

app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (!req.path.startsWith('/api')) return next();
  if (
    req.path === '/api/login' ||
    req.path === '/api/companies-public' ||
    req.path === '/api/select-company' ||
    req.path.startsWith('/api/companies/')
  ) {
    return next();
  }
  return authenticateAccessToken(req, res, next);
});

// Routes
app.use('/api',                    authRoutes);
app.use('/api/menu',               menuRoutes);
app.get('/api/items',              goodsReceiptController.getItems);
app.use('/api/items',              itemRoutes);
app.use('/api/business-partners',  businessPartnerRoutes);
app.get('/api/warehouses',         goodsReceiptController.getWarehouses);
app.use('/api/warehouses',         warehouseRoutes);
app.use('/api/price-lists',        priceListRoutes);
app.use('/api/tax-codes',          taxCodeRoutes);
app.use('/api/uom-groups',         uomGroupRoutes);
app.use('/api/payment-terms',      paymentTermsRoutes);
app.use('/api/shipping-types',     shippingTypeRoutes);
app.use('/api/branches',           branchRoutes);
app.use('/api/chart-of-accounts',  chartOfAccountsRoutes);
app.get('/api/series',             goodsReceiptController.getSeries);
app.get('/api/purchase-orders',    goodsReceiptController.getPurchaseOrders);
app.use('/api/purchase-order',     purchaseOrderRoutes);
app.use('/api/purchase-quotation', purchaseQuotationRoutes);
app.use('/api/purchase-request',   purchaseRequestRoutes);
app.use('/api/sales-order',        salesOrderRoutes);
app.use('/api/sales-quotation',    salesQuotationRoutes);
app.use('/api/blanket-agreements', blanketAgreementRoutes);
app.use('/api',                    printRoutes);
app.use('/api',                    reportLayoutRoutes);
app.use('/api',                    reportStudioRoutes);
app.use('/api/reports',            salesAnalysisRoutes);
app.use('/api/bom',                bomRoutes);
app.use('/api/production-order',   productionOrderRoutes);
app.use('/api/issue-for-production',    issueForProductionRoutes);
app.use('/api/receipt-from-production', receiptFromProductionRoutes);
app.use('/api/grpo',               grpoRoutes);
app.use('/api/delivery',           deliveryRoutes);
app.use('/api/ap-invoice',         apInvoiceRoutes);
app.use('/api/ar-invoice',         arInvoiceRoutes);
app.use('/api/ap-credit-memo',     apCreditMemoRoutes);
app.use('/api/ar-credit-memo',     arCreditMemoRoutes);
app.use('/api/hsn-codes',          hsnCodeRoutes);
app.use('/api/goods-receipt',      goodsReceiptRoutes);
app.use('/api/goods-issue',        goodsIssueRoutes);
app.use('/api/inventory-transfer-request', inventoryTransferRequestRoutes);
app.use('/api/inventory-transfer', inventoryTransferRoutes);
app.use('/api/reports',            purchaseAnalysisRoutes);
app.use('/api/reports',            purchaseRequestReportRoutes);
app.use('/api/lookups',            reportLookupsRoutes);
app.use('/api',                    sapRoutes);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', port: env.port }));

// SAP connection debug — remove in production
app.get('/api/debug/production-orders', async (_req, res) => {
  try {
    const sapService = require('./services/sapService');
    await sapService.ensureSession();
    const resp = await sapService.request({
      method: 'GET',
      url: `/ProductionOrders?$select=DocEntry,DocNum,ItemNo,ProductionOrderStatus&$top=5`,
    });
    res.json({ ok: true, count: resp.data?.value?.length, sample: resp.data?.value });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.response?.data || e.message });
  }
});

// Global error handler middleware
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  console.error('[ERROR_STACK]', err.stack);
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
});

const server = app.listen(env.port, () => {
  console.log(`[Server] Running on http://localhost:${env.port}`);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.log(`[SERVER_INFO] Port ${env.port} is already in use. Another backend instance is already running, so this duplicate start will close.`);
    process.exit(0);
    return;
  }

  console.error('[SERVER_ERROR]', error?.stack || error?.message || error);
});
