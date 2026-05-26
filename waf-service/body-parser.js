class BodyParser {
  parse(contentType, rawBody) {
    if (!rawBody || !contentType) return { parsed: null, error: null };
    try {
      if (contentType.includes('application/json')) {
        return { parsed: JSON.parse(rawBody), format: 'json', error: null };
      }
      if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(rawBody);
        const obj = {};
        for (const [k, v] of params) obj[k] = v;
        return { parsed: obj, format: 'form', error: null };
      }
      if (contentType.includes('application/xml') || contentType.includes('text/xml')) {
        return { parsed: rawBody, format: 'xml', error: null };
      }
      if (contentType.includes('multipart/form-data')) {
        return { parsed: rawBody, format: 'multipart', error: null };
      }
      return { parsed: rawBody, format: 'raw', error: null };
    } catch (err) {
      return { parsed: rawBody, format: 'raw', error: err.message };
    }
  }

  validateAgainstSchema(parsedBody, schema) {
    if (!schema || !parsedBody || typeof parsedBody !== 'object') return { valid: true, issues: [] };
    const issues = [];

    const checkField = (value, rules, path) => {
      if (!rules) return;
      if (rules.type && typeof value !== rules.type && !(rules.type === 'array' && Array.isArray(value))) {
        if (value !== null && value !== undefined) issues.push({ path, message: `Expected type ${rules.type}, got ${typeof value}` });
      }
      if (rules.required && (value === undefined || value === null)) issues.push({ path, message: 'Required field missing' });
      if (typeof value === 'string') {
        if (rules.minLength && value.length < rules.minLength) issues.push({ path, message: `Minimum length ${rules.minLength}` });
        if (rules.maxLength && value.length > rules.maxLength) issues.push({ path, message: `Maximum length ${rules.maxLength}` });
        if (rules.pattern && !new RegExp(rules.pattern).test(value)) issues.push({ path, message: `Pattern mismatch: ${rules.pattern}` });
        if (rules.enum && !rules.enum.includes(value)) issues.push({ path, message: `Must be one of: ${rules.enum.join(', ')}` });
      }
      if (typeof value === 'number') {
        if (rules.minimum !== undefined && value < rules.minimum) issues.push({ path, message: `Minimum ${rules.minimum}` });
        if (rules.maximum !== undefined && value > rules.maximum) issues.push({ path, message: `Maximum ${rules.maximum}` });
      }
    };

    const walkObject = (obj, schemaRules, basePath = '') => {
      if (!obj || !schemaRules) return;
      if (schemaRules.properties) {
        for (const [key, rules] of Object.entries(schemaRules.properties)) {
          const fieldPath = basePath ? `${basePath}.${key}` : key;
          if (rules.properties) {
            walkObject(obj[key], rules, fieldPath);
          } else {
            checkField(obj[key], rules, fieldPath);
          }
        }
      }
      if (schemaRules.items && Array.isArray(obj)) {
        obj.forEach((item, i) => {
          if (schemaRules.items.properties) {
            walkObject(item, schemaRules.items, `${basePath}[${i}]`);
          } else {
            checkField(item, schemaRules.items, `${basePath}[${i}]`);
          }
        });
      }
      if (schemaRules.required && Array.isArray(schemaRules.required)) {
        for (const req of schemaRules.required) {
          if (obj[req] === undefined || obj[req] === null) {
            issues.push({ path: basePath ? `${basePath}.${req}` : req, message: 'Required field missing' });
          }
        }
      }
    };

    walkObject(parsedBody, schema);
    return { valid: issues.length === 0, issues };
  }

  sanitize(value, type) {
    if (typeof value !== 'string') return value;
    if (type === 'string' || !type) {
      return value
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
    }
    return value;
  }

  deepSanitize(obj) {
    if (typeof obj === 'string') return this.sanitize(obj, 'string');
    if (Array.isArray(obj)) return obj.map(item => this.deepSanitize(item));
    if (obj && typeof obj === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.deepSanitize(value);
      }
      return sanitized;
    }
    return obj;
  }
}

module.exports = new BodyParser();
