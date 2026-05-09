import React from 'react';

const REPORT_TYPE_OPTIONS = [
  { value: 'GET', label: 'GET API' },
  { value: 'POST', label: 'POST API' },
  { value: 'API_GET', label: 'API GET' },
  { value: 'API_POST', label: 'API POST' },
];

function ReportForm({
  menuOptions,
  reportForm,
  onChange,
  onSubmit,
  isSaving,
  selectedReport,
  previewParameters,
  isLoadingParameters,
  onRun,
  onPreview,
  canPreview,
  onReportCodeBlur,
  onOpenReportCodeLookup,
}) {
  return (
    <section className="rs-card">
      <div className="rs-card__header">
        <h3>Create Report</h3>
        {selectedReport ? (
          <div className="rs-actions rs-actions--header">
            <button type="button" className="rs-btn" onClick={onPreview} disabled={!canPreview}>
              Preview
            </button>
            <button type="button" className="rs-btn rs-btn--primary" onClick={onRun}>
              Run Selected Report
            </button>
          </div>
        ) : null}
      </div>

      {selectedReport ? (
        <div className="rs-selected-report">
          <div><strong>Name:</strong> {selectedReport.reportName}</div>
          <div><strong>Code:</strong> {selectedReport.reportCode}</div>
          <div><strong>Type:</strong> {selectedReport.reportType}</div>
          <div><strong>API:</strong> {selectedReport.apiUrl}</div>
          <div><strong>Visibility:</strong> {selectedReport.isPublic ? 'Public' : 'Private'}</div>
        </div>
      ) : (
        <div className="rs-panel__empty rs-panel__empty--soft">Select a report in the tree to see details.</div>
      )}

      <form
        className="rs-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label className="rs-field">
          <span>Report Menu</span>
          <select
            value={reportForm.reportMenuId}
            onChange={(event) => onChange('reportMenuId', event.target.value)}
          >
            <option value="">Select Menu</option>
            {menuOptions.map((option) => (
              <option key={option.menuId} value={option.menuId}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="rs-field">
          <span>Report Name</span>
          <input
            type="text"
            value={reportForm.reportName}
            onChange={(event) => onChange('reportName', event.target.value)}
            placeholder="Purchase Margin Report"
          />
        </label>

        <div className="rs-form__split">
          <label className="rs-field">
            <span>Report Code</span>
            <div className="rs-lookup-field">
              <input
                type="text"
                value={reportForm.reportCode}
                onChange={(event) => onChange('reportCode', event.target.value.toUpperCase())}
                onBlur={onReportCodeBlur}
                placeholder="PUR_MARGIN"
              />
              <button
                type="button"
                className="rs-btn rs-btn--lookup"
                onClick={onOpenReportCodeLookup}
                aria-label="Lookup report code"
                title="Lookup report code"
              >
                ...
              </button>
            </div>
          </label>

          <label className="rs-field">
            <span>Report Type</span>
            <select
              value={reportForm.reportType}
              onChange={(event) => onChange('reportType', event.target.value)}
            >
              {REPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="rs-field">
          <span>API URL</span>
          <input
            type="text"
            value={reportForm.apiUrl}
            onChange={(event) => onChange('apiUrl', event.target.value)}
            placeholder="/api/reports/sales-analysis/customers"
          />
        </label>

        <div className="rs-preview-panel">
          <div className="rs-preview-panel__header">
            <span>Detected Parameters</span>
            {isLoadingParameters ? (
              <span className="rs-preview-panel__status">Loading...</span>
            ) : (
              <span className="rs-badge">{previewParameters.length} Found</span>
            )}
          </div>

          {previewParameters.length ? (
            <div className="rs-parameter-grid rs-parameter-grid--compact">
              <div className="rs-parameter-grid__header">Display Name</div>
              <div className="rs-parameter-grid__header">Param Name</div>
              <div className="rs-parameter-grid__header">Type</div>
              <div className="rs-parameter-grid__header">Default</div>

              {previewParameters.map((parameter, index) => (
                <React.Fragment key={`${parameter.paramName}-${index}`}>
                  <div>{parameter.displayName}</div>
                  <div>{parameter.paramName}</div>
                  <div>{parameter.paramType}</div>
                  <div>{parameter.defaultValue || '-'}</div>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="rs-panel__empty rs-panel__empty--soft">
              Select a report code to auto-load its parameters.
            </div>
          )}
        </div>

        <label className="rs-checkbox">
          <input
            type="checkbox"
            checked={reportForm.isPublic}
            onChange={(event) => onChange('isPublic', event.target.checked)}
          />
          <span>Share this report with other users in the same company</span>
        </label>

        <div className="rs-actions">
          <button type="submit" className="rs-btn rs-btn--primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Report'}
          </button>
        </div>
      </form>
    </section>
  );
}

export default ReportForm;
