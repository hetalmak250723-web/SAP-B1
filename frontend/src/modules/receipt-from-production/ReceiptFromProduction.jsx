import React, { useState, useEffect, useCallback, useRef } from "react";
import "../../modules/item-master/styles/itemMaster.css";
import "./receiptFromProduction.css";
import BackflushPreview from "./components/BackflushPreview";
import ReceiptAllocationModal from "./components/ReceiptAllocationModal";
import ReceiptList from "./components/ReceiptList";
import ReceiptLines from "./components/ReceiptLines";
import ProductionOrderSearchModal from "./components/ProductionOrderSearchModal";
import ItemSearchModal from "../bom/components/ItemSearchModal";
import {
  fetchReceiptReferenceData,
  fetchProductionOrderForReceipt,
  fetchReceiptByDocEntry,
  createReceipt,
} from "../../api/receiptFromProductionApi";
import { fetchBOMItems, getItemDetails } from "../../api/bomApi";

const MODES = { ADD: "add", VIEW: "view", LIST: "list" };
const TABS = ["Receipt Lines", "Backflush Components", "Remarks"];

const today = () => new Date().toISOString().slice(0, 10);
const EPSILON = 0.000001;

const EMPTY_HEADER = {
  doc_num: "",
  series: "",
  posting_date: today(),
  document_date: today(),
  ref_2: "",
  branch: "",
  uop: "",
  remarks: "",
  journal_remark: "",
};

const EMPTY_LINE = (overrides = {}) => ({
  _id: Date.now() + Math.random(),
  order_no: "",
  series_no: "",
  item_code: "",
  item_name: "",
  trans_type: "Complete",
  quantity: 0,
  unit_price: 0,
  value: 0,
  item_cost: 0,
  planned: 0,
  completed: 0,
  inventory_uom: "",
  uom_code: "",
  uom_name: "",
  items_per_unit: 1,
  warehouse: "",
  location: "",
  branch: "",
  uom_group: "",
  by_product: false,
  distribution_rule: "",
  project: "",
  base_entry: null,
  base_line: null,
  base_type: 202,
  manage_batch: false,
  manage_serial: false,
  issue_primarily_by: "",
  enable_bin_locations: false,
  batch_numbers: [],
  serial_numbers: [],
  bin_allocations: [],
  ...overrides,
});

const PO_STATUS_LABEL = {
  boposReleased: "Released",
  boposPlanned: "Planned",
  boposClosed: "Closed",
};

const isYes = (value) => value === true || value === "tYES" || value === "Y";
const toQty = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const getWarehouseMeta = (warehouses, code) =>
  warehouses.find((warehouse) => warehouse.WarehouseCode === code) || null;

const applyWarehouseSettings = (line, warehouses, warehouseCode) => {
  const warehouse = getWarehouseMeta(warehouses, warehouseCode);
  const enableBins = isYes(warehouse?.EnableBinLocations);

  return {
    ...line,
    warehouse: warehouseCode,
    enable_bin_locations: enableBins,
    bin_allocations: enableBins ? line.bin_allocations || [] : [],
  };
};

const normalizeItemManagement = (details = {}) => ({
  manage_batch: isYes(details.ManageBatchNumbers),
  manage_serial: isYes(details.ManageSerialNumbers),
  issue_primarily_by: details.IssuePrimarilyBy || "",
});

const getPrimaryLine = (rows) =>
  rows.find((line) => line.item_code?.trim() && !line.by_product) ||
  rows.find((line) => line.item_code?.trim()) ||
  null;

const getBatchTotal = (line) =>
  (line.batch_numbers || []).reduce((sum, row) => sum + toQty(row.quantity), 0);

const getBinTotal = (line) =>
  (line.bin_allocations || []).reduce((sum, row) => sum + toQty(row.quantity), 0);

