const itemService = require("../services/itemService");
const hsnCodeDbService = require("../services/hsnCodeDbService");
const path = require("path");
const fs   = require("fs");

// ── CRUD ──────────────────────────────────────────────────────────────────────

const normalizeGSTChapterID = async (data) => {
  if (!Object.prototype.hasOwnProperty.call(data, "ChapterID")) {
    return { ok: true };
  }

  const rawChapterID = String(data.ChapterID ?? "").trim();
  if (!rawChapterID || rawChapterID === "-1") {
    data.ChapterID = "";
    return { ok: true };
  }

  const absEntry = await hsnCodeDbService.resolveHSNCodeToAbsEntry(rawChapterID);
  if (absEntry == null) {
    return {
      ok: false,
      message: "Invalid HSN/SAC Code. Select a valid code from the list.",
    };
  }

  data.ChapterID = absEntry;
  return { ok: true };
};

const createItem = async (req, res) => {
  const data = req.body;

  const hsnNormalization = await normalizeGSTChapterID(data);
  if (!hsnNormalization.ok) {
    return res.status(400).json({ message: hsnNormalization.message });
  }
  
  // === Basic Required Fields ===
  if (!data.ItemCode || !data.ItemCode.trim()) {
    return res.status(400).json({ message: "ItemCode is required." });
  }
  if (!data.ItemName || !data.ItemName.trim()) {
    return res.status(400).json({ message: "ItemName is required." });
  }
  
  // === SAP B1 Mandatory Fields ===
  if (!data.ItemsGroupCode || data.ItemsGroupCode === "") {
    return res.status(400).json({ message: "Item Group is required." });
  }
  
  // UoM Group validation - required for inventory items
  if (data.InventoryItem === 'tYES' && (!data.UoMGroupEntry || data.UoMGroupEntry === "")) {
    return res.status(400).json({ message: "UoM Group is required for inventory items." });
  }
  
  // Tax Code validations
  if (data.VatLiable === 'tYES') {
    if (!data.ArTaxCode || data.ArTaxCode === "") {
      return res.status(400).json({ message: "AR Tax Code is required when VAT liable." });
    }
  }
  
  // Sales Item validations - ItemPrices collection is used instead of a single PriceListNum field
  // The UI Price List selection is handled via ItemPrices collection
  
  // Purchase Item validations
  if (data.PurchaseItem === 'tYES') {
    // Preferred vendor is recommended but not mandatory
    if (data.Mainsupplier && data.Mainsupplier.trim() === "") {
      data.Mainsupplier = ""; // Clear empty values
    }
  }
  
  // Inventory Item validations
  if (data.InventoryItem === 'tYES') {
    if (!data.DefaultWarehouse || data.DefaultWarehouse === "") {
      return res.status(400).json({ message: "Default Warehouse is required for inventory items." });
    }
  }
  
  // Asset Item validations
  if (data.AssetItem === 'tYES') {
    if (!data.IncomeAccount || data.IncomeAccount === "") {
      return res.status(400).json({ message: "Income Account is required for asset items." });
    }
  }
  
  // === GST Validations ===
  if (data.GSTRelevnt === 'tYES') {
    const chapterID = String(data.ChapterID || "").trim();
    if (!chapterID || chapterID === "" || chapterID === "-1") {
      return res.status(400).json({ message: "HSN/SAC Code is required when GST is enabled." });
    }
    if (!data.GSTTaxCategory || data.GSTTaxCategory === "") {
      return res.status(400).json({ message: "GST Tax Category is required when GST is enabled." });
    }
  }
  
  // === Item Type and Class Validation ===
  if (data.ItemType === 'itItems' && !data.ItemClass) {
    data.ItemClass = 'itcMaterial'; // Default for material items
  }
  
  // === Date Range Validations ===
  if (data.ValidFrom && data.ValidTo) {
    const validFrom = new Date(data.ValidFrom);
    const validTo = new Date(data.ValidTo);
    if (validFrom > validTo) {
      return res.status(400).json({ message: "Valid From date cannot be after Valid To date." });
    }
  }
  
  if (data.FrozenFrom && data.FrozenTo) {
    const frozenFrom = new Date(data.FrozenFrom);
    const frozenTo = new Date(data.FrozenTo);
    if (frozenFrom > frozenTo) {
      return res.status(400).json({ message: "Frozen From date cannot be after Frozen To date." });
    }
  }
  
  // === Numeric Range Validations ===
  const validatePositiveNumber = (value, fieldName) => {
    if (value !== undefined && value !== "" && (isNaN(value) || parseFloat(value) < 0)) {
      return res.status(400).json({ message: `${fieldName} must be a positive number.` });
    }
  };
  
  validatePositiveNumber(data.CommissionPercent, "Commission Percent");
  validatePositiveNumber(data.MinInventory, "Minimum Inventory");
  validatePositiveNumber(data.MaxInventory, "Maximum Inventory");
  validatePositiveNumber(data.DesiredInventory, "Desired Inventory");
  validatePositiveNumber(data.OrderMultiple, "Order Multiple");
  validatePositiveNumber(data.MinOrderQuantity, "Minimum Order Quantity");
  
  // === UoM Consistency Validation ===
  const validateUoMConsistency = () => {
    const purchasingUoM = data.DefaultPurchasingUoMEntry;
    const salesUoM = data.DefaultSalesUoMEntry;
    const inventoryUoM = data.InventoryUoMEntry;
    
    if (purchasingUoM && salesUoM && purchasingUoM !== salesUoM) {
      // Warning only - different UoMs are allowed but should be intentional
      console.warn(`[Item Validation] Purchasing UoM (${purchasingUoM}) differs from Sales UoM (${salesUoM})`);
    }
  };
  validateUoMConsistency();
  
  // === Validate Manage Item By configuration ===
  const manageItemBy = data.ManageItemBy || "None";
  
  if (manageItemBy === "Serial") {
    if (!data.SerialGenerationType) {
      return res.status(400).json({ message: "Serial Generation Type is required for serial items." });
    }
    if (data.SerialGenerationType === "Auto") {
      if (!data.SerialNumberLength || isNaN(data.SerialNumberLength) || parseInt(data.SerialNumberLength) <= 0) {
        return res.status(400).json({ message: "Serial Number Length is required and must be a positive number for auto-generated serials." });
      }
      if (!data.StartingSerialNumber || data.StartingSerialNumber.trim() === "") {
        return res.status(400).json({ message: "Starting Serial Number is required for auto-generated serials." });
      }
    }
  }
  
  if (manageItemBy === "Batch") {
    if (!data.BatchGenerationType) {
      return res.status(400).json({ message: "Batch Generation Type is required for batch items." });
    }
    if (data.BatchGenerationType === "Auto" && (!data.BatchNumberPrefix || data.BatchNumberPrefix.trim() === "")) {
      return res.status(400).json({ message: "Batch Number Prefix is required for auto-generated batches." });
    }
  }
  
  // === Item Code Format Validation ===
  const validateItemCodeFormat = () => {
    const itemCode = data.ItemCode.trim();
    
    // Check for valid characters (alphanumeric, hyphens, underscores)
    if (!/^[a-zA-Z0-9\-_]+$/.test(itemCode)) {
      return res.status(400).json({ message: "Item Code can only contain letters, numbers, hyphens, and underscores." });
    }
    
    // Check minimum length
    if (itemCode.length < 3) {
      return res.status(400).json({ message: "Item Code must be at least 3 characters long." });
    }
    
    // Check maximum length
    if (itemCode.length > 50) {
      return res.status(400).json({ message: "Item Code cannot exceed 50 characters." });
    }
  };
  validateItemCodeFormat();
  
  try {
    const result = await itemService.createItem(data);
    res.status(201).json(result);
  } catch (err) {
    const sapError = err.response?.data?.error?.message?.value
      || err.response?.data?.error?.message
      || err.message;
    const isHangUp = err.code === "ECONNRESET" || err.code === "EPIPE" || err.message?.includes("socket hang up");
    console.error("[SAP createItem error]", sapError, JSON.stringify(err.response?.data));
    res.status(err.response?.status || (isHangUp ? 502 : 500)).json({
      message: isHangUp
        ? "SAP server closed the connection. The payload may contain an invalid field value. Check server logs."
        : sapError,
    });
  }
};

