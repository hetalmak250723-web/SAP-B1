const productionOrderService = require('../services/productionOrderService');
const productionDbService = require('../services/productionDbService');

const getErrorPayload = (error) => ({
  detail:
    error.response?.data?.error?.message?.value ||
    error.response?.data?.error?.message ||
    error.response?.data ||
    error.message ||
    'Unknown error',
});

const getReferenceData = async (req, res) => {
  try {
    const data = await productionDbService.getProductionOrderReferenceData();
    res.json(data);
  } catch (error) {
    console.error('[ProdOrder] getReferenceData:', error.response?.data || error.message);
    res.status(500).json(getErrorPayload(error));
  }
};

const getProductionOrders = async (req, res) => {
  try {
    const data = await productionDbService.getProductionOrders(req.query);
    res.json(data);
  } catch (error) {
    console.error('[ProdOrder] list:', error.response?.data || error.message);
    res.status(500).json(getErrorPayload(error));
  }
};

const getProductionOrderByDocEntry = async (req, res) => {
  try {
    const data = await productionDbService.getProductionOrderByDocEntry(req.params.docEntry);
    res.json(data);
  } catch (error) {
    console.error('[ProdOrder] get:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(getErrorPayload(error));
  }
};

const createProductionOrder = async (req, res) => {
  try {
    const result = await productionOrderService.createProductionOrder(req.body);
    res.status(201).json(result);
  } catch (error) {
    console.error('[ProdOrder] create:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(getErrorPayload(error));
  }
};

const updateProductionOrder = async (req, res) => {
  try {
    const result = await productionOrderService.updateProductionOrder(req.params.docEntry, req.body);
    res.json(result);
  } catch (error) {
    console.error('[ProdOrder] update:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(getErrorPayload(error));
  }
};

const closeProductionOrder = async (req, res) => {
  try {
    const result = await productionOrderService.closeProductionOrder(req.params.docEntry);
    res.json(result);
  } catch (error) {
    console.error('[ProdOrder] close:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(getErrorPayload(error));
  }
};

const releaseProductionOrder = async (req, res) => {
  try {
    const result = await productionOrderService.releaseProductionOrder(req.params.docEntry);
    res.json(result);
  } catch (error) {
    console.error('[ProdOrder] release:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(getErrorPayload(error));
  }
};

const explodeBOM = async (req, res) => {
  try {
    const data = await productionDbService.explodeBOM(req.params.itemCode, req.query.qty);
    res.json(data);
  } catch (error) {
    console.error('[ProdOrder] explodeBOM:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json(getErrorPayload(error));
  }
};

const lookupItems = async (req, res) => {
  try {
    const data = await productionDbService.lookupProductionOrderItems(req.query.query || '');
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupComponentItems = async (req, res) => {
  try {
    const data = await productionDbService.lookupComponentItems(req.query.query || '');
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupResources = async (req, res) => {
  try {
    const data = await productionDbService.lookupResources(req.query.query || '');
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupRouteStages = async (req, res) => {
  try {
    const data = await productionDbService.lookupRouteStages(req.query.query || '');
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupWarehouses = async (req, res) => {
  try {
    const data = await productionDbService.lookupProdWarehouses();
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupDistributionRules = async (req, res) => {
  try {
    const data = await productionDbService.lookupDistributionRules();
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupProjects = async (req, res) => {
  try {
    const data = await productionDbService.lookupProjects();
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupBranches = async (req, res) => {
  try {
    const data = await productionDbService.lookupBranches();
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

const lookupCustomers = async (req, res) => {
  try {
    const data = await productionDbService.lookupCustomers(req.query.query || '');
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error));
  }
};

module.exports = {
  getReferenceData,
  getProductionOrders,
  getProductionOrderByDocEntry,
  createProductionOrder,
  updateProductionOrder,
  releaseProductionOrder,
  closeProductionOrder,
  explodeBOM,
  lookupItems,
  lookupComponentItems,
  lookupResources,
  lookupRouteStages,
  lookupWarehouses,
  lookupDistributionRules,
  lookupProjects,
  lookupBranches,
  lookupCustomers,
};
