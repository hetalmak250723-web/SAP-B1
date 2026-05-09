import React, { useEffect, useMemo, useState } from "react";
import apiClient from "../../../api/client";

const toQty = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const emptyBatch = () => ({ batch_number: "", quantity: 0 });
const emptySerial = () => ({ serial_number: "" });
const emptyBin = () => ({ bin_abs: "", quantity: 0, serial_batch_base_line: "" });

export default function ReceiptAllocationModal({ line, readOnly, onSave, onClose }) {
  const [loadingBins, setLoadingBins] = useState(false);
  const [binError, setBinError] = useState("");
  const [bins, setBins] = useState([]);
  const [batchRows, setBatchRows] = useState(line.batch_numbers?.length ? line.batch_numbers : [emptyBatch()]);
  const [serialRows, setSerialRows] = useState(line.serial_numbers?.length ? line.serial_numbers : [emptySerial()]);
  const [binRows, setBinRows] = useState(line.bin_allocations?.length ? line.bin_allocations : [emptyBin()]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!line.enable_bin_locations || !line.warehouse) return;

    let active = true;
    setLoadingBins(true);
    setBinError("");

    apiClient
      .get("/bin-locations", { params: { warehouse: line.warehouse } })
      .then((response) => {
        if (!active) return;
        setBins(response.data?.value || []);
      })
      .catch((err) => {
        if (!active) return;
        setBinError(err.response?.data?.detail || "Could not load bin locations.");
      })
      .finally(() => {
        if (active) setLoadingBins(false);
      });

    return () => {
      active = false;
    };
  }, [line.enable_bin_locations, line.warehouse]);

  const requiredQty = toQty(line.quantity);
  const validBatchRows = batchRows.filter((row) => row.batch_number && toQty(row.quantity) > 0);
  const validSerialRows = serialRows.filter((row) => row.serial_number);
  const validBinRows = binRows.filter((row) => row.bin_abs !== "" && row.bin_abs != null && toQty(row.quantity) > 0);

  const batchTotal = useMemo(
    () => validBatchRows.reduce((sum, row) => sum + toQty(row.quantity), 0),
    [validBatchRows]
  );
  const binTotal = useMemo(
    () => validBinRows.reduce((sum, row) => sum + toQty(row.quantity), 0),
    [validBinRows]
  );

  const linkedOptions = line.manage_batch
    ? validBatchRows.map((row, index) => ({
        value: index,
        label: `${index + 1}. ${row.batch_number || `Batch ${index + 1}`}`,
      }))
    : line.manage_serial
      ? validSerialRows.map((row, index) => ({
          value: index,
          label: `${index + 1}. ${row.serial_number || `Serial ${index + 1}`}`,
        }))
      : [];

  const updateArrayRow = (setter, index, field, value) => {
    setter((prev) => prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  };

  const validate = () => {
    if (line.manage_batch) {
      if (validBatchRows.length === 0) {
        return "Batch numbers are required.";
      }
      if (Math.abs(batchTotal - requiredQty) > 0.000001) {
        return `Batch total must equal ${requiredQty}.`;
      }
    }

    if (line.manage_serial) {
      if (validSerialRows.length === 0) {
        return "Serial numbers are required.";
      }
      if (validSerialRows.length !== Math.floor(requiredQty)) {
        return `Serial count must equal ${Math.floor(requiredQty)}.`;
      }
    }

    if (line.enable_bin_locations) {
      if (validBinRows.length === 0) {
        return "Bin allocations are required.";
      }
      if (Math.abs(binTotal - requiredQty) > 0.000001) {
        return `Bin total must equal ${requiredQty}.`;
      }

      if ((line.manage_batch || line.manage_serial) && linkedOptions.length > 1) {
        for (const row of validBinRows) {
          if (row.serial_batch_base_line === "" || row.serial_batch_base_line == null) {
            return "Choose a linked batch or serial row for each bin allocation.";
          }
        }
      }
    }

    return "";
  };

  const handleSave = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    onSave({
      batch_numbers: line.manage_batch ? validBatchRows : [],
      serial_numbers: line.manage_serial ? validSerialRows : [],
      bin_allocations: line.enable_bin_locations ? validBinRows : [],
    });
  };

  return (
    <div className="rfp-alloc-modal-overlay" onClick={onClose}>
      <div className="rfp-alloc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="rfp-alloc-modal__header">
          <div>
            <div className="rfp-alloc-modal__title">Receipt Allocations</div>
            <div className="rfp-alloc-modal__subtitle">
              {line.item_code} - {line.item_name || "Item"}
            </div>
          </div>
          <button type="button" className="rfp-alloc-modal__close" onClick={onClose}>
            x
          </button>
        </div>

        <div className="rfp-alloc-modal__meta">
          <span>Qty: <strong>{requiredQty.toFixed(2)}</strong></span>
          <span>Warehouse: <strong>{line.warehouse || "-"}</strong></span>
          {line.manage_batch && <span>Batch-managed</span>}
          {line.manage_serial && <span>Serial-managed</span>}
          {line.enable_bin_locations && <span>Bin-managed</span>}
        </div>

        {(error || binError) && <div className="rfp-alloc-modal__error">{error || binError}</div>}

        <div className="rfp-alloc-modal__body">
          {line.manage_batch && (
            <section className="rfp-alloc-section">
              <div className="rfp-alloc-section__header">
                <span>Batch Numbers</span>
                {!readOnly && (
                  <button type="button" className="im-btn im-btn--sm" onClick={() => setBatchRows((prev) => [...prev, emptyBatch()])}>
                    Add
                  </button>
                )}
              </div>
              <table className="rfp-alloc-table">
                <thead>
                  <tr>
                    <th>Batch Number</th>
                    <th>Quantity</th>
                    {!readOnly && <th />}
                  </tr>
                </thead>
                <tbody>
                  {batchRows.map((row, index) => (
                    <tr key={`batch-${index}`}>
                      <td>
                        <input
                          className="rfp-alloc-input"
                          value={row.batch_number || ""}
                          readOnly={readOnly}
                          onChange={(e) => updateArrayRow(setBatchRows, index, "batch_number", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="rfp-alloc-input rfp-alloc-input--num"
                          type="number"
                          min="0"
                          step="any"
                          value={row.quantity}
                          readOnly={readOnly}
                          onChange={(e) => updateArrayRow(setBatchRows, index, "quantity", e.target.value)}
                        />
                      </td>
                      {!readOnly && (
                        <td>
                          <button type="button" className="rfp-alloc-remove" onClick={() => setBatchRows((prev) => prev.filter((_, i) => i !== index))}>
                            -
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="rfp-alloc-section__summary">Total: {batchTotal.toFixed(2)}</div>
            </section>
          )}

          {line.manage_serial && (
            <section className="rfp-alloc-section">
              <div className="rfp-alloc-section__header">
                <span>Serial Numbers</span>
                {!readOnly && (
                  <button type="button" className="im-btn im-btn--sm" onClick={() => setSerialRows((prev) => [...prev, emptySerial()])}>
                    Add
                  </button>
                )}
              </div>
              <table className="rfp-alloc-table">
                <thead>
                  <tr>
                    <th>Serial Number</th>
                    {!readOnly && <th />}
                  </tr>
                </thead>
                <tbody>
                  {serialRows.map((row, index) => (
                    <tr key={`serial-${index}`}>
                      <td>
                        <input
                          className="rfp-alloc-input"
                          value={row.serial_number || ""}
                          readOnly={readOnly}
                          onChange={(e) => updateArrayRow(setSerialRows, index, "serial_number", e.target.value)}
                        />
                      </td>
                      {!readOnly && (
                        <td>
                          <button type="button" className="rfp-alloc-remove" onClick={() => setSerialRows((prev) => prev.filter((_, i) => i !== index))}>
                            -
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="rfp-alloc-section__summary">Count: {validSerialRows.length}</div>
            </section>
          )}

          {line.enable_bin_locations && (
            <section className="rfp-alloc-section">
              <div className="rfp-alloc-section__header">
                <span>Bin Allocations</span>
                {!readOnly && (
                  <button type="button" className="im-btn im-btn--sm" onClick={() => setBinRows((prev) => [...prev, emptyBin()])}>
                    Add
                  </button>
                )}
              </div>
              {loadingBins ? (
                <div className="rfp-alloc-loading">Loading bins...</div>
              ) : (
                <table className="rfp-alloc-table">
                  <thead>
                    <tr>
                      <th>Bin</th>
                      <th>Quantity</th>
                      {linkedOptions.length > 0 && <th>Linked Row</th>}
                      {!readOnly && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {binRows.map((row, index) => (
                      <tr key={`bin-${index}`}>
                        <td>
                          {bins.length > 0 ? (
                            <select
                              className="rfp-alloc-input"
                              value={row.bin_abs ?? ""}
                              disabled={readOnly}
                              onChange={(e) => updateArrayRow(setBinRows, index, "bin_abs", e.target.value)}
                            >
                              <option value="">--</option>
                              {bins.map((bin) => (
                                <option key={bin.AbsEntry} value={bin.AbsEntry}>
                                  {bin.BinCode}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="rfp-alloc-input"
                              value={row.bin_abs ?? ""}
                              readOnly={readOnly}
                              onChange={(e) => updateArrayRow(setBinRows, index, "bin_abs", e.target.value)}
                              placeholder="Bin AbsEntry"
                            />
                          )}
                        </td>
                        <td>
                          <input
                            className="rfp-alloc-input rfp-alloc-input--num"
                            type="number"
                            min="0"
                            step="any"
                            value={row.quantity}
                            readOnly={readOnly}
                            onChange={(e) => updateArrayRow(setBinRows, index, "quantity", e.target.value)}
                          />
                        </td>
                        {linkedOptions.length > 0 && (
                          <td>
                            <select
                              className="rfp-alloc-input"
                              value={row.serial_batch_base_line ?? ""}
                              disabled={readOnly}
                              onChange={(e) => updateArrayRow(setBinRows, index, "serial_batch_base_line", e.target.value)}
                            >
                              <option value="">--</option>
                              {linkedOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        )}
                        {!readOnly && (
                          <td>
                            <button type="button" className="rfp-alloc-remove" onClick={() => setBinRows((prev) => prev.filter((_, i) => i !== index))}>
                              -
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="rfp-alloc-section__summary">Total: {binTotal.toFixed(2)}</div>
            </section>
          )}
        </div>

        <div className="rfp-alloc-modal__footer">
          <button type="button" className="im-btn" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly && (
            <button type="button" className="im-btn im-btn--primary" onClick={handleSave}>
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
