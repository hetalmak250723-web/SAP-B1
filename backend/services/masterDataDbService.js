const db = require("./dbService");

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toYesNo = (value) => (String(value || "").toUpperCase() === "Y" ? "tYES" : "tNO");
const toCardType = (value) => {
  const code = String(value || "").toUpperCase();
  if (code === "C") return "cCustomer";
  if (code === "S") return "cSupplier";
  if (code === "L") return "cLead";
  return "cCustomer";
};

const toCompanyPrivate = (value) => (String(value || "").toUpperCase() === "P" ? "cPrivate" : "cCompany");
const toBPGstType = (value) => {
  if (value == null || value === "") return "";
  if (typeof value === "string" && value.startsWith("gst")) return value;

  const map = {
    0: "invalid",
    1: "gstRegularTDSISD",
    2: "gstCasualTaxablePerson",
    3: "gstCompositionLevy",
    4: "gstGoverDepartPSU",
    5: "gstNonResidentTaxablePerson",
    6: "gstUNAgencyEmbassy",
  };

  return map[Number(value)] || "";
};

const toAccountType = (groupMask) => {
  const map = {
    1: "sat_Assets",
    2: "sat_Liabilities",
    3: "sat_Equity",
    4: "sat_Revenues",
    5: "sat_Expenditure",
    6: "sat_Other",
  };
  return map[Number(groupMask)] || "sat_Other";
};

const toRoundingMethod = (value) => {
  const map = {
    0: "borm_NoRounding",
    1: "borm_Ceiling",
    2: "borm_Floor",
    3: "borm_Commercial",
    4: "borm_HalfUp",
    5: "borm_HalfDown",
  };
  return map[Number(value)] || "borm_NoRounding";
};

const toBaselineDate = (value) => {
  const map = {
    P: "bld_PostingDate",
    D: "bld_DocDate",
    T: "bld_TaxDate",
  };
  return map[String(value || "").toUpperCase()] || "bld_PostingDate";
};

const toTreeType = (value) => {
  const map = {
    P: "iProductionTree",
    S: "iSalesTree",
    T: "iTemplateTree",
    A: "iAssemblyTree",
  };
  return map[String(value || "").toUpperCase()] || "iProductionTree";
};

const toIssueMethod = (value) => {
  const map = {
    M: "im_Manual",
    B: "im_Backflush",
  };
  return map[String(value || "").toUpperCase()] || "im_Manual";
};

const toItemType = (value) => {
  const map = {
    4: "pit_Item",
  };
  return map[Number(value)] || "pit_Item";
};

const pagingParams = (top, skip) => ({
  top: Math.max(1, toInt(top, 50)),
  skip: Math.max(0, toInt(skip, 0)),
});

const queryRows = async (sql, params = {}, options = {}) => {
  const result = await db.query(sql, params, options);
  return result.recordset || [];
};

const queryOne = async (sql, params = {}, options = {}) => {
  const rows = await queryRows(sql, params, options);
  return rows[0] || null;
};

const mapBranch = (row) => ({
  BPLID: row.BPLId,
  BPLName: row.BPLName || "",
  BPLNameForeign: row.BPLFrName || "",
  VATRegNum: row.VATRegNum || row.TaxIdNum || "",
  RepName: row.RepName || "",
  Industry: row.Industry || "",
  MainBPL: toYesNo(row.MainBPL),
  Disabled: toYesNo(row.Disabled),
  Address: row.Address || "",
  Street: row.Street || "",
  StreetNo: row.StreetNo || "",
  Block: row.Block || "",
  Building: row.Building || "",
  ZipCode: row.ZipCode || "",
  City: row.City || "",
  State: row.State || "",
  County: row.County || "",
  Country: row.Country || "",
  DflWhs: row.DflWhs || "",
  TaxIdNum: row.TaxIdNum || "",
});

