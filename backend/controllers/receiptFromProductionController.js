const svc = require('../services/receiptFromProductionService');

const errPayload = (error) => ({
  detail:
    error.response?.data?.error?.message?.value ||
    error.response?.data?.error?.message ||
    error.response?.data ||
    error.message ||
    'Unknown error',
});

const getReferenceData = async (req, res) => {
  try {
    res.json(await svc.getReferenceData());
  } catch (e) {
    console.error('[ReceiptFromProd] refData:', e.response?.data || e.message);
    res.status(500).json(errPayload(e));
  }
};

const getProductionOrderForReceipt = async (req, res) => {
  try {
    res.json(await svc.getProductionOrderForReceipt(req.params.docEntry));
  } catch (e) {
    console.error('[ReceiptFromProd] getPO:', e.response?.data || e.message);
    res.status(e.response?.status || 400).json(errPayload(e));
  }
};

const getReceiptList = async (req, res) => {
  try {
    res.json(await svc.getReceiptList(req.query));
  } catch (e) {
    console.error('[ReceiptFromProd] list:', e.response?.data || e.message);
    res.status(500).json(errPayload(e));
  }
};

const getReceiptByDocEntry = async (req, res) => {
  try {
    res.json(await svc.getReceiptByDocEntry(req.params.docEntry));
  } catch (e) {
    console.error('[ReceiptFromProd] get:', e.response?.data || e.message);
    res.status(e.response?.status || 500).json(errPayload(e));
  }
};

const createReceipt = async (req, res) => {
  try {
    const result = await svc.createReceipt(req.body);
    res.status(201).json(result);
  } catch (e) {
    console.error('[ReceiptFromProd] create:', e.response?.data || e.message);
    res.status(e.response?.status || 400).json(errPayload(e));
  }
};

const lookupProductionOrders = async (req, res) => {
  try {
    const data = await svc.lookupProductionOrders(req.query.query || '');
    res.json(data);
  } catch (e) {
    console.error('[ReceiptFromProd] lookupPO error:', e.response?.data || e.message);
    res.status(500).json(errPayload(e));
  }
};

module.exports = {
  getReferenceData,
  getProductionOrderForReceipt,
  getReceiptList,
  getReceiptByDocEntry,
  createReceipt,
  lookupProductionOrders,
};
