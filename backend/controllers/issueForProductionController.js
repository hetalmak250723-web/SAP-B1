const svc = require('../services/issueForProductionService');

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
    console.error('[IssueForProd] refData:', e.response?.data || e.message);
    res.status(500).json(errPayload(e));
  }
};

const getProductionOrderForIssue = async (req, res) => {
  try {
    res.json(await svc.getProductionOrderForIssue(req.params.docEntry));
  } catch (e) {
    console.error('[IssueForProd] getPO:', e.response?.data || e.message);
    res.status(e.response?.status || 400).json(errPayload(e));
  }
};

const getIssueList = async (req, res) => {
  try {
    res.json(await svc.getIssueList(req.query));
  } catch (e) {
    console.error('[IssueForProd] list:', e.response?.data || e.message);
    res.status(500).json(errPayload(e));
  }
};

const getIssueByDocEntry = async (req, res) => {
  try {
    res.json(await svc.getIssueByDocEntry(req.params.docEntry));
  } catch (e) {
    console.error('[IssueForProd] get:', e.response?.data || e.message);
    res.status(e.response?.status || 500).json(errPayload(e));
  }
};

const createIssue = async (req, res) => {
  try {
    const result = await svc.createIssue(req.body);
    res.status(201).json(result);
  } catch (e) {
    console.error('[IssueForProd] create:', e.response?.data || e.message);
    res.status(e.response?.status || 400).json(errPayload(e));
  }
};

const lookupProductionOrders = async (req, res) => {
  try {
    const data = await svc.lookupProductionOrders(req.query.query || '');
    res.json(data);
  } catch (e) {
    console.error('[IssueForProd] lookupPO error:', e.response?.data || e.message);
    res.status(500).json(errPayload(e));
  }
};

module.exports = {
  getReferenceData,
  getProductionOrderForIssue,
  getIssueList,
  getIssueByDocEntry,
  createIssue,
  lookupProductionOrders,
};
