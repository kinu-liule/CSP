const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword',
  max: 3,
});

class GrpcInspector {
  async inspectUnary(method, metadata, payload, tenantId) {
    if (!tenantId) return { allowed: true };

    try {
      const blacklisted = await pool.query(
        `SELECT 1 FROM waf_blacklist WHERE tenant_id = $1 AND enabled = true
         AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
        [tenantId]
      );
      if (blacklisted.rows.length > 0) {
        return { allowed: false, reason: 'Tenant blocked', status: 403 };
      }

      const rules = await pool.query(
        `SELECT pattern, action FROM waf_rules WHERE tenant_id = $1 AND enabled = true
         AND rule_type IN ('regex', 'command_injection', 'sqli', 'xss')
         AND (detection_field = 'all' OR detection_field = 'request_body')
         ORDER BY priority ASC LIMIT 50`,
        [tenantId]
      );

      const checkValue = (value) => {
        if (!value || typeof value !== 'string') return null;
        for (const rule of rules.rows) {
          if (!rule.pattern) continue;
          try {
            if (new RegExp(rule.pattern, 'i').test(value)) {
              return { matched: true, action: rule.action, pattern: rule.pattern };
            }
          } catch {}
        }
        return null;
      };

      const flatValues = this._flatten(payload);
      for (const val of flatValues) {
        const result = checkValue(val);
        if (result && result.action === 'block') {
          return { allowed: false, reason: `gRPC payload blocked: matched ${result.pattern}` };
        }
      }

      return { allowed: true };
    } catch {
      return { allowed: true };
    }
  }

  async inspectStream(method, metadata, streamMessages, tenantId) {
    for (const msg of streamMessages) {
      const result = await this.inspectUnary(method, metadata, msg, tenantId);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }

  _flatten(obj, prefix = '') {
    const values = [];
    if (!obj || typeof obj !== 'object') {
      if (typeof obj === 'string') values.push(obj);
      return values;
    }
    if (Array.isArray(obj)) {
      for (const item of obj) values.push(...this._flatten(item));
    } else {
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') values.push(v);
        else if (v && typeof v === 'object') values.push(...this._flatten(v, `${prefix}.${k}`));
        else if (v !== null && v !== undefined) values.push(String(v));
      }
    }
    return values;
  }
}

module.exports = new GrpcInspector();
