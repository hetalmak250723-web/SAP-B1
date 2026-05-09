const sapService = require("../services/sapService");
const masterDataDbService = require("../services/masterDataDbService");

// ── List BOMs ─────────────────────────────────────────────────────────────────
const listBOMs = async (req, res) => {
  try {
    const { query = "", top = 50, skip = 0 } = req.query;
    const rows = await masterDataDbService.listBOMs(query, top, skip);
    res.json(rows);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

// ── Get single BOM ────────────────────────────────────────────────────────────
const getBOM = async (req, res) => {
  try {
    const code = req.params.treeCode;
    const row = await masterDataDbService.getBOM(code);
    if (!row) {
      return res.status(404).json({ message: `BOM "${code}" not found.` });
    }
    res.json(row);
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
    const q = req.query.query || "";
    const top = req.query.top || 1000;
    const headerLookup = String(req.query.headerLookup || "").toLowerCase() === "true";
    const rows = await masterDataDbService.lookupBOMItems(q, top, headerLookup);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupWarehouses = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupBOMWarehouses();
    res.json(rows);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupPriceLists = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupBOMPriceLists();
    res.json(rows);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupDistributionRules = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupDistributionRules();
    res.json(rows);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupProjects = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupProjects();
    res.json(rows);
  } catch (err) { res.status(500).json({ message: _sapMsg(err) }); }
};

const lookupGLAccounts = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupGLAccounts(req.query.query || "", 50);
    res.json(rows);
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
    const itemCode = req.params.itemCode;
    const item = await masterDataDbService.getBOMItemDetails(itemCode);
    if (!item) {
      return res.status(404).json({ message: `Item "${itemCode}" not found.` });
    }
    res.json(item);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

// ── Get Item Price for specific Price List ───────────────────────────────────
const getItemPrice = async (req, res) => {
  try {
    const itemCode = req.params.itemCode;
    const priceList = req.query.priceList;
    
    if (!priceList) {
      return res.status(400).json({ message: "Price list parameter is required." });
    }
    
    const price = await masterDataDbService.getItemPriceForPriceList(itemCode, priceList);
    res.json(price);
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: _sapMsg(err) });
  }
};

module.exports = {
  listBOMs, getBOM, createBOM, updateBOM, deleteBOM,
  lookupItems, lookupWarehouses, lookupPriceLists,
  lookupDistributionRules, lookupProjects, lookupGLAccounts,
  getItemDetails, getItemPrice,
};
