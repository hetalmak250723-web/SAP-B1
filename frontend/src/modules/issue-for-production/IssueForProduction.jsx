import React, { useState, useEffect, useCallback, useRef } from "react";
import "../../modules/item-master/styles/itemMaster.css";
import "./issueForProduction.css";
import IssueLines from "./components/IssueLines";
import IssueList from "./components/IssueList";
import ProductionOrderSearchModal from "./components/ProductionOrderSearchModal";
import {
  fetchIssueReferenceData,
  fetchProductionOrderForIssue,
  fetchIssueByDocEntry,
  createIssue,
} from "../../api/issueForProductionApi";
import { getDefaultSeriesForCurrentYear } from "../../utils/seriesDefaults";

const MODES = { ADD: "add", VIEW: "view", LIST: "list" };
const TABS = ["Document Lines", "Remarks"];

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_HEADER = {
  doc_num: "",
  series: "",
  posting_date: today(),
  ref_2: "",
  remarks: "",
  journal_remark: "",
};

const PO_STATUS_LABEL = {
  boposReleased: "Released",
  boposPlanned: "Planned",
  boposClosed: "Closed",
};

const toOrderSummary = (order = {}) => ({
  doc_entry: order.doc_entry,
  doc_num: order.doc_num,
  item_code: order.item_code || "",
  item_name: order.item_name || "",
  planned_qty: order.planned_qty,
  completed_qty: order.completed_qty,
  status: order.status || "",
  warehouse: order.warehouse || "",
  due_date: order.due_date || "",
});

const toIssueLine = (line, order) => ({
  _id: `${order.doc_entry}-${line.line_num ?? 0}`,
  line_num: line.line_num,
  item_code: line.item_code,
  item_name: line.item_name,
  planned_qty: line.planned_qty,
  issued_qty: line.issued_qty,
  remaining_qty: line.remaining_qty,
  issue_qty: line.issue_qty,
  uom: line.uom,
  warehouse: line.warehouse,
  issue_method: line.issue_method,
  distribution_rule: line.distribution_rule,
  project: line.project,
  base_entry: line.base_entry,
  base_line: line.base_line,
  base_type: line.base_type ?? 202,
  manage_batch: line.manage_batch || false,
  manage_serial: line.manage_serial || false,
  batch_numbers: line.batch_numbers || [],
  serial_numbers: line.serial_numbers || [],
  order_doc_entry: order.doc_entry,
  order_doc_num: order.doc_num,
  order_item_code: order.item_code || "",
  order_item_name: order.item_name || "",
});

const toLoadedIssueLine = (line) => ({
  _id: line._id ?? `${line.base_entry ?? "manual"}-${line.base_line ?? Math.random()}`,
  line_num: line.line_num,
  item_code: line.item_code,
  item_name: line.item_name,
  planned_qty: 0,
  issued_qty: line.issue_qty,
  remaining_qty: 0,
  issue_qty: line.issue_qty,
  uom: line.uom,
  warehouse: line.warehouse,
  distribution_rule: line.distribution_rule,
  project: line.project,
  base_entry: line.base_entry,
  base_line: line.base_line,
  base_type: line.base_type ?? 202,
  manage_batch: line.manage_batch || false,
  manage_serial: line.manage_serial || false,
  batch_numbers: line.batch_numbers || [],
  serial_numbers: line.serial_numbers || [],
  order_doc_entry: line.order_doc_entry ?? line.base_entry ?? null,
  order_doc_num: line.order_doc_num || (line.base_entry != null ? String(line.base_entry) : ""),
  order_item_code: line.order_item_code || "",
  order_item_name: line.order_item_name || "",
});

