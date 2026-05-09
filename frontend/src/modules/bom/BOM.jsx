import React, { useState, useEffect, useCallback, useRef } from "react";
import "../../modules/item-master/styles/itemMaster.css";
import "./bom.css";
import FindResultsModal from "../../components/FindResultsModal";
import BOMLines from "./components/BOMLines";
import BOMAttachments from "./components/BOMAttachments";
import ItemSearchModal from "./components/ItemSearchModal";
import {
  getBOM,
  createBOM,
  updateBOM,
  fetchBOMItems,
  fetchBOMList,
  fetchBOMWarehouses,
  fetchBOMPriceLists,
  fetchBOMDistributionRules,
  fetchBOMProjects,
  getItemDetails,
} from "../../api/bomApi";

const MODES = { ADD: "add", FIND: "find", UPDATE: "update" };
const TABS = ["Contents", "Attachments"];

const BOM_TYPES = [
  { value: "iProductionTree", label: "Production" },
  { value: "iSalesTree", label: "Sales" },
  { value: "iTemplateTree", label: "Template" },
  { value: "iAssemblyTree", label: "Assembly" },
];

const EMPTY_HEADER = {
  TreeCode: "",
  ProductDescription: "",
  TreeType: "iProductionTree",
  Quantity: 1,
  ProductionStdCost: 0,
  PlanAvgProdSize: 1,
  Warehouse: "",
  PriceList: "",
  DistributionRule: "",
  Project: "",
};

export const EMPTY_LINE = () => ({
  _id: Date.now() + Math.random(),
  ItemType: "pit_Item",
  ItemCode: "",
  ItemName: "",
  Quantity: 1,
  InventoryUOM: "",
  Warehouse: "",
  IssueMethod: "im_Manual",
  ProductionStdCost: 0,
  TotalStdCost: 0,
  PriceList: "",
  Price: 0,
  Total: 0,
  Comment: "",
  DistributionRule: "",
  WipAccount: "",
  RouteSequence: 0,
  Project: "",
});

