const sapService = require("../services/sapService");
const escapeOData = (v) => String(v || "").replace(/'/g, "''");

// ── List BOMs ─────────────────────────────────────────────────────────────────
const listBOMs = async (req, res) => {
  try {
    await sapService.ensureSession();
    const { query = "", top = 50, skip = 0 } = req.query;
    const filter = query
      ? `&$filter=contains(TreeCode,'${escapeOData(query)}') or contains(ProductDescription,'${escapeOData(query)}')`
      : "";
    const resp = await sapService.request({
      method: "GET",
      url: `/ProductTrees?$select=TreeCode,TreeType,Quantity,ProductDescription,Warehouse,PriceList,PlanAvgProdSize${filter}&$top=${top}&$skip=${skip}`,
    });
    res.json(resp.data.value || []);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

// ── Get single BOM ────────────────────────────────────────────────────────────
const getBOM = async (req, res) => {
  try {
    await sapService.ensureSession();
    const code = req.params.treeCode;
    const resp = await sapService.request({
      method: "GET",
      url: `/ProductTrees('${encodeURIComponent(code)}')`,
    });
    res.json(resp.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

// ── Create BOM ────────────────────────────────────────────────────────────────
const createBOM = async (req, res) => {
  try {
    const payload = _buildPayload(req.body);
    
    // Validate: Check for circular reference (parent item in its own BOM)
    const parentItemCode = payload.TreeCode;
    const componentItems = (payload.ProductTreeLines || []).map(line => line.ItemCode);
    
    if (componentItems.includes(parentItemCode)) {
      return res.status(400).json({ 
        message: `Circular reference detected: Item "${parentItemCode}" cannot be a component of itself.` 
      });
    }
    
    const resp = await sapService.request({ method: "POST", url: "/ProductTrees", data: payload });
    res.status(201).json(resp.data);
  } catch (err) {
    console.error("[BOM create]", _sapMsg(err), JSON.stringify(err.response?.data));
    if (_isDuplicateEntryError(err)) {
      return res.status(409).json({
        message: `A BOM already exists for item "${req.body?.TreeCode || "this item"}". Open the existing BOM instead of creating a new one.`,
      });
    }
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

// ── Update BOM ────────────────────────────────────────────────────────────────
const updateBOM = async (req, res) => {
  try {
    const code = req.params.treeCode;
    const payload = _buildPayload(req.body);
    
    // Validate: Check for circular reference (parent item in its own BOM)
    const parentItemCode = payload.TreeCode || code;
    const componentItems = (payload.ProductTreeLines || []).map(line => line.ItemCode);
    
    if (componentItems.includes(parentItemCode)) {
      return res.status(400).json({ 
        message: `Circular reference detected: Item "${parentItemCode}" cannot be a component of itself.` 
      });
    }
    
    await sapService.request({ method: "PATCH", url: `/ProductTrees('${encodeURIComponent(code)}')`, data: payload });
    const updated = await sapService.request({ method: "GET", url: `/ProductTrees('${encodeURIComponent(code)}')` });
    res.json(updated.data);
  } catch (err) {
    console.error("[BOM update]", _sapMsg(err), JSON.stringify(err.response?.data));
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

// ── Delete BOM ────────────────────────────────────────────────────────────────
const deleteBOM = async (req, res) => {
  try {
    await sapService.request({ method: "DELETE", url: `/ProductTrees('${encodeURIComponent(req.params.treeCode)}')` });
    res.json({ success: true });
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

// ── Lookups ───────────────────────────────────────────────────────────────────
const lookupItems = async (req, res) => {
  try {
    await sapService.ensureSession();
    const q = req.query.query || "";
    const filter = q ? `&$filter=contains(ItemCode,'${q}') or contains(ItemName,'${q}')` : "";
    const resp = await sapService.request({
      method: "GET",
      url: `/Items?$select=ItemCode,ItemName,InventoryUOM,PurchaseItem,SalesItem,InventoryItem,QuantityOnStock,ItemsGroupCode&$top=50${filter}`,
    });
    res.json(resp.data.value || []);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupWarehouses = async (req, res) => {
  try {
    await sapService.ensureSession();
    const resp = await sapService.request({ method: "GET", url: "/Warehouses?$select=WarehouseCode,WarehouseName" });
    res.json(resp.data.value || []);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupPriceLists = async (req, res) => {
  try {
    await sapService.ensureSession();
    const resp = await sapService.request({ method: "GET", url: "/PriceLists?$select=PriceListNo,PriceListName" });
    res.json(resp.data.value || []);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupDistributionRules = async (req, res) => {
  try {
    await sapService.ensureSession();
    const resp = await sapService.request({
      method: "GET",
      url: "/DistributionRules?$select=FactorCode,FactorDescription&$top=100",
    });
    res.json(resp.data.value || []);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupProjects = async (req, res) => {
  try {
    await sapService.ensureSession();
    const resp = await sapService.request({
      method: "GET",
      url: "/Projects?$select=Code,Name&$top=100",
    });
    res.json(resp.data.value || []);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupGLAccounts = async (req, res) => {
  try {
    await sapService.ensureSession();
    const q = req.query.query || "";
    const filter = q ? `?$filter=contains(Code,'${q}') or contains(Name,'${q}')` : "";
    const resp = await sapService.request({
      method: "GET",
      url: `/ChartOfAccounts?$select=Code,Name${filter}&$top=50`,
    });
    res.json(resp.data.value || []);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _sapMsg(err) {
  return (
    err.response?.data?.error?.message?.value ||
    err.response?.data?.error?.message ||
    err.response?.data?.message ||
    err.message
  );
}

function _isDuplicateEntryError(err) {
  const message = _sapMsg(err) || "";
  const code = String(err.response?.data?.error?.code || "");
  return code.includes("-2035") || message.includes("ODBC -2035") || /already exists/i.test(message);
}

function _buildPayload(body) {
  const opt = (v) => v !== "" && v != null;
  const p = {};

  p.TreeCode = body.TreeCode;
  p.TreeType = body.TreeType || "iProductionTree";
  p.Quantity = Number(body.Quantity) || 1;

  if (opt(body.Warehouse))        p.Warehouse        = body.Warehouse;
  if (opt(body.PriceList))        p.PriceList        = Number(body.PriceList);
  if (opt(body.PlanAvgProdSize))  p.PlanAvgProdSize  = Number(body.PlanAvgProdSize);
  if (opt(body.DistributionRule)) p.DistributionRule = body.DistributionRule;
  if (opt(body.Project))          p.Project          = body.Project;

  if (Array.isArray(body.ProductTreeLines) && body.ProductTreeLines.length > 0) {
    p.ProductTreeLines = body.ProductTreeLines
      .filter((l) => l.ItemCode)
      .map((l, idx) => {
        const line = {
          ItemCode:    l.ItemCode,
          Quantity:    Number(l.Quantity) || 1,
          // Confirmed SAP enum: im_Manual | im_Backflush
          IssueMethod: l.IssueMethod || "im_Manual",
          // Confirmed SAP enum: pit_Item (only value seen in live data)
          ItemType:    l.ItemType    || "pit_Item",
        };
        if (opt(l.Warehouse))        line.Warehouse        = l.Warehouse;
        if (opt(l.PriceList))        line.PriceList        = Number(l.PriceList);
        if (opt(l.Comment))          line.Comment          = l.Comment;
        if (opt(l.WipAccount))       line.WipAccount       = l.WipAccount;
        if (opt(l.DistributionRule)) line.DistributionRule = l.DistributionRule;
        if (opt(l.Project))          line.Project          = l.Project;
        if (opt(l.AdditionalQuantity)) line.AdditionalQuantity = Number(l.AdditionalQuantity);
        if (opt(l.StageID))          line.StageID          = Number(l.StageID);
        return line;
      });
  }

  return p;
}

// ── Get Item Details (for auto-populating BOM fields) ────────────────────────
const getItemDetails = async (req, res) => {
  try {
    await sapService.ensureSession();
    const itemCode = req.params.itemCode;
    const resp = await sapService.request({
      method: "GET",
      url: `/Items('${encodeURIComponent(itemCode)}')`,
    });
    const item = resp.data;
    
    // Return relevant fields for BOM auto-population
    res.json({
      ItemCode: item.ItemCode,
      ItemName: item.ItemName,
      InventoryUOM: item.InventoryUOM,
      DefaultWarehouse: item.DefaultWarehouse || item.WarehouseCode || "",
      PriceList: item.Mainsupplier || "",
      DistributionRule: item.DistributionRule || "",
      Project: item.Project || "",
      ManageSerialNumbers: item.ManageSerialNumbers,
      ManageBatchNumbers: item.ManageBatchNumbers,
      IssuePrimarilyBy: item.IssuePrimarilyBy || "",
    });
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

module.exports = {
  listBOMs, getBOM, createBOM, updateBOM, deleteBOM,
  lookupItems, lookupWarehouses, lookupPriceLists,
  lookupDistributionRules, lookupProjects, lookupGLAccounts,
  getItemDetails,
};
