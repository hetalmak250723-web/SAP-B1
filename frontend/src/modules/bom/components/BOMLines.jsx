import React from "react";

const ITEM_TYPES = [
  { value: "pit_Item", label: "Item" },
];

const ISSUE_METHODS = [
  { value: "im_Manual", label: "Manual" },
  { value: "im_Backflush", label: "Backflush" },
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

  return (
    <div className="bom-lines-wrap">
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
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
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
                        className="bom-cell-select"
                        value={line.ItemType}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "ItemType", e.target.value)}
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
                          className="bom-cell-input"
                          value={line.ItemCode}
                          onFocus={() => onSelectLine(line._id)}
                          onChange={(e) => onChange(line._id, "ItemCode", e.target.value)}
                          placeholder="Item Code"
                        />
                        <button
                          type="button"
                          className="im-lookup-btn"
                          tabIndex={-1}
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
                        className="bom-cell-input"
                        value={line.ItemName}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "ItemName", e.target.value)}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        step="any"
                        value={line.Quantity}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Quantity", e.target.value)}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        className="bom-cell-input"
                        value={line.InventoryUOM}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "InventoryUOM", e.target.value)}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <select
                        className="bom-cell-select"
                        value={line.Warehouse}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Warehouse", e.target.value)}
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
                        className="bom-cell-select"
                        value={line.IssueMethod}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "IssueMethod", e.target.value)}
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
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        step="any"
                        value={line.ProductionStdCost}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "ProductionStdCost", e.target.value)}
                      />
                    </td>

                    <td className="bom-grid__cell bom-grid__cell--readonly bom-grid__cell--num">
                      {lineStdTotal.toFixed(2)}
                    </td>

                    <td className="bom-grid__cell">
                      <select
                        className="bom-cell-select"
                        value={line.PriceList}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "PriceList", e.target.value)}
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
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        step="any"
                        value={line.Price}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Price", e.target.value)}
                      />
                    </td>

                    <td className="bom-grid__cell bom-grid__cell--readonly bom-grid__cell--num">
                      {lineTotal.toFixed(2)}
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        className="bom-cell-input"
                        value={line.Comment}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "Comment", e.target.value)}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <select
                        className="bom-cell-select"
                        value={line.DistributionRule}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "DistributionRule", e.target.value)}
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
                        className="bom-cell-input"
                        value={line.WipAccount}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "WipAccount", e.target.value)}
                      />
                    </td>

                    <td className="bom-grid__cell">
                      <input
                        className="bom-cell-input bom-cell-input--num"
                        type="number"
                        min="0"
                        value={line.RouteSequence}
                        onFocus={() => onSelectLine(line._id)}
                        onChange={(e) => onChange(line._id, "RouteSequence", e.target.value)}
                      />
                    </td>
                  </tr>
                );
              })}

              {lines.length < 8 &&
                Array.from({ length: 8 - lines.length }).map((_, i) => (
                  <tr key={`empty-${i}`} className="bom-grid__row bom-grid__row--empty">
                    {Array.from({ length: 16 }).map((__, j) => (
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
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="bom-row-actions" aria-label="Row actions">
          <button type="button" className="bom-row-btn" onClick={onAdd} title="Add row">
            +
          </button>
          <button
            type="button"
            className="bom-row-btn bom-row-btn--del"
            onClick={() => {
              if (selectedLineId) onDelete(selectedLineId);
            }}
            title="Remove selected row"
          >
            -
          </button>
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
