import React, { useRef } from "react";

const ITEM_TYPES = [
  { value: "pit_Item", label: "Item" },
];

const ISSUE_METHODS = [
  { value: "im_Manual", label: "Manual" },
  { value: "im_Backflush", label: "Backflush" },
];

const COLUMN_ORDER = [
  "ItemType",
  "ItemCode",
  "ItemName",
  "Quantity",
  "InventoryUOM",
  "Warehouse",
  "IssueMethod",
  "ProductionStdCost",
  "PriceList",
  "Price",
  "Comment",
  "DistributionRule",
  "WipAccount",
  "RouteSequence",
];

export default function BOMLines({
  lines,
  selectedLineId,
  warehouses,
  priceLists,
  distRules,
  projects,
  totalStdCost,
  totalPrice,
  onChange,
  onAdd,
  onDelete,
  onSelectLine,
  onItemSearch,
}) {
  void projects;
  const inputRefs = useRef({});

  const focusCell = (lineId, field) => {
    const target = inputRefs.current[`${lineId}:${field}`];
    if (target) {
      target.focus();
      target.select?.();
    }
  };

  const handleCellKeyDown = (event, rowIndex, field) => {
    const columnIndex = COLUMN_ORDER.indexOf(field);
    if (columnIndex === -1) return;

    if (event.key === "ArrowRight" || (event.key === "Tab" && !event.shiftKey)) {
      event.preventDefault();
      const nextColumn = COLUMN_ORDER[columnIndex + 1];
      if (nextColumn) {
        focusCell(lines[rowIndex]._id, nextColumn);
        return;
      }
      if (lines[rowIndex + 1]) {
        focusCell(lines[rowIndex + 1]._id, COLUMN_ORDER[0]);
        return;
      }
      const newLineId = onAdd();
      requestAnimationFrame(() => focusCell(newLineId, COLUMN_ORDER[0]));
      return;
    }

    if (event.key === "ArrowLeft" || (event.key === "Tab" && event.shiftKey)) {
      event.preventDefault();
      const previousColumn = COLUMN_ORDER[columnIndex - 1];
      if (previousColumn) {
        focusCell(lines[rowIndex]._id, previousColumn);
      } else if (rowIndex > 0) {
        focusCell(lines[rowIndex - 1]._id, COLUMN_ORDER[COLUMN_ORDER.length - 1]);
      }
      return;
    }

    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      if (lines[rowIndex + 1]) {
        focusCell(lines[rowIndex + 1]._id, field);
        return;
      }
      const newLineId = onAdd();
      requestAnimationFrame(() => focusCell(newLineId, field));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (rowIndex > 0) {
        focusCell(lines[rowIndex - 1]._id, field);
      }
    }
  };

  return (
    <div className="bom-lines-wrap">
      <div className="bom-grid-toolbar">
        <div className="bom-section-title">Item Matrix</div>
        <button type="button" className="bom-add-line-btn" onClick={onAdd}>
          + Add Line
        </button>
      </div>

      <div className="bom-lines-layout">
        <div className="bom-grid-scroll">
          <table className="bom-grid">
            <colgroup>
              <col className="bom-col bom-col--type" />
              <col className="bom-col bom-col--no" />
              <col className="bom-col bom-col--desc" />
              <col className="bom-col bom-col--qty" />
              <col className="bom-col bom-col--uom" />
              <col className="bom-col bom-col--wh" />
              <col className="bom-col bom-col--issue" />
              <col className="bom-col bom-col--stdcost" />
              <col className="bom-col bom-col--totalstd" />
              <col className="bom-col bom-col--pl" />
              <col className="bom-col bom-col--price" />
              <col className="bom-col bom-col--total" />
              <col className="bom-col bom-col--comment" />
              <col className="bom-col bom-col--dr" />
              <col className="bom-col bom-col--wip" />
              <col className="bom-col bom-col--route" />
              <col className="bom-col bom-col--delete" />
            </colgroup>
            <thead>
              <tr>
                <th className="bom-th bom-th--type" scope="col">Type</th>
                <th className="bom-th bom-th--no" scope="col">No.</th>
                <th className="bom-th bom-th--desc" scope="col">Description</th>
                <th className="bom-th bom-th--qty" scope="col">Quantity</th>
                <th className="bom-th bom-th--uom" scope="col">UoM Name</th>
                <th className="bom-th bom-th--wh" scope="col">Warehouse</th>
                <th className="bom-th bom-th--issue" scope="col">Issue Method</th>
                <th className="bom-th bom-th--stdcost" scope="col">Production Std Cost</th>
                <th className="bom-th bom-th--totalstd" scope="col">Total Production Std Cost</th>
                <th className="bom-th bom-th--pl" scope="col">Price List</th>
                <th className="bom-th bom-th--price" scope="col">Unit Price</th>
                <th className="bom-th bom-th--total" scope="col">Total</th>
                <th className="bom-th bom-th--comment" scope="col">Comments</th>
                <th className="bom-th bom-th--dr" scope="col">Distr. Rule</th>
                <th className="bom-th bom-th--wip" scope="col">WIP Account</th>
                <th className="bom-th bom-th--route" scope="col">Route Sequence</th>
                <th className="bom-th bom-th--delete" scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, rowIndex) => {
                const lineStdTotal = (Number(line.Quantity) || 0) * (Number(line.ProductionStdCost) || 0);
                const lineTotal = (Number(line.Quantity) || 0) * (Number(line.Price) || 0);

                return (
                  <tr
                    key={line._id}
                    className={`bom-grid__row${selectedLineId === line._id ? " bom-grid__row--selected" : ""}`}
                    onClick={() => onSelectLine(line._id)}
                  >
                    <td className="bom-grid__cell">
                      <select
                        ref={(node) => {
                          inputRefs.current[`${line._id}:ItemType`] = node;
                        }}
                        className="bom-cell-select"
                        value={line.ItemType}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "ItemType", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "ItemType")}
                      >
                        {ITEM_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="bom-grid__cell">
                      <div className="bom-cell-lookup">
                        <input
                          ref={(node) => {
                            inputRefs.current[`${line._id}:ItemCode`] = node;
                          }}
                          className="bom-cell-input"
                          value={line.ItemCode}
                          onFocus={() => onSelectLine(line._id)}
                          onChange={(e) => onChange(line._id, "ItemCode", e.target.value)}
                          onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "ItemCode")}
                          placeholder="Item Code"
                        />
                        <button
                          type="button"
                          className="im-lookup-btn"
                          tabIndex={-1}
                          title="Browse items"
                          aria-label="Browse items"
                          onClick={() => {
                            onSelectLine(line._id);
                            onItemSearch(line._id);
                          }}
                        >
                          ...
                        </button>
                      </div>
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:ItemName`] = node;
                        }}
                        className="bom-cell-input"
                        value={line.ItemName}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "ItemName", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "ItemName")}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:Quantity`] = node;
                        }}
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        step="any"
                        value={line.Quantity}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Quantity", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "Quantity")}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:InventoryUOM`] = node;
                        }}
                        className="bom-cell-input"
                        value={line.InventoryUOM}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "InventoryUOM", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "InventoryUOM")}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <select
                        ref={(node) => {
                          inputRefs.current[`${line._id}:Warehouse`] = node;
                        }}
                        className="bom-cell-select"
                        value={line.Warehouse}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Warehouse", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "Warehouse")}
                      >
                        <option value="">--</option>
                        {warehouses.map((w) => (
                          <option key={w.WarehouseCode} value={w.WarehouseCode}>
                            {w.WarehouseCode}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="bom-grid__cell">
                      <select
                        ref={(node) => {
                          inputRefs.current[`${line._id}:IssueMethod`] = node;
                        }}
                        className="bom-cell-select"
                        value={line.IssueMethod}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "IssueMethod", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "IssueMethod")}
                      >
                        {ISSUE_METHODS.map((m) => (
                          <option key={m.value} value={m.value}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:ProductionStdCost`] = node;
                        }}
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        step="any"
                        value={line.ProductionStdCost}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "ProductionStdCost", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "ProductionStdCost")}
                      />
                    </td>

                    <td className="bom-grid__cell bom-grid__cell--readonly bom-grid__cell--num">
                      {lineStdTotal.toFixed(2)}
                    </td>

                    <td className="bom-grid__cell">
                      <select
                        ref={(node) => {
                          inputRefs.current[`${line._id}:PriceList`] = node;
                        }}
                        className="bom-cell-select"
                        value={line.PriceList}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "PriceList", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "PriceList")}
                      >
                        <option value="">--</option>
                        {priceLists.map((p) => (
                          <option key={p.PriceListNo} value={p.PriceListNo}>
                            {p.PriceListName}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:Price`] = node;
                        }}
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        step="any"
                        value={line.Price}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Price", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "Price")}
                      />
                    </td>

                    <td className="bom-grid__cell bom-grid__cell--readonly bom-grid__cell--num">
                      {lineTotal.toFixed(2)}
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:Comment`] = node;
                        }}
                        className="bom-cell-input"
                        value={line.Comment}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Comment", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "Comment")}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <select
                        ref={(node) => {
                          inputRefs.current[`${line._id}:DistributionRule`] = node;
                        }}
                        className="bom-cell-select"
                        value={line.DistributionRule}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "DistributionRule", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "DistributionRule")}
                      >
                        <option value="">--</option>
                        {distRules.map((d) => (
                          <option key={d.FactorCode} value={d.FactorCode}>
                            {d.FactorCode}
                          </option>
                        ))}
                      </select>
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:WipAccount`] = node;
                        }}
                        className="bom-cell-input"
                        value={line.WipAccount}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "WipAccount", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "WipAccount")}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        ref={(node) => {
                          inputRefs.current[`${line._id}:RouteSequence`] = node;
                        }}
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        value={line.RouteSequence}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "RouteSequence", e.target.value)}
                        onKeyDown={(event) => handleCellKeyDown(event, rowIndex, "RouteSequence")}
                      />
                    </td>

                    <td className="bom-grid__cell bom-grid__cell--action">
                      <button
                        type="button"
                        className="bom-delete-line-btn"
                        onClick={() => onDelete(line._id)}
                        title="Remove row"
                      >
                        x
                      </button>
                    </td>
                  </tr>
                );
              })}

              {lines.length < 8 &&
                Array.from({ length: 8 - lines.length }).map((_, i) => (
                  <tr key={`empty-${i}`} className="bom-grid__row bom-grid__row--empty">
                    {Array.from({ length: 17 }).map((__, j) => (
                      <td key={j} className="bom-grid__cell bom-grid__cell--empty" />
                    ))}
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="bom-grid__footer">
                <td colSpan={8} />
                <td className="bom-grid__cell bom-grid__cell--num bom-grid__cell--total">
                  {totalStdCost.toFixed(2)}
                </td>
                <td colSpan={2} />
                <td className="bom-grid__cell bom-grid__cell--num bom-grid__cell--total">
                  {totalPrice.toFixed(2)}
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="bom-bottom-bar">
        <button type="button" className="im-btn">
          Product Price
        </button>
      </div>
    </div>
  );
}
