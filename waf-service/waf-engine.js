const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword',
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 3000,
});

class WafEngine {
  constructor() {
    this.ruleCache = null;
    this.cacheTime = 0;
    this.CACHE_TTL = 30000;
    this.whitelistCache = new Map();
    this.blacklistCache = new Map();
    this.rateLimiters = new Map();
  }

  async inspect(method, uri, headers, body, sourceIp, contentType, tenantId) {
    const result = {
      allowed: true,
      action: null,
      rule_name: null,
      rule_id: null,
      severity: null,
      score: 0,
      matched_field: null,
      matched_value: null,
      blocked: false,
      reason: null,
      status_code: null,
    };

    if (!tenantId) return result;

    const query = uri.split('?')[0] || '';
    const qs = uri.split('?')[1] || '';
    const ua = (headers && headers['user-agent']) || '';
    const referer = (headers && headers['referer']) || '';

    // 1. Check whitelist (fast path — skip all checks if whitelisted)
    const whitelisted = await this._checkWhitelist(sourceIp, tenantId);
    if (whitelisted) return result;

    // 2. Check blacklist
    const blacklisted = await this._checkBlacklist(sourceIp, tenantId);
    if (blacklisted) {
      result.allowed = false;
      result.action = 'block';
      result.blocked = true;
      result.reason = blacklisted;
      result.status_code = 403;
      await this._logAttack({ method, query, qs, headers, body, sourceIp, contentType, ua, referer, tenantId, action_taken: 'block', blocked: true, severity: 'high', reason: 'IP blacklisted' });
      return result;
    }

    // 3. Check auto-blacklist
    const autoBlocked = await this._checkAutoBlacklist(sourceIp, tenantId);
    if (autoBlocked) {
      result.allowed = false;
      result.action = 'block';
      result.blocked = true;
      result.reason = autoBlocked;
      result.status_code = 403;
      await this._logAttack({ method, query, qs, headers, body, sourceIp, contentType, ua, referer, tenantId, action_taken: 'block', blocked: true, severity: 'high', reason: 'IP auto-blacklisted' });
      return result;
    }

    // 4. Load rules + signatures
    const rules = await this._getRules(tenantId);

    // 5. Match rules against request
    for (const rule of rules) {
      const match = this._matchRule(rule, method, query, qs, headers, body, ua, referer, contentType);
      if (match) {
        result.matched_field = match.field;
        result.matched_value = match.value;
        result.rule_id = rule.id;
        result.rule_name = rule.name;
        result.severity = rule.severity;
        result.score = parseFloat(rule.score) || 5;

        if (rule.action === 'block' || rule.action === 'drop') {
          result.allowed = false;
          result.action = rule.action;
          result.blocked = true;
          result.reason = `Blocked by rule: ${rule.name}`;
          result.status_code = 403;
        } else if (rule.action === 'challenge') {
          result.allowed = false;
          result.action = 'challenge';
          result.reason = `Challenge required by rule: ${rule.name}`;
          result.status_code = 401;
        } else if (rule.action === 'redirect') {
          result.allowed = false;
          result.action = 'redirect';
          result.reason = `Redirect: ${rule.action_value || '/'}`;
          result.status_code = 302;
        } else if (rule.action === 'delay') {
          result.action = 'delay';
          result.reason = `Delayed by rule: ${rule.name}`;
          result.status_code = 429;
        } else if (rule.action === 'log') {
          result.action = 'log';
          result.reason = `Logged by rule: ${rule.name}`;
        }

        if (result.action !== 'allow' && result.action !== 'log') {
          await this._logAttack({ method, query, qs, headers, body, sourceIp, contentType, ua, referer, tenantId, rule_id: rule.id, rule_name: rule.name, matched_field: match.field, matched_value: match.value, action_taken: result.action, blocked: result.blocked, severity: rule.severity, score: rule.score, reason: rule.name });
          await this._updateAutoBlacklist(sourceIp, tenantId, rule.id, rule.severity);
        }
        return result;
      }
    }

    // 6. Check rate limits
    const rateLimitResult = await this._checkRateLimit(sourceIp, query, method, tenantId);
    if (rateLimitResult) {
      result.allowed = false;
      result.action = 'rate_limited';
      result.blocked = true;
      result.reason = rateLimitResult;
      result.status_code = 429;
      await this._logAttack({ method, query, qs, headers, body, sourceIp, contentType, ua, referer, tenantId, action_taken: 'rate_limited', blocked: true, severity: 'medium', reason: 'Rate limit exceeded' });
      return result;
    }

    return result;
  }

