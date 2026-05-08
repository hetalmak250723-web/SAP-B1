import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../modules/item-master/styles/itemMaster.css";
import "../../modules/sales-order/styles/salesOrder.css";
import "../../styles/salesAnalysis.css";
import "../../styles/purchaseQuotationComparison.css";
import SapLookupModal from "../../components/common/SapLookupModal";
import SalesAnalysisPropertiesModal from "../../components/reports/SalesAnalysisPropertiesModal";
import SapWindowControls from "../../components/reports/SapWindowControls";
import useFloatingWindow from "../../components/reports/useFloatingWindow";
import { useSapWindowTaskbarActions } from "../../components/SapWindowTaskbarContext";
import {
  fetchComparisonItemGroups,
  fetchComparisonItemProperties,
  fetchComparisonItems,
  fetchComparisonVendorGroups,
  fetchComparisonVendorProperties,
  fetchComparisonVendors,
  runPurchaseQuotationComparison,
} from "../../services/purchaseQuotationComparisonApi";

const emptyRange = { from: "", to: "" };

const createInitialCriteria = () => ({
  type: "item",
  item: {
    ...emptyRange,
    group: "All",
    propertiesMode: "Ignore",
    properties: [],
  },
  vendor: {
    ...emptyRange,
    group: "All",
    propertiesMode: "Ignore",
    properties: [],
  },
  requiredDate: { ...emptyRange },
  documentDate: { ...emptyRange },
  documentNo: { ...emptyRange },
  groupNo: { ...emptyRange },
  openOnly: true,
});