const mapWarehouse = (row) => ({
  WarehouseCode: row.WhsCode || "",
  WarehouseName: row.WhsName || "",
  DropShip: toYesNo(row.DropShip),
  Nettable: toYesNo(row.Nettable),
  Inactive: toYesNo(row.Inactive),
  AllowUseTax: toYesNo(row.UseTax),
  Excisable: toYesNo(row.Excisable),
  ManageSerialAndBatchNumbers: toYesNo(row.ManageSnB),
  Location: row.Location ?? "",
  BusinessPlaceID: row.BPLid ?? "",
  TaxGroup: row.VatGroup || "",
  FederalTaxID: row.FedTaxID || "",
  GlobalLocationNumber: row.GlblLocNum || "",
  WHShipToName: row.WhShipTo || "",
  Storekeeper: row.StorKeeper || "",
  Shipper: row.Shipper || "",
  EnableBinLocations: toYesNo(row.BinActivat),
  BinLocCodeSeparator: row.BinSeptor || "-",
  DefaultBin: row.DftBinAbs ?? "",
  DefaultBinEnforced: toYesNo(row.DftBinEnfd),
  Street: row.Street || "",
  StreetNo: row.StreetNo || "",
  Block: row.Block || "",
  BuildingFloorRoom: row.Building || "",
  City: row.City || "",
  ZipCode: row.ZipCode || "",
  County: row.County || "",
  State: row.State || "",
  Country: row.Country || "",
  AddressType: row.AddrType || "",
  AddressName2: row.Address2 || "",
  AddressName3: row.Address3 || "",
  StockAccount: row.BalInvntAc || "",
  DecreasingAccount: row.DecreasAc || "",
  IncreaseGLAccount: row.IncreasAc || "",
  CostOfGoodsSold: row.SaleCostAc || "",
  TransfersAcc: row.TransferAc || "",
  PriceDifferencesAccount: row.PriceDifAc || "",
  VarianceAccount: row.VarianceAc || "",
  NegativeInventoryAdjustmentAccount: row.NegStckAct || "",
  PurchaseAccount: row.PurchaseAc || "",
  PurchaseReturningAccount: row.PAReturnAc || "",
  PurchaseOffsetAccount: row.PurchOfsAc || "",
  ExpenseAccount: row.ExpensesAc || "",
  ExpensesClearingAccount: row.ExpClrAct || "",
  GoodsClearingAcc: row.PurBalAct || "",
  RevenuesAccount: row.RevenuesAc || "",
  ReturningAccount: row.ReturnAc || "",
  ExemptRevenuesAccount: row.ExmptIncom || "",
  ExpenseOffsetingAct: row.ExpOfstAct || "",
  WIPMaterialAccount: row.WipAcct || "",
  WIPMaterialVarianceAccount: row.WipVarAcct || "",
  WipOffsetProfitAndLossAccount: row.WipOffset || "",
  InventoryOffsetProfitAndLossAccount: row.StockOffst || "",
  ForeignRevenuesAcc: row.FrRevenuAc || "",
  EURevenuesAccount: row.EURevenuAc || "",
  ForeignExpensesAccount: row.FrExpensAc || "",
  EUExpensesAccount: row.EUExpensAc || "",
  ExchangeRateDifferencesAccount: row.ExchangeAc || "",
  StockInflationAdjustAccount: row.StokRvlAct || "",
  StockInflationOffsetAccount: row.StkOffsAct || "",
  CostInflationAccount: row.CostRvlAct || "",
  CostInflationOffsetAccount: row.CstOffsAct || "",
  ShippedGoodsAccount: row.ShpdGdsAct || "",
  StockInTransitAccount: row.StkInTnAct || "",
  PurchaseBalanceAccount: row.PurBalAct || "",
  PurchaseCreditAcc: row.APCMAct || "",
  EUPurchaseCreditAcc: row.APCMEUAct || "",
  ForeignPurchaseCreditAcc: row.APCMFrnAct || "",
  SalesCreditAcc: row.ARCMAct || "",
  SalesCreditEUAcc: row.ARCMEUAct || "",
  SalesCreditForeignAcc: row.ARCMFrnAct || "",
  ExemptedCredits: row.RevRetAct || "",
  VATInRevenueAccount: row.VatRevAct || "",
  WHIncomingCenvatAccount: row.WhICenAct || "",
  WHOutgoingCenvatAccount: row.WhOCenAct || "",
  IncreasingAcc: row.IncresGlAc || "",
  DecreaseGLAccount: row.DecresGlAc || "",
  AutoAllocOnIssue: row.AutoIssMtd === 1 ? "whsBinSingleChoiceOnly" : "whsBinSingleChoiceOnly",
  AutoAllocOnReceipt: row.AutoRecvMd === 1 ? "aaormOnEveryTransaction" : "aaormDefaultBin",
  EnableReceivingBinLocations: toYesNo(row.RecBinEnab),
  ReceivingBinLocationsBy: row.RecItemsBy === 1 ? "rblmAlternativeSortCodeOrder" : "rblmBinLocationCodeOrder",
  RestrictReceiptToEmptyBinLocation: row.RecvUpTo === "1" ? "tYES" : "tNO",
  ReceiveUpToMaxQuantity: toYesNo(row.RecvMaxQty),
  ReceiveUpToMaxWeight: toYesNo(row.RecvMaxWT),
  ReceiveUpToMethod: row.RecvUpTo === "1" ? "rutmMaximumWeight" : "rutmMaximumQty",
});

const mapPaymentTerms = (row, installments = []) => ({
  GroupNumber: row.GroupNum,
  PaymentTermsGroupCode: String(row.GroupNum),
  PaymentTermsGroupName: row.PymntGroup || "",
  BaselineDate: toBaselineDate(row.BslineDate),
  StartFrom: "ptsf_DayOfMonth",
  NumberOfAdditionalMonths: row.ExtraMonth ?? 0,
  NumberOfAdditionalDays: row.ExtraDays ?? 0,
  ToleranceDays: row.TolDays ?? 0,
  NumberOfInstallments: installments.length || row.InstNum || 1,
  OpenIncomingPaymentsByDueDate: toYesNo(row.OpenRcpt),
  CreditLimit: row.CredLimit ?? 0,
  LoadLimitCredit: "tNO",
  PriceListNo: row.ListNum ?? "",
  PaymentTermsInstallments: installments,
});

const mapUoMGroup = (row, lines = []) => ({
  AbsEntry: row.UgpEntry,
  Code: row.UgpCode || "",
  Name: row.UgpName || "",
  BaseUoM: row.BaseUom ?? "",
  BaseUoMCode: row.BaseUoMCode || "",
  UnitOfMeasurementGroupLines: lines,
  UoMGroupDefinitionCollection: lines,
});

const mapTaxCode = (row) => ({
  Code: row.Code || "",
  Name: row.Name || "",
  Category: row.Category || "",
  TaxAccount: row.Account || "",
  Inactive: toYesNo(row.Inactive),
  IsItemLevel: "tNO",
  Rate: row.Rate ?? 0,
  TaxType: row.TaxType || "",
});

const mapShippingType = (row) => ({
  Code: row.TrnspCode,
  Name: row.TrnspName || "",
  Website: row.WebSite || "",
  ShippingCompany: row.ShippingCompany || "",
});

const mapPriceList = (row, baseName) => ({
  PriceListNo: row.ListNum,
  PriceListName: row.ListName || "",
  RoundingMethod: toRoundingMethod(row.RoundSys),
  Active: toYesNo(row.ValidFor),
  IsGrossPrice: toYesNo(row.IsGrossPrc),
  BasePriceList: row.BASE_NUM ?? "",
  BasePriceListName: baseName || "",
  Factor: row.Factor ?? 1,
  PriceListCurrency: row.PrimCurr || "",
  PriceListCurrencyName: row.CurrName || "",
  ValidFrom: row.ValidFrom || "",
  ValidTo: row.ValidTo || "",
});

const mapAccount = (row, fatherName = "", taxName = "") => ({
  Code: row.AcctCode || "",
  Name: row.AcctName || "",
  ForeignName: row.FrgnName || "",
  AccountType: toAccountType(row.GroupMask),
  FatherAccountKey: row.FatherNum || "",
  FatherAccountName: fatherName || "",
  ExternalCode: row.ExportCode || "",
  Level: row.Levels ?? "",
  ActiveAccount: row.FrozenFor === "Y" ? "tNO" : "tYES",
  Locked: toYesNo(row.FrozenFor),
  IsTitleAccount: row.Postable === "N" ? "tYES" : "tNO",
  Confidential: "tNO",
  Protected: toYesNo(row.Protected),
  Balance: row.CurrTotal ?? 0,
  BalanceFC: row.FcTotal ?? 0,
  BalanceSC: row.SysTotal ?? 0,
  AccountCurrency: row.ActCurr || "",
  AccountCurrencyName: row.AccountCurrencyName || "",
  TaxGroup: row.DfltTax || "",
  TaxGroupName: taxName || "",
  TaxLiable: row.DfltTax ? "tYES" : "tNO",
  CashAccount: toYesNo(row.CashBox),
  RevaluationCoordinated: toYesNo(row.RevalAcct),
  RevaluationAccount: row.RevalAcct || "",
  AllowMultipleCurrencies: row.ActCurr === "##" ? "tYES" : "tNO",
  BudgetAccount: toYesNo(row.Budget),
  ProjectCode: row.Project || "",
  Remarks: row.Details || "",
});