export default function IssueForProductionModule() {
  const [mode, setMode] = useState(MODES.ADD);
  const [tab, setTab] = useState(0);
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [lines, setLines] = useState([]);
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  const [warehouses, setWarehouses] = useState([]);
  const [distRules, setDistRules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [series, setSeries] = useState([]);

  const [poModal, setPoModal] = useState(false);

  const alertTimer = useRef(null);
  const defaultSeriesRef = useRef(null);

  useEffect(() => {
    fetchIssueReferenceData()
      .then((data) => {
        const loadedSeries = data.series || [];
        const defaultSeries = getDefaultSeriesForCurrentYear(loadedSeries);
        setWarehouses(data.warehouses || []);
        setDistRules(data.distribution_rules || []);
        setProjects(data.projects || []);
        setSeries(loadedSeries);
        defaultSeriesRef.current = defaultSeries || null;
        setHeader((prev) => ({
          ...prev,
          series: prev.series || (defaultSeries?.Series != null ? String(defaultSeries.Series) : ""),
        }));
      })
      .catch(() => {});
  }, []);

  useEffect(() => () => clearTimeout(alertTimer.current), []);

  const showAlert = useCallback((type, msg) => {
    clearTimeout(alertTimer.current);
    setAlert({ type, msg });
    alertTimer.current = setTimeout(() => setAlert(null), 7000);
  }, []);

  const resetForm = useCallback((options = {}) => {
    const { nextAlert = null } = options;
    setHeader({
      ...EMPTY_HEADER,
      series: defaultSeriesRef.current?.Series != null ? String(defaultSeriesRef.current.Series) : "",
    });
    setLines([]);
    setLinkedOrders([]);
    setTab(0);
    clearTimeout(alertTimer.current);
    setAlert(nextAlert);
    if (nextAlert) {
      alertTimer.current = setTimeout(() => setAlert(null), 7000);
      return;
    }
    alertTimer.current = null;
  }, []);

  const handleHeaderChange = useCallback((e) => {
    const { name, value } = e.target;
    setHeader((prev) => ({ ...prev, [name]: value }));
  }, []);

  const loadProductionOrder = async (docEntry) => {
    setLoading(true);
    try {
      const data = await fetchProductionOrderForIssue(docEntry);
      const orderSummary = toOrderSummary(data);

      if (data.lines.length === 0) {
        showAlert("error", "No manual-issue components found on this production order. All lines may be set to Backflush.");
        return;
      }

      setLinkedOrders((prev) => {
        const others = prev.filter((order) => order.doc_entry !== orderSummary.doc_entry);
        return [...others, orderSummary];
      });

      setLines((prev) => {
        const otherLines = prev.filter((line) => line.base_entry !== orderSummary.doc_entry);
        return [...otherLines, ...data.lines.map((line) => toIssueLine(line, orderSummary))];
      });

      const backflushCount = (data.lines_total_count || 0) - data.lines.length;
      const msg = backflushCount > 0
        ? `${data.lines.length} manual component(s) loaded for Production Order #${data.doc_num}. ${backflushCount} backflush item(s) excluded.`
        : `${data.lines.length} component(s) loaded from Production Order #${data.doc_num}.`;
      showAlert("success", msg);
    } catch (err) {
      showAlert("error", err.response?.data?.detail || err.message || "Failed to load production order.");
    } finally {
      setLoading(false);
    }
  };

  const handlePoSelect = (po) => {
    setPoModal(false);
    loadProductionOrder(po.DocEntry);
  };

  const handleLineChange = useCallback((id, field, value) => {
    setLines((prev) =>
      prev.map((line) => (line._id !== id ? line : { ...line, [field]: value }))
    );
  }, []);

  const validate = () => {
    if (linkedOrders.length === 0) {
      showAlert("error", "Select at least one Production Order first.");
      return false;
    }
    if (!header.posting_date) {
      showAlert("error", "Posting date is required.");
      return false;
    }
    const validLines = lines.filter((line) => line.item_code && Number(line.issue_qty) > 0);
    if (validLines.length === 0) {
      showAlert("error", "At least one line must have an issue quantity > 0.");
      return false;
    }
    for (const line of validLines) {
      if (Number(line.issue_qty) < 0) {
        showAlert("error", `Issue quantity for "${line.item_code}" cannot be negative.`);
        return false;
      }
    }
    return true;
  };

  const handlePost = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        prod_order_entry: linkedOrders[0]?.doc_entry || null,
        series: header.series,
        posting_date: header.posting_date,
        ref_2: header.ref_2,
        remarks: header.remarks,
        journal_remark: header.journal_remark,
        lines: lines
          .filter((line) => line.item_code && Number(line.issue_qty) > 0)
          .map((line) => ({
            // SAP B1 Rule: ItemCode must be omitted when BaseType = 202 (Production Order)
            // SAP automatically populates ItemCode from the production order line
            issue_qty: Number(line.issue_qty),
            uom: line.uom,
            warehouse: line.warehouse,
            distribution_rule: line.distribution_rule,
            project: line.project,
            base_entry: line.base_entry,
            base_line: line.base_line,
            base_type: line.base_type ?? 202,
            manage_batch: line.manage_batch,
            manage_serial: line.manage_serial,
            batch_numbers: line.batch_numbers || [],
            serial_numbers: line.serial_numbers || [],
          })),
      };

      const result = await createIssue(payload);
      resetForm({
        nextAlert: {
          type: "success",
          msg: `Issue for Production #${result.doc_num} posted. Inventory reduced.`,
        },
      });
    } catch (err) {
      showAlert("error", err.response?.data?.detail || err.message || "Post failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetAllRemaining = () => {
    setLines((prev) =>
      prev.map((line) => ({ ...line, issue_qty: Math.max(0, line.remaining_qty ?? 0) }))
    );
  };

  const handleClearQtys = () => {
    setLines((prev) => prev.map((line) => ({ ...line, issue_qty: 0 })));
  };

  const handleSelectFromList = async (docEntry) => {
    setLoading(true);
    try {
      const data = await fetchIssueByDocEntry(docEntry);
      const issue = data.issue;
      setHeader({
        doc_num: issue.doc_num || "",
        series: issue.series || "",
        posting_date: issue.posting_date || today(),
        ref_2: issue.ref_2 || "",
        remarks: issue.remarks || "",
        journal_remark: issue.journal_remark || "",
      });
      setLinkedOrders((issue.linked_prod_orders || []).map((order) => toOrderSummary(order)));
      setLines((issue.lines || []).map((line) => toLoadedIssueLine(line)));
      setMode(MODES.VIEW);
      showAlert("success", `Issue #${issue.doc_num} loaded.`);
    } catch (err) {
      showAlert("error", err.response?.data?.detail || "Load failed.");
    } finally {
      setLoading(false);
    }
  };

  if (mode === MODES.LIST) {
    return (
      <IssueList
        onSelect={handleSelectFromList}
        onNew={() => {
          resetForm();
          setMode(MODES.ADD);
        }}
      />
    );
  }

  const isView = mode === MODES.VIEW;
  const productionOrderDisplay = linkedOrders.length === 0
    ? ""
    : linkedOrders.length === 1
      ? `#${linkedOrders[0].doc_num} - ${linkedOrders[0].item_code || ""}`
      : `${linkedOrders.length} production orders selected`;

  return (
    <div className="im-page">
      <div className="im-toolbar">
        <span className="im-toolbar__title">Issue for Production</span>
        <span className={`im-mode-badge im-mode-badge--${isView ? "update" : "add"}`}>
          {isView ? "View Mode" : "Add Mode"}
        </span>

        {!isView && (
          <button className="im-btn im-btn--primary" onClick={handlePost} disabled={loading}>
            {loading ? "..." : "Post"}
          </button>
        )}
        <button className="im-btn" onClick={() => { resetForm(); setMode(MODES.ADD); }}>New</button>
        <button className="im-btn" onClick={() => setMode(MODES.LIST)}>List</button>
        {!isView && (
          <>
            <button className="im-btn" onClick={handleSetAllRemaining} disabled={lines.length === 0 || loading}>
              Set All Remaining
            </button>
            <button className="im-btn" onClick={handleClearQtys} disabled={lines.length === 0 || loading}>
              Clear Qtys
            </button>
          </>
        )}
        <button className="im-btn" onClick={resetForm}>Cancel</button>
      </div>

      {alert && <div className={`im-alert im-alert--${alert.type}`}>{alert.msg}</div>}

      <div className="im-header-card">
        {linkedOrders.length > 0 && (
          <div className="ifp-po-banner">
            <span className="ifp-po-banner__label">
              Production Orders Loaded: {linkedOrders.length}
            </span>
            {linkedOrders.map((order) => (
              <span key={order.doc_entry} className="ifp-po-pill">
                <span className="ifp-po-pill__num">#{order.doc_num}</span>
                <span>{order.item_code}</span>
                {order.status && (
                  <span className="ifp-po-banner__status">
                    {PO_STATUS_LABEL[order.status] || order.status}
                  </span>
                )}
                {order.due_date && (
                  <span className="ifp-po-banner__warn">Due: {order.due_date}</span>
                )}
              </span>
            ))}
          </div>
        )}

        <div className="ifp-header-layout">
          <div className="ifp-header-left">
            <div className="im-field">
              <label className="im-field__label ifp-lbl">Production Order</label>
              <div className="im-lookup-wrap">
                <input
                  className="im-field__input"
                  value={productionOrderDisplay}
                  readOnly
                  placeholder="Add production orders..."
                  style={{ width: 220, background: linkedOrders.length > 0 ? "#f0fff4" : undefined }}
                />
                {!isView && (
                  <button
                    className="im-lookup-btn"
                    onClick={() => setPoModal(true)}
                    disabled={loading}
                  >...</button>
                )}
              </div>
            </div>

            <div className="im-field">
              <label className="im-field__label ifp-lbl">Number</label>
              <input
                className="im-field__input"
                value={header.doc_num || (isView ? "" : "(auto)")}
                readOnly
                style={{ width: 120 }}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label ifp-lbl">Series</label>
              <select
                className="im-field__select"
                name="series"
                value={header.series}
                onChange={handleHeaderChange}
                disabled={isView}
                style={{ width: 160 }}
              >
                <option value="">--</option>
                {series.map((entry) => (
                  <option key={entry.Series} value={entry.Series}>{entry.Name}</option>
                ))}
              </select>
            </div>

            <div className="im-field">
              <label className="im-field__label ifp-lbl">Posting Date</label>
              <input
                className="im-field__input"
                name="posting_date"
                type="date"
                value={header.posting_date}
                onChange={handleHeaderChange}
                readOnly={isView}
                style={{ width: 150 }}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label ifp-lbl">Ref. 2</label>
              <input
                className="im-field__input"
                name="ref_2"
                value={header.ref_2}
                onChange={handleHeaderChange}
                readOnly={isView}
                style={{ width: 160 }}
              />
            </div>
          </div>

          <div className="ifp-header-right">
            <div className="im-field">
              <label className="im-field__label ifp-lbl-r">Journal Remark</label>
              <input
                className="im-field__input"
                name="journal_remark"
                value={header.journal_remark}
                onChange={handleHeaderChange}
                readOnly={isView}
                style={{ flex: 1 }}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label ifp-lbl-r">Remarks</label>
              <input
                className="im-field__input"
                name="remarks"
                value={header.remarks}
                onChange={handleHeaderChange}
                readOnly={isView}
                style={{ flex: 1 }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="im-tabs">
        {TABS.map((tabName, index) => (
          <button
            key={tabName}
            type="button"
            className={`im-tab${tab === index ? " im-tab--active" : ""}`}
            onClick={() => setTab(index)}
          >
            {tabName}
          </button>
        ))}
      </div>

      <div className="im-tab-panel ifp-tab-panel">
        {tab === 0 && (
          <>
            {lines.length === 0 && linkedOrders.length === 0 && (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "#888", fontSize: 13 }}>
                Select one or more Production Orders to load components for issue.
              </div>
            )}
            {lines.length === 0 && linkedOrders.length > 0 && (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "#b45309", fontSize: 13 }}>
                No manual-issue components found on the selected production orders. All lines may be set to Backflush.
              </div>
            )}
            {lines.length > 0 && (
              <IssueLines
                lines={lines}
                warehouses={warehouses}
                distRules={distRules}
                projects={projects}
                readOnly={isView}
                onChange={handleLineChange}
              />
            )}
          </>
        )}

        {tab === 1 && (
          <div style={{ padding: "14px 16px" }}>
            <div className="im-field" style={{ flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
              <label className="im-field__label" style={{ textAlign: "left" }}>Remarks</label>
              <textarea
                name="remarks"
                value={header.remarks}
                onChange={handleHeaderChange}
                readOnly={isView}
                rows={6}
                style={{
                  width: "100%",
                  maxWidth: 600,
                  fontSize: 13,
                  padding: "6px 8px",
                  border: "1px solid #c8d0da",
                  borderRadius: 3,
                  resize: "vertical",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {poModal && (
        <ProductionOrderSearchModal
          onSelect={handlePoSelect}
          onClose={() => setPoModal(false)}
        />
      )}
    </div>
  );
}