const setDeepValue = (source, path, value) => {
  const keys = path.split(".");
  const clone = { ...source };
  let cursor = clone;

  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
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

const formatNumber = (value, digits = 2) =>
  new Intl.NumberFormat(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(value || 0));

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

function RangeLine({ label, value, onChange, onLookupFrom, onLookupTo, type = "text" }) {
  return (
    <div className="pqc-range-line">
      <label>{label}</label>
      <span>From</span>
      <div className="pqc-lookup-wrap">
        <input className="im-field__input" type={type} value={value.from} onChange={(event) => onChange("from", event.target.value)} />
        {onLookupFrom && <button type="button" className="sar-cfl-btn" onClick={onLookupFrom}>...</button>}
      </div>
      <span>To</span>
      <div className="pqc-lookup-wrap">
        <input className="im-field__input" type={type} value={value.to} onChange={(event) => onChange("to", event.target.value)} />
        {onLookupTo && <button type="button" className="sar-cfl-btn" onClick={onLookupTo}>...</button>}
      </div>
    </div>
  );
}

function SelectionBlock({
  title,
  codeLabel,
  value,
  groupOptions,
  propertySummary,
  onChange,
  onOpenLookup,
  onOpenProperties,
}) {
  return (
    <fieldset className="pqc-box">
      {title && <legend>{title}</legend>}
      <RangeLine
        label={codeLabel}
        value={value}
        onChange={(field, nextValue) => onChange(field, nextValue)}
        onLookupFrom={() => onOpenLookup("from")}
        onLookupTo={() => onOpenLookup("to")}
      />
      <div className="pqc-group-line">
        <label>{title === "Vendors" ? "Vendor Group" : "Item Group"}</label>
        <select className="im-field__input" value={value.group} onChange={(event) => onChange("group", event.target.value)}>
          {groupOptions.map((option) => (
            <option key={option.code} value={option.code}>{option.name || option.code}</option>
          ))}
        </select>
      </div>
      <div className="pqc-properties-line">
        <button type="button" className="pqc-properties-btn" onClick={onOpenProperties}>Properties</button>
        <input className="im-field__input" value={propertySummary} readOnly />
      </div>
    </fieldset>
  );
}

function ResultGrid({ result, onBack, onExport, windowFrame, onClose }) {
  const rows = result?.rows || [];

  return (
    <div
      className={`sar-window${windowFrame?.isMinimized ? " is-minimized" : ""}${windowFrame?.isMaximized ? " is-maximized" : ""}`}
      {...(windowFrame?.windowProps || {})}
    >
      <div className="sar-window__titlebar" {...(windowFrame?.titleBarProps || {})}>
        <span>{result?.title || "Purchase Quotation Comparison Report"}</span>
        <SapWindowControls windowFrame={windowFrame} onClose={onClose} />
      </div>
      <div className="sar-window__underline" />
      <div className="sar-window__body">
        <div className="pqc-result-meta">
          <span>{result?.companyName}</span>
          <span>Currency: {result?.currencyCode}</span>
          <span>Quotations: {result?.totals?.quotationCount || 0}</span>
          <span>Lines: {result?.totals?.lineCount || 0}</span>
        </div>
        <div className="sar-grid-wrap">
          <table className="sar-grid pqc-grid">
            <thead>
              <tr>
                <th>#</th>
                <th>Item No.</th>
                <th>Item Description</th>
                <th>Vendor</th>
                <th>Vendor Name</th>
                <th>Quotation No.</th>
                <th>Document Date</th>
                <th>Required Date</th>
                <th className="sar-grid__cell--num">Quantity</th>
                <th className="sar-grid__cell--num">Open Qty</th>
                <th className="sar-grid__cell--num">Price</th>
                <th className="sar-grid__cell--num">Discount %</th>
                <th className="sar-grid__cell--num">Net Price</th>
                <th className="sar-grid__cell--num">Best Price</th>
                <th>Best Vendor</th>
                <th className="sar-grid__cell--num">Variance</th>
                <th className="sar-grid__cell--num">Line Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className={row.isBestPrice ? "pqc-grid__best-row" : ""}>
                  <td>{row.rowNo}</td>
                  <td>{row.itemCode}</td>
                  <td>{row.itemName}</td>
                  <td>{row.vendorCode}</td>
                  <td>{row.vendorName}</td>
                  <td>{row.documentNo}</td>
                  <td>{row.documentDate}</td>
                  <td>{row.requiredDate}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.quantity, 3)}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.openQty, 3)}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.price)}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.discountPercent)}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.netPrice)}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.bestPrice)}</td>
                  <td>{row.bestVendorCode} {row.bestVendorName ? `- ${row.bestVendorName}` : ""}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.varianceFromBest)}</td>
                  <td className="sar-grid__cell--num">{formatNumber(row.lineTotal)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="8">Total</td>
                <td className="sar-grid__cell--num">{formatNumber(result?.totals?.quantity, 3)}</td>
                <td className="sar-grid__cell--num">{formatNumber(result?.totals?.openQty, 3)}</td>
                <td colSpan="6" />
                <td className="sar-grid__cell--num">{formatNumber(result?.totals?.lineTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <div className="sar-window__footer sar-window__footer--split">
        <button type="button" className="im-btn" onClick={onBack}>Back</button>
        <div className="sar-window__actions">
          <button type="button" className="im-btn" onClick={onExport}>Excel</button>
          <button type="button" className="im-btn im-btn--primary" onClick={onBack}>OK</button>
        </div>
      </div>
    </div>
  );
}

export default function PurchaseQuotationComparisonReport() {
  const navigate = useNavigate();
  const { closeActiveAndRestorePrevious } = useSapWindowTaskbarActions();
  const [criteria, setCriteria] = useState(createInitialCriteria);
  const [itemGroupOptions, setItemGroupOptions] = useState([{ code: "All", name: "All" }]);
  const [vendorGroupOptions, setVendorGroupOptions] = useState([{ code: "All", name: "All" }]);
  const [itemProperties, setItemProperties] = useState([]);
  const [vendorProperties, setVendorProperties] = useState([]);
  const [lookupState, setLookupState] = useState({ open: false, type: "items", rangeKey: "from" });
  const [propertiesModal, setPropertiesModal] = useState({ open: false, type: "item" });
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const reportWindow = useFloatingWindow({
    isOpen: true,
    defaultTop: 18,
    taskId: "purchase-quotation-comparison-report",
    taskTitle: result?.title || "Purchase Quotation Comparison Report - Selection Criteria",
    taskPath: "/reports/purchasing/purchase-quotation-comparison",
  });
  const handleCloseWindow = () => {
    if (closeActiveAndRestorePrevious()) return;
    navigate("/dashboard");
  };

  useEffect(() => {
    Promise.all([
      fetchComparisonItemGroups(),
      fetchComparisonVendorGroups(),
      fetchComparisonItemProperties(),
      fetchComparisonVendorProperties(),
    ])
      .then(([itemGroups, vendorGroups, itemProps, vendorProps]) => {
        setItemGroupOptions(itemGroups);
        setVendorGroupOptions(vendorGroups);
        setItemProperties(itemProps);
        setVendorProperties(vendorProps);
      })
      .catch(() => setMessage("Lookup data could not be loaded. Default values are still available."));
  }, []);

  const itemPropertySummary = useMemo(
    () => buildPropertySummary(criteria.item.propertiesMode, criteria.item.properties, itemProperties),
    [criteria.item.propertiesMode, criteria.item.properties, itemProperties]
  );
  const vendorPropertySummary = useMemo(
    () => buildPropertySummary(criteria.vendor.propertiesMode, criteria.vendor.properties, vendorProperties),
    [criteria.vendor.propertiesMode, criteria.vendor.properties, vendorProperties]
  );

  const handleChange = (path, value) => {
    setCriteria((previous) => setDeepValue(previous, path, value));
  };

  const validateCriteria = () => {
    const ranges = [criteria.item, criteria.vendor, criteria.requiredDate, criteria.documentDate, criteria.documentNo, criteria.groupNo];
    if (ranges.some((range) => range.from && range.to && range.from > range.to)) return "Invalid selection criteria";
    if ([criteria.documentNo, criteria.groupNo].some((range) => (range.from && !/^\d+$/.test(range.from)) || (range.to && !/^\d+$/.test(range.to)))) {
      return "Document No. and Group No. must be numeric";
    }
    return "";
  };

  const handleRun = async () => {
    const validationMessage = validateCriteria();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const response = await runPurchaseQuotationComparison(criteria);
      setResult(response);
      if (response.message) setMessage(response.message);
    } catch (error) {
      setMessage(error.response?.data?.message || "Invalid selection criteria");
    } finally {
      setLoading(false);
    }
  };

  const handleLookupSelect = (row) => {
    const code = row.code || row.ItemCode || row.CardCode || "";
    const path = lookupState.type === "items" ? `item.${lookupState.rangeKey}` : `vendor.${lookupState.rangeKey}`;
    handleChange(path, code);
    setLookupState((previous) => ({ ...previous, open: false }));
  };

  const handleToggleProperty = (type, propertyNumber) => {
    setCriteria((previous) => {
      const selected = previous[type].properties;
      const nextValues = selected.includes(propertyNumber)
        ? selected.filter((entry) => entry !== propertyNumber)
        : [...selected, propertyNumber];
      return setDeepValue(previous, `${type}.properties`, nextValues);
    });
  };

  if (result) {
    return (
      <div className="sar-page">
        {message && <div className="im-alert im-alert--error" style={{ margin: "10px 12px 0" }}>{message}</div>}
        <ResultGrid
          result={result}
          onBack={() => setResult(null)}
          onExport={() => downloadCsv("purchase-quotation-comparison.csv", result.rows || [])}
          windowFrame={reportWindow}
          onClose={handleCloseWindow}
        />
      </div>
    );
  }

  return (
    <div className="sar-page">
      {message && <div className="im-alert im-alert--error" style={{ margin: "10px 12px 0" }}>{message}</div>}
      <div
        className={`pqc-window${reportWindow.isMinimized ? " is-minimized" : ""}${reportWindow.isMaximized ? " is-maximized" : ""}`}
        {...reportWindow.windowProps}
      >
        <div className="pqc-titlebar" {...reportWindow.titleBarProps}>
          <span>Purchase Quotation Comparison Report - Selection Criteria</span>
          <span className="pqc-titlebar__buttons">
            <button
              type="button"
              aria-label={reportWindow.isMinimized ? "Restore" : "Minimize"}
              onClick={reportWindow.toggleMinimize}
            />
            <button
              type="button"
              aria-label={reportWindow.isMaximized ? "Restore Down" : "Maximize"}
              onClick={reportWindow.toggleMaximize}
            />
            <button type="button" aria-label="Close" onClick={handleCloseWindow} />
          </span>
        </div>
        <div className="pqc-underline" />
        <div className="pqc-body">
          <div className="pqc-type-line">
            <label>Type</label>
            <select className="im-field__input" value={criteria.type} onChange={(event) => handleChange("type", event.target.value)}>
              <option value="item">Item</option>
              <option value="service">Service</option>
            </select>
          </div>

          <SelectionBlock
            codeLabel="Code"
            value={criteria.item}
            groupOptions={itemGroupOptions}
            propertySummary={itemPropertySummary}
            onChange={(field, value) => handleChange(`item.${field}`, value)}
            onOpenLookup={(rangeKey) => setLookupState({ open: true, type: "items", rangeKey })}
            onOpenProperties={() => setPropertiesModal({ open: true, type: "item" })}
          />

          <SelectionBlock
            title="Vendors"
            codeLabel="Code"
            value={criteria.vendor}
            groupOptions={vendorGroupOptions}
            propertySummary={vendorPropertySummary}
            onChange={(field, value) => handleChange(`vendor.${field}`, value)}
            onOpenLookup={(rangeKey) => setLookupState({ open: true, type: "vendors", rangeKey })}
            onOpenProperties={() => setPropertiesModal({ open: true, type: "vendor" })}
          />

          <div className="pqc-dates">
            <RangeLine label="Required Date" type="date" value={criteria.requiredDate} onChange={(field, value) => handleChange(`requiredDate.${field}`, value)} />
            <RangeLine label="Document Date" type="date" value={criteria.documentDate} onChange={(field, value) => handleChange(`documentDate.${field}`, value)} />
            <RangeLine label="Document No." value={criteria.documentNo} onChange={(field, value) => handleChange(`documentNo.${field}`, value)} />
            <RangeLine label="Group No." value={criteria.groupNo} onChange={(field, value) => handleChange(`groupNo.${field}`, value)} />
          </div>

          <label className="im-checkbox-label pqc-open-only">
            <input type="checkbox" checked={criteria.openOnly} onChange={(event) => handleChange("openOnly", event.target.checked)} />
            Display Open Purchase Quotations Only
          </label>
        </div>
        <div className="pqc-footer">
          <button type="button" className="im-btn im-btn--primary" disabled={loading} onClick={handleRun}>
            {loading ? "Loading..." : "OK"}
          </button>
          <button type="button" className="im-btn" onClick={() => { setCriteria(createInitialCriteria()); setMessage(""); }}>Cancel</button>
        </div>
      </div>

      <SapLookupModal
        open={lookupState.open}
        title={lookupState.type === "items" ? "Choose From List - Items" : "Choose From List - Vendors"}
        columns={
          lookupState.type === "items"
            ? [
                { key: "code", label: "Code" },
                { key: "name", label: "Item Description" },
                { key: "groupName", label: "Item Group" },
              ]
            : [
                { key: "code", label: "Code" },
                { key: "name", label: "Vendor Name" },
                { key: "groupName", label: "Group" },
              ]
        }
        fetchOptions={lookupState.type === "items" ? fetchComparisonItems : fetchComparisonVendors}
        onClose={() => setLookupState((previous) => ({ ...previous, open: false }))}
        onSelect={handleLookupSelect}
      />

      <SalesAnalysisPropertiesModal
        open={propertiesModal.open}
        title={propertiesModal.type === "item" ? "Item Properties" : "Vendor Properties"}
        mode={propertiesModal.type === "item" ? criteria.item.propertiesMode : criteria.vendor.propertiesMode}
        properties={propertiesModal.type === "item" ? criteria.item.properties : criteria.vendor.properties}
        options={propertiesModal.type === "item" ? itemProperties : vendorProperties}
        onModeChange={(value) => handleChange(`${propertiesModal.type}.propertiesMode`, value)}
        onToggleProperty={(propertyNumber) => handleToggleProperty(propertiesModal.type, propertyNumber)}
        onClose={() => setPropertiesModal({ open: false, type: propertiesModal.type })}
        onApply={() => setPropertiesModal({ open: false, type: propertiesModal.type })}
      />
    </div>
  );
}