const mapBPAddress = (row) => ({
  AddressType: String(row.AdresType || row.AddrType || "").toUpperCase().startsWith("B") ? "bo_BillTo" : "bo_ShipTo",
  AddressName: row.Address || "",
  AddressName2: row.Address2 || "",
  AddressName3: row.Address3 || "",
  Street: row.Street || "",
  StreetNo: row.StreetNo || "",
  Block: row.Block || "",
  BuildingFloorRoom: row.Building || "",
  City: row.City || "",
  ZipCode: row.ZipCode || "",
  County: row.County || "",
  Country: row.Country || "",
  State: row.State || "",
  TaxOffice: row.TaxOffice || "",
  GlobalLocationNumber: row.GlblLocNum || "",
  GSTIN: row.GSTRegnNo || "",
  GstType: toBPGstType(row.GSTType),
  U_GSTIN_No: row.U_GSTIN_No || "",
  RowNum: row.LineNum ?? null,
});

const mapBPContact = (row) => ({
  Name: row.Name || "",
  Title: row.Title || "",
  Position: row.Position || "",
  Department: "",
  Phone1: row.Tel1 || "",
  Phone2: row.Tel2 || "",
  MobilePhone: row.Cellolar || "",
  Fax: row.Fax || "",
  E_Mail: row.E_MailL || "",
  Active: toYesNo(row.Active),
});

const mapBP = (row, addresses = [], contacts = []) => {
  const payload = {
    CardCode: row.CardCode || "",
    CardName: row.CardName || "",
    CardForeignName: row.CardFName || "",
    CardType: toCardType(row.CardType),
    GroupCode: row.GroupCode ?? "",
    Currency: row.Currency || "##",
    Phone1: row.Phone1 || "",
    Phone2: row.Phone2 || "",
    Fax: row.Fax || "",
    Cellular: row.Cellular || "",
    EmailAddress: row.E_Mail || "",
    Website: row.IntrntSite || "",
    FederalTaxID: row.LicTradNum || "",
    VatIDNum: row.VatIDNum || "",
    VATRegistrationNumber: row.VATRegNum || "",
    CompanyPrivate: toCompanyPrivate(row.CmpPrivate),
    LanguageCode: row.LangCode ?? "",
    SalesPersonCode: row.SlpCode ?? "",
    Territory: row.Territory ?? "",
    Industry: row.Industry ?? "",
    Valid: toYesNo(row.validFor),
    ValidFrom: row.validFrom || "",
    ValidTo: row.validTo || "",
    Frozen: toYesNo(row.frozenFor),
    FrozenFrom: row.frozenFrom || "",
    FrozenTo: row.frozenTo || "",
    PayTermsGrpCode: row.GroupNum ?? "",
    PriceListNum: row.ListNum ?? "",
    CreditLimit: row.CreditLine ?? 0,
    MaxCommitment: row.DebtLine ?? 0,
    DiscountPercent: row.Discount ?? 0,
    PeymentMethodCode: row.PymCode || "",
    DebitorAccount: row.DebPayAcct || row.DflAccount || "",
    DownPaymentClearAct: row.DpmClear || "",
    DownPaymentInterimAccount: row.DpmIntAct || "",
    ECommerceMerchantID: row.MerchantID || "",
    UseBillToAddrToDetermineTax: String(row.LocMth || "").toUpperCase() === "N" ? "tYES" : "tNO",
    BilltoDefault: row.BillToDef || "",
    ShipToDefault: row.ShipToDef || "",
    VatGroup: row.VatGroup || "",
    FreeText: row.Free_Text || "",
    Notes: row.Notes || "",
    CurrentAccountBalance: row.Balance ?? 0,
    OpenOrdersBalance: row.OrdersBal ?? 0,
    OpenDeliveryNotesBalance: row.DNotesBal ?? 0,
    BPAddresses: addresses,
    ContactEmployees: contacts,
  };

  for (let i = 1; i <= 64; i += 1) {
    payload[`Properties${i}`] = toYesNo(row[`QryGroup${i}`]);
  }

  return payload;
};

const mapBOMHeader = (row) => ({
  TreeCode: row.Code || "",
  ProductDescription: row.Name || "",
  TreeType: toTreeType(row.TreeType),
  Quantity: row.Qauntity ?? 1,
  Warehouse: row.ToWH || "",
  PriceList: row.PriceList ?? "",
  DistributionRule: row.OcrCode || "",
  Project: row.Project || "",
  PlanAvgProdSize: row.PlAvgSize ?? 1,
});

const mapBOMLine = (row) => ({
  ItemCode: row.Code || "",
  ItemName: row.ItemName || "",
  Quantity: row.Quantity ?? 1,
  Warehouse: row.Warehouse || "",
  Price: row.Price ?? 0,
  PriceList: row.PriceList ?? "",
  IssueMethod: toIssueMethod(row.IssueMthd),
  ItemType: toItemType(row.Type),
  DistributionRule: row.OcrCode || "",
  Project: row.Project || "",
  WipAccount: row.WipActCode || "",
  Comment: row.Comment || row.LineText || "",
  InventoryUOM: row.InvntryUom || "",
  ChildNum: row.ChildNum ?? 0,
  VisualOrder: row.VisOrder ?? 0,
});

const getBranch = async (bplid) => {
  const row = await queryOne(`
    SELECT *
    FROM OBPL
    WHERE BPLId = @bplid
  `, { bplid: toInt(bplid, 0) });

  return row ? mapBranch(row) : null;
};

