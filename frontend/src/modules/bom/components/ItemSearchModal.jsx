import React, { useEffect, useMemo, useRef, useState } from "react";

const getCellValue = (row, key) => {
  const value = row?.[key];
  return value == null ? "" : value;
};

const normalize = (value) => String(value || "").trim().toLowerCase();

const matchesQuery = (row, query, columns) => {
  if (!query) return true;
  return columns.some((column) => normalize(getCellValue(row, column.key)).includes(query));
};

export default function ItemSearchModal({ onSelect, onClose, fetchItems, columns, title }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);

  const displayColumns = useMemo(
    () =>
      columns || [
        { key: "ItemCode", label: "Item No." },
        { key: "ItemName", label: "Item Description" },
        { key: "InventoryUOM", label: "UoM" },
      ],
    [columns]
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;

    const loadItems = async () => {
      setLoading(true);
      try {
        const data = await fetchItems(query);
        if (active) {
          setItems(Array.isArray(data) ? data : []);
          setSelectedIndex(-1);
        }
      } catch {
        if (active) {
          setItems([]);
          setSelectedIndex(-1);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadItems();

    return () => {
      active = false;
    };
  }, [fetchItems, query]);

  const normalizedQuery = normalize(query);

  const filteredItems = useMemo(
    () => items.filter((item) => matchesQuery(item, normalizedQuery, displayColumns)),
    [displayColumns, items, normalizedQuery]
  );

  const handleChoose = () => {
    if (selectedIndex < 0 || !filteredItems[selectedIndex]) return;
    onSelect(filteredItems[selectedIndex]);
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      onClose();
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (selectedIndex >= 0 && filteredItems[selectedIndex]) {
        onSelect(filteredItems[selectedIndex]);
      }
    }
  };

  return (
    <div className="im-modal-overlay" onClick={onClose}>
      <div
        className="im-modal im-modal--cfl"
        style={{ width: "1100px", maxWidth: "95vw", maxHeight: "82vh" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="im-modal__header">
          <span>{title || "List of Items"}</span>
          <button className="im-modal__close" onClick={onClose}>
            x
          </button>
        </div>

        <div
          className="im-modal__search"
          style={{ background: "#f5f5f5", borderBottom: "1px solid #c8d0da" }}
        >
          <label
            htmlFor="bom-item-search"
            style={{ minWidth: 36, fontSize: 12, fontWeight: 600, color: "#2c3e50" }}
          >
            Find
          </label>
          <input
            id="bom-item-search"
            ref={inputRef}
            className="im-field__input"
            style={{ flex: 1 }}
            placeholder="Search by item number or description"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="im-modal__body" style={{ padding: 0 }}>
          <table className="im-lookup-table">
            <thead>
              <tr>
                {displayColumns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={displayColumns.length} className="im-modal__empty" style={{ padding: 24 }}>
                    Loading items...
                  </td>
                </tr>
              )}

              {!loading && filteredItems.length === 0 && (
                <tr>
                  <td colSpan={displayColumns.length} className="im-modal__empty" style={{ padding: 24 }}>
                    No items found.
                  </td>
                </tr>
              )}

              {!loading &&
                filteredItems.map((item, index) => (
                  <tr
                    key={`${getCellValue(item, displayColumns[0].key)}-${index}`}
                    className={`im-lookup-table__row${selectedIndex === index ? " selected" : ""}`}
                    style={{ background: selectedIndex === index ? "#fff8c5" : undefined }}
                    onClick={() => setSelectedIndex(index)}
                    onDoubleClick={() => onSelect(item)}
                  >
                    {displayColumns.map((column) => (
                      <td
                        key={column.key}
                        style={
                          /stock|qty|quantity|price|total/i.test(column.key)
                            ? { textAlign: "right" }
                            : undefined
                        }
                      >
                        {getCellValue(item, column.key)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="im-modal__footer">
          <button className="im-btn im-btn--primary" onClick={handleChoose} disabled={selectedIndex < 0}>
            Choose
          </button>
          <button className="im-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
