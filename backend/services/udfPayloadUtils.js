const isUdfKey = (key) => /^U_[A-Za-z0-9_]+$/.test(String(key || ''));

const hasUdfValue = (value) => (
  value !== undefined &&
  value !== null &&
  value !== ''
);

const applyUdfs = (target, values = {}) => {
  Object.entries(values || {}).forEach(([key, value]) => {
    if (isUdfKey(key) && hasUdfValue(value)) {
      target[key] = value;
    }
  });
  return target;
};

module.exports = {
  applyUdfs,
  hasUdfValue,
  isUdfKey,
};