const searchBranches = async (query = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const like = `%${String(query || "").trim()}%`;
  const rows = await queryRows(`
    SELECT BPLId, BPLName, BPLFrName, VATRegNum, TaxIdNum, RepName, Industry, MainBPL, Disabled
    FROM OBPL
    WHERE @query = ''
      OR BPLName LIKE @like
      OR ISNULL(BPLFrName, '') LIKE @like
    ORDER BY BPLId
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: String(query || "").trim(), like, top: limit, skip: offset });

  return rows.map(mapBranch);
};

const lookupBranchWarehouses = async (query = "", branchId = "") => {
  const branchIdNum = toInt(branchId, null);
  const rows = await queryRows(`
    SELECT TOP 100 WhsCode, WhsName, BPLid
    FROM OWHS
    WHERE (@query = ''
      OR WhsCode LIKE @like
      OR ISNULL(WhsName, '') LIKE @like)
      AND (@branchId IS NULL OR BPLid = @branchId)
    ORDER BY WhsCode
  `, { query: String(query || "").trim(), like: `%${String(query || "").trim()}%`, branchId: branchIdNum });

  return rows.map((row) => ({
    code: row.WhsCode,
    name: row.WhsName,
    branchId: row.BPLid,
  }));
};

const getWarehouse = async (whCode) => {
  const row = await queryOne(`
    SELECT *
    FROM OWHS
    WHERE WhsCode = @whCode
  `, { whCode });

  return row ? mapWarehouse(row) : null;
};

const searchWarehouses = async (query = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT WhsCode, WhsName, Street, City, Country, Inactive
    FROM OWHS
    WHERE @query = ''
      OR WhsCode LIKE @like
      OR ISNULL(WhsName, '') LIKE @like
    ORDER BY WhsCode
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset });

  return rows.map((row) => ({
    WarehouseCode: row.WhsCode,
    WarehouseName: row.WhsName,
    Street: row.Street || "",
    City: row.City || "",
    Country: row.Country || "",
    Inactive: toYesNo(row.Inactive),
  }));
};

const lookupCountries = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 Code, Name
    FROM OCRY
    WHERE @query = ''
      OR Code LIKE @like
      OR Name LIKE @like
    ORDER BY Code
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({ code: row.Code, name: row.Name }));
};

const getCountryByCode = async (code) => {
  const trimmed = String(code || "").trim();
  if (!trimmed) return null;

  const row = await queryOne(`
    SELECT TOP 1 Code, Name
    FROM OCRY
    WHERE Code = @code
    ORDER BY Code
  `, { code: trimmed });

  return row ? { code: row.Code, name: row.Name || "" } : null;
};

const lookupStates = async (country = "") => {
  const trimmed = String(country || "").trim();
  const rows = await queryRows(`
    SELECT Code, Name, Country
    FROM OCST
    WHERE (@country = '' OR Country = @country)
    ORDER BY Country, Code
  `, { country: trimmed });

  return rows.map((row) => ({ code: row.Code, name: row.Name, country: row.Country || "" }));
};

const lookupWarehouseLocations = async () => {
  const rows = await queryRows(`
    SELECT Code, Location
    FROM OLCT
    ORDER BY Code
  `);

  return rows.map((row) => ({ code: String(row.Code), name: row.Location || "" }));
};

const lookupBusinessPlaces = async () => {
  const rows = await queryRows(`
    SELECT BPLId, BPLName
    FROM OBPL
    WHERE Disabled <> 'Y'
    ORDER BY BPLId
  `);

  return rows.map((row) => ({ code: String(row.BPLId), name: row.BPLName || "" }));
};

const lookupGLAccounts = async (query = "", top = 100) => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP (${Math.max(1, toInt(top, 100))}) AcctCode, AcctName
    FROM OACT
    WHERE @query = ''
      OR AcctCode LIKE @like
      OR AcctName LIKE @like
    ORDER BY AcctCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({ code: row.AcctCode, name: row.AcctName }));
};

const getPaymentTerms = async (groupNumber) => {
  const row = await queryOne(`
    SELECT *
    FROM OCTG
    WHERE GroupNum = @groupNumber
  `, { groupNumber: toInt(groupNumber, 0) });

  if (!row) return null;

  const lines = await queryRows(`
    SELECT CTGCode, IntsNo, InstMonth, InstDays, InstPrcnt
    FROM CTG1
    WHERE CTGCode = @groupNumber
    ORDER BY IntsNo
  `, { groupNumber: toInt(groupNumber, 0) });

  const mappedLines = lines.map((line, index) => ({
    InstallmentNumber: index + 1,
    Percent: line.InstPrcnt ?? 0,
    NumberOfAdditionalMonths: line.InstMonth ?? 0,
    NumberOfAdditionalDays: line.InstDays ?? 0,
    BaselineDate: toBaselineDate(row.BslineDate),
    StartFrom: "ptsf_DayOfMonth",
  }));

  return mapPaymentTerms(row, mappedLines);
};

const searchPaymentTerms = async (query = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT GroupNum, PymntGroup, ExtraMonth, ExtraDays, CredLimit, DiscCode, OpenRcpt, BslineDate, InstNum
    FROM OCTG
    WHERE @query = ''
      OR PymntGroup LIKE @like
      OR CAST(GroupNum AS NVARCHAR(50)) LIKE @like
    ORDER BY GroupNum
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset });

  return rows.map((row) => ({
    GroupNumber: row.GroupNum,
    PaymentTermsGroupName: row.PymntGroup || "",
    PaymentTermsGroupCode: String(row.GroupNum),
    CashDiscountPercent: 0,
    NumberOfAdditionalMonths: row.ExtraMonth ?? 0,
    NumberOfAdditionalDays: row.ExtraDays ?? 0,
    CreditLimit: row.CredLimit ?? 0,
    DiscountCode: row.DiscCode || "",
    LoadLimitCredit: "tNO",
    OpenIncomingPaymentsByDueDate: toYesNo(row.OpenRcpt),
    BaselineDate: toBaselineDate(row.BslineDate),
    StartFrom: "ptsf_DayOfMonth",
    PaymentMethod: "",
  }));
};

const getUoMGroup = async (absEntry) => {
  const row = await queryOne(`
    SELECT G.UgpEntry, G.UgpCode, G.UgpName, G.BaseUom, U.UomCode AS BaseUoMCode
    FROM OUGP G
    LEFT JOIN OUOM U ON U.UomEntry = G.BaseUom
    WHERE G.UgpEntry = @absEntry
  `, { absEntry: toInt(absEntry, 0) });

  if (!row) return null;

  const lines = await queryRows(`
    SELECT L.UomEntry, L.AltQty, L.BaseQty, L.LineNum, U.UomCode, U.UomName
    FROM UGP1 L
    LEFT JOIN OUOM U ON U.UomEntry = L.UomEntry
    WHERE L.UgpEntry = @absEntry
    ORDER BY L.LineNum
  `, { absEntry: toInt(absEntry, 0) });

  const mappedLines = lines.map((line) => ({
    AlternateUoM: line.UomEntry,
    AlternateQuantity: line.AltQty ?? 1,
    BaseQuantity: line.BaseQty ?? 1,
    UoMType: "uomtAdditional",
    UoMCode: line.UomCode || "",
    UoMName: line.UomName || "",
  }));

  return mapUoMGroup(row, mappedLines);
};

const searchUoMGroups = async (query = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT UgpEntry, UgpCode, UgpName, BaseUom
    FROM OUGP
    WHERE @query = ''
      OR UgpCode LIKE @like
      OR UgpName LIKE @like
      OR CAST(UgpEntry AS NVARCHAR(50)) LIKE @like
    ORDER BY UgpEntry
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset });

  return rows.map((row) => ({
    AbsEntry: row.UgpEntry,
    Code: row.UgpCode || "",
    Name: row.UgpName || "",
    BaseUoM: row.BaseUom ?? "",
  }));
};

const lookupUoMs = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 UomEntry, UomCode, UomName
    FROM OUOM
    WHERE @query = ''
      OR UomCode LIKE @like
      OR UomName LIKE @like
    ORDER BY UomCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({
    code: String(row.UomEntry),
    name: `${row.UomCode} - ${row.UomName}`,
    uomCode: row.UomCode,
  }));
};

const getTaxCode = async (code) => {
  const row = await queryOne(`
    SELECT *
    FROM OVTG
    WHERE Code = @code
  `, { code });

  return row ? mapTaxCode(row) : null;
};

const searchTaxCodes = async (query = "", category = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT Code, Name, Category, Account, Inactive, TaxType, Rate
    FROM OVTG
    WHERE (@query = ''
      OR Code LIKE @like
      OR Name LIKE @like)
      AND (@category = '' OR Category = @category)
    ORDER BY Code
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, category: String(category || "").trim(), top: limit, skip: offset });

  return rows.map(mapTaxCode);
};

const getShippingType = async (code) => {
  const row = await queryOne(`
    SELECT TrnspCode, TrnspName, WebSite, '' AS ShippingCompany
    FROM OSHP
    WHERE TrnspCode = @code
  `, { code: toInt(code, 0) });

  return row ? mapShippingType(row) : null;
};

const searchShippingTypes = async (query = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TrnspCode, TrnspName, WebSite, '' AS ShippingCompany
    FROM OSHP
    WHERE @query = ''
      OR TrnspName LIKE @like
      OR CAST(TrnspCode AS NVARCHAR(50)) LIKE @like
    ORDER BY TrnspCode
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset });

  return rows.map(mapShippingType);
};

const getPriceList = async (priceListNo) => {
  const row = await queryOne(`
    SELECT P.*, C.CurrName, B.ListName AS BasePriceListName
    FROM OPLN P
    LEFT JOIN OCRN C ON C.CurrCode = P.PrimCurr
    LEFT JOIN OPLN B ON B.ListNum = P.BASE_NUM
    WHERE P.ListNum = @priceListNo
  `, { priceListNo: toInt(priceListNo, 0) });

  return row ? mapPriceList(row, row.BasePriceListName) : null;
};

const searchPriceLists = async (query = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT ListNum, ListName, BASE_NUM, Factor, RoundSys, IsGrossPrc, ValidFor
    FROM OPLN
    WHERE @query = ''
      OR ListName LIKE @like
      OR CAST(ListNum AS NVARCHAR(50)) LIKE @like
    ORDER BY ListNum
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset });

  return rows.map((row) => ({
    PriceListNo: row.ListNum,
    PriceListName: row.ListName || "",
    BasePriceList: row.BASE_NUM ?? "",
    Factor: row.Factor ?? 1,
    RoundingMethod: toRoundingMethod(row.RoundSys),
    Active: toYesNo(row.ValidFor),
    IsGrossPrice: toYesNo(row.IsGrossPrc),
  }));
};

const lookupPriceLists = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 ListNum, ListName
    FROM OPLN
    WHERE @query = ''
      OR ListName LIKE @like
      OR CAST(ListNum AS NVARCHAR(50)) LIKE @like
    ORDER BY ListNum
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({
    code: String(row.ListNum),
    name: row.ListName,
  }));
};

const lookupCurrencies = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 CurrCode, CurrName
    FROM OCRN
    WHERE @query = ''
      OR CurrCode LIKE @like
      OR CurrName LIKE @like
    ORDER BY CurrCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({ code: row.CurrCode, name: row.CurrName }));
};

const getAccount = async (code) => {
  const row = await queryOne(`
    SELECT A.*, F.AcctName AS FatherAccountName, T.Name AS TaxGroupName, C.CurrName AS AccountCurrencyName
    FROM OACT A
    LEFT JOIN OACT F ON F.AcctCode = A.FatherNum
    LEFT JOIN OVTG T ON T.Code = A.DfltTax
    LEFT JOIN OCRN C ON C.CurrCode = A.ActCurr
    WHERE A.AcctCode = @code
  `, { code });

  return row ? mapAccount(row, row.FatherAccountName, row.TaxGroupName) : null;
};

const searchAccounts = async (query = "", accountType = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const groupMask = {
    sat_Assets: 1,
    sat_Liabilities: 2,
    sat_Equity: 3,
    sat_Revenues: 4,
    sat_Expenditure: 5,
    sat_Other: 6,
  }[accountType] ?? null;

  const rows = await queryRows(`
    SELECT AcctCode, AcctName, FatherNum, GroupMask, FrozenFor, ExportCode, Levels, Postable
    FROM OACT
    WHERE (@query = ''
      OR AcctCode LIKE @like
      OR AcctName LIKE @like)
      AND (@groupMask IS NULL OR GroupMask = @groupMask)
    ORDER BY AcctCode
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, groupMask, top: limit, skip: offset });

  return rows.map((row) => ({
    Code: row.AcctCode,
    Name: row.AcctName,
    FatherAccountKey: row.FatherNum || "",
    AccountType: toAccountType(row.GroupMask),
    ActiveAccount: row.FrozenFor === "Y" ? "tNO" : "tYES",
    Locked: toYesNo(row.FrozenFor),
    ExternalCode: row.ExportCode || "",
    Level: row.Levels ?? "",
    IsTitleAccount: row.Postable === "N" ? "tYES" : "tNO",
  }));
};

