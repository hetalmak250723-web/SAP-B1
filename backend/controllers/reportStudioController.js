const reportStudioService = require('../services/reportStudioService');

const getErrorMessage = (error, fallbackMessage) =>
  error?.response?.data?.message ||
  error?.response?.data?.detail ||
  error?.message ||
  fallbackMessage;

const listReportMenus = async (req, res, next) => {
  try {
    const data = await reportStudioService.listReportMenus(req.auth);
    res.json(data);
  } catch (error) {
    next(error);
  }
};

const listAuthorizedReportCodes = async (req, res) => {
  try {
    const data = await reportStudioService.listAuthorizedReportCodes(req.auth, req.query.query || '');
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: getErrorMessage(error, 'Failed to load report codes.'),
      detail: getErrorMessage(error, 'Failed to load report codes.'),
    });
  }
};

const getReportCodeParameters = async (req, res) => {
  try {
    const data = await reportStudioService.listReportCodeParameters(req.auth, req.params.code || '');
    res.json(data);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: getErrorMessage(error, 'Failed to load report parameters.'),
      detail: getErrorMessage(error, 'Failed to load report parameters.'),
    });
  }
};

const createReportMenu = async (req, res, next) => {
  try {
    const data = await reportStudioService.createReportMenu(req.body || {}, req.auth);
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
};

const createReport = async (req, res, next) => {
  try {
    const data = await reportStudioService.createReport(req.body || {}, req.auth);
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
};

const addReportParameter = async (req, res, next) => {
  try {
    const data = await reportStudioService.addReportParameter(req.body || {}, req.auth);
    res.status(201).json(data);
  } catch (error) {
    next(error);
  }
};

const getReportById = async (req, res, next) => {
  try {
    const data = await reportStudioService.getReportById(Number(req.params.id), req.auth);
    res.json(data);
  } catch (error) {
    next(error);
  }
};

const runReport = async (req, res) => {
  try {
    const data = await reportStudioService.runReport(req.body || {}, req.auth, req.headers.authorization || '');
    res.json(data);
  } catch (error) {
    const response = {
      message: getErrorMessage(error, 'Failed to run report.'),
      detail: getErrorMessage(error, 'Failed to run report.'),
    };

    if (error?.diagnostics) {
      response.diagnostics = error.diagnostics;
    }

    res.status(error.statusCode || 500).json(response);
  }
};

module.exports = {
  listReportMenus,
  listAuthorizedReportCodes,
  getReportCodeParameters,
  createReportMenu,
  createReport,
  addReportParameter,
  getReportById,
  runReport,
};
