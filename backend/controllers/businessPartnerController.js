const sapService = require("../services/sapService");
const masterDataDbService = require("../services/masterDataDbService");
const authDbService = require("../services/authDbService");
const businessPartnerDbService = require("../services/businessPartnerDbService");

const enrichBP = async (bp) => {
  if (!bp || !bp.CardCode) return bp;

  const [
    paymentTerms,
    priceList,
    creditCard,
    bank,
    country,
    fatherBP,
    linkedVendorBP,
    debitorAccount,
    downPaymentClearAccount,
    downPaymentInterimAccount,
    withholdingTaxCode,
  ] = await Promise.all([
    bp.PayTermsGrpCode != null && bp.PayTermsGrpCode !== "" && Number(bp.PayTermsGrpCode) >= 0
      ? masterDataDbService.getPaymentTerms(bp.PayTermsGrpCode).catch(() => null)
      : Promise.resolve(null),
    bp.PriceListNum != null && bp.PriceListNum !== "" && Number(bp.PriceListNum) >= 0
      ? masterDataDbService.getPriceList(bp.PriceListNum).catch(() => null)
      : Promise.resolve(null),
    bp.CreditCardCode != null && bp.CreditCardCode !== "" && Number(bp.CreditCardCode) >= 0
      ? masterDataDbService.getCreditCardByCode(bp.CreditCardCode).catch(() => null)
      : Promise.resolve(null),
    bp.BPBankAccounts?.[0]?.BankCode
      ? masterDataDbService.getBankByCode(bp.BPBankAccounts[0].BankCode, bp.BPBankAccounts[0].Country).catch(() => null)
      : Promise.resolve(null),
    bp.BPBankAccounts?.[0]?.Country
      ? masterDataDbService.getCountryByCode(bp.BPBankAccounts[0].Country).catch(() => null)
      : Promise.resolve(null),
    bp.FatherCard
      ? masterDataDbService.getBP(bp.FatherCard).catch(() => null)
      : Promise.resolve(null),
    bp.LinkedBusinessPartner
      ? masterDataDbService.getBP(bp.LinkedBusinessPartner).catch(() => null)
      : Promise.resolve(null),
    bp.DebitorAccount
      ? masterDataDbService.getAccount(bp.DebitorAccount).catch(() => null)
      : Promise.resolve(null),
    bp.DownPaymentClearAct
      ? masterDataDbService.getAccount(bp.DownPaymentClearAct).catch(() => null)
      : Promise.resolve(null),
    bp.DownPaymentInterimAccount
      ? masterDataDbService.getAccount(bp.DownPaymentInterimAccount).catch(() => null)
      : Promise.resolve(null),
    bp.WTCode
      ? masterDataDbService.getWithholdingTaxCode(bp.WTCode).catch(() => null)
      : Promise.resolve(null),
  ]);

  return {
    ...bp,
    FatherCardName: fatherBP?.CardName || bp.FatherCardName || "",
    ConsolidatingBPName: fatherBP?.CardName || bp.ConsolidatingBPName || "",
    LinkedBusinessPartnerName: linkedVendorBP?.CardName || bp.LinkedBusinessPartnerName || "",
    PayTermsName: paymentTerms?.PaymentTermsGroupName || bp.PayTermsName || "",
    PriceListName: priceList?.PriceListName || bp.PriceListName || "",
    CreditCardName: creditCard?.name || bp.CreditCardName || "",
    DebitorAccountName: debitorAccount?.Name || bp.DebitorAccountName || "",
    DownPaymentClearActName: downPaymentClearAccount?.Name || bp.DownPaymentClearActName || "",
    DownPaymentInterimAccountName: downPaymentInterimAccount?.Name || bp.DownPaymentInterimAccountName || "",
    WTCodeName: withholdingTaxCode?.name || bp.WTCodeName || "",
    WTTaxCategoryLabel: withholdingTaxCode?.taxCategory || bp.WTTaxCategoryLabel || "",
    PaymentBankName: bank?.name || bp.PaymentBankName || "",
    PaymentBankCountryName: country?.name || bank?.countryName || bp.PaymentBankCountryName || "",
  };
};