const lookupParentAccounts = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 100 AcctCode, AcctName
    FROM OACT
    WHERE FrozenFor <> 'Y'
      AND (@query = ''
        OR AcctCode LIKE @like
        OR AcctName LIKE @like)
    ORDER BY AcctCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({ code: row.AcctCode, name: `${row.AcctCode} - ${row.AcctName}` }));
};

const lookupTaxCodes = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 100 Code, Name, Category
    FROM OVTG
    WHERE @query = ''
      OR Code LIKE @like
      OR Name LIKE @like
    ORDER BY Code
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({ code: row.Code, name: `${row.Code} - ${row.Name}`, category: row.Category || "" }));
};

const getBP = async (cardCode) => {
  const row = await queryOne(`
    SELECT *
    FROM OCRD
    WHERE CardCode = @cardCode
  `, { cardCode });

  if (!row) return null;

  const addresses = await queryRows(`
    SELECT *
    FROM CRD1
    WHERE CardCode = @cardCode
    ORDER BY LineNum
  `, { cardCode });

  const contacts = await queryRows(`
    SELECT *
    FROM OCPR
    WHERE CardCode = @cardCode
    ORDER BY CntctCode
  `, { cardCode });

  return mapBP(row, addresses.map(mapBPAddress), contacts.map(mapBPContact));
};