  async _getRules(tenantId) {
    const now = Date.now();
    if (this.ruleCache && (now - this.cacheTime) < this.CACHE_TTL) return this.ruleCache;
    try {
      const result = await pool.query(
        `SELECT r.*, s.pattern as sig_pattern, s.category as sig_category, s.cve_id
         FROM waf_rules r
         LEFT JOIN waf_signatures s ON r.rule_type = 'signature' AND s.enabled = true AND s.tenant_id = r.tenant_id
         WHERE r.tenant_id = $1 AND r.enabled = true
         ORDER BY r.priority ASC`,
        [tenantId]
      );
      this.ruleCache = result.rows;
      this.cacheTime = now;
      return result.rows;
    } catch {
      return [];
    }
  }

  _matchRule(rule, method, uri, qs, headers, body, ua, referer, contentType) {
    const fields = this._getDetectionFields(rule, method, uri, qs, headers, body, ua, referer, contentType);
    const pattern = rule.pattern || rule.sig_pattern;
    if (!pattern) return null;

    for (const { name, value } of fields) {
      if (!value) continue;
      let matched = false;
      try {
        if (rule.pattern_type === 'regex') {
          const re = new RegExp(pattern, 'i');
          matched = re.test(value);
        } else if (rule.pattern_type === 'exact') {
          matched = value === pattern;
        } else if (rule.pattern_type === 'contains') {
          matched = value.toLowerCase().includes(pattern.toLowerCase());
        } else if (rule.pattern_type === 'prefix') {
          matched = value.toLowerCase().startsWith(pattern.toLowerCase());
        } else if (rule.pattern_type === 'suffix') {
          matched = value.toLowerCase().endsWith(pattern.toLowerCase());
        } else {
          const re = new RegExp(pattern, 'i');
          matched = re.test(value);
        }
      } catch {
        continue;
      }
      if (rule.is_negated) matched = !matched;
      if (matched) return { field: name, value: value.substring(0, 200) };
    }
    return null;
  }