const getAllocationError = (line) => {
  const qty = toQty(line.quantity);
  if (!qty || qty <= 0) return null;

  if (line.manage_batch) {
    const validBatches = (line.batch_numbers || []).filter(
      (row) => row.batch_number && toQty(row.quantity) > 0
    );
    if (validBatches.length === 0) {
      return `Line ${line.item_code}: batch numbers are required.`;
    }
    if (Math.abs(getBatchTotal({ batch_numbers: validBatches }) - qty) > EPSILON) {
      return `Line ${line.item_code}: batch quantity must equal ${qty}.`;
    }
  }

  if (line.manage_serial) {
    const validSerials = (line.serial_numbers || []).filter((row) => row.serial_number);
    if (validSerials.length === 0) {
      return `Line ${line.item_code}: serial numbers are required.`;
    }
    if (validSerials.length !== Math.floor(qty)) {
      return `Line ${line.item_code}: serial count must equal ${Math.floor(qty)}.`;
    }
  }

  if (line.enable_bin_locations) {
    const validBins = (line.bin_allocations || []).filter(
      (row) => row.bin_abs != null && row.bin_abs !== "" && toQty(row.quantity) > 0
    );
    if (validBins.length === 0) {
      return `Line ${line.item_code}: bin allocations are required.`;
    }
    if (Math.abs(getBinTotal({ bin_allocations: validBins }) - qty) > EPSILON) {
      return `Line ${line.item_code}: bin quantity must equal ${qty}.`;
    }
  }

  return null;
};

