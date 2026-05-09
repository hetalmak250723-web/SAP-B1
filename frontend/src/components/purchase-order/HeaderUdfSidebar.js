import React from 'react';

function renderField(field, value, disabled, onChange) {
  if (field.type === 'select') {
    return (
      <select
        className="form-control form-control-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {field.options.map((option) => {
          const normalizedOption = typeof option === 'object'
            ? option
            : { value: option, label: option };

          return (
            <option key={normalizedOption.value} value={normalizedOption.value}>
              {normalizedOption.label}
            </option>
          );
        })}
      </select>
    );
  }

  if (field.type === 'textarea') {
    return (
      <textarea
        rows={3}
        className="form-control form-control-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      type={field.type === 'date' ? 'date' : 'text'}
      className="form-control form-control-sm"
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function HeaderUdfSidebar({
  isOpen,
  fields,
  formSettings,
  values,
  onFieldChange,
  orientation = 'vertical',
  className = '',
  style,
}) {
  if (!isOpen || !Array.isArray(fields) || fields.length === 0) {
    return null;
  }

  const containerClass = orientation === 'horizontal'
    ? 'po-udf-sidebar-horizontal'
    : 'col-xl-3 col-lg-4 align-self-start';

  const rootClassName = [containerClass, className].filter(Boolean).join(' ');

  return (
    <div className={rootClassName} style={style}>
      <div className={`card p-3 po-udf-sidebar-card ${orientation === 'horizontal' ? 'po-udf-sidebar-card-horizontal' : ''}`}>
        <div className="mb-3 border-bottom pb-2">
          <h6 className="mb-1">Header UDFs</h6>
          <small className="text-muted">
            Marketing document header user-defined fields
          </small>
        </div>

        <div className="po-udf-sidebar-body">
          {fields.map((field) => {
            const disabled = formSettings.headerUdfs[field.key]?.active === false;

            return (
              <div
                key={field.key}
                className={`mb-3 po-udf-sidebar-field po-udf-sidebar-field--${field.type || 'text'}`}
              >
                <label className="form-label mb-1">{field.label}</label>
                {renderField(
                  field,
                  values[field.key],
                  disabled,
                  (nextValue) => onFieldChange(field.key, nextValue)
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default HeaderUdfSidebar;
