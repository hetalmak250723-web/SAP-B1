import React, { useState } from "react";
import BatchSerialModal from "./BatchSerialModal";

export default function IssueLines({
  lines, warehouses, distRules, projects,
  readOnly, onChange,
}) {
  const [batchSerialModal, setBatchSerialModal] = useState(null);
  const EMPTY_ROWS = 8;
  const totalIssueQty = lines.reduce((s, l) => s + (Number(l.issue_qty) || 0), 0);

  const handleBatchSerialSave = (lineId, data) => {
    onChange(lineId, "batch_numbers", data.batch_numbers);
    onChange(lineId, "serial_numbers", data.serial_numbers);
    setBatchSerialModal(null);
  };

  return (
    <>
      {batchSerialModal && (
        <BatchSerialModal
          line={batchSerialModal}
          onSave={(data) => handleBatchSerialSave(batchSerialModal._id, data)}
          onClose={() => setBatchSerialModal(null)}
        />
      )}
      <div className="ifp-lines-wrap">
        <div className="ifp-grid-scroll">
          <table className="ifp-grid">
            <thead>
              <tr>
                <th className="ifp-th ifp-th--no">Row No.</th>
                <th className="ifp-th ifp-th--no">Item No.</th>
                <th className="ifp-th ifp-th--desc">Description</th>
                <th className="ifp-th ifp-th--planned">Planned Qty</th>
                <th className="ifp-th ifp-th--issued">Already Issued</th>
                <th className="ifp-th ifp-th--remain">Remaining</th>
                <th className="ifp-th ifp-th--issueqty">Issue Qty</th>
                <th className="ifp-th ifp-th--uom">UoM</th>
                <th className="ifp-th ifp-th--wh">Warehouse</th>
                <th className="ifp-th ifp-th--batch">Batch/Serial</th>
                <th className="ifp-th ifp-th--dr">Distr. Rule</th>
                <th className="ifp-th ifp-th--proj">Project</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const remaining = Number(line.remaining_qty ?? 0);
                const fullyIssued = remaining <= 0;

                return (
                  <tr
                    key={line._id}
                    className={`ifp-grid__row${fullyIssued ? " ifp-grid__row--fully-issued" : ""}`}
                  >
                    <td className="ifp-grid__cell ifp-grid__cell--readonly ifp-grid__cell--num">
                      {Number(line.line_num ?? 0)}
                    </td>

                    <td className="ifp-grid__cell ifp-grid__cell--readonly">
                      <span style={{ padding: "0 3px", fontSize: 12 }}>{line.item_code}</span>
                    </td>

                    <td className="ifp-grid__cell ifp-grid__cell--readonly">
                      <span style={{ padding: "0 3px", fontSize: 12 }}>{line.item_name}</span>
                    </td>

                    <td className="ifp-grid__cell ifp-grid__cell--readonly ifp-grid__cell--num">
                      {Number(line.planned_qty || 0).toFixed(2)}
                    </td>

                    <td className="ifp-grid__cell ifp-grid__cell--readonly ifp-grid__cell--num">
                      {Number(line.issued_qty || 0).toFixed(2)}
                    </td>

                    <td className={`ifp-grid__cell ${fullyIssued ? "ifp-grid__cell--zero" : "ifp-grid__cell--remain"}`}>
                      {remaining.toFixed(2)}
                    </td>

                    <td className="ifp-grid__cell ifp-grid__cell--issue">
                      <input
                        className="ifp-issue-input"
                        type="number"
                        min="0"
                        step="any"
                        value={line.issue_qty}
                        disabled={readOnly || fullyIssued}
                        onChange={(e) => onChange(line._id, "issue_qty", e.target.value)}
                      />
                    </td>

                    <td className="ifp-grid__cell ifp-grid__cell--readonly">
                      <span style={{ padding: "0 3px", fontSize: 12 }}>{line.uom}</span>
                    </td>

                    <td className="ifp-grid__cell">
                      <select
                        className="ifp-cell-select"
                        value={line.warehouse}
                        disabled={readOnly}
                        onChange={(e) => onChange(line._id, "warehouse", e.target.value)}
                      >
                        <option value="">--</option>
                        {warehouses.map((w) => (
                          <option key={w.WarehouseCode} value={w.WarehouseCode}>
                            {w.WarehouseCode}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="ifp-grid__cell ifp-grid__cell--batch">
                      {(line.manage_batch || line.manage_serial) ? (
                        <button
                          className="batch-serial-btn"
                          disabled={readOnly || fullyIssued || !line.warehouse || Number(line.issue_qty) <= 0}
                          onClick={() => setBatchSerialModal(line)}
                          title={line.manage_batch ? "Select Batch Numbers" : "Select Serial Numbers"}
                        >
                          {line.manage_batch && (
                            <>
                              {(line.batch_numbers || []).length > 0 ? (
                                <span className="batch-serial-btn--selected">
                                  ✓ {(line.batch_numbers || []).length} batch(es)
                                </span>
                              ) : (
                                <span className="batch-serial-btn--empty">Select Batches</span>
                              )}
                            </>
                          )}
                          {line.manage_serial && (
                            <>
                              {(line.serial_numbers || []).length > 0 ? (
                                <span className="batch-serial-btn--selected">
                                  ✓ {(line.serial_numbers || []).length} serial(s)
                                </span>
                              ) : (
                                <span className="batch-serial-btn--empty">Select Serials</span>
                              )}
                            </>
                          )}
                        </button>
                      ) : (
                        <span style={{ fontSize: 11, color: "#aaa" }}>—</span>
                      )}
                    </td>

                    <td className="ifp-grid__cell">
                      <select
                        className="ifp-cell-select"
                        value={line.distribution_rule}
                        disabled={readOnly}
                        onChange={(e) => onChange(line._id, "distribution_rule", e.target.value)}
                      >
                        <option value="">--</option>
                        {distRules.map((d) => (
                          <option key={d.FactorCode} value={d.FactorCode}>
                            {d.FactorCode}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="ifp-grid__cell">
                      <select
                        className="ifp-cell-select"
                        value={line.project}
                        disabled={readOnly}
                        onChange={(e) => onChange(line._id, "project", e.target.value)}
                      >
                        <option value="">--</option>
                        {projects.map((p) => (
                          <option key={p.Code} value={p.Code}>
                            {p.Code}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}

              {lines.length < EMPTY_ROWS &&
                Array.from({ length: EMPTY_ROWS - lines.length }).map((_, i) => (
                  <tr key={`e-${i}`} className="ifp-grid__row ifp-grid__row--empty">
                    {Array.from({ length: 12 }).map((__, j) => (
                      <td key={j} className="ifp-grid__cell ifp-grid__cell--empty" />
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="ifp-bottom-bar">
          <div className="ifp-bottom-bar__totals">
            <span>
              Lines: <span className="ifp-bottom-bar__total-val">{lines.length}</span>
            </span>
            <span>
              Total Issue Qty:{" "}
              <span className="ifp-bottom-bar__total-val">{totalIssueQty.toFixed(2)}</span>
            </span>
          </div>
          {!readOnly && (
            <span style={{ fontSize: 11, color: "#888", fontStyle: "italic" }}>
              Backflush items are excluded — they are auto-issued on receipt
            </span>
          )}
        </div>
      </div>
    </>
  );
}
