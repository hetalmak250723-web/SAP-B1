import React from "react";
import AnalysisChartsPanel from "./AnalysisChartsPanel";

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

const formatCurrency = (currencyCode, value) => `${currencyCode} ${formatNumber(value)}`;

const formatDate = (value) => {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year.slice(-2)}`;
};

export default function SalesAnalysisDetailGrid({
  result,
  reportPeriod,
  customerLabel = "Customer",
  salesEmployeeLabel = "Sales Employee",
  showGrossProfit = true,
  onBack,
  onExport,
  onExportPdf,
  exportLabel = "Export",
  pdfExportLabel = "PDF",
}) {
  if (result.detailLayout === "sapDocument") {
    const primaryLabel = result.chartData?.primaryLabel || "Amount";
    const secondaryLabel = result.chartData?.secondaryLabel || "Applied Amount";

    return (
      <div className="sar-window">
        <div className="sar-window__titlebar">
          <span>{result.title}</span>
        </div>
        <div className="sar-window__underline" />

        <div className="sar-window__body">
          <div className="sar-grid-wrap">
            <table className="sar-grid">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Document</th>
                  <th>Installment</th>
                  <th>{salesEmployeeLabel}</th>
                  <th>Posting Date</th>
                  <th>Due Date</th>
                  <th>{customerLabel} Name</th>
                  <th className="sar-grid__cell--num">{primaryLabel}</th>
                  <th className="sar-grid__cell--num">{secondaryLabel}</th>
                  <th>Agreement No.</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={`${row.docEntry}-${row.rowNo}`}>
                    <td>{row.rowNo}</td>
                    <td>
                      <span className="sar-row-arrow">→</span>
                      {row.documentRef}
                    </td>
                    <td>{row.installmentLabel}</td>
                    <td>{row.salesEmployee}</td>
                    <td>{formatDate(row.postingDate)}</td>
                    <td>{formatDate(row.dueDate)}</td>
                    <td>{row.customerName}</td>
                    <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.purchasedAmount)}</td>
                    <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.appliedAmount)}</td>
                    <td>{row.agreementNo}</td>
                  </tr>
                ))}
              </tbody>
              {result.totals && (
                <tfoot>
                  <tr>
                    <td colSpan={7}>Total</td>
                    <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, result.totals.purchasedAmount)}</td>
                    <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, result.totals.appliedAmount)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <AnalysisChartsPanel
            chartData={result.chartData}
            currencyCode={result.currencyCode}
            showControls
          />
        </div>

        <div className="sar-window__footer">
          <button type="button" className="im-btn" onClick={onBack}>Back</button>
          {typeof onExport === "function" && (
            <button type="button" className="im-btn" onClick={onExport}>{exportLabel}</button>
          )}
          {typeof onExportPdf === "function" && (
            <button type="button" className="im-btn" onClick={onExportPdf}>{pdfExportLabel}</button>
          )}
        </div>
      </div>
    );
  }

  const footerLabelColSpan = reportPeriod === "annual" ? 7 : 8;

  return (
    <div className="sar-window">
      <div className="sar-window__titlebar">
        <span>{result.title}</span>
      </div>
      <div className="sar-window__underline" />

      <div className="sar-window__body">
        <div className="sar-grid-wrap">
          <table className="sar-grid">
            <thead>
              <tr>
                <th>#</th>
                <th>Document No</th>
                <th>Posting Date</th>
                <th>{customerLabel} Code</th>
                <th>{customerLabel} Name</th>
                <th>Item Code</th>
                <th>Item Name</th>
                {reportPeriod !== "annual" && <th>{reportPeriod === "monthly" ? "Month" : "Quarter"}</th>}
                <th className="sar-grid__cell--num">Quantity</th>
                <th className="sar-grid__cell--num">Price</th>
                <th className="sar-grid__cell--num">Line Total</th>
                {showGrossProfit && <th className="sar-grid__cell--num">Gross Profit</th>}
                {showGrossProfit && <th className="sar-grid__cell--num">Gross Profit %</th>}
                <th>{salesEmployeeLabel}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={`${row.docEntry}-${row.rowNo}`}>
                  <td>{row.rowNo}</td>
                  <td>{row.documentNo}</td>
                  <td>{row.postingDate}</td>
                  <td>{row.customerCode}</td>
                  <td>{row.customerName}</td>
                  <td>{row.itemCode}</td>
                  <td>{row.itemName}</td>
                  {reportPeriod !== "annual" && <td>{row.periodLabel}</td>}
                  <td className="sar-grid__cell--num">{formatNumber(row.quantity)}</td>
                  <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.price)}</td>
                  <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.lineTotal)}</td>
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.grossProfit)}</td>}
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatNumber(row.grossProfitPct)}</td>}
                  <td>{row.salesEmployee}</td>
                </tr>
              ))}
            </tbody>
            {result.totals && (
              <tfoot>
                <tr>
                  <td colSpan={footerLabelColSpan}>Total</td>
                  <td className="sar-grid__cell--num">{formatNumber(result.totals.quantity)}</td>
                  <td />
                  <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, result.totals.totalAmount)}</td>
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, result.totals.grossProfit)}</td>}
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatNumber(result.totals.grossProfitPct)}</td>}
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <AnalysisChartsPanel
          chartData={result.chartData}
          currencyCode={result.currencyCode}
          showControls
        />
      </div>

      <div className="sar-window__footer">
        <button type="button" className="im-btn" onClick={onBack}>Back</button>
        {typeof onExport === "function" && (
          <button type="button" className="im-btn" onClick={onExport}>{exportLabel}</button>
        )}
        {typeof onExportPdf === "function" && (
          <button type="button" className="im-btn" onClick={onExportPdf}>{pdfExportLabel}</button>
        )}
      </div>
    </div>
  );
}
