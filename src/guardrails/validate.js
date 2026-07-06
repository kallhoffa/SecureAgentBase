const RULES = {
  string: (value, field, rules) => {
    if (typeof value !== 'string') return `${field} must be a string`;
    if (rules.minLength != null && value.length < rules.minLength) return `${field} must be at least ${rules.minLength} characters`;
    if (rules.maxLength != null && value.length > rules.maxLength) return `${field} must be at most ${rules.maxLength} characters`;
    if (rules.pattern && !rules.pattern.test(value)) return rules.message || `${field} has an invalid format`;
    return null;
  },
  number: (value, field, rules) => {
    if (typeof value !== 'number' || isNaN(value)) return `${field} must be a number`;
    if (rules.min != null && value < rules.min) return `${field} must be at least ${rules.min}`;
    if (rules.max != null && value > rules.max) return `${field} must be at most ${rules.max}`;
    return null;
  },
  boolean: (value, field) => {
    if (typeof value !== 'boolean') return `${field} must be a boolean`;
    return null;
  },
  email: (value, field) => {
    if (typeof value !== 'string') return `${field} must be a string`;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `${field} is not a valid email`;
    return null;
  },
  url: (value, field) => {
    if (typeof value !== 'string') return `${field} must be a string`;
    try { new URL(value); return null; }
    catch { return `${field} is not a valid URL`; }
  },
};

export const validate = (data, schema) => {
  const errors = {};
  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];
    const label = rules.label || field;

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors[field] = `${label} is required`;
      continue;
    }
    if (value === undefined || value === null || value === '') continue;

    const type = rules.type || 'string';
    const validator = RULES[type];
    if (!validator) continue;

    const error = validator(value, label, rules);
    if (error) errors[field] = error;

    if (rules.oneOf && !rules.oneOf.includes(value)) {
      errors[field] = `${label} must be one of: ${rules.oneOf.join(', ')}`;
    }
  }
  return Object.keys(errors).length > 0 ? errors : null;
};
