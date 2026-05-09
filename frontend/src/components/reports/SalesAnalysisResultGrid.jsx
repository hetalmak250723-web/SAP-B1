import React, { useState } from "react";
import AnalysisChartsPanel from "./AnalysisChartsPanel";

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0));

const formatCurrency = (currencyCode, value) => `${currencyCode} ${formatNumber(value)}`;

export default function SalesAnalysisResultGrid({
  result,
  tab,
  customerLabel = "Customer",
  salesEmployeeLabel = "Sales Employee",
  showGrossProfit = true,
  openAmountLabel,
  onOpenDetail,
  onNavigateEntity,
  onExport,
  onExportPdf,
  exportLabel = "Export",
  pdfExportLabel = "PDF",
  onOk,
}) {
  const [showCharts, setShowCharts] = useState(false);
  const codeLabel = tab === "customers" ? `${customerLabel} Code` : tab === "items" ? "Item Code" : `${salesEmployeeLabel} Code`;
  const nameLabel = tab === "customers" ? `${customerLabel} Name` : tab === "items" ? "Item Description" : `${salesEmployeeLabel} Name`;
  const hasSecondary = result.rows.some((row) => row.secondaryCode);
  const hasPeriod = result.rows.some((row) => row.periodLabel);
  const labelColSpan = 3 + (hasSecondary ? 1 : 0) + (hasPeriod ? 1 : 0);
  const resolvedOpenAmountLabel = openAmountLabel || `Total Open ${result.currencyCode}`;

  return (
    <div className="sar-window">
      <div className="sar-window__titlebar">
        <span>{result.title}</span>
      </div>
      <div className="sar-window__underline" />

      <div className="sar-window__body">
        <div className="sar-result-hint">
          Double-click on row number for a detailed report
          {tab === "customers" && typeof onNavigateEntity === "function" && (
            <span> • Click the blue arrow (→) button to open supplier/customer in Business Partner form</span>
          )}
        </div>
        <div className="sar-grid-wrap">
          <table className="sar-grid">
            <thead>
              <tr>
                <th>#</th>
                <th>{codeLabel}</th>
                <th>{nameLabel}</th>
                {hasSecondary && <th>Grouping</th>}
                {hasPeriod && <th>Period</th>}
                {tab === "items" && <th className="sar-grid__cell--num">Quantity</th>}
                <th className="sar-grid__cell--num">{result.documentLabel}</th>
                <th className="sar-grid__cell--num">{result.amountLabel}</th>
                {showGrossProfit && <th className="sar-grid__cell--num">Gross Profit</th>}
                {showGrossProfit && <th className="sar-grid__cell--num">Gross Profit %</th>}
                <th className="sar-grid__cell--num">{resolvedOpenAmountLabel}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.key}>
                  <td className="sar-grid__row-link" onDoubleClick={() => onOpenDetail(row)}>{row.rowNo}</td>
                  <td>
                    {tab === "customers" && typeof onNavigateEntity === "function" ? (
                      <button
                        type="button"
                        className="sar-row-arrow-btn"
                        onClick={() => onNavigateEntity(row)}
                        title={`Click to open ${row.entityCode} in Business Partner form`}
                      >
                        <span className="sar-row-arrow">→</span>
                      </button>
                    ) : (
                      <span className="sar-row-arrow">→</span>
                    )}
                    {row.entityCode}
                  </td>
                  <td>{row.entityName}</td>
                  {hasSecondary && <td>{row.secondaryCode ? `${row.secondaryCode} - ${row.secondaryName}` : ""}</td>}
                  {hasPeriod && <td>{row.periodLabel}</td>}
                  {tab === "items" && <td className="sar-grid__cell--num">{formatNumber(row.quantity)}</td>}
                  <td className="sar-grid__cell--num">{row.documentCount}</td>
                  <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.totalAmount)}</td>
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.grossProfit)}</td>}
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatNumber(row.grossProfitPct)}</td>}
                  <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, row.openAmount)}</td>
                </tr>
              ))}
            </tbody>
            {result.totals && (
              <tfoot>
                <tr>
                  <td colSpan={labelColSpan}>Total</td>
                  {tab === "items" && <td className="sar-grid__cell--num">{formatNumber(result.totals.quantity)}</td>}
                  <td className="sar-grid__cell--num">{result.totals.documentCount}</td>
                  <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, result.totals.totalAmount)}</td>
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, result.totals.grossProfit)}</td>}
                  {showGrossProfit && <td className="sar-grid__cell--num">{formatNumber(result.totals.grossProfitPct)}</td>}
                  <td className="sar-grid__cell--num">{formatCurrency(result.currencyCode, result.totals.openAmount)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {showCharts && (
          <AnalysisChartsPanel
            chartData={result.chartData}
            currencyCode={result.currencyCode}
          />
        )}
      </div>

      <div className="sar-window__footer">
        <div className="sar-window__actions">
          <button type="button" className="im-btn im-btn--primary" onClick={onOk}>OK</button>
          {typeof onExport === "function" && (
            <button type="button" className="im-btn" onClick={onExport}>{exportLabel}</button>
          )}
          {typeof onExportPdf === "function" && (
            <button type="button" className="im-btn" onClick={onExportPdf}>{pdfExportLabel}</button>
          )}
          {result.chartData && (
            <button
              type="button"
              className="im-btn"
              onClick={() => setShowCharts((previous) => !previous)}
            >
              {showCharts ? "Hide Graph" : "Show Graph"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