  _getDetectionFields(rule, method, uri, qs, headers, body, ua, referer, contentType) {
    const df = rule.detection_field || 'request_uri';
    const all = [
      { name: 'request_uri', value: uri },
      { name: 'query_string', value: qs },
      { name: 'request_method', value: method },
      { name: 'user_agent', value: ua },
      { name: 'referer', value: referer },
      { name: 'content_type', value: contentType },
    ];
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        all.push({ name: `header:${k}`, value: typeof v === 'string' ? v : JSON.stringify(v) });
      }
    }
    if (body) {
      const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
      all.push({ name: 'request_body', value: bodyStr });
    }
    if (df === 'all') return all;
    return all.filter(f => f.name === df || f.name.startsWith(df + ':') || f.name === `header:${df}`);
  }

  async _checkWhitelist(ip, tenantId) {
    const key = `${tenantId}:${ip}`;
    if (this.whitelistCache.has(key)) return this.whitelistCache.get(key);
    try {
      const result = await pool.query(
        `SELECT 1 FROM waf_whitelist WHERE tenant_id = $1 AND enabled = true
         AND (ip_address = $2::inet OR $2::inet <<= cidr_block)
         AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
        [tenantId, ip]
      );
      const hit = result.rows.length > 0;
      this.whitelistCache.set(key, hit);
      setTimeout(() => this.whitelistCache.delete(key), 60000);
      return hit;
    } catch { return false; }
  }

  async _checkBlacklist(ip, tenantId) {
    const key = `bl:${tenantId}:${ip}`;
    if (this.blacklistCache.has(key)) return this.blacklistCache.get(key);
    try {
      const result = await pool.query(
        `SELECT reason FROM waf_blacklist WHERE tenant_id = $1 AND enabled = true
         AND (ip_address = $2::inet OR $2::inet <<= cidr_block)
         AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1`,
        [tenantId, ip]
      );
      const hit = result.rows[0]?.reason || null;
      this.blacklistCache.set(key, hit);
      setTimeout(() => this.blacklistCache.delete(key), 60000);
      return hit;
    } catch { return null; }
  }

  async _checkAutoBlacklist(ip, tenantId) {
    try {
      const result = await pool.query(
        `SELECT reason FROM waf_auto_blacklist WHERE tenant_id = $1 AND ip_address = $2::inet AND expires_at > NOW() LIMIT 1`,
        [tenantId, ip]
      );
      return result.rows[0]?.reason || null;
    } catch { return null; }
  }

  async _updateAutoBlacklist(ip, tenantId, ruleId, severity) {
    try {
      const sevScore = { info: 5, low: 15, medium: 30, high: 50, critical: 75 };
      const threshold = parseInt(process.env.WAF_AUTO_BLOCK_THRESHOLD) || 100;
      const increment = sevScore[severity] || 20;

      const existing = await pool.query(
        `SELECT id, violation_count, score_at_block FROM waf_auto_blacklist
         WHERE tenant_id = $1 AND ip_address = $2::inet AND expires_at > NOW() LIMIT 1`,
        [tenantId, ip]
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        const newCount = parseInt(row.violation_count) + 1;
        const newScore = parseInt(row.score_at_block || 0) + increment;
        if (newScore >= threshold) {
          const duration = parseInt(process.env.WAF_AUTO_BLOCK_DURATION_MINUTES) || 60;
          await pool.query(
            `UPDATE waf_auto_blacklist SET violation_count = $1, score_at_block = $2,
             expires_at = NOW() + INTERVAL '1 minute' * $3, triggered_by_rule_id = $4
             WHERE id = $5`,
            [newCount, newScore, duration, ruleId, row.id]
          );
        } else {
          await pool.query(
            `UPDATE waf_auto_blacklist SET violation_count = $1, score_at_block = $2,
             triggered_by_rule_id = $3 WHERE id = $4`,
            [newCount, newScore, ruleId, row.id]
          );
        }
      } else if (increment >= threshold) {
        const duration = parseInt(process.env.WAF_AUTO_BLOCK_DURATION_MINUTES) || 60;
        await pool.query(
          `INSERT INTO waf_auto_blacklist (id, tenant_id, ip_address, reason, triggered_by_rule_id, violation_count, score_at_block, expires_at, department_id)
           VALUES ($1, $2, $3, $4, $5, 1, $6, NOW() + INTERVAL '1 minute' * $7, NULL)`,
          ['abl_' + crypto.randomBytes(8).toString('hex'), tenantId, ip, `Auto-blocked: ${severity} severity violation`, ruleId, increment, duration]
        );
      }
    } catch {}
  }

  async _checkRateLimit(ip, path, method, tenantId) {
    try {
      const limits = await pool.query(
        `SELECT * FROM waf_rate_limits WHERE tenant_id = $1 AND enabled = true`,
        [tenantId]
      );
      for (const limit of limits.rows) {
        if (limit.http_methods && !limit.http_methods.includes(method)) continue;
        if (limit.path_pattern) {
          try {
            if (!new RegExp(limit.path_pattern, 'i').test(path)) continue;
          } catch { continue; }
        }
        return `Rate limit exceeded for path: ${limit.path_pattern || '/'}`;
      }
      return null;
    } catch { return null; }
  }

  async _logAttack(data) {
    try {
      const id = crypto.randomBytes(8).toString('hex');
      await pool.query(
        `INSERT INTO waf_attack_events (tenant_id, rule_id, rule_name, source_ip, request_method, request_path, request_query, user_agent, referer, matched_field, matched_value, action_taken, severity, score, blocked, request_id, timestamp, department_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), $17)`,
        [data.tenantId, data.rule_id || null, data.rule_name || null, data.sourceIp, data.method, data.query, data.qs, data.ua, data.referer || null, data.matched_field || null, data.matched_value || null, data.action_taken || 'block', data.severity || 'medium', data.score || null, data.blocked !== false, id, null]
      );
    } catch {}
  }

  invalidateCache() {
    this.ruleCache = null;
    this.cacheTime = 0;
    this.whitelistCache.clear();
    this.blacklistCache.clear();
  }
}

module.exports = new WafEngine();
