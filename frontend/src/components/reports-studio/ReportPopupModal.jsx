import React from 'react';

const buildInputType = (paramType) => {
  if (paramType === 'date') return 'date';
  if (paramType === 'number') return 'number';
  return 'text';
};

function ReportPopupModal({
  isOpen,
  report,
  parameters,
  values,
  isRunning,
  onChange,
  onClose,
  onRun,
}) {
  if (!isOpen || !report) {
    return null;
  }

  return (
    <div className="rs-modal__backdrop" role="presentation" onClick={onClose}>
      <div className="rs-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="rs-modal__titlebar">
          <span>{report.reportName} - Selection Criteria</span>
          <button type="button" className="rs-modal__close" onClick={onClose}>
            x
          </button>
        </div>

        <div className="rs-modal__body">
          <div className="rs-modal__summary">
            <div><strong>Code:</strong> {report.reportCode}</div>
            <div><strong>Type:</strong> {report.reportType}</div>
          </div>

          <div className="rs-modal__fields">
            {parameters.length ? (
              parameters.map((parameter) => (
                <label key={parameter.parameterId} className="rs-field">
                  <span>
                    {parameter.displayName}
                    {parameter.isRequired ? ' *' : ''}
                  </span>
                  <input
                    type={buildInputType(parameter.paramType)}
                    value={values[parameter.paramName] ?? ''}
                    onChange={(event) => onChange(parameter.paramName, event.target.value)}
                    required={parameter.isRequired}
                  />
                </label>
              ))
            ) : (
              <div className="rs-panel__empty">This report has no parameters, so it can run directly.</div>
            )}
          </div>
        </div>

        <div className="rs-modal__footer">
          <button type="button" className="rs-btn rs-btn--primary" onClick={onRun} disabled={isRunning}>
            {isRunning ? 'Running...' : 'OK'}
          </button>
          <button type="button" className="rs-btn" onClick={onClose} disabled={isRunning}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReportPopupModal;