export default function BOMModule() {
  const [mode, setMode] = useState(MODES.ADD);
  const [tab, setTab] = useState(0);
  const [header, setHeader] = useState(EMPTY_HEADER);
  const [lines, setLines] = useState(() => {
    const firstLine = EMPTY_LINE();
    return [firstLine];
  });
  const [selectedLineId, setSelectedLineId] = useState(() => {
    const firstLine = EMPTY_LINE();
    return firstLine._id;
  });
  const [attachments, setAttachments] = useState([]);
  const [alert, setAlert] = useState(null);
  const [loading, setLoading] = useState(false);

  const [warehouses, setWarehouses] = useState([]);
  const [priceLists, setPriceLists] = useState([]);
  const [distRules, setDistRules] = useState([]);
  const [projects, setProjects] = useState([]);

  const [itemModal, setItemModal] = useState({ open: false, target: null });
  const [findResults, setFindResults] = useState([]);
  const [showFindResults, setShowFindResults] = useState(false);

  const alertTimer = useRef(null);

  useEffect(() => {
    fetchBOMWarehouses().then(setWarehouses).catch(() => {});
    fetchBOMPriceLists().then(setPriceLists).catch(() => {});
    fetchBOMDistributionRules().then(setDistRules).catch(() => {});
    fetchBOMProjects().then(setProjects).catch(() => {});
  }, []);

  const showAlert = useCallback((type, msg) => {
    clearTimeout(alertTimer.current);
    setAlert({ type, msg });
    alertTimer.current = setTimeout(() => setAlert(null), 6000);
  }, []);

  const loadExistingBOM = useCallback(
    async (treeCode, message) => {
      const data = await getBOM(treeCode);
      loadBOM(data);
      setMode(MODES.UPDATE);
      if (message) showAlert("warning", message);
      return data;
    },
    [showAlert]
  );

  const resetForm = useCallback(() => {
    const firstLine = EMPTY_LINE();
    setHeader(EMPTY_HEADER);
    setLines([firstLine]);
    setSelectedLineId(firstLine._id);
    setAttachments([]);
    setTab(0);
    setAlert(null);
    setFindResults([]);
    setShowFindResults(false);
  }, []);

  const handleHeaderChange = useCallback((e) => {
    const { name, value } = e.target;
    setHeader((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleItemSelect = useCallback(
    async (item) => {
      const { target } = itemModal;
      setItemModal({ open: false, target: null });

      try {
        if (target === "header" && mode === MODES.ADD) {
          try {
            await loadExistingBOM(
              item.ItemCode,
              `BOM "${item.ItemCode}" already exists, so it was opened in Update Mode.`
            );
            return;
          } catch {
            // No BOM exists yet, continue with create flow.
          }
        }

        const details = await getItemDetails(item.ItemCode);

        if (target === "header") {
          setHeader((prev) => ({
            ...prev,
            TreeCode: details.ItemCode,
            ProductDescription: details.ItemName,
            Warehouse: details.DefaultWarehouse || prev.Warehouse,
          }));
        } else {
          setLines((prev) =>
            prev.map((line) =>
              line._id === target
                ? {
                    ...line,
                    ItemCode: details.ItemCode,
                    ItemName: details.ItemName,
                    InventoryUOM: details.InventoryUOM || "",
                    Warehouse: details.DefaultWarehouse || line.Warehouse,
                  }
                : line
            )
          );
        }
      } catch {
        if (target === "header") {
          setHeader((prev) => ({
            ...prev,
            TreeCode: item.ItemCode,
            ProductDescription: item.ItemName,
          }));
        } else {
          setLines((prev) =>
            prev.map((line) =>
              line._id === target
                ? {
                    ...line,
                    ItemCode: item.ItemCode,
                    ItemName: item.ItemName,
                    InventoryUOM: item.InventoryUOM || "",
                  }
                : line
            )
          );
        }
      }
    },
    [itemModal, loadExistingBOM, mode]
  );

  const handleLineChange = useCallback((id, field, value) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line._id !== id) return line;

        const updated = { ...line, [field]: value };
        const qty = Number(field === "Quantity" ? value : updated.Quantity) || 0;
        const stdCost =
          Number(field === "ProductionStdCost" ? value : updated.ProductionStdCost) || 0;
        const price = Number(field === "Price" ? value : updated.Price) || 0;

        updated.TotalStdCost = qty * stdCost;
        updated.Total = qty * price;
        return updated;
      })
    );
  }, []);

  const addLine = useCallback(() => {
    const newLine = EMPTY_LINE();
    setLines((prev) => {
      const selectedIndex = prev.findIndex((line) => line._id === selectedLineId);
      if (selectedIndex === -1) {
        return [...prev, newLine];
      }

      const next = [...prev];
      next.splice(selectedIndex + 1, 0, newLine);
      return next;
    });
    setSelectedLineId(newLine._id);
  }, [selectedLineId]);

  const deleteLine = useCallback((id) => {
    setLines((prev) => {
      if (prev.length <= 1) {
        const replacement = EMPTY_LINE();
        setSelectedLineId(replacement._id);
        return [replacement];
      }

      const index = prev.findIndex((line) => line._id === id);
      if (index === -1) return prev;

      const next = prev.filter((line) => line._id !== id);
      const fallbackIndex = Math.min(index, next.length - 1);
      setSelectedLineId(next[fallbackIndex]?._id ?? null);
      return next;
    });
  }, []);

  const totalStdCost = lines.reduce((sum, line) => sum + (Number(line.TotalStdCost) || 0), 0);
  const totalPrice = lines.reduce((sum, line) => sum + (Number(line.Total) || 0), 0);

  const validate = useCallback(() => {
    if (!header.TreeCode.trim()) {
      showAlert("error", "Product No. is required.");
      return false;
    }
    if (Number(header.Quantity) <= 0) {
      showAlert("error", "Quantity must be > 0.");
      return false;
    }

    const validLines = lines.filter((line) => line.ItemCode.trim());
    if (validLines.length === 0) {
      showAlert("error", "At least one component required.");
      return false;
    }

    const codes = validLines.map((line) => line.ItemCode);
    if (new Set(codes).size !== codes.length) {
      showAlert("error", "Duplicate item codes.");
      return false;
    }

    return true;
  }, [header.Quantity, header.TreeCode, lines, showAlert]);

  const buildPayload = useCallback(() => {
    const opt = (value) => value !== "" && value != null;

    return {
      TreeCode: header.TreeCode,
      TreeType: header.TreeType,
      Quantity: Number(header.Quantity),
      ...(opt(header.Warehouse) && { Warehouse: header.Warehouse }),
      ...(opt(header.PriceList) && { PriceList: Number(header.PriceList) }),
      ...(opt(header.PlanAvgProdSize) && { PlanAvgProdSize: Number(header.PlanAvgProdSize) }),
      ...(opt(header.DistributionRule) && { DistributionRule: header.DistributionRule }),
      ...(opt(header.Project) && { Project: header.Project }),
      ProductTreeLines: lines
        .filter((line) => line.ItemCode.trim())
        .map((line) => ({
          ItemCode: line.ItemCode,
          ItemType: line.ItemType || "pit_Item",
          Quantity: Number(line.Quantity) || 1,
          IssueMethod: line.IssueMethod || "im_Manual",
          ...(opt(line.Warehouse) && { Warehouse: line.Warehouse }),
          ...(opt(line.PriceList) && { PriceList: Number(line.PriceList) }),
          ...(opt(line.Comment) && { Comment: line.Comment }),
          ...(opt(line.WipAccount) && { WipAccount: line.WipAccount }),
          ...(opt(line.DistributionRule) && { DistributionRule: line.DistributionRule }),
          ...(opt(line.Project) && { Project: line.Project }),
        })),
    };
  }, [header, lines]);

  const handleSave = useCallback(async () => {
    if (mode === MODES.FIND) {
      await handleFind();
      return;
    }

    if (!validate()) return;

    setLoading(true);
    try {
      const payload = buildPayload();

      if (mode === MODES.ADD) {
        await createBOM(payload);
        showAlert("success", `BOM "${header.TreeCode}" created.`);
        setMode(MODES.UPDATE);
      } else {
        const updated = await updateBOM(header.TreeCode, payload);
        loadBOM(updated);
        showAlert("success", `BOM "${header.TreeCode}" updated.`);
      }
    } catch (err) {
      const message = err.response?.data?.message || err.message || "Save failed.";
      if (mode === MODES.ADD && /already exists|ODBC -2035/i.test(message)) {
        try {
          await loadExistingBOM(
            header.TreeCode,
            `BOM "${header.TreeCode}" already exists, so it was opened in Update Mode.`
          );
          return;
        } catch {
          // Fall back to the original error.
        }
      }
      showAlert("error", message);
    } finally {
      setLoading(false);
    }
  }, [buildPayload, header.TreeCode, loadExistingBOM, mode, showAlert, validate]);

  const handleFind = useCallback(
    async (treeCode = null) => {
      const code = treeCode || header.TreeCode.trim();
      const query = code || header.ProductDescription.trim();
      if (!query) {
        showAlert("error", "Enter a Product No. or Product Description to search.");
        return;
      }

      setLoading(true);
      try {
        if (code) {
          const data = await getBOM(code);
          loadBOM(data);
          setMode(MODES.UPDATE);
          showAlert("success", `BOM "${data.TreeCode}" loaded.`);
          return;
        }

        const results = await fetchBOMList(query);
        if (results.length === 0) {
          showAlert("error", "No matching BOMs found.");
        } else if (results.length === 1) {
          const data = await loadExistingBOM(results[0].TreeCode);
          showAlert("success", `BOM "${data.TreeCode}" loaded.`);
        } else {
          setFindResults(results);
          setShowFindResults(true);
        }
      } catch (err) {
        showAlert("error", err.response?.data?.message || err.message || "BOM search failed.");
      } finally {
        setLoading(false);
      }
    },
    [header.TreeCode, header.ProductDescription, loadExistingBOM, showAlert]
  );

  const handleFindResultSelect = useCallback(
    async (row) => {
      setShowFindResults(false);
      setLoading(true);
      try {
        const data = await loadExistingBOM(row.TreeCode);
        showAlert("success", `BOM "${data.TreeCode}" loaded.`);
      } catch (err) {
        showAlert("error", err.response?.data?.message || err.message || "Failed to load BOM.");
      } finally {
        setLoading(false);
      }
    },
    [loadExistingBOM, showAlert]
  );

  const loadBOM = useCallback((data) => {
    setHeader({
      TreeCode: data.TreeCode || "",
      ProductDescription: data.ProductDescription || "",
      TreeType: data.TreeType || "iProductionTree",
      Quantity: data.Quantity ?? 1,
      ProductionStdCost: 0,
      PlanAvgProdSize: data.PlanAvgProdSize ?? 1,
      Warehouse: data.Warehouse || "",
      PriceList: data.PriceList != null ? String(data.PriceList) : "",
      DistributionRule: data.DistributionRule || "",
      Project: data.Project || "",
    });

    setLines(
      (data.ProductTreeLines || []).map((line) => {
        const qty = line.Quantity ?? 1;
        const stdCost = 0;
        const price = line.Price ?? 0;

        return {
          _id: Date.now() + Math.random(),
          ItemType: line.ItemType || "pit_Item",
          ItemCode: line.ItemCode || "",
          ItemName: line.ItemName || "",
          Quantity: qty,
          InventoryUOM: line.InventoryUOM || "",
          Warehouse: line.Warehouse || "",
          IssueMethod: line.IssueMethod || "im_Manual",
          ProductionStdCost: stdCost,
          TotalStdCost: qty * stdCost,
          PriceList: line.PriceList != null ? String(line.PriceList) : "",
          Price: price,
          Total: qty * price,
          Comment: line.Comment || "",
          DistributionRule: line.DistributionRule || "",
          WipAccount: line.WipAccount || "",
          RouteSequence: line.VisualOrder ?? 0,
          Project: line.Project || "",
        };
      })
    );
    setSelectedLineId(null);
  }, []);

  useEffect(() => {
    if (!lines.length) return;
    if (!selectedLineId || !lines.some((line) => line._id === selectedLineId)) {
      setSelectedLineId(lines[0]._id);
    }
  }, [lines, selectedLineId]);

  return (
    <div className="im-page bom-page">
      <div className="im-toolbar">
        <span className="im-toolbar__title">Bill of Materials</span>
        <span className={`im-mode-badge im-mode-badge--${mode}`}>
          {mode === MODES.ADD ? "Add Mode" : mode === MODES.FIND ? "Find Mode" : "Update Mode"}
        </span>
        <button type="button" className="im-btn im-btn--primary" onClick={handleSave} disabled={loading}>
          {loading ? "..." : mode === MODES.FIND ? "Find" : "OK"}
        </button>
        <button type="button" className="im-btn" onClick={() => { setMode(MODES.ADD); resetForm(); }}>
          New
        </button>
        <button type="button" className="im-btn" onClick={() => { setMode(MODES.FIND); resetForm(); }}>
          Find
        </button>
        <button type="button" className="im-btn" onClick={resetForm}>
          Cancel
        </button>
      </div>

      {alert && <div className={`im-alert im-alert--${alert.type}`}>{alert.msg}</div>}

      <div className="im-header-card bom-header-card">
        <div className="bom-header-layout">
          <div className="bom-header-left">
            <div className="im-field">
              <label className="im-field__label bom-lbl">Product No.</label>
              <div className="im-lookup-wrap">
                <input
                  className="im-field__input bom-code-input"
                  name="TreeCode"
                  value={header.TreeCode}
                  onChange={handleHeaderChange}
                  readOnly={mode === MODES.UPDATE}
                  autoFocus
                />
                {mode !== MODES.UPDATE && (
                  <button
                    type="button"
                    className="im-lookup-btn"
                    onClick={() => setItemModal({ open: true, target: "header" })}
                  >
                    ...
                  </button>
                )}
              </div>
              <span className="bom-field__hint">X Quantity</span>
              <input
                className="im-field__input bom-qty-input"
                name="Quantity"
                type="number"
                min="0.001"
                step="any"
                value={header.Quantity}
                onChange={handleHeaderChange}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label bom-lbl">Product Description</label>
              <input
                className="im-field__input bom-field__input--grow"
                name="ProductDescription"
                value={header.ProductDescription}
                onChange={handleHeaderChange}
              />
            </div>

            <div className="im-field">
              <label className="im-field__label bom-lbl">BOM Type</label>
              <select
                className="im-field__select bom-field__select"
                name="TreeType"
                value={header.TreeType}
                onChange={handleHeaderChange}
              >
                {BOM_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="im-field">
              <label className="im-field__label bom-lbl">Production Std Cost</label>
              <input
                className="im-field__input bom-readonly bom-field__input--compact"
                value={totalStdCost.toFixed(2)}
                readOnly
              />
            </div>

            <div className="im-field">
              <label className="im-field__label bom-lbl">Planned Avg Production Size</label>
              <input
                className="im-field__input bom-field__input--compact"
                name="PlanAvgProdSize"
                type="number"
                min="0"
                step="any"
                value={header.PlanAvgProdSize}
                onChange={handleHeaderChange}
              />
            </div>
          </div>

          <div className="bom-header-right">
            <div className="im-field">
              <label className="im-field__label bom-lbl-r">Warehouse</label>
              <select
                className="im-field__select bom-field__select"
                name="Warehouse"
                value={header.Warehouse}
                onChange={handleHeaderChange}
              >
                <option value="">--</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.WarehouseCode} value={warehouse.WarehouseCode}>
                    {warehouse.WarehouseCode}
                  </option>
                ))}
              </select>
            </div>

            <div className="im-field">
              <label className="im-field__label bom-lbl-r">Price List</label>
              <select
                className="im-field__select bom-field__select"
                name="PriceList"
                value={header.PriceList}
                onChange={handleHeaderChange}
              >
                <option value="">--</option>
                {priceLists.map((priceList) => (
                  <option key={priceList.PriceListNo} value={priceList.PriceListNo}>
                    {priceList.PriceListName}
                  </option>
                ))}
              </select>
            </div>

            <div className="im-field">
              <label className="im-field__label bom-lbl-r">Distr. Rule</label>
              <select
                className="im-field__select bom-field__select"
                name="DistributionRule"
                value={header.DistributionRule}
                onChange={handleHeaderChange}
              >
                <option value="">--</option>
                {distRules.map((rule) => (
                  <option key={rule.FactorCode} value={rule.FactorCode}>
                    {rule.FactorCode} - {rule.FactorDescription}
                  </option>
                ))}
              </select>
            </div>

            <div className="im-field">
              <label className="im-field__label bom-lbl-r">Project</label>
              <select
                className="im-field__select bom-field__select"
                name="Project"
                value={header.Project}
                onChange={handleHeaderChange}
              >
                <option value="">--</option>
                {projects.map((project) => (
                  <option key={project.Code} value={project.Code}>
                    {project.Code} - {project.Name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="im-tabs">
        {TABS.map((label, index) => (
          <button
            key={label}
            type="button"
            className={`im-tab${tab === index ? " im-tab--active" : ""}`}
            onClick={() => setTab(index)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="im-tab-panel bom-tab-panel">
        {tab === 0 && (
          <BOMLines
            lines={lines}
            selectedLineId={selectedLineId}
            warehouses={warehouses}
            priceLists={priceLists}
            distRules={distRules}
            projects={projects}
            totalStdCost={totalStdCost}
            totalPrice={totalPrice}
            onChange={handleLineChange}
            onAdd={addLine}
            onDelete={deleteLine}
            onSelectLine={setSelectedLineId}
            onItemSearch={(lineId) => setItemModal({ open: true, target: lineId })}
          />
        )}
        {tab === 1 && <BOMAttachments attachments={attachments} onChange={setAttachments} />}
      </div>

      {itemModal.open && itemModal.target === "header" && mode === MODES.FIND && (
        <ItemSearchModal
          onSelect={(bom) => {
            setItemModal({ open: false, target: null });
            handleFind(bom.TreeCode);
          }}
          onClose={() => setItemModal({ open: false, target: null })}
          fetchItems={fetchBOMList}
          columns={[
            { key: "TreeCode", label: "Product No." },
            { key: "ProductDescription", label: "Description" },
            { key: "TreeType", label: "Type" },
          ]}
        />
      )}

      {itemModal.open && (itemModal.target !== "header" || mode !== MODES.FIND) && (
        <ItemSearchModal
          onSelect={handleItemSelect}
          onClose={() => setItemModal({ open: false, target: null })}
          fetchItems={(query) =>
            fetchBOMItems(query).then((items) =>
              items.filter((item) => item.ItemCode !== header.TreeCode)
            )
          }
          columns={[
            { key: "ItemCode", label: "Item Code" },
            { key: "ItemName", label: "Item Description" },
            { key: "QuantityOnStock", label: "In Stock" },
            { key: "ItemsGroupCode", label: "Item Group" },
          ]}
        />
      )}

      <FindResultsModal
        open={showFindResults}
        title="BOM Search Results"
        columns={[
          { key: "TreeCode", label: "Product No." },
          { key: "ProductDescription", label: "Description" },
          { key: "TreeType", label: "Type" },
        ]}
        rows={findResults}
        getRowKey={(row) => row.TreeCode}
        onClose={() => setShowFindResults(false)}
        onSelect={handleFindResultSelect}
      />
    </div>
  );
}