const searchBP = async (query = "", type = "", top = 50, skip = 0, options = {}) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const cardType = type === "cCustomer" ? "C" : type === "cSupplier" ? "S" : type === "cLead" ? "L" : "";
  const rows = await queryRows(`
    SELECT
      CardCode,
      CardName,
      CardType,
      GroupCode,
      Phone1,
      E_Mail,
      Currency,
      Balance,
      ValidFor,
      FrozenFor,
      BillToDef,
      Address,
      LicTradNum
    FROM OCRD
      WHERE (@query = ''
        OR CardCode LIKE @like
        OR CardName LIKE @like)
        AND (@cardType = '' OR CardType = @cardType)
      ORDER BY CardName, CardCode
      OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
    `, { query: trimmed, like: `%${trimmed}%`, cardType, top: limit, skip: offset }, options);

    return rows.map((row) => ({
      CardCode: row.CardCode,
      CardName: row.CardName,
      CardType: toCardType(row.CardType),
      GroupCode: row.GroupCode ?? "",
      Phone1: row.Phone1 || "",
      EmailAddress: row.E_Mail || "",
      Currency: row.Currency || "##",
      Balance: row.Balance ?? 0,
      Active: String(row.ValidFor || '').toUpperCase() === 'N' ? 'No' : 'Yes',
      Inactive: String(row.FrozenFor || '').toUpperCase() === 'Y' ? 'Yes' : 'No',
      BillToBlock: row.BillToDef || "",
      BillToBuildingFloorRoom: row.Address || "",
      GTSRegistrationNumber: row.LicTradNum || "",
    }));
  };

const lookupBPGroups = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 GroupCode, GroupName
    FROM OCRG
    WHERE @query = ''
      OR CAST(GroupCode AS NVARCHAR(50)) LIKE @like
      OR GroupName LIKE @like
    ORDER BY GroupCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({ code: String(row.GroupCode), name: row.GroupName }));
};

const lookupPaymentTerms = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 GroupNum, PymntGroup
    FROM OCTG
    WHERE @query = ''
      OR CAST(GroupNum AS NVARCHAR(50)) LIKE @like
      OR PymntGroup LIKE @like
    ORDER BY GroupNum
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({ code: String(row.GroupNum), name: row.PymntGroup }));
};

const getCreditCardByCode = async (code) => {
  const numericCode = toInt(code, null);
  if (numericCode == null || numericCode < 0) return null;

  const row = await queryOne(`
    SELECT CreditCard, CardName, AcctCode, Phone, CompanyId, Country
    FROM OCRC
    WHERE CreditCard = @code
  `, { code: numericCode });

  if (!row) return null;

  return {
    code: String(row.CreditCard),
    name: row.CardName || "",
    glAccount: row.AcctCode || "",
    telephone: row.Phone || "",
    companyId: row.CompanyId || "",
    country: row.Country || "",
  };
};

const lookupCreditCards = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 CreditCard, CardName, AcctCode, Phone, CompanyId, Country
    FROM OCRC
    WHERE @query = ''
      OR CAST(CreditCard AS NVARCHAR(50)) LIKE @like
      OR ISNULL(CardName, '') LIKE @like
    ORDER BY CreditCard
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({
    code: String(row.CreditCard),
    name: row.CardName || "",
    glAccount: row.AcctCode || "",
    telephone: row.Phone || "",
    companyId: row.CompanyId || "",
    country: row.Country || "",
  }));
};

const mapWithholdingTaxCode = (row) => ({
  code: row.WTCode || "",
  name: row.WTName || "",
  assesseeType: Number(row.Assessee) === 1 ? "atCompany" : "atOthers",
  assesseeTypeLabel: Number(row.Assessee) === 1 ? "Company" : "Others",
  taxCategory: row.EBWTaxCate == null || row.EBWTaxCate === "" ? (row.Category || "") : String(row.EBWTaxCate),
  threshold: row.Threshold ?? 0,
  surcharge: row.Surcharge ?? 0,
  officialCode: row.OffclCode || "",
  rate: row.Rate ?? 0,
  inactive: toYesNo(row.Inactive),
});

const getWithholdingTaxCode = async (code) => {
  const trimmed = String(code || "").trim();
  if (!trimmed) return null;

  const row = await queryOne(`
    SELECT TOP 1 WTCode, WTName, Assessee, Threshold, Surcharge, EBWTaxCate, Category, OffclCode, Rate, Inactive
    FROM OWHT
    WHERE WTCode = @code
    ORDER BY WTCode
  `, { code: trimmed });

  return row ? mapWithholdingTaxCode(row) : null;
};

