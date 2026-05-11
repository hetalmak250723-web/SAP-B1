const sapService = require('./sapService');
const itemDbService = require('./itemDbService');

const extractSapError = (error, fallback) =>
  error.response?.data?.error?.message?.value ||
  error.response?.data?.error?.message ||
  error.response?.data?.detail ||
  error.message ||
  fallback;

const createItem = async (payload) => {
  try {
    const response = await sapService.request({
      method: 'POST',
      url: '/Items',
      data: payload,
    });

    return response.data;
  } catch (error) {
    const detail = extractSapError(error, 'Failed to create item.');
    const sapError = new Error(detail);
    sapError.response = error.response;
    sapError.code = error.code;
    throw sapError;
  }
};

const updateItem = async (itemCode, payload) => {
  try {
    await sapService.request({
      method: 'PATCH',
      url: `/Items('${encodeURIComponent(itemCode)}')`,
      data: payload,
    });

    return itemDbService.getItem(itemCode);
  } catch (error) {
    const detail = extractSapError(error, 'Failed to update item.');
    const sapError = new Error(detail);
    sapError.response = error.response;
    sapError.code = error.code;
    throw sapError;
  }
};

const createItemGroup = async (payload) => {
  const sapPayload = {
    GroupName: payload.GroupName,
    DefaultUoMGroup:
      payload.DefaultUoMGroup != null && payload.DefaultUoMGroup !== ''
        ? Number(payload.DefaultUoMGroup)
        : undefined,
    PlanningSystem: payload.PlanningSystem || 'bop_None',
    ProcurementMethod: payload.ProcurementMethod || 'bom_Buy',
    OrderIntervals:
      payload.OrderIntervals != null && payload.OrderIntervals !== ''
        ? Number(payload.OrderIntervals)
        : undefined,
    OrderMultiple:
      payload.OrderMultiple != null && payload.OrderMultiple !== ''
        ? Number(payload.OrderMultiple)
        : undefined,
    MinimumOrderQuantity:
      payload.MinimumOrderQuantity != null && payload.MinimumOrderQuantity !== ''
        ? Number(payload.MinimumOrderQuantity)
        : undefined,
    LeadTime:
      payload.LeadTime != null && payload.LeadTime !== ''
        ? Number(payload.LeadTime)
        : undefined,
    ToleranceDays:
      payload.ToleranceDays != null && payload.ToleranceDays !== ''
        ? Number(payload.ToleranceDays)
        : undefined,
    InventorySystem: payload.InventorySystem || 'bis_MovingAverage',
    ItemClass: payload.ItemClass || 'itcMaterial',
  };

  try {
    const response = await sapService.request({
      method: 'POST',
      url: '/ItemGroups',
      data: sapPayload,
    });

    return {
      code: String(response.data.Number),
      name: response.data.GroupName,
    };
  } catch (error) {
    const detail = extractSapError(error, 'Failed to create item group.');
    const sapError = new Error(detail);
    sapError.response = error.response;
    throw sapError;
  }
};

const createManufacturer = async ({ ManufacturerName }) => {
  try {
    const response = await sapService.request({
      method: 'POST',
      url: '/Manufacturers',
      data: { ManufacturerName },
    });

    return {
      code: String(response.data.Code || response.data.ManufacturerCode || ''),
      name: response.data.ManufacturerName || ManufacturerName,
    };
  } catch (error) {
    const detail = extractSapError(error, 'Failed to create manufacturer.');
    const sapError = new Error(detail);
    sapError.response = error.response;
    throw sapError;
  }
};

module.exports = {
  createItem,
  updateItem,
  createItemGroup,
  createManufacturer,
  getItem: itemDbService.getItem,
  searchItems: itemDbService.searchItems,
  getRecentItemCodes: itemDbService.getRecentItemCodes,
  generateItemCode: itemDbService.generateItemCode,
  getItemCodePrefixes: itemDbService.getItemCodePrefixes,
  checkItemCodeExists: itemDbService.checkItemCodeExists,
  getItemPrices: itemDbService.getItemPrices,
  getItemStock: itemDbService.getItemStock,
  getItemGroups: itemDbService.getItemGroups,
  getManufacturers: itemDbService.getManufacturers,
  getHSNCodes: itemDbService.getHSNCodes,
  getPriceLists: itemDbService.getPriceLists,
  getVendors: itemDbService.getVendors,
  getWarehouses: itemDbService.getWarehouses,
  getGLAccounts: itemDbService.getGLAccounts,
  getUoMGroups: itemDbService.getUoMGroups,
  getItemProperties: itemDbService.getItemProperties,
};