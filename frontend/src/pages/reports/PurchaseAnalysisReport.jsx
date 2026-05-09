import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../modules/item-master/styles/itemMaster.css";
import "../../modules/sales-order/styles/salesOrder.css";
import "../../styles/salesAnalysis.css";
import SapLookupModal from "../../components/common/SapLookupModal";
import SalesAnalysisCriteria from "../../components/reports/SalesAnalysisCriteria";
import SalesAnalysisPropertiesModal from "../../components/reports/SalesAnalysisPropertiesModal";
import SalesAnalysisResultGrid from "../../components/reports/SalesAnalysisResultGrid";
import SalesAnalysisDetailGrid from "../../components/reports/SalesAnalysisDetailGrid";
import { exportPurchaseDetailPdf, exportPurchaseSummaryPdf } from "../../utils/analysisPdf";
import {
  fetchPurchaseAnalysisItemGroups,
  fetchPurchaseAnalysisItemProperties,
  fetchPurchaseAnalysisItems,
  fetchPurchaseAnalysisPurchasingEmployees,
  fetchPurchaseAnalysisVendorGroups,
  fetchPurchaseAnalysisVendorProperties,
  fetchPurchaseAnalysisVendors,
  runPurchaseAnalysis,
} from "../../services/purchaseAnalysisApi";

const today = new Date();
const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
const todayIso = today.toISOString().slice(0, 10);

const emptyRange = { codeFrom: "", codeTo: "" };

const createInitialCriteria = () => ({
  tab: "customers",
  reportPeriod: "annual",
  documentType: "invoices",
  displayMode: "individual",
  totalType: "totalByCustomer",
  dateFilters: {
    postingDate: { enabled: true, from: monthStart, to: todayIso },
    dueDate: { enabled: false, from: monthStart, to: todayIso },
    documentDate: { enabled: false, from: monthStart, to: todayIso },
  },
  customer: {
    ...emptyRange,
    group: "All",
    propertiesMode: "Ignore",
    properties: [],
  },
  item: {
    ...emptyRange,
    group: "All",
    propertiesMode: "Ignore",
    properties: [],
    secondarySelection: false,
    secondaryFilters: {
      customer: { ...emptyRange },
      salesEmployee: { ...emptyRange },
      warehouse: { ...emptyRange },
    },
  },
  salesEmployee: {
    ...emptyRange,
    includeInactive: false,
  },
  displaySystemCurrency: false,
});

const setDeepValue = (source, path, nextValue) => {
  const keys = path.split(".");
  const clone = { ...source };
  let cursor = clone;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = nextValue;
      return;
    }
    cursor[key] = Array.isArray(cursor[key]) ? [...cursor[key]] : { ...cursor[key] };
    cursor = cursor[key];
  });

  return clone;
};

const buildPropertySummary = (mode, properties, options) => {
  if (mode === "Ignore" || !properties.length) return "Ignore";
  const names = properties
    .map((propertyNumber) => options.find((option) => option.number === propertyNumber)?.name || `Property ${propertyNumber}`)
    .slice(0, 3);
  const suffix = properties.length > 3 ? ` +${properties.length - 3} more` : "";
  return `${mode}: ${names.join(", ")}${suffix}`;
};

const downloadCsv = (filename, rows) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => `"${String(row[header] ?? "").replace(/"/g, '""')}"`).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  link.click();
  URL.revokeObjectURL(link.href);
};