const lookupWithholdingTaxCodes = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 WTCode, WTName, Assessee, Threshold, Surcharge, EBWTaxCate, Category, OffclCode, Rate, Inactive
    FROM OWHT
    WHERE @query = ''
      OR WTCode LIKE @like
      OR ISNULL(WTName, '') LIKE @like
      OR ISNULL(OffclCode, '') LIKE @like
    ORDER BY WTCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map(mapWithholdingTaxCode);
};

const getNextCreditCardCode = async () => {
  const row = await queryOne(`
    SELECT ISNULL(MAX(CreditCard), 0) + 1 AS NextCode
    FROM OCRC
  `);

  return row?.NextCode ?? 1;
};

const getBankByCode = async (bankCode, country = "") => {
  const trimmedCode = String(bankCode || "").trim();
  if (!trimmedCode) return null;

  const row = await queryOne(`
    SELECT TOP 1 B.BankCode, B.BankName, B.CountryCod, B.SwiftNum, B.IBAN, B.DfltBranch, C.Name AS CountryName
    FROM ODSC B
    LEFT JOIN OCRY C ON C.Code = B.CountryCod
    WHERE B.BankCode = @bankCode
      AND (@country = '' OR B.CountryCod = @country)
    ORDER BY B.BankCode
  `, { bankCode: trimmedCode, country: String(country || "").trim() });

  if (!row) return null;

  return {
    code: row.BankCode || "",
    name: row.BankName || "",
    country: row.CountryCod || "",
    countryName: row.CountryName || row.CountryCod || "",
    swift: row.SwiftNum || "",
    iban: row.IBAN || "",
    branch: row.DfltBranch || "",
  };
};

const lookupBanks = async (query = "", country = "") => {
  const trimmed = String(query || "").trim();
  const countryCode = String(country || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 B.BankCode, B.BankName, B.CountryCod, B.SwiftNum, B.IBAN, B.DfltBranch, C.Name AS CountryName
    FROM ODSC B
    LEFT JOIN OCRY C ON C.Code = B.CountryCod
    WHERE (@query = ''
      OR B.BankCode LIKE @like
      OR ISNULL(B.BankName, '') LIKE @like)
      AND (@country = '' OR B.CountryCod = @country)
    ORDER BY B.CountryCod, B.BankCode
  `, { query: trimmed, like: `%${trimmed}%`, country: countryCode });

  return rows.map((row) => ({
    code: row.BankCode || "",
    name: row.BankName || "",
    country: row.CountryCod || "",
    countryName: row.CountryName || row.CountryCod || "",
    swift: row.SwiftNum || "",
    iban: row.IBAN || "",
    branch: row.DfltBranch || "",
  }));
};

const lookupHouseBankAccounts = async (bankCode = "", country = "") => {
  const trimmedBankCode = String(bankCode || "").trim();
  const trimmedCountry = String(country || "").trim();
  if (!trimmedBankCode) return [];

  const rows = await queryRows(`
    SELECT
      D.BankCode,
      D.Account,
      COALESCE(NULLIF(D.BranchName, ''), NULLIF(D.Branch, ''), NULLIF(B.DfltBranch, '')) AS Branch,
      COALESCE(NULLIF(D.IBAN, ''), NULLIF(B.IBAN, '')) AS IBAN,
      COALESCE(NULLIF(D.SwiftNum, ''), NULLIF(B.SwiftNum, '')) AS SwiftNum,
      D.ControlKey,
      D.Country,
      B.BankName,
      C.Name AS CountryName
    FROM DSC1 D
    LEFT JOIN ODSC B
      ON B.BankCode = D.BankCode
     AND (@country = '' OR B.CountryCod = @country)
    LEFT JOIN OCRY C
      ON C.Code = D.Country
    WHERE D.BankCode = @bankCode
      AND (@country = '' OR D.Country = @country)
    ORDER BY D.Account
  `, { bankCode: trimmedBankCode, country: trimmedCountry });

  return rows.map((row) => ({
    bankCode: row.BankCode || "",
    bankName: row.BankName || row.BankCode || "",
    account: row.Account || "",
    branch: row.Branch || "",
    iban: row.IBAN || "",
    swift: row.SwiftNum || "",
    controlKey: row.ControlKey || "",
    country: row.Country || "",
    countryName: row.CountryName || row.Country || "",
  }));
};

const lookupSalesPersons = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 200 SlpCode, SlpName, Memo
    FROM OSLP
    WHERE @query = ''
      OR CAST(SlpCode AS NVARCHAR(50)) LIKE @like
      OR SlpName LIKE @like
    ORDER BY SlpCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({
    code: String(row.SlpCode),
    name: row.SlpName,
    remarks: row.Memo || "",
  }));
};

const lookupBPSeries = async () => {
  const rows = await queryRows(`
    SELECT Series, SeriesName, InitialNum, NextNumber, BeginStr, EndStr, Indicator, Locked, IsManual
    FROM NNM1
    WHERE ObjectCode IN ('2', 'OCRD')
    ORDER BY CASE WHEN IsManual = 'Y' THEN 0 ELSE 1 END, Series
  `);

  const seenDisplayNames = new Set();

  return rows.map((row) => {
    const seriesName = row.SeriesName || `Series ${row.Series}`;
    const isManual =
      String(row.IsManual || "").toUpperCase() === "Y" ||
      seriesName.trim().toLowerCase() === "manual";

    return {
      series: String(row.Series),
      name: seriesName,
      prefix: row.BeginStr || "",
      suffix: row.EndStr || "",
      indicator: row.Indicator || "",
      nextNumber: row.NextNumber ?? row.InitialNum ?? null,
      locked: String(row.Locked || "").toUpperCase() === "Y",
      isManual,
      isDefault: false,
    };
  }).filter((row) => {
    const key = row.isManual ? "manual" : row.name.trim().toLowerCase();
    if (seenDisplayNames.has(key)) return false;
    seenDisplayNames.add(key);
    return true;
  });
};

const getBPSeriesNextNumber = async (series) => {
  const row = await queryOne(`
    SELECT TOP 1 Series, SeriesName, InitialNum, NextNumber, BeginStr, EndStr, Indicator, Locked, IsManual
    FROM NNM1
    WHERE Series = @series
      AND ObjectCode IN ('2', 'OCRD')
  `, { series: toInt(series, 0) });

  if (!row) return null;

  const seriesName = row.SeriesName || `Series ${row.Series}`;
  const isManual =
    String(row.IsManual || "").toUpperCase() === "Y" ||
    seriesName.trim().toLowerCase() === "manual";
  const nextNumber = row.NextNumber ?? row.InitialNum ?? null;
  const padded = nextNumber == null ? "" : String(nextNumber).padStart(5, "0");

  return {
    series: String(row.Series),
    nextNumber,
    prefix: row.BeginStr || "",
    suffix: row.EndStr || "",
    indicator: row.Indicator || "",
    seriesName,
    isManual,
    formattedCode: isManual ? "" : `${row.BeginStr || ""}${padded}${row.EndStr || ""}`,
  };
};

const listBOMs = async (query = "", top = 50, skip = 0) => {
  const { top: limit, skip: offset } = pagingParams(top, skip);
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT Code, TreeType, Qauntity, Name, ToWH, PriceList, PlAvgSize
    FROM OITT
    WHERE @query = ''
      OR Code LIKE @like
      OR Name LIKE @like
    ORDER BY Code
    OFFSET @skip ROWS FETCH NEXT @top ROWS ONLY
  `, { query: trimmed, like: `%${trimmed}%`, top: limit, skip: offset });

  return rows.map((row) => ({
    TreeCode: row.Code,
    TreeType: toTreeType(row.TreeType),
    Quantity: row.Qauntity ?? 1,
    ProductDescription: row.Name || "",
    Warehouse: row.ToWH || "",
    PriceList: row.PriceList ?? "",
    PlanAvgProdSize: row.PlAvgSize ?? 1,
  }));
};