export default function ReceiptFromProductionModule() {
  const [mode, setMode] = useState(MODES.ADD);
  const [tab, setTab] = useState(0);
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [lines, setLines] = useState([EMPTY_LINE()]);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);
  const [poInfo, setPoInfo] = useState(null);
  const [backflushLines, setBackflushLines] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [distRules, setDistRules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [branches, setBranches] = useState([]);
  const [series, setSeries] = useState([]);
  const [poModal, setPoModal] = useState(false);
  const [itemModal, setItemModal] = useState({ open: false, target: null });
  const [allocationModal, setAllocationModal] = useState({ open: false, lineId: null });

  const alertTimer = useRef(null);

  useEffect(() => {
    fetchReceiptReferenceData()
      .then((data) => {
        setWarehouses(data.warehouses || []);
        setDistRules(data.distribution_rules || []);
        setProjects(data.projects || []);
        setBranches(data.branches || []);
        setSeries(data.series || []);
      })
      .catch(() => {});
  }, []);

  const showAlert = useCallback((type, msg) => {
    clearTimeout(alertTimer.current);
    setAlert({ type, msg });
    alertTimer.current = setTimeout(() => setAlert(null), 7000);
  }, []);

  const resetForm = useCallback(() => {
    setHeader(EMPTY_HEADER);
    setLines([EMPTY_LINE()]);
    setBackflushLines([]);
    setPoInfo(null);
    setTab(0);
    setAlert(null);
    setItemModal({ open: false, target: null });
    setAllocationModal({ open: false, lineId: null });
  }, []);

  const handleHeaderChange = useCallback((e) => {
    const { name, value } = e.target;
    setHeader((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleLineChange = useCallback((id, field, value) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line._id !== id) return line;
        if (field === "warehouse") {
          return applyWarehouseSettings(
            {
              ...line,
              warehouse: value,
            },
            warehouses,
            value
          );
        }
        return { ...line, [field]: value };
      })
    );
  }, [warehouses]);

  const addLine = useCallback(() => {
    const seeded = poInfo
      ? {
          order_no: String(poInfo.doc_num || ""),
          warehouse: poInfo.warehouse || "",
          base_entry: poInfo.doc_entry,
          base_line: 0,
          base_type: 202,
          by_product: true,
        }
      : {};

    setLines((prev) => [
      ...prev,
      applyWarehouseSettings(EMPTY_LINE(seeded), warehouses, seeded.warehouse || ""),
    ]);
  }, [poInfo, warehouses]);

  const deleteLine = useCallback((id) => {
    setLines((prev) => prev.filter((line) => line._id !== id));
  }, []);

  const loadProductionOrder = async (docEntry) => {
    setLoading(true);
    try {
      const data = await fetchProductionOrderForReceipt(docEntry);

      setPoInfo({
        doc_entry: data.doc_entry,
        doc_num: data.doc_num,
        item_code: data.item_code,
        item_name: data.item_name,
        planned_qty: data.planned_qty,
        completed_qty: data.completed_qty,
        remaining_qty: data.remaining_qty,
        status: data.status,
        warehouse: data.warehouse,
        due_date: data.due_date,
        manual_lines_count: data.manual_lines_count || 0,
      });

      const primaryLine = applyWarehouseSettings(
        EMPTY_LINE({
          item_code: data.item_code || "",
          item_name: data.item_name || "",
          quantity: data.remaining_qty > 0 ? data.remaining_qty : 0,
          planned: data.planned_qty ?? 0,
          completed: data.completed_qty ?? 0,
          warehouse: data.warehouse || "",
          inventory_uom: data.inventory_uom || "",
          uom_code: data.uom_code || "",
          uom_name: data.uom_name || "",
          base_entry: data.doc_entry,
          base_line: 0,
          base_type: 202,
          order_no: String(data.doc_num || ""),
          by_product: false,
          manage_batch: Boolean(data.manage_batch),
          manage_serial: Boolean(data.manage_serial),
          issue_primarily_by: data.issue_primarily_by || "",
          enable_bin_locations: Boolean(data.enable_bin_locations),
        }),
        warehouses,
        data.warehouse || ""
      );

      setLines([
        {
          ...primaryLine,
          enable_bin_locations: Boolean(data.enable_bin_locations) || primaryLine.enable_bin_locations,
        },
      ]);

      setBackflushLines(data.backflush_lines || []);

      const messages = [`Production Order #${data.doc_num} loaded.`];
      if (data.backflush_lines?.length > 0) {
        messages.push(`${data.backflush_lines.length} backflush component(s) will auto-issue on receipt.`);
      }
      if (data.manual_lines_count > 0) {
        messages.push(`${data.manual_lines_count} manual component(s) must be issued separately via Issue for Production.`);
      }
      showAlert("success", messages.join(" "));
      setTab(0);
    } catch (err) {
      showAlert("error", err.response?.data?.detail || err.message || "Failed to load production order.");
    } finally {
      setLoading(false);
    }
  };

  const handleItemSelect = useCallback(async (item) => {
    const { target } = itemModal;
    setItemModal({ open: false, target: null });
    if (!target) return;

    let details = null;
    try {
      details = await getItemDetails(item.ItemCode);
    } catch (err) {
      details = null;
    }

    setLines((prev) =>
      prev.map((line) => {
        if (line._id !== target) return line;

        const itemManagement = normalizeItemManagement(details || {});
        const nextWarehouse =
          details?.DefaultWarehouse || line.warehouse || poInfo?.warehouse || "";

        return applyWarehouseSettings(
          {
            ...line,
            item_code: item.ItemCode,
            item_name: item.ItemName,
            inventory_uom: details?.InventoryUOM || item.InventoryUOM || "",
            uom_code: details?.InventoryUOM || item.InventoryUOM || "",
            uom_name: details?.InventoryUOM || item.InventoryUOM || "",
            warehouse: nextWarehouse,
            manage_batch: itemManagement.manage_batch,
            manage_serial: itemManagement.manage_serial,
            issue_primarily_by: itemManagement.issue_primarily_by,
            batch_numbers: [],
            serial_numbers: [],
            bin_allocations: [],
          },
          warehouses,
          nextWarehouse
        );
      })
    );
  }, [itemModal, poInfo, warehouses]);

  const handlePoSelect = (po) => {
    setPoModal(false);
    loadProductionOrder(po.DocEntry);
  };

  const handleAllocationSave = useCallback((lineId, allocations) => {
    setLines((prev) =>
      prev.map((line) =>
        line._id === lineId
          ? {
              ...line,
              batch_numbers: allocations.batch_numbers || [],
              serial_numbers: allocations.serial_numbers || [],
              bin_allocations: allocations.bin_allocations || [],
            }
          : line
      )
    );
    setAllocationModal({ open: false, lineId: null });
  }, []);

  const validate = () => {
    if (!poInfo?.doc_entry) {
      showAlert("error", "Select a Production Order first.");
      return false;
    }
    if (!header.posting_date) {
      showAlert("error", "Posting date is required.");
      return false;
    }

    const validLines = lines.filter((line) => line.item_code.trim());
    if (validLines.length === 0) {
      showAlert("error", "At least one receipt line with an item is required.");
      return false;
    }

    const mainLines = validLines.filter((line) => !line.by_product);
    if (mainLines.length === 0) {
      showAlert("error", "One main finished goods line is required.");
      return false;
    }
    if (mainLines.length > 1) {
      showAlert("error", "Only one main finished goods line is allowed. Mark the others as by-products.");
      return false;
    }

    const primaryLine = mainLines[0];
    if (toQty(primaryLine.quantity) > toQty(poInfo.remaining_qty) + EPSILON) {
      showAlert(
        "error",
        `Receipt quantity (${toQty(primaryLine.quantity).toFixed(2)}) exceeds remaining quantity (${toQty(poInfo.remaining_qty).toFixed(2)}).`
      );
      return false;
    }

    for (const line of validLines) {
      const qty = toQty(line.quantity);
      if (!qty || qty <= 0) {
        showAlert("error", `Line ${line.item_code}: Quantity must be greater than 0.`);
        return false;
      }
      if (!line.warehouse) {
        showAlert("error", `Line ${line.item_code}: Warehouse is required.`);
        return false;
      }

      const allocationError = getAllocationError(line);
      if (allocationError) {
        showAlert("error", allocationError);
        return false;
      }
    }

    return true;
  };

  const handlePost = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const postingLines = lines.filter((line) => line.item_code.trim());
      const primaryLine = getPrimaryLine(postingLines);
      const payload = {
        prod_order_entry: poInfo.doc_entry,
        item_code: primaryLine?.item_code || "",
        receipt_qty: toQty(primaryLine?.quantity),
        remaining_qty: toQty(poInfo?.remaining_qty),
        warehouse: primaryLine?.warehouse || "",
        uom: primaryLine?.uom_code || "",
        distribution_rule: primaryLine?.distribution_rule || "",
        project: primaryLine?.project || "",
        posting_date: header.posting_date,
        document_date: header.document_date || header.posting_date,
        series: header.series,
        ref_2: header.ref_2,
        branch: header.branch,
        uop: header.uop,
        remarks: header.remarks,
        journal_remark: header.journal_remark,
        lines: postingLines.map((line) => ({
          item_code: line.item_code,
          quantity: toQty(line.quantity),
          warehouse: line.warehouse,
          uom_code: line.uom_code,
          unit_price: toQty(line.unit_price),
          trans_type: line.trans_type,
          location: line.location,
          distribution_rule: line.distribution_rule,
          project: line.project,
          base_entry: line.base_entry ?? poInfo.doc_entry,
          base_line: line.base_line ?? 0,
          base_type: line.base_type ?? 202,
          order_no: line.order_no,
          series_no: line.series_no,
          by_product: line.by_product,
          manage_batch: line.manage_batch,
          manage_serial: line.manage_serial,
          enable_bin_locations: line.enable_bin_locations,
          batch_numbers: line.batch_numbers || [],
          serial_numbers: line.serial_numbers || [],
          bin_allocations: line.bin_allocations || [],
        })),
      };

      const result = await createReceipt(payload);
      const totalPostedQty = postingLines.reduce((sum, line) => sum + toQty(line.quantity), 0);

      showAlert(
        "success",
        `Receipt #${result.doc_num} posted. Total quantity: ${totalPostedQty.toFixed(2)}.` +
          (backflushLines.length > 0 ? ` ${backflushLines.length} backflush component(s) auto-issued.` : "")
      );
      resetForm();
    } catch (err) {
      showAlert("error", err.response?.data?.detail || err.message || "Post failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFromList = async (docEntry) => {
    setLoading(true);
    try {
      const data = await fetchReceiptByDocEntry(docEntry);
      const receipt = data.receipt;

      setHeader({
        doc_num: receipt.doc_num || "",
        series: receipt.series || "",
        posting_date: receipt.posting_date || today(),
        document_date: receipt.document_date || today(),
        ref_2: receipt.ref_2 || "",
        branch: receipt.branch || "",
        uop: receipt.uop || "",
        remarks: receipt.remarks || "",
        journal_remark: receipt.journal_remark || "",
      });

      setLines(
        (receipt.lines || []).map((line) => {
          const mapped = applyWarehouseSettings(
            EMPTY_LINE({
              order_no: line.order_no || "",
              series_no: line.series_no || "",
              item_code: line.item_code || "",
              item_name: line.item_name || "",
              trans_type: line.trans_type || "Complete",
              quantity: line.quantity ?? 0,
              unit_price: line.unit_price ?? 0,
              value: line.value ?? 0,
              item_cost: line.item_cost ?? 0,
              planned: line.planned ?? 0,
              completed: line.completed ?? 0,
              inventory_uom: line.inventory_uom || "",
              uom_code: line.uom_code || "",
              uom_name: line.uom_name || "",
              items_per_unit: line.items_per_unit ?? 1,
              warehouse: line.warehouse || "",
              location: line.location || "",
              branch: line.branch || "",
              uom_group: line.uom_group || "",
              by_product: line.by_product || false,
              distribution_rule: line.distribution_rule || "",
              project: line.project || "",
              base_entry: line.base_entry ?? null,
              base_line: line.base_line ?? null,
              base_type: line.base_type ?? 202,
              manage_batch: Boolean(line.manage_batch),
              manage_serial: Boolean(line.manage_serial),
              enable_bin_locations:
                Boolean(line.enable_bin_locations) || isYes(getWarehouseMeta(warehouses, line.warehouse)?.EnableBinLocations),
              batch_numbers: line.batch_numbers || [],
              serial_numbers: line.serial_numbers || [],
              bin_allocations: line.bin_allocations || [],
            }),
            warehouses,
            line.warehouse || ""
          );

          return {
            ...mapped,
            enable_bin_locations:
              Boolean(line.enable_bin_locations) ||
              mapped.enable_bin_locations ||
              (line.bin_allocations || []).length > 0,
          };
        })
      );

      setPoInfo(receipt.prod_order_entry ? { doc_entry: receipt.prod_order_entry } : null);
      setBackflushLines([]);
      setMode(MODES.VIEW);
      showAlert("success", `Receipt #${receipt.doc_num} loaded.`);
    } catch (err) {
      showAlert("error", err.response?.data?.detail || "Load failed.");
    } finally {
      setLoading(false);
    }
  };

  const totalQty = lines.reduce((sum, line) => sum + toQty(line.quantity), 0);
  const primaryLine = getPrimaryLine(lines);
  const receiptQtyForBackflush = toQty(primaryLine?.quantity);
  const activeAllocationLine = lines.find((line) => line._id === allocationModal.lineId) || null;

  if (mode === MODES.LIST) {
    return (
      <ReceiptList
        onSelect={handleSelectFromList}
        onNew={() => {
          resetForm();
          setMode(MODES.ADD);
        }}
      />
    );
  }

  const isView = mode === MODES.VIEW;

  return (
    <div className="im-page">
      <div className="im-toolbar">
        <span className="im-toolbar__title">Receipt from Production</span>
        <span className={`im-mode-badge im-mode-badge--${isView ? "update" : "add"}`}>
          {isView ? "View Mode" : "Add Mode"}
        </span>

        {!isView && (
          <button className="im-btn im-btn--primary" onClick={handlePost} disabled={loading || !poInfo}>
            {loading ? "..." : "Post"}
          </button>
        )}
        <button className="im-btn" onClick={() => { resetForm(); setMode(MODES.ADD); }}>New</button>
        <button className="im-btn" onClick={() => setMode(MODES.LIST)}>List</button>
        <button className="im-btn" onClick={resetForm}>Cancel</button>
      </div>

      {alert && <div className={`im-alert im-alert--${alert.type}`}>{alert.msg}</div>}

      <div className="im-header-card">
        {poInfo && (
          <div className="rfp-po-banner">
            <span>
              <span className="rfp-po-banner__label">Production Order: </span>
              <span className="rfp-po-banner__value">#{poInfo.doc_num}</span>
            </span>
            {poInfo.item_code && (
              <span>
                <span className="rfp-po-banner__label">FG Item: </span>
                <span className="rfp-po-banner__value">{poInfo.item_code}</span>
                {poInfo.item_name && <span style={{ color: "#555" }}> - {poInfo.item_name}</span>}
              </span>
            )}
            {poInfo.planned_qty != null && (
              <span>
                <span className="rfp-po-banner__label">Planned: </span>
                <span className="rfp-po-banner__value">{toQty(poInfo.planned_qty).toFixed(2)}</span>
              </span>
            )}
            {poInfo.completed_qty != null && (
              <span>
                <span className="rfp-po-banner__label">Completed: </span>
                <span className="rfp-po-banner__value">{toQty(poInfo.completed_qty).toFixed(2)}</span>
              </span>
            )}
            {poInfo.remaining_qty != null && (
              <span className="rfp-po-banner__remain">
                Remaining: {toQty(poInfo.remaining_qty).toFixed(2)}
              </span>
            )}
            {poInfo.status && (
              <span className="rfp-po-banner__status">
                {PO_STATUS_LABEL[poInfo.status] || poInfo.status}
              </span>
            )}
            {poInfo.due_date && (
              <span className="rfp-po-banner__warn">Due: {poInfo.due_date}</span>
            )}
            {poInfo.manual_lines_count > 0 && (
              <span className="rfp-po-banner__warn">
                {poInfo.manual_lines_count} manual component(s) require Issue for Production
              </span>
            )}
          </div>
        )}

        <div className="rfp-header-layout">
          <div className="rfp-header-left">
            <div className="im-field">
              <label className="im-field__label rfp-lbl">Production Order</label>
              <div className="im-lookup-wrap">
                <input
                  className="im-field__input"
                  value={poInfo ? `#${poInfo.doc_num} - ${poInfo.item_code || ""}` : ""}
                  readOnly
                  placeholder="Select a production order..."
                  style={{ width: 240, background: poInfo ? "#f0fff4" : undefined }}
                />
                {!isView && (
                  <button className="im-lookup-btn" onClick={() => setPoModal(true)} disabled={loading}>
                    ...
                  </button>
                )}
              </div>
            </div>

            <div className="im-field">
              <label className="im-field__label rfp-lbl">Number</label>
              <input
                className="im-field__input rfp-readonly"
                value={header.doc_num || (mode === MODES.ADD ? "(auto)" : "")}
                readOnly
                style={{ width: 100 }}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label rfp-lbl">Series</label>
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
                  <option key={entry.Series} value={entry.Series}>
                    {entry.Name}
                  </option>
                ))}
              </select>
            </div>

            <div className="im-field">
              <label className="im-field__label rfp-lbl">Ref. 2</label>
              <input
                className="im-field__input"
                name="ref_2"
                value={header.ref_2}
                onChange={handleHeaderChange}
                readOnly={isView}
                style={{ width: 160 }}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label rfp-lbl">Branch</label>
              <select
                className="im-field__select"
                name="branch"
                value={header.branch}
                onChange={handleHeaderChange}
                disabled={isView}
                style={{ width: 200 }}
              >
                <option value="">--</option>
                {branches.map((branch) => (
                  <option key={branch.BPLID} value={branch.BPLID}>
                    {branch.BPLName}
                  </option>
                ))}
              </select>
            </div>

            <div className="im-field">
              <label className="im-field__label rfp-lbl">UoP</label>
              <input
                className="im-field__input"
                name="uop"
                value={header.uop}
                onChange={handleHeaderChange}
                readOnly={isView}
                style={{ width: 160 }}
              />
            </div>
          </div>
          
          <div className="rfp-header-right">
            <div className="im-field">
              <label className="im-field__label rfp-lbl-r">Posting Date</label>
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
              <label className="im-field__label rfp-lbl-r">Document Date</label>
              <input
                className="im-field__input"
                name="document_date"
                type="date"
                value={header.document_date}
                onChange={handleHeaderChange}
                readOnly={isView}
                style={{ width: 150 }}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label rfp-lbl-r">Journal Remark</label>
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
              <label className="im-field__label rfp-lbl-r">Remarks</label>
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
            {index === 1 && backflushLines.length > 0 && (
              <span
                style={{
                  marginLeft: 5,
                  background: "#fff3cd",
                  color: "#7c5c00",
                  borderRadius: 3,
                  padding: "0 5px",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {backflushLines.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="im-tab-panel rfp-tab-panel">
        {tab === 0 && (
          <ReceiptLines
            lines={lines}
            warehouses={warehouses}
            distRules={distRules}
            projects={projects}
            branches={branches}
            readOnly={isView}
            onChange={handleLineChange}
            onAdd={addLine}
            onDelete={deleteLine}
            onItemSearch={(lineId) => setItemModal({ open: true, target: lineId })}
            onAllocate={(lineId) => setAllocationModal({ open: true, lineId })}
          />
        )}

        {tab === 1 && (
          <div style={{ padding: "12px 16px" }}>
            {backflushLines.length === 0 ? (
              <div style={{ textAlign: "center", color: "#888", fontSize: 13, padding: "30px 0" }}>
                {poInfo
                  ? "No backflush components on this production order."
                  : "Select a Production Order to see backflush components."}
              </div>
            ) : (
              <BackflushPreview
                lines={backflushLines}
                receiptQty={receiptQtyForBackflush}
                plannedQty={toQty(poInfo?.planned_qty || 1)}
                warehouses={warehouses}
              />
            )}
          </div>
        )}

        {tab === 2 && (
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

      {itemModal.open && (
        <ItemSearchModal
          onSelect={handleItemSelect}
          onClose={() => setItemModal({ open: false, target: null })}
          fetchItems={fetchBOMItems}
          title="Item Search"
        />
      )}

      {allocationModal.open && activeAllocationLine && (
        <ReceiptAllocationModal
          line={activeAllocationLine}
          readOnly={isView}
          onSave={(allocations) => handleAllocationSave(activeAllocationLine._id, allocations)}
          onClose={() => setAllocationModal({ open: false, lineId: null })}
        />
      )}

      <div className="rfp-bottom-bar">
        <div className="rfp-bottom-bar__totals">
          <span>
            Total Qty: <span className="rfp-bottom-bar__total-val">{totalQty.toFixed(2)}</span>
          </span>
          {primaryLine && (
            <span>
              FG Qty: <span className="rfp-bottom-bar__total-val">{toQty(primaryLine.quantity).toFixed(2)}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
