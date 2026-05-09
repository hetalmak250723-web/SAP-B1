import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchMarketingDocumentUdfs } from '../api/udfMetadataApi';

const normalizeOptions = (options = []) =>
  [{ value: '', label: '' }, ...options].filter((option, index, all) => (
    index === all.findIndex((candidate) => candidate.value === option.value)
  ));

const normalizeField = (field) => ({
  ...field,
  type: field.type || 'text',
  defaultValue: field.defaultValue ?? '',
  options: field.type === 'select' ? normalizeOptions(field.options || []) : field.options,
});

const mergeDefinitions = (sapFields = [], fallbackFields = []) => {
  const fieldsByKey = new Map();

  fallbackFields.forEach((field) => fieldsByKey.set(field.key, normalizeField(field)));
  sapFields.forEach((field) => fieldsByKey.set(field.key, normalizeField({
    ...fieldsByKey.get(field.key),
    ...field,
  })));

  return Array.from(fieldsByKey.values());
};

const mergeVisibilityGroup = (fields, saved = {}) =>
  fields.reduce((acc, field) => {
    acc[field.key] = {
      visible: field.visible !== undefined ? field.visible : true,
      active: true,
      ...(saved[field.key] || {}),
    };
    return acc;
  }, {});

const createUdfStateFromDefinitions = (definitions, values = {}) =>
  definitions.reduce((acc, field) => {
    acc[field.key] = values[field.key] ?? field.defaultValue ?? '';
    return acc;
  }, {});

function useMarketingDocumentUdfs({
  documentType,
  fallbackHeaderFields,
  fallbackRowFields,
  formSettings,
  setFormSettings,
}) {
  const [sapHeaderFields, setSapHeaderFields] = useState([]);
  const [sapRowFields, setSapRowFields] = useState([]);

  useEffect(() => {
    let cancelled = false;

    fetchMarketingDocumentUdfs(documentType)
      .then((response) => {
        if (cancelled) return;
        setSapHeaderFields(response.data?.header || []);
        setSapRowFields(response.data?.row || []);
      })
      .catch((error) => {
        console.warn(`Failed to load SAP UDF metadata for ${documentType}`, error);
      });

    return () => {
      cancelled = true;
    };
  }, [documentType]);

  const headerFields = useMemo(
    () => mergeDefinitions(sapHeaderFields, fallbackHeaderFields),
    [fallbackHeaderFields, sapHeaderFields]
  );

  const rowFields = useMemo(
    () => mergeDefinitions(sapRowFields, fallbackRowFields),
    [fallbackRowFields, sapRowFields]
  );

  useEffect(() => {
    if (!setFormSettings) return;

    setFormSettings((prev) => ({
      ...prev,
      headerUdfs: mergeVisibilityGroup(headerFields, prev.headerUdfs),
      rowUdfs: mergeVisibilityGroup(rowFields, prev.rowUdfs),
    }));
  }, [headerFields, rowFields, setFormSettings]);

  const visibleHeaderFields = useMemo(
    () => headerFields.filter((field) => formSettings.headerUdfs?.[field.key]?.visible !== false),
    [formSettings.headerUdfs, headerFields]
  );

  const visibleRowFields = useMemo(
    () => rowFields.filter((field) => formSettings.rowUdfs?.[field.key]?.visible !== false),
    [formSettings.rowUdfs, rowFields]
  );

  return {
    headerFields,
    rowFields,
    visibleHeaderFields,
    visibleRowFields,
    createHeaderUdfState: useCallback(
      (values = {}) => createUdfStateFromDefinitions(headerFields, values),
      [headerFields]
    ),
    createRowUdfState: useCallback(
      (values = {}) => createUdfStateFromDefinitions(rowFields, values),
      [rowFields]
    ),
  };
}

export {
  createUdfStateFromDefinitions,
  useMarketingDocumentUdfs,
};
