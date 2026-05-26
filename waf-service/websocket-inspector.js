const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword',
  max: 3,
});

class WebSocketInspector {
  constructor() {
    this.connections = new Map();
  }

  async inspectConnect(ip, path, protocol, tenantId) {
    if (!tenantId) return { allowed: true };

    try {
      const blacklisted = await pool.query(
        `SELECT 1 FROM waf_blacklist WHERE tenant_id = $1 AND enabled = true
         AND (ip_address = $2::inet OR $2::inet <<= cidr_block)
         AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
        [tenantId, ip]
      );
      if (blacklisted.rows.length > 0) {
        return { allowed: false, reason: 'IP blacklisted', status: 403 };
      }

      const rules = await pool.query(
        `SELECT pattern FROM waf_rules WHERE tenant_id = $1 AND enabled = true
         AND rule_type IN ('regex', 'input_validation') AND (detection_field = 'all' OR detection_field = 'request_uri')
         AND action IN ('block', 'drop')`,
        [tenantId]
      );
      for (const rule of rules.rows) {
        if (!rule.pattern) continue;
        try {
          if (new RegExp(rule.pattern, 'i').test(path)) {
            return { allowed: false, reason: `Blocked by rule matching path: ${path}`, status: 403 };
          }
        } catch {}
      }
      return { allowed: true };
    } catch {
      return { allowed: true };
    }
  }

  async inspectMessage(connectionId, message, tenantId) {
    if (!tenantId || !message) return { allowed: true };
    try {
      const rules = await pool.query(
        `SELECT pattern, action FROM waf_rules WHERE tenant_id = $1 AND enabled = true
         AND rule_type IN ('regex', 'signature', 'command_injection', 'sqli', 'xss')
         AND (detection_field = 'all' OR detection_field = 'request_body')
         ORDER BY priority ASC LIMIT 50`,
        [tenantId]
      );
      const msgStr = typeof message === 'string' ? message : JSON.stringify(message);
      for (const rule of rules.rows) {
        if (!rule.pattern) continue;
        try {
          if (new RegExp(rule.pattern, 'i').test(msgStr)) {
            if (rule.action === 'drop' || rule.action === 'block') {
              return { allowed: false, reason: `Message blocked by rule: ${rule.pattern}` };
            }
            return { allowed: true, action: 'log' };
          }
        } catch {}
      }
      return { allowed: true };
    } catch {
      return { allowed: true };
    }
  }

  trackConnection(connectionId, ip, tenantId) {
    this.connections.set(connectionId, { ip, tenantId, connectedAt: Date.now() });
  }

  removeConnection(connectionId) {
    this.connections.delete(connectionId);
  }

  getStats() {
    return { active_connections: this.connections.size };
  }
}

module.exports = new WebSocketInspector();