export default function PurchaseAnalysisReport() {
  const navigate = useNavigate();
  const [criteria, setCriteria] = useState(createInitialCriteria);
  const [customerGroupOptions, setCustomerGroupOptions] = useState([{ code: "All", name: "All" }]);
  const [itemGroupOptions, setItemGroupOptions] = useState([{ code: "All", name: "All" }]);
  const [customerProperties, setCustomerProperties] = useState([]);
  const [itemProperties, setItemProperties] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [summaryResult, setSummaryResult] = useState(null);
  const [detailResult, setDetailResult] = useState(null);
  const [lookupState, setLookupState] = useState({ open: false, type: "vendors", rangeKey: "from" });
  const [propertiesModal, setPropertiesModal] = useState({ open: false, type: "customer" });

  useEffect(() => {
    Promise.all([
      fetchPurchaseAnalysisVendorGroups(),
      fetchPurchaseAnalysisItemGroups(),
      fetchPurchaseAnalysisVendorProperties(),
      fetchPurchaseAnalysisItemProperties(),
    ])
      .then(([customerGroups, itemGroups, bpProperties, itmProperties]) => {
        setCustomerGroupOptions(customerGroups);
        setItemGroupOptions(itemGroups);
        setCustomerProperties(bpProperties);
        setItemProperties(itmProperties);
      })
      .catch(() => {
        setMessage("Lookup data could not be loaded. Default values are still available.");
      });
  }, []);

  const customerPropertySummary = useMemo(
    () => buildPropertySummary(criteria.customer.propertiesMode, criteria.customer.properties, customerProperties),
    [criteria.customer.propertiesMode, criteria.customer.properties, customerProperties]
  );
  const itemPropertySummary = useMemo(
    () => buildPropertySummary(criteria.item.propertiesMode, criteria.item.properties, itemProperties),
    [criteria.item.propertiesMode, criteria.item.properties, itemProperties]
  );

  const validateCriteria = () => {
    const enabledFilters = Object.values(criteria.dateFilters).filter((filter) => filter.enabled);
    if (!enabledFilters.length) return "At least one date criterion must be selected";
    const invalidFilter = enabledFilters.find((filter) => !filter.from || !filter.to || filter.from > filter.to);
    if (invalidFilter) return "Enter valid date range";
    if (
      criteria.customer.codeFrom &&
      criteria.customer.codeTo &&
      criteria.customer.codeFrom > criteria.customer.codeTo
    ) {
      return "Invalid selection criteria";
    }
    if (
      criteria.item.codeFrom &&
      criteria.item.codeTo &&
      criteria.item.codeFrom > criteria.item.codeTo
    ) {
      return "Invalid selection criteria";
    }
    if (
      criteria.salesEmployee.codeFrom &&
      criteria.salesEmployee.codeTo &&
      criteria.salesEmployee.codeFrom > criteria.salesEmployee.codeTo
    ) {
      return "Invalid selection criteria";
    }
    return "";
  };

  const handleChange = (path, value) => {
    setCriteria((previous) => {
      const next = setDeepValue(previous, path, value);
      if (path === "tab") {
        if (value === "customers") next.totalType = "totalByCustomer";
        if (value === "items") next.totalType = "none";
      }
      return next;
    });
  };

  const handleRun = async () => {
    const validationMessage = validateCriteria();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setLoading(true);
    setMessage("");
    setDetailResult(null);

    try {
      const result = await runPurchaseAnalysis(criteria);
      setSummaryResult(result);
      if (result.message) setMessage(result.message);
    } catch (error) {
      setMessage(error.response?.data?.message || "Invalid selection criteria");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDetail = async (row) => {
    setLoading(true);
    setMessage("");
    try {
      const result = await runPurchaseAnalysis({
        ...criteria,
        detailContext: {
          entityCode: row.entityCode,
          entityName: row.entityName,
          periodKey: row.periodKey,
          secondaryCode: row.secondaryCode,
        },
      });
      setDetailResult(result);
    } catch (error) {
      setMessage(error.response?.data?.message || "No matching records found");
    } finally {
      setLoading(false);
    }
  };

  const getLookupFetcher = () => {
    if (lookupState.type === "vendors") return fetchPurchaseAnalysisVendors;
    if (lookupState.type === "items") return fetchPurchaseAnalysisItems;
    return (query) => fetchPurchaseAnalysisPurchasingEmployees(query, criteria.salesEmployee.includeInactive);
  };

  const handleLookupSelect = (row) => {
    if (lookupState.type === "vendors") {
      const field = lookupState.rangeKey === "from" ? "customer.codeFrom" : "customer.codeTo";
      handleChange(field, row.code || row.CardCode || "");
    } else if (lookupState.type === "items") {
      const field = lookupState.rangeKey === "from" ? "item.codeFrom" : "item.codeTo";
      handleChange(field, row.code || row.ItemCode || "");
    } else {
      const field = lookupState.rangeKey === "from" ? "salesEmployee.codeFrom" : "salesEmployee.codeTo";
      handleChange(field, row.code || "");
    }
    setLookupState((previous) => ({ ...previous, open: false }));
  };

  const handleToggleProperty = (type, propertyNumber) => {
    setCriteria((previous) => {
      const path = type === "customer" ? previous.customer.properties : previous.item.properties;
      const nextValues = path.includes(propertyNumber)
        ? path.filter((entry) => entry !== propertyNumber)
        : [...path, propertyNumber];
      return setDeepValue(previous, `${type}.properties`, nextValues);
    });
  };

  const renderBody = () => {
    if (detailResult) {
      return (
        <SalesAnalysisDetailGrid
          result={detailResult}
          reportPeriod={criteria.reportPeriod}
          customerLabel="Supplier"
          salesEmployeeLabel="Sales Employee"
          showGrossProfit={false}
          onBack={() => setDetailResult(null)}
          onExport={() => downloadCsv("purchase-analysis-detail.csv", detailResult.rows)}
          onExportPdf={() => exportPurchaseDetailPdf({ result: detailResult, criteria })}
          exportLabel="Excel"
        />
      );
    }

    if (summaryResult) {
      return (
        <SalesAnalysisResultGrid
          result={summaryResult}
          tab={criteria.tab}
          customerLabel="Supplier"
          salesEmployeeLabel="Sales Employee"
          showGrossProfit={false}
          openAmountLabel="Total Open PU"
          onOpenDetail={handleOpenDetail}
          onNavigateEntity={(row) => {
            if (criteria.tab !== "customers" || !row?.entityCode) return;
            navigate("/business-partner", {
              state: {
                cardCode: row.entityCode,
                cardType: "cSupplier",
                source: "purchase-analysis",
              },
            });
          }}
          onBack={() => setSummaryResult(null)}
          onOk={() => setSummaryResult(null)}
          onExport={() => downloadCsv("purchase-analysis-summary.csv", summaryResult.rows)}
          onExportPdf={() =>
            exportPurchaseSummaryPdf({
              result: summaryResult,
              criteria,
              tab: criteria.tab,
              customerLabel: "Supplier",
              salesEmployeeLabel: "Sales Employee",
              openAmountLabel: "Total Open PU",
            })
          }
          exportLabel="Excel"
        />
      );
    }

    return (
      <SalesAnalysisCriteria
        criteria={criteria}
        title="Purchase Analysis - Selection Criteria"
        customerTabLabel="Suppliers"
        customerLabel="Supplier"
        salesEmployeeTabLabel="Sales Employees"
        salesEmployeeLabel="Sales Employee"
        customerGroupOptions={customerGroupOptions}
        itemGroupOptions={itemGroupOptions}
        customerPropertySummary={customerPropertySummary}
        itemPropertySummary={itemPropertySummary}
        documentTypeOptions={[
          { value: "invoices", label: "AP Invoices" },
          { value: "orders", label: "Purchase Order" },
          { value: "goodsReceiptPO", label: "Goods Receipt PO" },
        ]}
        customerTotalTypeOptions={[
          { value: "totalByCustomer", label: "Group by Supplier" },
          { value: "totalByBlanketAgreement", label: "Total by Blanket Agreement" },
        ]}
        itemTotalTypeOptions={[
          { value: "none", label: "No Totals" },
          { value: "totalByCustomer", label: "Group by Supplier" },
          { value: "totalBySalesEmployee", label: "Total by Sales Employee" },
        ]}
        onChange={handleChange}
        onOpenLookup={(type, rangeKey) =>
          setLookupState({
            open: true,
            type: type === "customers" ? "vendors" : type === "salesEmployees" ? "purchasingEmployees" : type,
            rangeKey,
          })
        }
        onOpenCustomerProperties={() => setPropertiesModal({ open: true, type: "customer" })}
        onOpenItemProperties={() => setPropertiesModal({ open: true, type: "item" })}
        onSubmit={handleRun}
        onCancel={() => {
          setCriteria(createInitialCriteria());
          setMessage("");
        }}
        loading={loading}
      />
    );
  };

  return (
    <div className="sar-page">
      {message && <div className="im-alert im-alert--error" style={{ margin: "10px 12px 0" }}>{message}</div>}
      {renderBody()}

      <SapLookupModal
        open={lookupState.open}
        title={
          lookupState.type === "vendors"
            ? "Choose From List - Suppliers"
            : lookupState.type === "items"
              ? "Choose From List - Items"
              : "Choose From List - Sales Employees"
        }
        columns={
          lookupState.type === "vendors"
            ? [
                { key: "code", label: "Code" },
                { key: "name", label: "Supplier Name" },
                { key: "groupName", label: "Group" },
              ]
            : lookupState.type === "items"
              ? [
                  { key: "code", label: "Code" },
                  { key: "name", label: "Item Description" },
                  { key: "groupName", label: "Item Group" },
                ]
              : [
                  { key: "code", label: "Code" },
                  { key: "name", label: "Sales Employee Name" },
                ]
        }
        fetchOptions={getLookupFetcher()}
        onClose={() => setLookupState((previous) => ({ ...previous, open: false }))}
        onSelect={handleLookupSelect}
      />

      <SalesAnalysisPropertiesModal
        open={propertiesModal.open}
        title={propertiesModal.type === "customer" ? "Supplier Properties" : "Item Properties"}
        mode={propertiesModal.type === "customer" ? criteria.customer.propertiesMode : criteria.item.propertiesMode}
        properties={propertiesModal.type === "customer" ? criteria.customer.properties : criteria.item.properties}
        options={propertiesModal.type === "customer" ? customerProperties : itemProperties}
        onModeChange={(value) => handleChange(`${propertiesModal.type}.propertiesMode`, value)}
        onToggleProperty={(propertyNumber) => handleToggleProperty(propertiesModal.type, propertyNumber)}
        onClose={() => setPropertiesModal({ open: false, type: propertiesModal.type })}
        onApply={() => setPropertiesModal({ open: false, type: propertiesModal.type })}
      />
    </div>
  );
}