const createBP = async (req, res) => {
  const data = req.body;
  if (!data.CardName) return res.status(400).json({ message: "CardName is required." });
  if (!data.CardType) return res.status(400).json({ message: "CardType is required." });
  const series = String(data.Series ?? "");
  let isManual = !series || series === "0";

  try {
    const next = !isManual ? await masterDataDbService.getBPSeriesNextNumber(series) : null;
    isManual = isManual || Boolean(next?.isManual);

    if (isManual && !data.CardCode) {
      return res.status(400).json({ message: "CardCode is required for manual entry." });
    }

    if (!data.CardCode && !isManual) {
      if (!next || next.isManual || !next.formattedCode) {
        return res.status(400).json({ message: `Could not get next number for series '${series}'.` });
      }
      data.CardCode = next.formattedCode;
    }

    if (isManual) {
      delete data.Series;
    }

    const result = await sapService.createItem_generic("/BusinessPartners", data);
    res.status(201).json(result);
  } catch (err) {
    const msg =
      err.response?.data?.error?.message?.value ||
      err.response?.data?.error?.message ||
      err.message;
    console.error("[SAP createBP error]", msg, JSON.stringify(err.response?.data));
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

const getBP = async (req, res) => {
  try {
    const response = await sapService.request({
      method: "GET",
      url: `/BusinessPartners('${encodeURIComponent(req.params.cardCode)}')`,
    });
    res.json(await enrichBP(response.data));
  } catch (err) {
    const msg = err.response?.data?.error?.message?.value || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

const updateBP = async (req, res) => {
  const { cardCode } = req.params;
  try {
    await sapService.request({
      method: "PATCH",
      url: `/BusinessPartners('${encodeURIComponent(cardCode)}')`,
      data: req.body,
    });
    const response = await sapService.request({
      method: "GET",
      url: `/BusinessPartners('${encodeURIComponent(cardCode)}')`,
    });
    res.json(await enrichBP(response.data));
  } catch (err) {
    const msg = err.response?.data?.error?.message?.value || err.message;
    console.error("[SAP updateBP error]", msg, JSON.stringify(err.response?.data));
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

const searchBP = async (req, res) => {
  try {
    const { query = "", type = "", top = 50, skip = 0 } = req.query;
    let databaseName = '';

    if (req.auth?.userId && req.auth?.companyId) {
      const assignedCompany = await authDbService.getAssignedCompanyForUser(req.auth.userId, req.auth.companyId);
      databaseName = String(assignedCompany?.DbName || '').trim();
    }

    const rows = await masterDataDbService.searchBP(query, type, top, skip, {
      databaseName: databaseName || undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupBPGroups = async (req, res) => {
  try {
    let databaseName = '';

    if (req.auth?.userId && req.auth?.companyId) {
      const assignedCompany = await authDbService.getAssignedCompanyForUser(req.auth.userId, req.auth.companyId);
      databaseName = String(assignedCompany?.DbName || '').trim();
    }

    const rows = await businessPartnerDbService.getBusinessPartnerGroups(req.query.query || "", {
      databaseName: databaseName || undefined,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: "Could not load BP groups: " + err.message });
  }
};

const lookupPaymentTerms = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupPaymentTerms(req.query.query || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupSalesPersons = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupSalesPersons(req.query.query || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupPriceLists = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupPriceLists(req.query.query || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupCurrencies = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupCurrencies(req.query.query || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupCountries = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupCountries(req.query.query || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupCreditCards = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupCreditCards(req.query.query || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const createCreditCard = async (req, res) => {
  try {
    const CreditCardName = String(req.body.CreditCardName || "").trim();
    if (!CreditCardName) {
      return res.status(400).json({ message: "Credit Card Name is required." });
    }

    const GLAccount = String(req.body.GLAccount || "").trim();
    if (!GLAccount) {
      return res.status(400).json({ message: "G/L Account is required." });
    }

    const account = await masterDataDbService.getAccount(GLAccount);
    if (!account) {
      return res.status(400).json({ message: `G/L Account "${GLAccount}" was not found.` });
    }

    const payload = {
      CreditCardName,
      GLAccount,
    };

    if (req.body.Telephone) payload.Telephone = String(req.body.Telephone).trim();
    if (req.body.CompanyID) payload.CompanyID = String(req.body.CompanyID).trim();

    const response = await sapService.request({
      method: "POST",
      url: "/CreditCards",
      data: payload,
    });

    res.status(201).json({
      code: String(response.data?.CreditCardCode ?? response.data?.CreditCard ?? ""),
      name: response.data?.CreditCardName || response.data?.CardName || CreditCardName,
      glAccount: response.data?.GLAccount || response.data?.AcctCode || payload.GLAccount || "",
      telephone: response.data?.Telephone || response.data?.Phone || payload.Telephone || "",
      companyId: response.data?.CompanyID || response.data?.CompanyId || payload.CompanyID || "",
      country: response.data?.CountryCode || response.data?.Country || "",
    });
  } catch (err) {
    const msg = err.response?.data?.error?.message?.value || err.message;
    res.status(err.response?.status || 500).json({ message: msg });
  }
};

const lookupBanks = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupBanks(req.query.query || "", req.query.country || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupHouseBankAccounts = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupHouseBankAccounts(req.query.bankCode || "", req.query.country || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupWithholdingTaxCodes = async (req, res) => {
  try {
    const rows = await masterDataDbService.lookupWithholdingTaxCodes(req.query.query || "");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const lookupNumberingSeries = async (_req, res) => {
  try {
    const rows = await masterDataDbService.lookupBPSeries();
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const getNextNumber = async (req, res) => {
  const { series } = req.params;
  if (String(series) === "0") {
    return res.json({
      series: "0",
      nextNumber: null,
      prefix: "",
      suffix: "",
      indicator: "",
      formattedCode: "",
      seriesName: "Manual",
      isManual: true,
    });
  }

  try {
    const row = await masterDataDbService.getBPSeriesNextNumber(series);
    if (!row) {
      return res.status(404).json({ message: `Series ${series} not found.` });
    }
    res.json(row);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createBP,
  getBP,
  updateBP,
  searchBP,
  lookupBPGroups,
  lookupPaymentTerms,
  lookupSalesPersons,
  lookupPriceLists,
  lookupCurrencies,
  lookupCountries,
  lookupCreditCards,
  createCreditCard,
  lookupBanks,
  lookupHouseBankAccounts,
  lookupWithholdingTaxCodes,
  lookupNumberingSeries,
  getNextNumber,
};