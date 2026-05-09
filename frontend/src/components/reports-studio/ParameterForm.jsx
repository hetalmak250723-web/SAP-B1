import React from 'react';

const PARAM_TYPE_OPTIONS = [
  { value: 'string', label: 'String' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
];

function ParameterForm({
  selectedReport,
  parameters,
  paramForm,
  onChange,
  onSubmit,
  isSaving,
}) {
  return (
    <section className="rs-card">
      <div className="rs-card__header">
        <h3>Report Parameters</h3>
        {selectedReport ? <span className="rs-badge">{selectedReport.reportCode}</span> : null}
      </div>

      {selectedReport ? (
        <>
          <div className="rs-parameter-grid">
            <div className="rs-parameter-grid__header">Display Name</div>
            <div className="rs-parameter-grid__header">Param Name</div>
            <div className="rs-parameter-grid__header">Type</div>
            <div className="rs-parameter-grid__header">Required</div>
            <div className="rs-parameter-grid__header">Default</div>

            {parameters.length ? (
              parameters.map((parameter) => (
                <React.Fragment key={parameter.parameterId}>
                  <div>{parameter.displayName}</div>
                  <div>{parameter.paramName}</div>
                  <div>{parameter.paramType}</div>
                  <div>{parameter.isRequired ? 'Yes' : 'No'}</div>
                  <div>{parameter.defaultValue || '-'}</div>
                </React.Fragment>
              ))
            ) : (
              <div className="rs-parameter-grid__empty">No parameters added yet.</div>
            )}
          </div>

          <form
            className="rs-form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <div className="rs-form__split rs-form__split--triple">
              <label className="rs-field">
                <span>Display Name</span>
                <input
                  type="text"
                  value={paramForm.displayName}
                  onChange={(event) => onChange('displayName', event.target.value)}
                  placeholder="From Date"
                />
              </label>

              <label className="rs-field">
                <span>Param Name</span>
                <input
                  type="text"
                  value={paramForm.paramName}
                  onChange={(event) => onChange('paramName', event.target.value)}
                  placeholder="fromDate"
                />
              </label>

              <label className="rs-field">
                <span>Type</span>
                <select
                  value={paramForm.paramType}
                  onChange={(event) => onChange('paramType', event.target.value)}
                >
                  {PARAM_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="rs-form__split rs-form__split--triple">
              <label className="rs-field">
                <span>Default Value</span>
                <input
                  type="text"
                  value={paramForm.defaultValue}
                  onChange={(event) => onChange('defaultValue', event.target.value)}
                  placeholder="Optional"
                />
              </label>

              <label className="rs-field">
                <span>Sort Order</span>
                <input
                  type="number"
                  value={paramForm.sortOrder}
                  onChange={(event) => onChange('sortOrder', event.target.value)}
                  placeholder="0"
                />
              </label>

              <label className="rs-checkbox rs-checkbox--inline">
                <input
                  type="checkbox"
                  checked={paramForm.isRequired}
                  onChange={(event) => onChange('isRequired', event.target.checked)}
                />
                <span>Required</span>
              </label>
            </div>

            <div className="rs-actions">
              <button type="submit" className="rs-btn rs-btn--primary" disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Add Parameter'}
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="rs-panel__empty">Select a report first to define its parameters.</div>
      )}
    </section>
  );
}

export default ParameterForm;
