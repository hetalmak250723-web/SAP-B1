import React, { useState, useEffect, useCallback, useRef } from "react";
import "../../modules/item-master/styles/itemMaster.css";
import "./issueForProduction.css";
import IssueLines                  from "./components/IssueLines";
import IssueList                   from "./components/IssueList";
import ProductionOrderSearchModal  from "./components/ProductionOrderSearchModal";
import {
  fetchIssueReferenceData,
  fetchProductionOrderForIssue,
  fetchIssueByDocEntry,
  createIssue,
} from "../../api/issueForProductionApi";

const MODES = { ADD: "add", VIEW: "view", LIST: "list" };
const TABS  = ["Document Lines", "Remarks"];

const today = () => new Date().toISOString().slice(0, 10);

const EMPTY_HEADER = {
  doc_num:         "",
  series:          "",
  posting_date:   today(),
  ref_2:           "",
  remarks:        "",
  journal_remark: "",
};

const PO_STATUS_LABEL = {
  boposReleased: "Released",
  boposPlanned:  "Planned",
  boposClosed:   "Closed",
};

export default function IssueForProductionModule() {
  const [mode,    setMode]    = useState(MODES.ADD);
  const [tab,     setTab]     = useState(0);
  const [header,  setHeader]  = useState(EMPTY_HEADER);
  const [lines,   setLines]   = useState([]);
  const [alert,   setAlert]   = useState(null);
  const [loading, setLoading] = useState(false);

  // Linked production order info (display only)
  const [poInfo,  setPoInfo]  = useState(null);   // { doc_entry, doc_num, item_code, item_name, ... }

  // Lookup data
  const [warehouses, setWarehouses] = useState([]);
  const [distRules,  setDistRules]  = useState([]);
  const [projects,   setProjects]   = useState([]);
  const [series,     setSeries]     = useState([]);

  // PO search modal
  const [poModal, setPoModal] = useState(false);

  const alertTimer = useRef(null);

  useEffect(() => {
    fetchIssueReferenceData()
      .then((d) => {
        setWarehouses(d.warehouses || []);
        setDistRules(d.distribution_rules || []);
        setProjects(d.projects || []);
        setSeries(d.series || []);
      })
      .catch(() => {});
  }, []);

  const showAlert = useCallback((type, msg) => {
    clearTimeout(alertTimer.current);
    setAlert({ type, msg });
    alertTimer.current = setTimeout(() => setAlert(null), 7000);
  }, []);

  const resetForm = () => {
    setHeader(EMPTY_HEADER);
    setLines([]);
    setPoInfo(null);
    setTab(0);
    setAlert(null);
  };

  const handleHeaderChange = useCallback((e) => {
    const { name, value } = e.target;
    setHeader((prev) => ({ ...prev, [name]: value }));
  }, []);

  // ── Load production order components into the issue form ───────────────────
  const loadProductionOrder = async (docEntry) => {
    setLoading(true);
    try {
      const data = await fetchProductionOrderForIssue(docEntry);
      setPoInfo({
        doc_entry:    data.doc_entry,
        doc_num:      data.doc_num,
        item_code:    data.item_code,
        item_name:    data.item_name,
        planned_qty:  data.planned_qty,
        completed_qty:data.completed_qty,
        status:       data.status,
        warehouse:    data.warehouse,
        due_date:     data.due_date,
      });

      if (data.lines.length === 0) {
        showAlert("error", "No manual-issue components found on this production order. All lines may be set to Backflush.");
        setLines([]);
        return;
      }

      // Map PO lines → issue lines
      setLines(
        data.lines.map((l) => ({
          _id:              l._id,
          line_num:         l.line_num,
          item_code:        l.item_code,
          item_name:        l.item_name,
          planned_qty:      l.planned_qty,
          issued_qty:       l.issued_qty,
          remaining_qty:    l.remaining_qty,
          issue_qty:        l.issue_qty,   // pre-filled with remaining
          uom:              l.uom,
          warehouse:        l.warehouse,
          issue_method:     l.issue_method,
          distribution_rule:l.distribution_rule,
          project:          l.project,
          base_entry:       l.base_entry,
          base_line:        l.base_line,
          base_type:        202,  // 202 = Production Order
          manage_batch:     l.manage_batch || false,
          manage_serial:    l.manage_serial || false,
          batch_numbers:    l.batch_numbers || [],
          serial_numbers:   l.serial_numbers || [],
        }))
      );

      const backflushCount = (data.lines_total_count || 0) - data.lines.length;
      const msg = backflushCount > 0
        ? `${data.lines.length} manual component(s) loaded. ${backflushCount} backflush item(s) excluded.`
        : `${data.lines.length} component(s) loaded from Production Order #${data.doc_num}.`;
      showAlert("success", msg);
    } catch (err) {
      showAlert("error", err.response?.data?.detail || err.message || "Failed to load production order.");
    } finally {
      setLoading(false);
    }
  };

  // ── PO selected from modal ─────────────────────────────────────────────────
  const handlePoSelect = (po) => {
    setPoModal(false);
    loadProductionOrder(po.DocEntry);
  };

  // ── Line change ────────────────────────────────────────────────────────────
  const handleLineChange = useCallback((id, field, value) => {
    setLines((prev) =>
      prev.map((l) => (l._id !== id ? l : { ...l, [field]: value }))
    );
  }, []);

  // ── Validate ───────────────────────────────────────────────────────────────
  const validate = () => {
    if (!poInfo?.doc_entry) {
      showAlert("error", "Select a Production Order first.");
      return false;
    }
    if (!header.posting_date) {
      showAlert("error", "Posting date is required.");
      return false;
    }
    const validLines = lines.filter((l) => l.item_code && Number(l.issue_qty) > 0);
    if (validLines.length === 0) {
      showAlert("error", "At least one line must have an issue quantity > 0.");
      return false;
    }
    for (const l of validLines) {
      if (Number(l.issue_qty) < 0) {
        showAlert("error", `Issue quantity for "${l.item_code}" cannot be negative.`);
        return false;
      }
    }
    return true;
  };

  // ── Post issue ─────────────────────────────────────────────────────────────
  const handlePost = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const payload = {
        prod_order_entry: poInfo.doc_entry,
        series:           header.series,
        posting_date:     header.posting_date,
        ref_2:            header.ref_2,
        remarks:          header.remarks,
        journal_remark:   header.journal_remark,
        lines: lines
          .filter((l) => l.item_code && Number(l.issue_qty) > 0)
          .map((l) => ({
            item_code:         l.item_code,
            issue_qty:         Number(l.issue_qty),
            uom:               l.uom,
            warehouse:         l.warehouse,
            distribution_rule: l.distribution_rule,
            project:           l.project,
            base_entry:        l.base_entry,
            base_line:         l.base_line,
            base_type:         202,  // 202 = Production Order
            manage_batch:      l.manage_batch,
            manage_serial:     l.manage_serial,
            batch_numbers:     l.batch_numbers || [],
            serial_numbers:    l.serial_numbers || [],
          })),
      };

      const result = await createIssue(payload);
      showAlert("success", `Issue for Production #${result.doc_num} posted. Inventory reduced.`);
      resetForm();
    } catch (err) {
      showAlert("error", err.response?.data?.detail || err.message || "Post failed.");
    } finally {
      setLoading(false);
    }
  };

  // ── Set all issue qtys to remaining ───────────────────────────────────────
  const handleSetAllRemaining = () => {
    setLines((prev) =>
      prev.map((l) => ({ ...l, issue_qty: Math.max(0, l.remaining_qty ?? 0) }))
    );
  };

  // ── Set all issue qtys to zero ─────────────────────────────────────────────
  const handleClearQtys = () => {
    setLines((prev) => prev.map((l) => ({ ...l, issue_qty: 0 })));
  };

  // ── Load existing issue for view ───────────────────────────────────────────
  const handleSelectFromList = async (docEntry) => {
    setLoading(true);
    try {
      const data = await fetchIssueByDocEntry(docEntry);
      const issue = data.issue;
      setHeader({
        doc_num:         issue.doc_num        || "",
        series:          issue.series         || "",
        posting_date:   issue.posting_date  || today(),
        ref_2:          issue.ref_2          || "",
        remarks:        issue.remarks       || "",
        journal_remark: issue.journal_remark|| "",
      });
      setPoInfo(issue.prod_order_entry ? { doc_entry: issue.prod_order_entry } : null);
      setLines(
        (issue.lines || []).map((l) => ({
          _id:              l._id ?? Math.random(),
          line_num:         l.line_num,
          item_code:        l.item_code,
          item_name:        l.item_name,
          planned_qty:      0,
          issued_qty:       l.issue_qty,
          remaining_qty:    0,
          issue_qty:        l.issue_qty,
          uom:              l.uom,
          warehouse:        l.warehouse,
          distribution_rule:l.distribution_rule,
          project:          l.project,
          base_entry:       l.base_entry,
          base_line:        l.base_line,
        }))
      );
      setMode(MODES.VIEW);
      showAlert("success", `Issue #${issue.doc_num} loaded.`);
    } catch (err) {
      showAlert("error", err.response?.data?.detail || "Load failed.");
    } finally {
      setLoading(false);
    }
  };

  // ── List view ──────────────────────────────────────────────────────────────
  if (mode === MODES.LIST) {
    return (
      <IssueList
        onSelect={handleSelectFromList}
        onNew={() => { resetForm(); setMode(MODES.ADD); }}
      />
    );
  }

  const isView = mode === MODES.VIEW;

  return (
    <div className="im-page">
      {/* Toolbar */}
      <div className="im-toolbar">
        <span className="im-toolbar__title">Issue for Production</span>
        <span className={`im-mode-badge im-mode-badge--${isView ? "update" : "add"}`}>
          {isView ? "View Mode" : "Add Mode"}
        </span>

        {!isView && (
          <button className="im-btn im-btn--primary" onClick={handlePost} disabled={loading}>
            {loading ? "…" : "Post"}
          </button>
        )}
        <button className="im-btn" onClick={() => { resetForm(); setMode(MODES.ADD); }}>New</button>
        <button className="im-btn" onClick={() => setMode(MODES.LIST)}>List</button>
        {!isView && (
          <>
            <button className="im-btn" onClick={handleSetAllRemaining} disabled={!poInfo || loading}>
              Set All Remaining
            </button>
            <button className="im-btn" onClick={handleClearQtys} disabled={!poInfo || loading}>
              Clear Qtys
            </button>
          </>
        )}
        <button className="im-btn" onClick={resetForm}>Cancel</button>
      </div>

      {alert && <div className={`im-alert im-alert--${alert.type}`}>{alert.msg}</div>}

      {/* ── Header ── */}
      <div className="im-header-card">

        {/* Production Order info banner */}
        {poInfo && (
          <div className="ifp-po-banner">
            <span>
              <span className="ifp-po-banner__label">Production Order: </span>
              <span className="ifp-po-banner__value">#{poInfo.doc_num}</span>
            </span>
            {poInfo.item_code && (
              <span>
                <span className="ifp-po-banner__label">Item: </span>
                <span className="ifp-po-banner__value">{poInfo.item_code}</span>
                {poInfo.item_name && <span style={{ color: "#555" }}> — {poInfo.item_name}</span>}
              </span>
            )}
            {poInfo.planned_qty != null && (
              <span>
                <span className="ifp-po-banner__label">Planned: </span>
                <span className="ifp-po-banner__value">{Number(poInfo.planned_qty).toFixed(2)}</span>
              </span>
            )}
            {poInfo.completed_qty != null && (
              <span>
                <span className="ifp-po-banner__label">Completed: </span>
                <span className="ifp-po-banner__value">{Number(poInfo.completed_qty).toFixed(2)}</span>
              </span>
            )}
            {poInfo.status && (
              <span className="ifp-po-banner__status">
                {PO_STATUS_LABEL[poInfo.status] || poInfo.status}
              </span>
            )}
            {poInfo.due_date && (
              <span className="ifp-po-banner__warn">Due: {poInfo.due_date}</span>
            )}
          </div>
        )}

        <div className="ifp-header-layout">
          {/* Left column */}
          <div className="ifp-header-left">
            <div className="im-field">
              <label className="im-field__label ifp-lbl">Production Order</label>
              <div className="im-lookup-wrap">
                <input
                  className="im-field__input"
                  value={poInfo ? `#${poInfo.doc_num} — ${poInfo.item_code || ""}` : ""}
                  readOnly
                  placeholder="Select a production order…"
                  style={{ width: 220, background: poInfo ? "#f0fff4" : undefined }}
                />
                {!isView && (
                  <button
                    className="im-lookup-btn"
                    onClick={() => setPoModal(true)}
                    disabled={loading}
                  >…</button>
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
                {series.map((s) => (
                  <option key={s.Series} value={s.Series}>{s.Name}</option>
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

          {/* Right column */}
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

      {/* Tabs */}
      <div className="im-tabs">
        {TABS.map((t, i) => (
          <button
            key={t}
            type="button"
            className={`im-tab${tab === i ? " im-tab--active" : ""}`}
            onClick={() => setTab(i)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="im-tab-panel ifp-tab-panel">
        {tab === 0 && (
          <>
            {lines.length === 0 && !poInfo && (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "#888", fontSize: 13 }}>
                Select a Production Order to load components for issue.
              </div>
            )}
            {lines.length === 0 && poInfo && (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "#b45309", fontSize: 13 }}>
                No manual-issue components found. All lines on this production order may be set to Backflush.
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
                  width: "100%", maxWidth: 600, fontSize: 13,
                  padding: "6px 8px", border: "1px solid #c8d0da",
                  borderRadius: 3, resize: "vertical",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Production Order search modal */}
      {poModal && (
        <ProductionOrderSearchModal
          onSelect={handlePoSelect}
          onClose={() => setPoModal(false)}
        />
      )}
    </div>
  );
}