const getBOM = async (treeCode) => {
  const row = await queryOne(`
    SELECT *
    FROM OITT
    WHERE Code = @treeCode
  `, { treeCode });

  if (!row) return null;

  const lines = await queryRows(`
    SELECT L.*, I.InvntryUom
    FROM ITT1 L
    LEFT JOIN OITM I ON I.ItemCode = L.Code
    WHERE L.Father = @treeCode
    ORDER BY L.ChildNum
  `, { treeCode });

  return {
    ...mapBOMHeader(row),
    ProductTreeLines: lines.map(mapBOMLine),
  };
};

const lookupBOMItems = async (query = "") => {
  const trimmed = String(query || "").trim();
  const rows = await queryRows(`
    SELECT TOP 50 ItemCode, ItemName, InvntryUom AS InventoryUOM, PrchseItem AS PurchaseItem, SellItem AS SalesItem, InvntItem AS InventoryItem
    FROM OITM
    WHERE @query = ''
      OR ItemCode LIKE @like
      OR ItemName LIKE @like
    ORDER BY ItemCode
  `, { query: trimmed, like: `%${trimmed}%` });

  return rows.map((row) => ({
    ItemCode: row.ItemCode,
    ItemName: row.ItemName,
    InventoryUOM: row.InventoryUOM || "",
    PurchaseItem: toYesNo(row.PurchaseItem),
    SalesItem: toYesNo(row.SalesItem),
    InventoryItem: toYesNo(row.InventoryItem),
  }));
};

const lookupBOMWarehouses = async () =>
  queryRows(`
    SELECT WhsCode AS WarehouseCode, WhsName AS WarehouseName
    FROM OWHS
    ORDER BY WhsCode
  `);

const lookupBOMPriceLists = async () =>
  queryRows(`
    SELECT ListNum AS PriceListNo, ListName AS PriceListName
    FROM OPLN
    ORDER BY ListNum
  `);

const lookupDistributionRules = async () =>
  queryRows(`
    SELECT TOP 100 OcrCode AS FactorCode, OcrName AS FactorDescription
    FROM OOCR
    WHERE Active <> 'N'
    ORDER BY OcrCode
  `);

const lookupProjects = async () =>
  queryRows(`
    SELECT TOP 100 PrjCode AS Code, PrjName AS Name
    FROM OPRJ
    ORDER BY PrjCode
  `);

const getBOMItemDetails = async (itemCode) => {
  const row = await queryOne(`
    SELECT TOP 1 ItemCode, ItemName, InvntryUom, DfltWH, ManSerNum, ManBtchNum, IssueMthd
    FROM OITM
    WHERE ItemCode = @itemCode
  `, { itemCode });

  if (!row) return null;

  return {
    ItemCode: row.ItemCode,
    ItemName: row.ItemName || "",
    InventoryUOM: row.InvntryUom || "",
    DefaultWarehouse: row.DfltWH || "",
    DistributionRule: "",
    Project: "",
    ManageSerialNumbers: toYesNo(row.ManSerNum),
    ManageBatchNumbers: toYesNo(row.ManBtchNum),
    IssuePrimarilyBy: toIssueMethod(row.IssueMthd),
  };
};

module.exports = {
  getBranch,
  searchBranches,
  lookupBranchWarehouses,
  getWarehouse,
  searchWarehouses,
  lookupCountries,
  getCountryByCode,
  lookupStates,
  lookupWarehouseLocations,
  lookupBusinessPlaces,
  lookupGLAccounts,
  getPaymentTerms,
  searchPaymentTerms,
  getUoMGroup,
  searchUoMGroups,
  lookupUoMs,
  getTaxCode,
  searchTaxCodes,
  getShippingType,
  searchShippingTypes,
  getPriceList,
  searchPriceLists,
  lookupPriceLists,
  lookupCurrencies,
  getAccount,
  searchAccounts,
  lookupParentAccounts,
  lookupTaxCodes,
  getBP,
  searchBP,
  lookupBPGroups,
  lookupPaymentTerms,
  getCreditCardByCode,
  lookupCreditCards,
  getWithholdingTaxCode,
  lookupWithholdingTaxCodes,
  getNextCreditCardCode,
  getBankByCode,
  lookupBanks,
  lookupHouseBankAccounts,
  lookupSalesPersons,
  lookupBPSeries,
  getBPSeriesNextNumber,
  listBOMs,
  getBOM,
  lookupBOMItems,
  lookupBOMWarehouses,
  lookupBOMPriceLists,
  lookupDistributionRules,
  lookupProjects,
  getBOMItemDetails,
};