const generateItemCode = async (req, res) => {
  try {
    const { prefix } = req.query;
    if (!prefix || prefix === "Manual") {
      return res.json({ itemCode: "" });
    }

    res.json(await itemService.generateItemCode(prefix));
  } catch (err) {
    const msg = err.response?.data?.error?.message?.value || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

const checkItemCodeExists = async (req, res) => {
  const { itemCode } = req.params;
  try {
    res.json(await itemService.checkItemCodeExists(itemCode));
  } catch (err) {
    const msg = err.response?.data?.error?.message?.value || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

const getItem = async (req, res) => {
  try {
    res.json(await itemService.getItem(req.params.itemCode));
  } catch (err) {
    const sapError = err.response?.data?.error?.message?.value
      || err.response?.data?.error?.message
      || err.message;
    res.status(err.response?.status || 500).json({ message: sapError });
  }
};

const updateItem = async (req, res) => {
  const { itemCode } = req.params;
  const data = req.body;

  const hsnNormalization = await normalizeGSTChapterID(data);
  if (!hsnNormalization.ok) {
    return res.status(400).json({ message: hsnNormalization.message });
  }
  
  // === Basic Required Fields ===
  if (!data.ItemName || !data.ItemName.trim()) {
    return res.status(400).json({ message: "ItemName is required." });
  }
  
  // === SAP B1 Mandatory Fields ===
  if (data.ItemsGroupCode !== undefined && data.ItemsGroupCode === "") {
    return res.status(400).json({ message: "Item Group cannot be empty." });
  }
  
  // UoM Group validation - required for inventory items
  if (data.InventoryItem === 'tYES' && data.UoMGroupEntry !== undefined && data.UoMGroupEntry === "") {
    return res.status(400).json({ message: "UoM Group is required for inventory items." });
  }
  
  // Tax Code validations
  if (data.VatLiable === 'tYES') {
    if (data.ArTaxCode !== undefined && data.ArTaxCode === "") {
      return res.status(400).json({ message: "AR Tax Code is required when VAT liable." });
    }
  }
  
  // Sales Item validations - ItemPrices collection is used instead of a single PriceListNum field
  // The UI Price List selection is handled via ItemPrices collection
  
  // Inventory Item validations
  if (data.InventoryItem === 'tYES') {
    if (data.DefaultWarehouse !== undefined && data.DefaultWarehouse === "") {
      return res.status(400).json({ message: "Default Warehouse is required for inventory items." });
    }
  }
  
  // Asset Item validations
  if (data.AssetItem === 'tYES') {
    if (data.IncomeAccount !== undefined && data.IncomeAccount === "") {
      return res.status(400).json({ message: "Income Account is required for asset items." });
    }
  }
  
  // === GST Validations ===
  if (data.GSTRelevnt === 'tYES') {
    if (data.ChapterID !== undefined) {
      const chapterID = String(data.ChapterID || "").trim();
      if (chapterID === "" || chapterID === "-1") {
        return res.status(400).json({ message: "HSN/SAC Code is required when GST is enabled." });
      }
    }
    if (data.GSTTaxCategory !== undefined && data.GSTTaxCategory === "") {
      return res.status(400).json({ message: "GST Tax Category is required when GST is enabled." });
    }
  }
  
  // === Date Range Validations ===
  if (data.ValidFrom && data.ValidTo) {
    const validFrom = new Date(data.ValidFrom);
    const validTo = new Date(data.ValidTo);
    if (validFrom > validTo) {
      return res.status(400).json({ message: "Valid From date cannot be after Valid To date." });
    }
  }
  
  if (data.FrozenFrom && data.FrozenTo) {
    const frozenFrom = new Date(data.FrozenFrom);
    const frozenTo = new Date(data.FrozenTo);
    if (frozenFrom > frozenTo) {
      return res.status(400).json({ message: "Frozen From date cannot be after Frozen To date." });
    }
  }
  
  // === Numeric Range Validations ===
  const validatePositiveNumber = (value, fieldName) => {
    if (value !== undefined && value !== "" && (isNaN(value) || parseFloat(value) < 0)) {
      return res.status(400).json({ message: `${fieldName} must be a positive number.` });
    }
  };
  
  validatePositiveNumber(data.CommissionPercent, "Commission Percent");
  validatePositiveNumber(data.MinInventory, "Minimum Inventory");
  validatePositiveNumber(data.MaxInventory, "Maximum Inventory");
  validatePositiveNumber(data.DesiredInventory, "Desired Inventory");
  validatePositiveNumber(data.OrderMultiple, "Order Multiple");
  validatePositiveNumber(data.MinOrderQuantity, "Minimum Order Quantity");
  
  // === UoM Consistency Validation ===
  const validateUoMConsistency = () => {
    const purchasingUoM = data.DefaultPurchasingUoMEntry;
    const salesUoM = data.DefaultSalesUoMEntry;
    const inventoryUoM = data.InventoryUoMEntry;
    
    if (purchasingUoM && salesUoM && purchasingUoM !== salesUoM) {
      // Warning only - different UoMs are allowed but should be intentional
      console.warn(`[Item Validation] Purchasing UoM (${purchasingUoM}) differs from Sales UoM (${salesUoM})`);
    }
  };
  validateUoMConsistency();
  
  // === Validate Manage Item By configuration ===
  const manageItemBy = data.ManageItemBy || "None";
  
  if (manageItemBy === "Serial") {
    if (!data.SerialGenerationType) {
      return res.status(400).json({ message: "Serial Generation Type is required for serial items." });
    }
    if (data.SerialGenerationType === "Auto") {
      if (!data.SerialNumberLength || isNaN(data.SerialNumberLength) || parseInt(data.SerialNumberLength) <= 0) {
        return res.status(400).json({ message: "Serial Number Length is required and must be a positive number for auto-generated serials." });
      }
      if (!data.StartingSerialNumber || data.StartingSerialNumber.trim() === "") {
        return res.status(400).json({ message: "Starting Serial Number is required for auto-generated serials." });
      }
    }
  }
  
  if (manageItemBy === "Batch") {
    if (!data.BatchGenerationType) {
      return res.status(400).json({ message: "Batch Generation Type is required for batch items." });
    }
    if (data.BatchGenerationType === "Auto" && (!data.BatchNumberPrefix || data.BatchNumberPrefix.trim() === "")) {
      return res.status(400).json({ message: "Batch Number Prefix is required for auto-generated batches." });
    }
  }
  
  try {
    const result = await itemService.updateItem(itemCode, data);
    res.json(result);
  } catch (err) {
    const sapError = err.response?.data?.error?.message?.value
      || err.response?.data?.error?.message
      || err.message;
    const isHangUp = err.code === "ECONNRESET" || err.code === "EPIPE" || err.message?.includes("socket hang up");
    console.error("[SAP updateItem error]", sapError, JSON.stringify(err.response?.data));
    res.status(err.response?.status || (isHangUp ? 502 : 500)).json({
      message: isHangUp
        ? "SAP server closed the connection. The payload may contain an invalid field value. Check server logs."
        : sapError,
    });
  }
};

const searchItems = async (req, res) => {
  try {
    const { query = "", top = 50, skip = 0 } = req.query;
    res.json(await itemService.searchItems(query, Number(top), Number(skip)));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Search failed." });
  }
};

const getRecentItemCodes = async (req, res) => {
  try {
    res.json(await itemService.getRecentItemCodes(req.query.query || ""));
  } catch (err) {
    const msg = err.response?.data?.error?.message?.value || err.message;
    console.error("[Item getRecentItemCodes error]", msg);
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

// ── Prices ────────────────────────────────────────────────────────────────────

const getItemPrices = async (req, res) => {
  try {
    res.json(await itemService.getItemPrices(req.params.itemCode));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load prices." });
  }
};

// ── Warehouse stock ───────────────────────────────────────────────────────────

const getItemStock = async (req, res) => {
  try {
    res.json(await itemService.getItemStock(req.params.itemCode));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load stock." });
  }
};

// ── Lookup endpoints ──────────────────────────────────────────────────────────

const lookupItemGroups = async (req, res) => {
  try {
    res.json(await itemService.getItemGroups(req.query.query || ""));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load item groups." });
  }
};

const lookupHSNCodes = async (req, res) => {
  try {
    res.json(await itemService.getHSNCodes(req.query.query || ""));
  } catch (err) {
    console.error('[HSN Lookup Global Error]', err.message);
    res.json([]);
  }
};

const createItemGroup = async (req, res) => {
  try {
    const data = req.body;
    if (!data.GroupName) return res.status(400).json({ message: "Group Name is required." });

    res.json(await itemService.createItemGroup(data));
  } catch (err) {
    const sapError = err.response?.data?.error?.message?.value
      || err.response?.data?.error?.message
      || err.message;
    res.status(err.response?.status || 500).json({ message: sapError });
  }
};

const lookupManufacturers = async (req, res) => {
  try {
    res.json(await itemService.getManufacturers(req.query.query || ""));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load manufacturers." });
  }
};

const createManufacturer = async (req, res) => {
  try {
    const { ManufacturerName } = req.body;
    console.log('[Controller] Creating manufacturer:', ManufacturerName);
    if (!ManufacturerName) return res.status(400).json({ message: "Manufacturer Name is required." });
    const result = await itemService.createManufacturer({ ManufacturerName });
    console.log('[Controller] SAP response:', result);
    res.json(result);
  } catch (err) {
    const sapError = err.response?.data?.error?.message?.value
      || err.response?.data?.error?.message
      || err.message;
    console.error('[Controller] Error creating manufacturer:', sapError);
    if (err.response) {
      console.error('[Controller] SAP Error Body:', JSON.stringify(err.response.data));
    }
    res.status(err.response?.status || 500).json({ message: sapError });
  }
};

const lookupPriceLists = async (req, res) => {
  try {
    res.json(await itemService.getPriceLists(req.query.query || ""));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load price lists." });
  }
};

const lookupVendors = async (req, res) => {
  try {
    res.json(await itemService.getVendors(req.query.query || ""));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load vendors." });
  }
};

const lookupWarehouses = async (req, res) => {
  try {
    console.log('Warehouse lookup called with query:', req.query.query);
    const warehouses = await itemService.getWarehouses(req.query.query || "");
    console.log('Warehouses found:', warehouses);
    res.json(warehouses);
  } catch (error) {
    console.error('Error in lookupWarehouses:', error);
    res.status(500).json({ error: 'Failed to fetch warehouses' });
  }
};

const lookupGLAccounts = async (req, res) => {
  try {
    res.json(await itemService.getGLAccounts(req.query.query || ""));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load G/L accounts." });
  }
};

// ── Item Properties (QryGroup names from SAP ItemProperties) ─────────────────

const lookupUoMGroups = async (req, res) => {
  try {
    res.json(await itemService.getUoMGroups(req.query.query || ""));
  } catch (err) {
    res.status(err.response?.status || 500).json({ message: err.message || "Failed to load UoM groups." });
  }
};

const lookupItemProperties = async (req, res) => {
  try {
    res.json(await itemService.getItemProperties());
  } catch (err) {
    const sapError = err.response?.data?.error?.message?.value
      || err.response?.data?.error?.message
      || err.message;
    res.status(err.response?.status || 500).json({ message: sapError });
  }
};

// ── Item Code Prefixes ────────────────────────────────────────────────────────
const lookupItemCodePrefixes = async (req, res) => {
  try {
    const prefixes = await itemService.getItemCodePrefixes();
    res.json(prefixes);
  } catch (err) {
    const msg = err.response?.data?.error?.message?.value || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

// ── Attachments ───────────────────────────────────────────────────────────────

const UPLOAD_DIR = path.join(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const getAttachments = async (req, res) => {
  const { itemCode } = req.params;
  const dir = path.join(UPLOAD_DIR, itemCode);
  if (!fs.existsSync(dir)) return res.json([]);
  const files = fs.readdirSync(dir).map((f) => {
    const stat = fs.statSync(path.join(dir, f));
    return { id: f, name: f, size: stat.size, type: path.extname(f).slice(1).toUpperCase(), url: `/api/items/${itemCode}/attachments/${f}` };
  });
  res.json(files);
};

const uploadAttachment = async (req, res) => {
  const { itemCode } = req.params;
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  const dir = path.join(UPLOAD_DIR, itemCode);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, req.file.originalname);
  fs.renameSync(req.file.path, dest);
  res.json({ id: req.file.originalname, name: req.file.originalname, size: req.file.size });
};

const deleteAttachment = async (req, res) => {
  const { itemCode, attachmentId } = req.params;
  const filePath = path.join(UPLOAD_DIR, itemCode, attachmentId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ success: true });
};

const serveAttachment = (req, res) => {
  const { itemCode, attachmentId } = req.params;
  const filePath = path.join(UPLOAD_DIR, itemCode, attachmentId);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: "File not found." });
  res.download(filePath);
};

module.exports = {
  createItem, getItem, updateItem, searchItems, getRecentItemCodes,
  generateItemCode, checkItemCodeExists,
  getItemPrices, getItemStock,
  lookupItemGroups, createItemGroup, lookupManufacturers, createManufacturer, lookupPriceLists, lookupVendors, lookupWarehouses, lookupGLAccounts,
  lookupHSNCodes,
  lookupUoMGroups, lookupItemProperties, lookupItemCodePrefixes,
  getAttachments, uploadAttachment, deleteAttachment, serveAttachment,
};