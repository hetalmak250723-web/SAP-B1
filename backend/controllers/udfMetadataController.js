const udfMetadataService = require('../services/udfMetadataService');

const getErrorPayload = (error, fallbackMessage) => ({
  detail: error.message || fallbackMessage,
});

const getMarketingDocumentUdfs = async (req, res) => {
  try {
    const data = await udfMetadataService.getMarketingDocumentUdfs({
      documentType: req.params.documentType,
      auth: req.auth,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json(getErrorPayload(error, 'Failed to load UDF metadata.'));
  }
};

module.exports = {
  getMarketingDocumentUdfs,
};
