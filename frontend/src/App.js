import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import { AuthProvider } from "./auth/AuthContext";
import {
  PublicOnlyRoute,
  RequireAuth,
  RequirePendingSelection,
  RouteFallback,
} from "./auth/RouteGuards";

import Dashboard from "./pages/Dashboard";
import LoginPage from "./pages/LoginPage";
import ItemMaster from "./pages/ItemMaster";
import BusinessPartner from "./pages/BusinessPartner";
import Warehouse from "./pages/Warehouse";
import PriceList from "./pages/PriceList";
import Delivery from "./pages/Delivery";
import DeliveryList from "./pages/DeliveryList";
import TaxCode from "./pages/TaxCode";
import UoMGroup from "./pages/UoMGroup";
import PaymentTerms from "./pages/PaymentTerms";
import ShippingType from "./pages/ShippingType";
import Branch from "./pages/Branch";
import ChartOfAccounts from "./pages/ChartOfAccounts";
import GoodsReceipt from "./pages/GoodsReceipt";
import GoodsReceiptList from "./pages/GoodsReceiptList";
import GoodsIssue from "./pages/GoodsIssue";
import GoodsIssueList from "./pages/GoodsIssueList";
import InventoryTransferRequest from "./pages/InventoryTransferRequest";
import InventoryTransferRequestList from "./pages/InventoryTransferRequestList";
import InventoryTransfer from "./pages/InventoryTransfer";
import InventoryTransferList from "./pages/InventoryTransferList";
import PurchaseOrder from "./pages/PurchaseOrder";
import PurchaseOrderList from "./pages/PurchaseOrderList";
import PurchaseQuotation from "./pages/PurchaseQuotation";
import PurchaseQuotationList from "./pages/PurchaseQuotationList";
import PurchaseRequest from "./pages/PurchaseRequest";
import PurchaseRequestList from "./pages/PurchaseRequestList";
import GoodsReceiptPO from "./pages/GRPO";
import GRPOList from "./pages/GRPOList";
import SalesOrder from "./pages/SalesOrder";
import SalesOrderList from "./pages/SalesOrderList";
import BOM from "./pages/BOM";
import ProductionOrder from "./pages/ProductionOrder";
import IssueForProduction from "./pages/IssueForProduction";
import ReceiptFromProduction from "./pages/ReceiptFromProduction";
import APInvoice from "./pages/APInvoice";
import APInvoiceList from "./pages/APInvoiceList";
import ARInvoice from "./pages/ARInvoice";
import ARInvoiceList from "./pages/ARInvoiceList";
import APCreditMemo from "./pages/APCreditMemo";
import APCreditMemoList from "./pages/APCreditMemoList";
import ARCreditMemo from "./pages/ARCreditMemo";
import ARCreditMemoList from "./pages/ARCreditMemoList";
import SalesQuotation from "./pages/SalesQuotation";
import SalesQuotationList from "./pages/SalesQuotationList";
import SalesAnalysisReportPage from "./pages/SalesAnalysisReportPage";
import PurchaseAnalysisReport from "./pages/PurchaseAnalysisReport";
import PurchaseRequestReportPage from "./pages/PurchaseRequestReportPage";
import ReportsStudioPage from "./pages/ReportsStudioPage";
import "./App.css";
import "./styles/auth.css";

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />

          <Route
            path="/company-select"
            element={
              <RequirePendingSelection>
                <Navigate to="/login" replace />
              </RequirePendingSelection>
            }
          />

          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/item-master" element={<ItemMaster />} />
              <Route path="/business-partner" element={<BusinessPartner />} />
              <Route path="/warehouse" element={<Warehouse />} />
              <Route path="/price-list" element={<PriceList />} />
              <Route path="/tax-code" element={<TaxCode />} />
              <Route path="/uom-group" element={<UoMGroup />} />
              <Route path="/payment-terms" element={<PaymentTerms />} />
              <Route path="/goods-receipt" element={<GoodsReceipt />} />
              <Route path="/goods-receipt/find" element={<GoodsReceiptList />} />
              <Route path="/goods-issue" element={<GoodsIssue />} />
              <Route path="/goods-issue/find" element={<GoodsIssueList />} />
              <Route path="/inventory-transfer-request" element={<InventoryTransferRequest />} />
              <Route path="/inventory-transfer-request/find" element={<InventoryTransferRequestList />} />
              <Route path="/inventory-transfer" element={<InventoryTransfer />} />
              <Route path="/inventory-transfer/find" element={<InventoryTransferList />} />
              <Route path="/delivery" element={<Delivery />} />
              <Route path="/delivery/new" element={<Delivery />} />
              <Route path="/Delivery" element={<Navigate to="/delivery" replace />} />
              <Route path="/delivery/find" element={<DeliveryList />} />
              <Route path="/shipping-type" element={<ShippingType />} />
              <Route path="/branch" element={<Branch />} />
              <Route path="/chart-of-accounts" element={<ChartOfAccounts />} />
              <Route path="/purchase-order" element={<PurchaseOrder />} />
              <Route path="/purchase-order/find" element={<PurchaseOrderList />} />
              <Route path="/purchase-quotation" element={<PurchaseQuotation />} />
              <Route path="/purchase-quotation/find" element={<PurchaseQuotationList />} />
              <Route path="/purchase-request" element={<PurchaseRequest />} />
              <Route path="/purchase-request/find" element={<PurchaseRequestList />} />
              <Route path="/grpo" element={<GoodsReceiptPO />} />
              <Route path="/grpo/find" element={<GRPOList />} />
              <Route path="/sales-order" element={<SalesOrder />} />
              <Route path="/sales-order/old" element={<SalesOrder />} />
              <Route path="/sales-order/find" element={<SalesOrderList />} />
              <Route path="/sales-quotation" element={<SalesQuotation />} />
              <Route path="/sales-quotation/find" element={<SalesQuotationList />} />
              <Route path="/reports" element={<ReportsStudioPage />} />
              <Route path="/reports/sales/analysis" element={<SalesAnalysisReportPage />} />
              <Route path="/reports/purchasing/analysis" element={<PurchaseAnalysisReport />} />
              <Route path="/reports/purchase-analysis" element={<PurchaseAnalysisReport />} />
              <Route path="/reports/purchase/analysis" element={<PurchaseAnalysisReport />} />
              <Route path="/reports/purchasing/purchase-request-report" element={<PurchaseRequestReportPage />} />
              <Route path="/bom" element={<BOM />} />
              <Route path="/production-order" element={<ProductionOrder />} />
              <Route path="/issue-for-production" element={<IssueForProduction />} />
              <Route path="/receipt-from-production" element={<ReceiptFromProduction />} />
              <Route path="/ap-invoice" element={<APInvoice />} />
              <Route path="/ap-invoice/find" element={<APInvoiceList />} />
              <Route path="/ar-invoice" element={<ARInvoice />} />
              <Route path="/ar-invoice/find" element={<ARInvoiceList />} />
              <Route path="/ar-credit-memo" element={<ARCreditMemo />} />
              <Route path="/ar-credit-memo/find" element={<ARCreditMemoList />} />
              <Route path="/ap-credit-memo" element={<APCreditMemo />} />
              <Route path="/ap-credit-memo/find" element={<APCreditMemoList />} />
            </Route>
          </Route>

          <Route path="*" element={<RouteFallback />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
