const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const amqp = require('amqplib');
const { DepartmentScope } = require('../common/department-scope');
const wafEngine = require('./waf-engine');
const EventEmitter = require('events');
const redisLimiter = require('./rate-limiter');
const geoip = require('./geoip');
const bodyParser = require('./body-parser');
const wsInspector = require('./websocket-inspector');
const grpcInspector = require('./grpc-inspector');
const proxyEngine = require('./proxy-engine');

dotenv.config();

const attackEvents = new EventEmitter();
attackEvents.setMaxListeners(100);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

let channel;
async function setupRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
    channel = await connection.createChannel();
    await channel.assertQueue('waf-events', { durable: true });
    await channel.assertQueue('waf-attacks', { durable: true });
    console.log('WAF connected to RabbitMQ');
  } catch (err) {
    console.error('RabbitMQ connection error (non-fatal):', err.message);
  }
}
setupRabbitMQ();

// Initialize WAF subsystems
redisLimiter.connect().catch(() => {});
geoip.load().catch(() => {});

app.use((req, res, next) => {
  req.wafEngine = wafEngine;
  req.wsInspector = wsInspector;
  req.grpcInspector = grpcInspector;
  next();
});

// ========================================================================
// WAF PROXY ENGINE — Inline Request Inspection Middleware
// ========================================================================
app.use('/proxy-engine/inspect', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.body?.tenant_id;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

    const sourceIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || req.body?.source_ip || '127.0.0.1';
    const method = req.body?.method || req.method;
    const uri = req.body?.uri || req.path;
    const headers = req.body?.headers || req.headers;
    const body = req.body?.body || req.body?.payload;
    const contentType = req.body?.content_type || req.headers['content-type'] || '';

    const result = await wafEngine.inspect(method, uri, headers, body, sourceIp, contentType, tenantId);
    if (!result.allowed && result.action !== 'log') {
      const geo = geoip.lookupCountryCode(sourceIp);
      attackEvents.emit('attack', {
        type: 'attack_blocked',
        data: {
          source_ip: sourceIp,
          source_country: geo,
          rule_id: result.rule_id,
          rule_name: result.rule_name,
          action: result.action,
          reason: result.reason,
          severity: result.severity,
          score: result.score,
          request_method: method,
          request_path: uri,
          tenant_id: tenantId,
          blocked: true,
        },
        timestamp: new Date().toISOString(),
      });
      return res.status(result.status_code || 403).json({
        allowed: false, action: result.action, reason: result.reason,
        rule_id: result.rule_id, rule_name: result.rule_name,
        severity: result.severity, score: result.score,
        source_ip: sourceIp, source_country: geo, timestamp: new Date().toISOString(),
      });
    }
    res.json({ allowed: true, action: result.action, source_ip: sourceIp, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: `WAF inspection error: ${err.message}` });
  }
});

app.use(DepartmentScope.middleware());

const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id || req.body?.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};

function genId(prefix) {
  return prefix + '_' + crypto.randomBytes(8).toString('hex');
}

function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(query.limit) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

async function publishEvent(queue, event) {
  if (!channel) return;
  try {
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(event)), { persistent: true });
  } catch (err) {
    console.error('RabbitMQ publish error:', err.message);
  }
}

function addTimestamps(obj) {
  obj.created_at = obj.created_at || new Date().toISOString();
  obj.updated_at = new Date().toISOString();
  return obj;
}

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const stats = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM waf_rules) as total_rules,
        (SELECT COUNT(*) FROM waf_rules WHERE enabled = true) as active_rules,
        (SELECT COUNT(*) FROM waf_profiles) as total_profiles,
        (SELECT COUNT(*) FROM waf_attack_events WHERE timestamp > NOW() - INTERVAL '24 hours') as attacks_24h,
        (SELECT COUNT(*) FROM waf_auto_blacklist WHERE expires_at > NOW()) as active_blocks
    `);
    res.json({
      status: 'healthy',
      service: 'waf',
      version: '2.0.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      stats: stats.rows[0],
      rabbitmq: channel ? 'connected' : 'disconnected',
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', service: 'waf', error: err.message });
  }
});

app.get('/metrics', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM waf_rules) as total_rules,
        (SELECT COUNT(*) FROM waf_rules WHERE enabled = true) as active_rules,
        (SELECT COUNT(*) FROM waf_attack_events WHERE blocked = true AND timestamp > NOW() - INTERVAL '24 hours') as blocked_24h,
        (SELECT COUNT(*) FROM waf_attack_events WHERE timestamp > NOW() - INTERVAL '24 hours') as total_events_24h,
        (SELECT COUNT(*) FROM waf_auto_blacklist WHERE expires_at > NOW()) as auto_blacklist_count,
        (SELECT COUNT(*) FROM waf_geoip_rules WHERE enabled = true) as geoip_rule_count
    `);
    res.set('Content-Type', 'text/plain');
    const m = result.rows[0];
    res.send([
      '# HELP waf_total_rules Total number of WAF rules',
      '# TYPE waf_total_rules gauge',
      `waf_total_rules ${m.total_rules}`,
      '# HELP waf_active_rules Number of enabled WAF rules',
      '# TYPE waf_active_rules gauge',
      `waf_active_rules ${m.active_rules}`,
      '# HELP waf_blocked_24h Requests blocked in last 24 hours',
      '# TYPE waf_blocked_24h counter',
      `waf_blocked_24h ${m.blocked_24h}`,
      '# HELP waf_total_events_24h Total events in last 24 hours',
      '# TYPE waf_total_events_24h counter',
      `waf_total_events_24h ${m.total_events_24h}`,
      '# HELP waf_auto_blacklist_count Active auto-blacklisted IPs',
      '# TYPE waf_auto_blacklist_count gauge',
      `waf_auto_blacklist_count ${m.auto_blacklist_count}`,
      '# HELP waf_geoip_rule_count Active geo-ip rule count',
      '# TYPE waf_geoip_rule_count gauge',
      `waf_geoip_rule_count ${m.geoip_rule_count}`,
    ].join('\n'));
  } catch (err) {
    res.status(500).send(`error ${err.message}`);
  }
});

// ========================================================================
// PROTECTION PROFILES
// ========================================================================
app.get('/profiles', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waf_profiles WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/profiles/:id', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waf_profiles WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    const rules = await pool.query(
      `SELECT wr.* FROM waf_rules wr
       JOIN waf_profile_rules wpr ON wr.id = wpr.rule_id
       WHERE wpr.profile_id = $1 AND wpr.enabled = true`,
      [req.params.id]
    );
    res.json({ success: true, data: { ...result.rows[0], rules: rules.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/profiles', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, description, mode, paranoia_level, target_protocol, target_domains, backend_url } = req.body;
    const id = genId('prof');
    const result = await pool.query(
      `INSERT INTO waf_profiles (id, tenant_id, name, description, mode, paranoia_level, target_protocol, target_domains, backend_url, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [id, req.tenantId, name, description, mode || 'blocking', paranoia_level || 2, target_protocol || 'https', target_domains || null, backend_url, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/profiles/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, description, mode, paranoia_level, target_protocol, target_domains, backend_url } = req.body;
    const result = await pool.query(
      `UPDATE waf_profiles SET name = COALESCE($1, name), description = COALESCE($2, description),
       mode = COALESCE($3, mode), paranoia_level = COALESCE($4, paranoia_level),
       target_protocol = COALESCE($5, target_protocol), target_domains = COALESCE($6, target_domains),
       backend_url = COALESCE($7, backend_url), updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND tenant_id = $9 RETURNING *`,
      [name, description, mode, paranoia_level, target_protocol, target_domains, backend_url, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/profiles/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_profiles WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    res.json({ success: true, message: 'Profile deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/profiles/:profileId/rules/:ruleId', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO waf_profile_rules (profile_id, rule_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [req.params.profileId, req.params.ruleId]
    );
    res.json({ success: true, message: 'Rule added to profile' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/profiles/:profileId/rules/:ruleId', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM waf_profile_rules WHERE profile_id = $1 AND rule_id = $2',
      [req.params.profileId, req.params.ruleId]
    );
    res.json({ success: true, message: 'Rule removed from profile' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// RULE GROUPS
// ========================================================================
app.get('/rule-groups', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rg.*, (SELECT COUNT(*) FROM waf_rules r WHERE r.group_id = rg.id) as rule_count
       FROM waf_rule_groups rg WHERE rg.tenant_id = $1 ORDER BY rg.category, rg.name`,
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rule-groups', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, description, category, version } = req.body;
    const id = genId('rgrp');
    const result = await pool.query(
      `INSERT INTO waf_rule_groups (id, tenant_id, name, description, category, version, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, req.tenantId, name, description, category || 'custom', version, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/rule-groups/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, description, category, version, enabled } = req.body;
    const result = await pool.query(
      `UPDATE waf_rule_groups SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       category = COALESCE($3, category), version = COALESCE($4, version),
       enabled = COALESCE($5, enabled), updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [name, description, category, version, enabled, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule group not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/rule-groups/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_rule_groups WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule group not found' });
    res.json({ success: true, message: 'Rule group deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// ENHANCED RULES CRUD
// ========================================================================
app.get('/rules', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { group_id, rule_type, severity, enabled, search, sort_by, sort_order } = req.query;
    const { limit, offset } = parsePagination(req.query);

    let query = 'SELECT r.*, rg.name as group_name FROM waf_rules r LEFT JOIN waf_rule_groups rg ON r.group_id = rg.id WHERE r.tenant_id = $1';
    const params = [req.tenantId];
    let paramIdx = 2;

    if (group_id) { params.push(group_id); query += ` AND r.group_id = $${paramIdx++}`; }
    if (rule_type) { params.push(rule_type); query += ` AND r.rule_type = $${paramIdx++}`; }
    if (severity) { params.push(severity); query += ` AND r.severity = $${paramIdx++}`; }
    if (enabled !== undefined) { params.push(enabled === 'true'); query += ` AND r.enabled = $${paramIdx++}`; }
    if (search) { params.push(`%${search}%`); query += ` AND (r.name ILIKE $${paramIdx} OR r.description ILIKE $${paramIdx} OR r.pattern ILIKE $${paramIdx})`; paramIdx++; }

    const allowedSort = ['priority', 'name', 'created_at', 'updated_at', 'severity', 'score'];
    const sby = allowedSort.includes(sort_by) ? sort_by : 'priority';
    const sord = sort_order === 'asc' ? 'ASC' : 'DESC';
    query += ` ORDER BY r.${sby} ${sord}, r.created_at DESC`;

    params.push(limit); query += ` LIMIT $${paramIdx++}`;
    params.push(offset); query += ` OFFSET $${paramIdx++}`;

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_rules WHERE tenant_id = $1', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(req.query.page) || 1, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/rules/:id', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT r.*, rg.name as group_name FROM waf_rules r LEFT JOIN waf_rule_groups rg ON r.group_id = rg.id WHERE r.id = $1 AND r.tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rules', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, description, rule_type, detection_field, pattern, pattern_type, action, action_value, severity, priority, score, enabled, is_negated, tags, metadata, group_id } = req.body;
    const id = genId('rule');
    const result = await pool.query(
      `INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, pattern_type, action, action_value, severity, priority, score, enabled, is_negated, tags, metadata, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
      [id, req.tenantId, group_id, name, description, rule_type || 'regex', detection_field || 'request_uri', pattern, pattern_type || 'regex', action || 'block', action_value, severity || 'medium', priority || 100, score || 5.0, enabled !== false, is_negated || false, tags || null, metadata || null, req.deptId]
    );
    await publishEvent('waf-events', { event: 'rule.created', tenant_id: req.tenantId, rule_id: id, rule_name: name });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/rules/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const fields = ['name', 'description', 'rule_type', 'detection_field', 'pattern', 'pattern_type', 'action', 'action_value', 'severity', 'priority', 'score', 'enabled', 'is_negated', 'tags', 'metadata', 'group_id'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        vals.push(req.body[f]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(req.params.id, req.tenantId);
    const result = await pool.query(
      `UPDATE waf_rules SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    await publishEvent('waf-events', { event: 'rule.updated', tenant_id: req.tenantId, rule_id: req.params.id });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/rules/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_rules WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    await publishEvent('waf-events', { event: 'rule.deleted', tenant_id: req.tenantId, rule_id: req.params.id });
    res.json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rules/:id/toggle', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE waf_rules SET enabled = NOT enabled, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rules/:id/test', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { test_payload } = req.body;
    if (!test_payload) return res.status(400).json({ error: 'test_payload required' });
    const rule = await pool.query('SELECT * FROM waf_rules WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (rule.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    const r = rule.rows[0];
    let matched = false;
    try {
      if (r.pattern_type === 'regex') {
        const re = new RegExp(r.pattern, 'i');
        matched = re.test(test_payload);
      } else if (r.pattern_type === 'exact') {
        matched = test_payload === r.pattern;
      } else if (r.pattern_type === 'contains') {
        matched = test_payload.includes(r.pattern);
      } else if (r.pattern_type === 'prefix') {
        matched = test_payload.startsWith(r.pattern);
      } else if (r.pattern_type === 'suffix') {
        matched = test_payload.endsWith(r.pattern);
      }
    } catch (e) {
      return res.json({ success: true, data: { matched: false, error: 'Pattern error: ' + e.message } });
    }
    if (r.is_negated) matched = !matched;
    res.json({ success: true, data: { matched, action: matched ? r.action : 'none', severity: r.severity, score: r.score, rule_name: r.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// BULK RULE OPERATIONS
// ========================================================================
app.post('/rules/bulk', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { rules } = req.body;
    if (!rules || !Array.isArray(rules) || rules.length === 0) return res.status(400).json({ error: 'rules array required' });
    const results = [];
    for (const r of rules) {
      try {
        const id = genId('rule');
        const result = await pool.query(
          `INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, pattern_type, action, action_value, severity, priority, score, enabled, is_negated, tags, metadata, department_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
          [id, req.tenantId, r.group_id, r.name, r.description, r.rule_type || 'regex', r.detection_field || 'request_uri', r.pattern, r.pattern_type || 'regex', r.action || 'block', r.action_value, r.severity || 'medium', r.priority || 100, r.score || 5.0, r.enabled !== false, r.is_negated || false, r.tags || null, r.metadata || null, req.deptId]
        );
        results.push({ status: 'created', rule: result.rows[0] });
      } catch (e) {
        results.push({ status: 'error', name: r.name, error: e.message });
      }
    }
    res.status(201).json({ success: true, data: { created: results.filter(r => r.status === 'created').length, errors: results.filter(r => r.status === 'error').length, results } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/rules/bulk', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
    const result = await pool.query(
      'DELETE FROM waf_rules WHERE id = ANY($1::text[]) AND tenant_id = $2 RETURNING id',
      [ids, req.tenantId]
    );
    res.json({ success: true, message: `${result.rows.length} rules deleted` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/rules/bulk/enable', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { ids, enabled } = req.body;
    if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'ids array required' });
    const result = await pool.query(
      'UPDATE waf_rules SET enabled = $1, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($2::text[]) AND tenant_id = $3 RETURNING id',
      [enabled !== false, ids, req.tenantId]
    );
    res.json({ success: true, message: `${result.rows.length} rules updated` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// RULE IMPORT / EXPORT
// ========================================================================
app.get('/rules/export', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { group_id, format } = req.query;
    let query = 'SELECT * FROM waf_rules WHERE tenant_id = $1';
    const params = [req.tenantId];
    if (group_id) { params.push(group_id); query += ' AND group_id = $2'; }
    query += ' ORDER BY priority ASC';
    const result = await pool.query(query, params);
    if (format === 'csv') {
      res.set('Content-Type', 'text/csv');
      res.set('Content-Disposition', 'attachment; filename=waf-rules.csv');
      const headers = 'id,name,rule_type,pattern,action,severity,priority,enabled,description';
      const rows = result.rows.map(r => `${r.id},"${r.name}",${r.rule_type},"${r.pattern}",${r.action},${r.severity},${r.priority},${r.enabled},"${(r.description || '').replace(/"/g, '""')}"`);
      res.send([headers, ...rows].join('\n'));
    } else {
      res.set('Content-Type', 'application/json');
      res.set('Content-Disposition', 'attachment; filename=waf-rules.json');
      res.json(result.rows);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rules/import', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { rules, group_id, format } = req.body;
    if (!rules || !Array.isArray(rules)) return res.status(400).json({ error: 'rules array required' });
    const results = [];
    for (const r of rules) {
      try {
        const id = genId('rule');
        const result = await pool.query(
          `INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, pattern_type, action, severity, priority, score, enabled, tags, department_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
          [id, req.tenantId, group_id || r.group_id, r.name, r.description, r.rule_type || 'regex', r.detection_field || 'request_uri', r.pattern, r.pattern_type || 'regex', r.action || 'block', r.severity || 'medium', r.priority || 100, r.score || 5.0, r.enabled !== false, r.tags || null, req.deptId]
        );
        results.push({ status: 'imported', rule: result.rows[0] });
      } catch (e) {
        results.push({ status: 'error', name: r.name, error: e.message });
      }
    }
    res.status(201).json({ success: true, data: { total: rules.length, imported: results.filter(r => r.status === 'imported').length, errors: results.filter(r => r.status === 'error').length, results } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// SIGNATURE DATABASE
// ========================================================================
app.get('/signatures', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { category, severity, enabled } = req.query;
    const { limit, offset } = parsePagination(req.query);
    let query = 'SELECT * FROM waf_signatures WHERE tenant_id = $1';
    const params = [req.tenantId];
    let idx = 2;
    if (category) { params.push(category); query += ` AND category = $${idx++}`; }
    if (severity) { params.push(severity); query += ` AND severity = $${idx++}`; }
    if (enabled !== undefined) { params.push(enabled === 'true'); query += ` AND enabled = $${idx++}`; }
    query += ' ORDER BY category, severity DESC';
    params.push(limit); query += ` LIMIT $${idx++}`;
    params.push(offset); query += ` OFFSET $${idx++}`;
    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_signatures WHERE tenant_id = $1', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/signatures', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, description, category, cve_id, pattern, detection_field, severity, confidence, references_url } = req.body;
    const id = genId('sig');
    const result = await pool.query(
      `INSERT INTO waf_signatures (id, tenant_id, name, description, category, cve_id, pattern, detection_field, severity, confidence, references_url, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [id, req.tenantId, name, description, category, cve_id, pattern, detection_field || 'request_uri', severity || 'medium', confidence || 0.8, references_url || null, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/signatures/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const fields = ['name', 'description', 'category', 'cve_id', 'pattern', 'detection_field', 'severity', 'confidence', 'references_url', 'enabled'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        vals.push(req.body[f]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(req.params.id, req.tenantId);
    const result = await pool.query(
      `UPDATE waf_signatures SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Signature not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/signatures/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_signatures WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Signature not found' });
    res.json({ success: true, message: 'Signature deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const OWASP_CRS_SIGNATURES = [
  // ========================================================================
  // SQL INJECTION (sqli) - 25 patterns
  // ========================================================================
  { name: 'SQLi - Comment Injection', category: 'sqli', pattern: '/\\*!.*\\*/|--[^-].*|#.*$|--\\s', severity: 'critical', confidence: 0.95, description: 'SQL comment injection attack using inline or end-of-line comments' },
  { name: 'SQLi - Union Select Based', category: 'sqli', pattern: 'UNION\\s+(ALL\\s+)?SELECT|UNION\\s+SELECT', severity: 'critical', confidence: 0.95, description: 'UNION-based SQL injection to combine query results' },
  { name: 'SQLi - Time-Based Blind (MySQL)', category: 'sqli', pattern: 'SLEEP\\s*\\(\\s*\\d+\\s*\\)|BENCHMARK\\s*\\(\\s*\\d+\\s*,', severity: 'critical', confidence: 0.9, description: 'Time-based blind SQL injection using SLEEP or BENCHMARK (MySQL)' },
  { name: 'SQLi - Time-Based Blind (PostgreSQL)', category: 'sqli', pattern: 'pg_sleep\\s*\\(|pg_sleep_for|pg_sleep_until|generate_series\\(', severity: 'critical', confidence: 0.9, description: 'Time-based blind SQL injection using pg_sleep (PostgreSQL)' },
  { name: 'SQLi - Time-Based Blind (MSSQL)', category: 'sqli', pattern: 'WAITFOR\\s+DELAY\\s+|WAITFOR\\s+TIME\\s+|\\bBENCHMARK\\s*\\(', severity: 'critical', confidence: 0.9, description: 'Time-based blind SQL injection using WAITFOR DELAY (MSSQL)' },
  { name: 'SQLi - Time-Based Blind (Oracle)', category: 'sqli', pattern: "DBMS_LOCK\\.SLEEP|UTL_INADDR\\.GET_HOST_NAME|HTTPURITY_PACKAGE\\.REQUEST|DBMS_PIPE\\.RECEIVE_MESSAGE", severity: 'critical', confidence: 0.9, description: 'Time-based blind SQL injection via Oracle packages' },
  { name: 'SQLi - Error-Based (Oracle)', category: 'sqli', pattern: 'ORA-[0-9]{5}\\b|ORA-[0-9]{4}\\b|PLS-[0-9]{5}', severity: 'high', confidence: 0.95, description: 'Oracle error-based SQL injection via ORA/PLS error codes' },
  { name: 'SQLi - Error-Based (MySQL)', category: 'sqli', pattern: 'SQLITE_ERROR|mysql_fetch|MySQLSyntaxErrorException|You have an error in your SQL syntax', severity: 'high', confidence: 0.9, description: 'MySQL error-based SQL injection detection' },
  { name: 'SQLi - Error-Based (PostgreSQL)', category: 'sqli', pattern: 'PostgreSQL.*ERROR|pg_query|invalid input syntax for type|ERROR:\\s+.*\\sat\\s+|CONTEXT:\\s+.*\\s+line', severity: 'high', confidence: 0.9, description: 'PostgreSQL error-based SQL injection detection' },
  { name: 'SQLi - Error-Based (MSSQL)', category: 'sqli', pattern: 'Incorrect syntax near|Unclosed quotation mark|Conversion failed|Microsoft OLE DB|SQL Server.*Driver', severity: 'high', confidence: 0.9, description: 'MSSQL error-based SQL injection detection' },
  { name: 'SQLi - Boolean-Based Blind', category: 'sqli', pattern: "'\\s*(AND|OR)\\s+\\d+\\s*=\\s*\\d+|\\bAND\\s+\\d+>\\d+|\\bOR\\s+\\d+<\\d+", severity: 'high', confidence: 0.85, description: 'Boolean-based blind SQL injection using AND/OR comparisons' },
  { name: 'SQLi - Stacked Queries', category: 'sqli', pattern: ';\\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|EXEC|EXECUTE)\\s', severity: 'critical', confidence: 0.9, description: 'Stacked query SQL injection with multiple statements' },
  { name: 'SQLi - Out-of-Band (MySQL)', category: 'sqli', pattern: 'INTO\\s+OUTFILE|INTO\\s+DUMPFILE|LOAD_FILE\\s*\\(', severity: 'critical', confidence: 0.9, description: 'MySQL out-of-band SQL injection via file operations' },
  { name: 'SQLi - Out-of-Band (MSSQL)', category: 'sqli', pattern: 'xp_cmdshell|xp_regread|xp_dirtree|sp_makewebtask|sp_send_dbmail|OPENROWSET|OPENDATASOURCE', severity: 'critical', confidence: 0.95, description: 'MSSQL out-of-band SQL injection via extended procedures' },
  { name: 'SQLi - Out-of-Band (Oracle)', category: 'sqli', pattern: 'UTL_HTTP\\.REQUEST|UTL_FILE\\.FOPEN|UTL_SMTP\\.MAIL|DBMS_LDAP\\.INIT|HTTPREQUEST\\.MAKEREQUEST', severity: 'critical', confidence: 0.9, description: 'Oracle out-of-band SQL injection via network packages' },
  { name: 'SQLi - Information Schema', category: 'sqli', pattern: 'INFORMATION_SCHEMA\\.|information_schema\\.|sys\\.tables|sys\\.columns|sqlite_master|sql_temp_master', severity: 'high', confidence: 0.85, description: 'Information schema enumeration SQL injection' },
  { name: 'SQLi - Having/Order By Injection', category: 'sqli', pattern: "'\\s+HAVING\\s+|'\\s+ORDER\\s+BY\\s+\\d+|'\\s+GROUP\\s+BY\\s+\\d+", severity: 'high', confidence: 0.85, description: 'HAVING/ORDER BY clause SQL injection for column enumeration' },
  { name: 'SQLi - Tautology-Based', category: 'sqli', pattern: "'\\s*OR\\s+'\\d'\\s*=\\s*'\\d|'\\s*OR\\s+1=1|'\\s*OR\\s+'\\w+'\\s*LIKE\\s+'\\w+", severity: 'critical', confidence: 0.95, description: 'Tautology-based SQL injection forcing true conditions' },
  { name: 'SQLi - Null Byte/Encoding Bypass', category: 'sqli', pattern: '%bf%27|%df%27|%e0%80%27|%a8%27|%00%27|%ef%bc%87', severity: 'high', confidence: 0.85, description: 'SQL injection via multibyte character encoding bypass' },
  { name: 'SQLi - PostgreSQL Cast/String', category: 'sqli', pattern: "::text\\b|::integer\\b|::varchar\\b|STRING_AGG\\s*\\(|ARRAY_AGG\\s*\\(|string_to_array\\s*\\(", severity: 'high', confidence: 0.85, description: 'PostgreSQL-specific SQL injection type casting operations' },
  { name: 'SQLi - MSSQL Exec/Sp_exec', category: 'sqli', pattern: 'EXEC\\s*\\(|EXECUTE\\s*\\(|sp_executesql\\s*\\(|sp_sqlexec\\s*\\(|exec\\s+master\\.', severity: 'critical', confidence: 0.9, description: 'MSSQL dynamic execution SQL injection via EXEC or sp_executesql' },
  { name: 'SQLi - MySQL 0x/Hex Encoding', category: 'sqli', pattern: '0x[0-9a-fA-F]{4,}|0b[01]{4,}|x\\\'[0-9a-fA-F]+\\\'', severity: 'high', confidence: 0.85, description: 'SQL injection using MySQL hex/binary literal encoding' },
  { name: 'SQLi - Unix Timestamp Blind', category: 'sqli', pattern: "UNIX_TIMESTAMP\\s*\\(\\s*NOW\\s*\\(|UNIX_TIMESTAMP\\s*\\(\\s*SYSDATE\\s*\\(|IF\\s*\\(\\s*\\d+\\s*,\\s*SLEEP", severity: 'high', confidence: 0.85, description: 'Blind SQL injection using conditional time-based payloads' },
  { name: 'SQLi - Heavy Query', category: 'sqli', pattern: "GET_LOCK\\s*\\(|RELEASE_LOCK\\s*\\(|IS_FREE_LOCK\\s*\\(|IS_USED_LOCK\\s*\\(|NAME_CONST\\s*\\(", severity: 'high', confidence: 0.85, description: 'Heavy query SQL injection using MySQL lock/user variable functions' },
  { name: 'SQLi - Group Concatenation', category: 'sqli', pattern: 'GROUP_CONCAT\\s*\\(|CONCAT_WS\\s*\\(|WM_CONCAT\\s*\\(|LISTAGG\\s*\\(|COALESCE\\s*\\(', severity: 'high', confidence: 0.85, description: 'String aggregation SQL injection for data extraction' },
  // ========================================================================
  // CROSS-SITE SCRIPTING (xss) - 25 patterns
  // ========================================================================
  { name: 'XSS - Script Tag Injection', category: 'xss', pattern: '<script[^>]*>[\\s\\S]*?<\\/script>|<script[^>]*\\/>', severity: 'high', confidence: 0.95, description: 'Classic script tag injection attack' },
  { name: 'XSS - JavaScript Protocol', category: 'xss', pattern: 'javascript:\\s*(alert|prompt|confirm|eval|document\\.|location\\.|this\\.)', severity: 'high', confidence: 0.9, description: 'XSS using javascript: pseudo-protocol in href/src attributes' },
  { name: 'XSS - Data URI', category: 'xss', pattern: 'data:\\s*text/html|data:\\s*text/javascript|data:\\s*application/x-javascript', severity: 'high', confidence: 0.9, description: 'XSS via data URI scheme with HTML/JavaScript content' },
  { name: 'XSS - onerror Handler', category: 'xss', pattern: 'onerror\\s*=|onerror\\s*\\(', severity: 'high', confidence: 0.92, description: 'XSS via onerror event handler attribute' },
  { name: 'XSS - onload Handler', category: 'xss', pattern: 'onload\\s*=|onload\\s*\\(', severity: 'high', confidence: 0.92, description: 'XSS via onload event handler attribute' },
  { name: 'XSS - Event Handlers (Comprehensive)', category: 'xss', pattern: 'onfocus\\s*=|onblur\\s*=|onsubmit\\s*=|onreset\\s*=|onchange\\s*=|onselect\\s*=|onmouseover\\s*=|onmouseout\\s*=|onmousedown\\s*=|onmouseup\\s*=|onmousemove\\s*=|onkeydown\\s*=|onkeyup\\s*=|onkeypress\\s*=|onclick\\s*=|ondblclick\\s*=|onabort\\s*=|onbeforeunload\\s*=', severity: 'high', confidence: 0.9, description: 'Comprehensive XSS event handler attribute injection' },
  { name: 'XSS - SVG Injection', category: 'xss', pattern: '<svg[^>]*>.*onload\\s*=|onerror\\s*=|onbegin\\s*=|onend\\s*=', severity: 'high', confidence: 0.9, description: 'XSS injection via SVG elements with event handlers' },
  { name: 'XSS - Iframe Injection', category: 'xss', pattern: '<iframe[^>]*src\\s*=\\s*[\"\\\']javascript:|<iframe[^>]*srcdoc\\s*=', severity: 'high', confidence: 0.9, description: 'XSS via malicious iframe src/srcdoc attributes' },
  { name: 'XSS - Embed/Object Injection', category: 'xss', pattern: '<embed[^>]*src\\s*=|\\s*<object[^>]*data\\s*=|\\s*<param[^>]*value\\s*=', severity: 'medium', confidence: 0.85, description: 'XSS via embed/object/param tag injection' },
  { name: 'XSS - Alert/Prompt/Confirm', category: 'xss', pattern: 'alert\\s*\\(.*\\)|prompt\\s*\\(.*\\)|confirm\\s*\\(.*\\)', severity: 'high', confidence: 0.9, description: 'XSS detection via JavaScript popup function calls' },
  { name: 'XSS - eval/setTimeout Injection', category: 'xss', pattern: 'eval\\s*\\(\\s*(atob|base64|document\\.cookie|window\\.|location\\.|unescape|decodeURI)', severity: 'high', confidence: 0.9, description: 'XSS via eval() or setTimeout() with dangerous payloads' },
  { name: 'XSS - innerHTML/document.write', category: 'xss', pattern: 'innerHTML\\s*=\\s*[\"\\\'][^\"\\\']*<|document\\.write\\s*\\([\"\\\'].*<', severity: 'high', confidence: 0.88, description: 'XSS via innerHTML assignment or document.write with HTML' },
  { name: 'XSS - Import/Href JavaScript', category: 'xss', pattern: 'href\\s*=\\s*[\"\\\']\\s*javascript:|href\\s*=\\s*[\"\\\']\\s*vbscript:|href\\s*=\\s*[\"\\\']\\s*livescript:', severity: 'high', confidence: 0.9, description: 'XSS via href attribute with javascript/vbscript/livescript URI' },
  { name: 'XSS - Base64 Encoded Payload', category: 'xss', pattern: 'atob\\s*\\([\"\\\'][A-Za-z0-9+/]{20,}={0,2}[\"\\\']\\)|btoa\\s*\\(', severity: 'medium', confidence: 0.8, description: 'XSS payload encoded with Base64 via atob/btoa' },
  { name: 'XSS - Polyglot Vector', category: 'xss', pattern: '"\\s*>\\s*<script|\\\'>\\s*<script|\\s*javascript:.*<|\\s*onerror=\\s*alert\\(1\\)', severity: 'critical', confidence: 0.95, description: 'Polyglot XSS vectors combining multiple injection techniques' },
  { name: 'XSS - Form Action Hijack', category: 'xss', pattern: '<form[^>]*action\\s*=\\s*[\"\\\']javascript:|<form[^>]*action\\s*=\\s*[\"\\\']data:', severity: 'high', confidence: 0.9, description: 'XSS via form action attribute pointing to JavaScript' },
  { name: 'XSS - Window/Location Manipulation', category: 'xss', pattern: 'window\\.location\\s*=|document\\.location\\s*=|location\\.href\\s*=|location\\.replace\\s*\\(', severity: 'high', confidence: 0.88, description: 'XSS code execution via window.location or document.location assignment' },
  { name: 'XSS - Cookie Theft', category: 'xss', pattern: 'document\\.cookie|\\\\x61\\\\x6c\\\\x65\\\\x72\\\\x74|\\\\x61\\\\x6c\\\\x65\\\\x72\\\\(|fromCharCode', severity: 'high', confidence: 0.85, description: 'XSS payload targeting cookie theft or JS char-code obfuscation' },
  { name: 'XSS - DOM-Based URL Fragment', category: 'xss', pattern: 'location\\.hash\\s*=|location\\.search\\s*=|location\\.pathname\\s*=', severity: 'medium', confidence: 0.8, description: 'DOM-based XSS via URL hash/search/pathname manipulation' },
  { name: 'XSS - onpointer/ontouch Handlers', category: 'xss', pattern: 'onpointerdown\\s*=|onpointerup\\s*=|onpointermove\\s*=|ontouchstart\\s*=|ontouchend\\s*=|ontouchmove\\s*=', severity: 'high', confidence: 0.9, description: 'XSS via modern pointer/touch event handler injection' },
  { name: 'XSS - Meta Refresh/Redirect', category: 'xss', pattern: '<meta[^>]*http-equiv\\s*=\\s*[\"\\\']refresh[\"\\\'][^>]*content\\s*=\\s*[\"\\\']\\s*\\d+;\\s*url\\s*=\\s*javascript:', severity: 'high', confidence: 0.9, description: 'XSS via meta refresh redirect to javascript: URL' },
  { name: 'XSS - Angular Template Injection', category: 'xss', pattern: '\\{\\{.*constructor.*\\}\\}|\\{\\{.*__proto__.*\\}\\}|\\{\\{.*toString\\(\\)|ng-c|ng-app[^>]*>\\s*\\{\\{', severity: 'high', confidence: 0.85, description: 'Angular template injection / client-side template injection' },
  { name: 'XSS - CSS Expression/Behavior', category: 'xss', pattern: 'expression\\(.*xss|expression\\(.*javascript|behavior\\s*:\\s*url\\s*\\(|\\\\2d\\\\2d\\\\3e|-->)', severity: 'medium', confidence: 0.85, description: 'XSS via CSS expression() or behavior attribute (IE legacy)' },
  { name: 'XSS - Multiplication Operator Obfuscation', category: 'xss', pattern: '<[^>]*\\s*=\\s*\\d+\\s*\\*\\s*\\d+|\\d+\\s*\\*\\s*\\d+\\s*=\\s*[^>]*>', severity: 'medium', confidence: 0.8, description: 'XSS using multiplication operator obfuscation techniques' },
  { name: 'XSS - IMG Tag Unclosed', category: 'xss', pattern: '<img[^>]*src\\s*=\\s*[\"\\\'][^\"\\\']*[\"\\\']\\s*onerror|src\\s*=\\s*[\"\\\']x[\"\\\']\\s*onerror|<img[^>]*src\\s*=\\s*x', severity: 'high', confidence: 0.9, description: 'XSS via img tag with invalid src and onerror handler' },
  // ========================================================================
  // LOCAL FILE INCLUSION (lfi) - 12 patterns
  // ========================================================================
  { name: 'LFI - PHP Wrappers', category: 'lfi', pattern: 'php://|expect://|zip://|phar://|compress.zlib|compress.bzip2|ogg://|rar://', severity: 'critical', confidence: 0.95, description: 'LFI using PHP stream wrappers for file inclusion' },
  { name: 'LFI - Data Wrapper', category: 'lfi', pattern: 'data://(text/plain|text/html|application/x-httpd-php)', severity: 'critical', confidence: 0.95, description: 'LFI using data URL wrapper to inject PHP code' },
  { name: 'LFI - Input Wrapper', category: 'lfi', pattern: 'php://input|php://filter|php://memory|php://temp', severity: 'critical', confidence: 0.95, description: 'LFI using PHP input stream wrappers' },
  { name: 'LFI - Log Poisoning', category: 'lfi', pattern: '/var/log/|/proc/self/environ|/proc/self/fd/|/var/log/apache|/var/log/nginx|/var/log/httpd', severity: 'high', confidence: 0.88, description: 'LFI via log file poisoning paths' },
  { name: 'LFI - /etc/passwd Traversal', category: 'lfi', pattern: 'etc/passwd|etc/shadow|etc/master.passwd|etc/security|etc/sudoers|etc/hosts', severity: 'high', confidence: 0.9, description: 'LFI targeting critical Linux system files' },
  { name: 'LFI - Windows System Files', category: 'lfi', pattern: 'boot\\.ini|windows/win\\.ini|windows/system32/config|windows/repair|windows/php\\.ini|windows/my\\.ini', severity: 'high', confidence: 0.9, description: 'LFI targeting Windows system configuration files' },
  { name: 'LFI - Null Byte Injection', category: 'lfi', pattern: '\\.php%00|\\.php\\x00|\\.php%2500|\\.inc%00|\\.inc\\x00', severity: 'high', confidence: 0.85, description: 'LFI via null byte injection to bypass extension checks' },
  { name: 'LFI - Double Encoding', category: 'lfi', pattern: '%252e%252e%252f|%252e%252e%255c|%25c0%25ae%25c0%25ae|%%32%%65%%32%%65%%32%%66', severity: 'high', confidence: 0.85, description: 'LFI via double URL-encoded path traversal sequences' },
  { name: 'LFI - Proc/self/fd Enumeration', category: 'lfi', pattern: '/proc/self/fd/\\d+|/proc/\\d+/fd/\\d+|/proc/self/cwd|/proc/self/root', severity: 'high', confidence: 0.85, description: 'LFI via /proc/self/fd enumeration for file descriptor brute-force' },
  { name: 'LFI - Application Source Code', category: 'lfi', pattern: 'index\\.php%00|index\\.php\\x00|config\\.php%00|db\\.config|database\\.yml|wp-config\\.php|config\\.inc\\.php', severity: 'high', confidence: 0.9, description: 'LFI targeting application source code and configuration files' },
  { name: 'LFI - Path Relative / Base64 Filter', category: 'lfi', pattern: 'php://filter/.*base64|php://filter/.*convert|php://filter/.*rot13|php://filter/.*string\\.', severity: 'critical', confidence: 0.95, description: 'LFI using PHP filter wrapper for base64-encoded source extraction' },
  { name: 'LFI - /dev/ Random/Zero', category: 'lfi', pattern: '/dev/urandom|/dev/zero|/dev/random|/proc/config\\.gz|/proc/kcore|/proc/mem|/boot/vmlinuz', severity: 'medium', confidence: 0.8, description: 'LFI targeting /dev/ and kernel memory/configuration files' },
  // ========================================================================
  // REMOTE FILE INCLUSION (rfi) - 10 patterns
  // ========================================================================
  { name: 'RFI - External PHP/ASP Script', category: 'rfi', pattern: '(https?|ftp):\\/\\/[^\\s]+?\\.(php|asp|aspx|jsp|pl|cgi|py|rb|cfm|do|action)\\b', severity: 'critical', confidence: 0.9, description: 'RFI targeting remote script inclusion of PHP/ASP/etc executables' },
  { name: 'RFI - Data URL Wrapper', category: 'rfi', pattern: 'data://|data\\s*:\\s*text|data\\s*:\\s*application', severity: 'critical', confidence: 0.95, description: 'RFI using data URL wrapper for inline code injection' },
  { name: 'RFI - IP-Based Remote URL', category: 'rfi', pattern: 'https?://\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}/.*\\.(php|asp|txt|inc)', severity: 'high', confidence: 0.85, description: 'RFI using raw IP address for remote file inclusion' },
  { name: 'RFI - Allow URL Include Bypass', category: 'rfi', pattern: 'allow_url_include|allow_url_fopen', severity: 'medium', confidence: 0.8, description: 'RFI attempt to detect or bypass allow_url_include settings' },
  { name: 'RFI - FTP URL Inclusion', category: 'rfi', pattern: 'ftp://[^\\s]+/.*\\.(php|asp|jsp|txt|html?|inc)', severity: 'high', confidence: 0.85, description: 'RFI via FTP protocol for remote file inclusion' },
  { name: 'RFI - SMB/UNC Path Inclusion', category: 'rfi', pattern: '\\\\\\\\[^\\\\]+\\\\[^\\s]+|smb://|\\bUNC\\b|\\\\\\\\192\\.|\\\\\\\\10\\.', severity: 'high', confidence: 0.85, description: 'RFI via SMB/UNC path for Windows-based inclusion attacks' },
  { name: 'RFI - Thin Client Shell/Exec', category: 'rfi', pattern: 'https?://[^\\s]*/cmd\\.php|https?://[^\\s]*/shell\\.php|https?://[^\\s]*/eval\\.php|https?://[^\\s]*/c99\\.php', severity: 'critical', confidence: 0.9, description: 'RFI targeting known remote shell/webshell scripts on external hosts' },
  { name: 'RFI - Compressed Archive Include', category: 'rfi', pattern: 'zip://|phar://|compress.zlib|compress.bzip2|ogg://', severity: 'critical', confidence: 0.95, description: 'RFI using PHP compressed archive wrappers for code execution' },
  { name: 'RFI - PHP Input Stream Include', category: 'rfi', pattern: 'expect://|php://input', severity: 'critical', confidence: 0.95, description: 'RFI using expect:// wrapper for direct command execution' },
  { name: 'RFI - SSI Include', category: 'rfi', pattern: '<!--\\s*#include\\s+virtual\\s*=|<!--\\s*#include\\s+file\\s*=|<!--\\s*#exec\\s+cmd\\s*=', severity: 'high', confidence: 0.88, description: 'Server-Side Include (SSI) injection for remote file inclusion' },
  // ========================================================================
  // COMMAND EXECUTION (cmd_exec) - 18 patterns
  // ========================================================================
  { name: 'CMD Exec - Pipe Command', category: 'cmd_exec', pattern: '\\|\\s*(cat|ls|id|whoami|pwd|rm|chmod|chown|wget|curl|nc|ncat|bash|sh|python|perl|ruby)', severity: 'critical', confidence: 0.92, description: 'Command injection via pipe to shell commands' },
  { name: 'CMD Exec - Subshell (Backtick)', category: 'cmd_exec', pattern: '`[^`]+`', severity: 'critical', confidence: 0.9, description: 'Command injection via backtick subshell execution' },
  { name: 'CMD Exec - Subshell ($())', category: 'cmd_exec', pattern: '\\$\\([^)]+\\)', severity: 'critical', confidence: 0.9, description: 'Command injection via $() command substitution' },
  { name: 'CMD Exec - Semicolon Chaining', category: 'cmd_exec', pattern: ';\\s*(cat|ls|id|whoami|rm|chmod|wget|curl|nc|bash|sh|python|ping|nslookup|dig)\\s', severity: 'critical', confidence: 0.9, description: 'Command injection via semicolon command chaining' },
  { name: 'CMD Exec - AND/OR Chaining', category: 'cmd_exec', pattern: '&&\\s*(cat|ls|id|whoami|rm|chmod|wget|curl|nc|bash|sh|python|perl|echo)|\\|\\|\\s*(cat|ls|id|whoami)', severity: 'critical', confidence: 0.92, description: 'Command injection via && or || logical operators' },
  { name: 'CMD Exec - Newline Injection', category: 'cmd_exec', pattern: '%0a|%0d|\\r\\n|\\x0a|\\x0d|\\\\n|\\n\\s*(cat|ls|id|wget|curl)', severity: 'critical', confidence: 0.88, description: 'Command injection via newline/carriage return injection' },
  { name: 'CMD Exec - Windows PowerShell', category: 'cmd_exec', pattern: 'powershell\\s+(-Command|-EncodedCommand|-Exec|Invoke-|iex\\s|Get-|Set-|Start-)|pwsh\\s+', severity: 'critical', confidence: 0.92, description: 'Command injection via Windows PowerShell cmdlets' },
  { name: 'CMD Exec - Windows CMD', category: 'cmd_exec', pattern: 'cmd\\.exe\\s+/c|cmd\\.exe\\s+/k|cmd\\s+/c\\s+|cmd\\s+/k\\s+|command\\.com\\s+/c', severity: 'critical', confidence: 0.92, description: 'Command injection via Windows cmd.exe execution' },
  { name: 'CMD Exec - Windows Certutil', category: 'cmd_exec', pattern: 'certutil\\s+-urlcache|certutil\\s+-decode|certutil\\s+-encode', severity: 'high', confidence: 0.88, description: 'Command injection via Windows certutil for file download/decode' },
  { name: 'CMD Exec - Windows Bitsadmin', category: 'cmd_exec', pattern: 'bitsadmin\\s+/transfer|bitsadmin\\s+/addfile|bitsadmin\\s+/create|bitsadmin\\s+/setnotifycmdline', severity: 'high', confidence: 0.88, description: 'Command injection via Windows bitsadmin for file download' },
  { name: 'CMD Exec - Windows Wmic', category: 'cmd_exec', pattern: 'wmic\\s+|wmic\\.exe\\s+', severity: 'high', confidence: 0.85, description: 'Command injection via Windows Management Instrumentation Command' },
  { name: 'CMD Exec - Windows Cscript/Wscript', category: 'cmd_exec', pattern: 'cscript\\s+|wscript\\s+', severity: 'high', confidence: 0.85, description: 'Command injection via Windows Script Host execution' },
  { name: 'CMD Exec - Windows Regsvr32', category: 'cmd_exec', pattern: 'regsvr32\\s+/s|regsvr32\\s+/u|regsvr32\\s+/i', severity: 'high', confidence: 0.85, description: 'Command injection via Windows regsvr32 DLL registration' },
  { name: 'CMD Exec - Network Tools (ping/nslookup/dig)', category: 'cmd_exec', pattern: 'ping\\s+-n\\s+\\d+|ping\\s+-c\\s+\\d+|nslookup\\s+-type=|nslookup\\s+-q=|dig\\s+@|nmap\\s+', severity: 'high', confidence: 0.85, description: 'Command injection via network diagnostic tools for data exfil' },
  { name: 'CMD Exec - Curl/Wget Download', category: 'cmd_exec', pattern: 'curl\\s+(-o|-O|--output)|wget\\s+(-O|-o|--output-document)|curl\\s+http://|wget\\s+http://', severity: 'critical', confidence: 0.9, description: 'Command injection via curl/wget for remote payload download' },
  { name: 'CMD Exec - Netcat/Ncat Reverse Shell', category: 'cmd_exec', pattern: 'nc\\s+(-e|-c|/e|/c)\\s+|ncat\\s+(-e|-c)|nc\\s+\\d+\\.\\d+\\.\\d+\\.\\d+\\s+\\d+', severity: 'critical', confidence: 0.95, description: 'Reverse shell via netcat/ncat -e flag for remote shell' },
  { name: 'CMD Exec - Base64 Decode to Shell', category: 'cmd_exec', pattern: 'echo\\s+[A-Za-z0-9+/]{20,}={0,2}\\s*\\|\\s*(base64|bash|sh|python|perl)', severity: 'critical', confidence: 0.9, description: 'Command injection via base64 encoded payload piped to shell' },
  { name: 'CMD Exec - Null Byte Terminator', category: 'cmd_exec', pattern: '%00(\\s*cat|\\s*ls|\\s*id|\\s*whoami|\\s*bash|\\s*sh|\\s*python|\\s*perl)|\\x00(\\s*cat|\\s*ls|\\s*id)', severity: 'high', confidence: 0.85, description: 'Command injection via null byte terminator to bypass input validation' },
  // ========================================================================
  // PATH TRAVERSAL (path_traversal) - 12 patterns
  // ========================================================================
  { name: 'PT - URL Encoded Dot-Dot-Slash', category: 'path_traversal', pattern: '%2e%2e%2f|%2e%2e%5c|%2e%2e%2f%2e%2e%2f|%2e%2e%5c%2e%2e%5c', severity: 'high', confidence: 0.95, description: 'Path traversal using URL-encoded ../ or ..\\ sequences' },
  { name: 'PT - Double URL Encoded', category: 'path_traversal', pattern: '%252e%252e%252f|%252e%252e%255c|%25c0%25ae%25c0%25ae', severity: 'high', confidence: 0.9, description: 'Path traversal using double URL-encoded sequences to bypass filters' },
  { name: 'PT - Unicode Encoded', category: 'path_traversal', pattern: '%c0%ae%c0%ae%c0%af|%c0%ae%c0%ae\\/|%uff0e%uff0e%uff0f|%ef%bc%8f', severity: 'high', confidence: 0.9, description: 'Path traversal using Unicode overlong encoding bypass' },
  { name: 'PT - Windows Backslash', category: 'path_traversal', pattern: '\.\\.\\\\|\.\\./\.\./\.\./|\.\\.\\\\\.\\.\\\\\.\\.\\\\|\.\\.\\/\.\\.\\/\.\\.\\/', severity: 'high', confidence: 0.95, description: 'Path traversal using Windows backslash or repeated ../ patterns' },
  { name: 'PT - Null Byte Extension Bypass', category: 'path_traversal', pattern: '\\.\\./\\.\\./\\.\\./%00|\\.\\.\\\\\.\\.\\\\\.\\.\\\\%00|\\.\\./\\.\\./\\.\\./\\x00', severity: 'high', confidence: 0.88, description: 'Path traversal with null byte to bypass file extension requirements' },
  { name: 'PT - Hex/Octal Encoded', category: 'path_traversal', pattern: '\\\\x2e\\\\x2e\\\\x2f|\\\\x2e\\\\x2e\\\\x5c|%%32%%65%%32%%65%%32%%66|%%32%%65%%32%%65%%35%%63', severity: 'medium', confidence: 0.85, description: 'Path traversal using hex or triple-encoded sequences' },
  { name: 'PT - Absolute Path Inclusion', category: 'path_traversal', pattern: '^/etc/|^/var/|^/usr/|^/opt/|^/home/|^/root/|^/tmp/', severity: 'high', confidence: 0.88, description: 'Path traversal using absolute Linux paths for file access' },
  { name: 'PT - Windows Absolute Path', category: 'path_traversal', pattern: '^[A-Za-z]:\\\\|^\\\\\\\\|^/../../windows|^C:\\\\windows|^%SYSTEMROOT%|^%WINDIR%', severity: 'high', confidence: 0.88, description: 'Path traversal using absolute Windows paths (C:\\, UNC, etc.)' },
  { name: 'PT - Dot-Dot Variants', category: 'path_traversal', pattern: '\\.\\.\\\\|\\.\\./|~\\.\\.|~\\.\\\\', severity: 'high', confidence: 0.92, description: 'Path traversal using basic dot-dot patterns (../ or ..\\)' },
  { name: 'PT - Filter Bypass (....)', category: 'path_traversal', pattern: '\.\.\\/|\\.\\.\\\\|\.\\./\.\./|\.\\.\\\\\.\\.\\\\', severity: 'high', confidence: 0.9, description: 'Path traversal bypass using concatenated dot-dot sequences' },
  { name: 'PT - URL Encoded Tilde/Home', category: 'path_traversal', pattern: '%7e%2e%2e|~%2e%2e|~%2f|~\\w+/\.\.', severity: 'medium', confidence: 0.8, description: 'Path traversal using tilde-based home directory references' },
  { name: 'PT - Path Traversal in Params', category: 'path_traversal', pattern: 'file=.*\.\./|path=.*\.\./|dir=.*\.\./|template=.*\.\./|include=.*\.\./|require=.*\.\./', severity: 'high', confidence: 0.9, description: 'Path traversal detection in common parameter names (file, path, dir, etc.)' },
  // ========================================================================
  // SERVER-SIDE REQUEST FORGERY (ssrf) - 12 patterns
  // ========================================================================
  { name: 'SSRF - Localhost IPv4', category: 'ssrf', pattern: 'https?://127\\.0\\.0\\.1|https?://0\\.0\\.0\\.0|https?://localhost', severity: 'high', confidence: 0.92, description: 'SSRF targeting localhost (127.0.0.1, 0.0.0.0)' },
  { name: 'SSRF - Private IPv4 (10.x)', category: 'ssrf', pattern: 'https?://10\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}', severity: 'high', confidence: 0.9, description: 'SSRF targeting private Class A network (10.x.x.x)' },
  { name: 'SSRF - Private IPv4 (172.16-31.x)', category: 'ssrf', pattern: 'https?://172\\.(1[6-9]|2[0-9]|3[01])\\.\\d{1,3}\\.\\d{1,3}', severity: 'high', confidence: 0.9, description: 'SSRF targeting private Class B network (172.16-31.x.x)' },
  { name: 'SSRF - Private IPv4 (192.168.x)', category: 'ssrf', pattern: 'https?://192\\.168\\.\\d{1,3}\\.\\d{1,3}', severity: 'high', confidence: 0.9, description: 'SSRF targeting private Class C network (192.168.x.x)' },
  { name: 'SSRF - Link-Local (169.254.x)', category: 'ssrf', pattern: 'https?://169\\.254\\.', severity: 'medium', confidence: 0.85, description: 'SSRF targeting link-local address space for metadata' },
  { name: 'SSRF - AWS Metadata', category: 'ssrf', pattern: 'https?://169\\.254\\.169\\.254|http://169\\.254\\.169\\.254/latest/|http://instance-data\\.', severity: 'critical', confidence: 0.95, description: 'SSRF targeting AWS EC2 instance metadata endpoint' },
  { name: 'SSRF - GCP Metadata', category: 'ssrf', pattern: 'metadata\\.google\\.internal|metadata\\.google\\.com|169\\.254\\.169\\.254/computeMetadata/', severity: 'critical', confidence: 0.95, description: 'SSRF targeting GCP metadata endpoints' },
  { name: 'SSRF - Azure Metadata', category: 'ssrf', pattern: '169\\.254\\.169\\.254/metadata/|metadata\\.azure\\.com|azure\\.microsoft\\.com/metadata', severity: 'critical', confidence: 0.95, description: 'SSRF targeting Azure instance metadata service' },
  { name: 'SSRF - IPv6 Localhost', category: 'ssrf', pattern: 'https?://\\[::1\\]|https?://\\[0:0:0:0:0:0:0:1\\]|https?://\\[0::1\\]', severity: 'high', confidence: 0.9, description: 'SSRF targeting IPv6 loopback address' },
  { name: 'SSRF - Internal DNS Names', category: 'ssrf', pattern: 'https?://.*\\.internal\\b|https?://.*\\.local\\b|https?://.*\\.intranet\\b|https?://.*\\.corp\\b', severity: 'high', confidence: 0.85, description: 'SSRF targeting internal DNS names (internal, local, intranet, corp)' },
  { name: 'SSRF - Cloud Provider Internal', category: 'ssrf', pattern: 'https?://.*\\.amazonaws\\.com/internal|https?://.*\\.googleapis\\.com/internal|https?://.*\\.core\\.windows\\.net', severity: 'high', confidence: 0.85, description: 'SSRF targeting cloud provider internal API endpoints' },
  { name: 'SSRF - Docker Socket', category: 'ssrf', pattern: 'https?://.*\\.docker\\.sock|https?://localhost/v\\d+\\.\\d+/containers|https?://127\\.0\\.0\\.1/v\\d+\\.\\d+/exec|https?://localhost/v\\d+\\.\\d+/images', severity: 'critical', confidence: 0.95, description: 'SSRF targeting Docker daemon socket for container escape' },
  // ========================================================================
  // XML EXTERNAL ENTITY (xxe) - 10 patterns
  // ========================================================================
  { name: 'XXE - DOCTYPE with External Entity', category: 'xxe', pattern: '<!DOCTYPE\\s+[^\\[]+\\[\\s*<!ENTITY\\s+', severity: 'critical', confidence: 0.95, description: 'XXE via DOCTYPE declaration with inline external entity' },
  { name: 'XXE - SYSTEM Entity File Read', category: 'xxe', pattern: 'SYSTEM\\s+"file://|SYSTEM\\s+\'file://|SYSTEM\\s+"php://|SYSTEM\\s+\'php://', severity: 'critical', confidence: 0.95, description: 'XXE using SYSTEM entity for local file reading' },
  { name: 'XXE - SYSTEM Entity HTTP', category: 'xxe', pattern: 'SYSTEM\\s+"http://|SYSTEM\\s+\'http://|SYSTEM\\s+"https://|SYSTEM\\s+\'https://|SYSTEM\\s+"ftp://', severity: 'critical', confidence: 0.95, description: 'XXE using SYSTEM entity for SSRF via HTTP/FTP' },
  { name: 'XXE - Parameter Entity', category: 'xxe', pattern: '<!ENTITY\\s+%\\s+[^\\s]+\\s+SYSTEM|<![^\\[]*\\[.*%[^;]+;', severity: 'critical', confidence: 0.9, description: 'XXE via parameter entity for blind out-of-band data exfiltration' },
  { name: 'XXE - Blind OOB Detection', category: 'xxe', pattern: '<!ENTITY\\s+[^\\s]+\\s+SYSTEM\\s+"(http|https|ftp)://\\d+\\.\\d+\\.\\d+\\.\\d+', severity: 'critical', confidence: 0.95, description: 'Blind XXE out-of-band exfiltration to attacker-controlled server' },
  { name: 'XXE - XInclude Attack', category: 'xxe', pattern: 'xml\\s*:\\s*base|xi:include|xmlns:xi=|http://www\\.w3\\.org/2001/XInclude', severity: 'high', confidence: 0.9, description: 'XXE via XInclude namespace injection for file inclusion' },
  { name: 'XXE - SVG File Read', category: 'xxe', pattern: '<svg[^>]*xmlns="http://www\\.w3\\.org/2000/svg"[^>]*>.*<!ENTITY|DOCTYPE\\s+svg\\s+SYSTEM', severity: 'high', confidence: 0.9, description: 'XXE via SVG upload with entity declarations' },
  { name: 'XXE - SOAP/XML-RPC Entity', category: 'xxe', pattern: '<!DOCTYPE\\s+(soap|methodCall|request|xml|root)\\s+\\[|<!DOCTYPE\\s+\\w+\\s+PUBLIC\\s+["\']-//', severity: 'high', confidence: 0.88, description: 'XXE in SOAP/XML-RPC envelopes with DOCTYPE entity' },
  { name: 'XXE - DocType with Entity Expansion', category: 'xxe', pattern: '<!ENTITY\\s+[^\\s]+\\s+[^\\s]+\\s+[^\\s]+>.*<!ENTITY\\s+[^\\s]+\\s+[^\\s]+\\s+[^\\s]+>', severity: 'medium', confidence: 0.85, description: 'Billion Laughs / entity expansion XXE denial of service' },
  { name: 'XXE - Java External Entity', category: 'xxe', pattern: 'javax\\.xml\\.parsers|DocumentBuilderFactory|SAXParser|XMLReader.*entity', severity: 'medium', confidence: 0.8, description: 'XXE detection in Java XML parsing context' },
  // ========================================================================
  // SCANNER DETECTION (scanners) - 20 patterns
  // ========================================================================
  { name: 'Scanner - Nmap', category: 'scanners', pattern: 'nmap|Nmap|NMAP|nmap\\s+-sS|nmap\\s+-sV|nmap\\s+-A', severity: 'medium', confidence: 0.9, description: 'Nmap port scanner detection' },
  { name: 'Scanner - Nessus', category: 'scanners', pattern: 'nessus|Nessus|NASL|nessus\\s+-T', severity: 'medium', confidence: 0.9, description: 'Nessus vulnerability scanner detection' },
  { name: 'Scanner - OpenVAS', category: 'scanners', pattern: 'openvas|OpenVas|OpenVAS|OVAL|openvas-nasl', severity: 'medium', confidence: 0.9, description: 'OpenVAS vulnerability scanner detection' },
  { name: 'Scanner - Nikto', category: 'scanners', pattern: 'nikto|Nikto|NIKTO|nikto\\.pl', severity: 'medium', confidence: 0.9, description: 'Nikto web server scanner detection' },
  { name: 'Scanner - OWASP ZAP', category: 'scanners', pattern: 'OWASP ZAP|ZAP\\s+v\\d\\.|zaproxy|ZAP-', severity: 'medium', confidence: 0.9, description: 'OWASP Zed Attack Proxy detection' },
  { name: 'Scanner - Acunetix', category: 'scanners', pattern: 'acunetix-wvs|acunetix-scanning-agents|Acunetix|acunetix', severity: 'medium', confidence: 0.95, description: 'Acunetix web vulnerability scanner detection' },
  { name: 'Scanner - SQLMap', category: 'scanners', pattern: 'sqlmap|SQLMap|sqlmap/', severity: 'high', confidence: 0.95, description: 'SQLMap automated SQL injection tool detection' },
  { name: 'Scanner - WPScan', category: 'scanners', pattern: 'wpscan|WPScan|WPScan\\s+v', severity: 'medium', confidence: 0.9, description: 'WPScan WordPress vulnerability scanner detection' },
  { name: 'Scanner - DirBuster', category: 'scanners', pattern: 'dirbuster|DirBuster|dirb\\s+', severity: 'medium', confidence: 0.88, description: 'DirBuster/dirb directory brute-force tool detection' },
  { name: 'Scanner - Gobuster', category: 'scanners', pattern: 'gobuster|GoBuster|Gobuster', severity: 'medium', confidence: 0.88, description: 'GoBuster directory/file brute-force tool detection' },
  { name: 'Scanner - FFUF', category: 'scanners', pattern: 'ffuf|Ffuf|fuzz|Fuzz\\s+v|wfuzz|Wfuzz', severity: 'medium', confidence: 0.85, description: 'FFUF/WFuzz web fuzzing tool detection' },
  { name: 'Scanner - Burp Suite', category: 'scanners', pattern: 'Burp-Suite|burpsuite|Burp\\s+Scanner|burpscanner|Burp\\s+v\\d', severity: 'low', confidence: 0.8, description: 'Burp Suite professional scanner detection' },
  { name: 'Scanner - Nuclei', category: 'scanners', pattern: 'nuclei|Nuclei|projectdiscovery/nuclei', severity: 'medium', confidence: 0.88, description: 'Nuclei YAML-based vulnerability scanner detection' },
  { name: 'Scanner - Netsparker', category: 'scanners', pattern: 'netsparker|Netsparker|Netsparker\\s+', severity: 'medium', confidence: 0.9, description: 'Netsparker web application security scanner detection' },
  { name: 'Scanner - AppScan', category: 'scanners', pattern: 'AppScan|appscan|AppScan\\s+v\\d', severity: 'medium', confidence: 0.85, description: 'IBM AppScan web security scanner detection' },
  { name: 'Scanner - Arachni', category: 'scanners', pattern: 'arachni|Arachni|arachni\\s+v\\d', severity: 'medium', confidence: 0.88, description: 'Arachni web application security scanner detection' },
  { name: 'Scanner - QualysGuard', category: 'scanners', pattern: 'Qualys|qualysguard|QualysGuard', severity: 'medium', confidence: 0.85, description: 'QualysGuard vulnerability management scanner detection' },
  { name: 'Scanner - Masscan', category: 'scanners', pattern: 'masscan|Masscan|masscan\\s+[0-9]', severity: 'medium', confidence: 0.88, description: 'Masscan high-speed port scanner detection' },
  { name: 'Scanner - WhatWeb', category: 'scanners', pattern: 'whatweb|WhatWeb|WhatWeb\\s+v\\d', severity: 'low', confidence: 0.8, description: 'WhatWeb website technology identification tool detection' },
  { name: 'Scanner - Vega', category: 'scanners', pattern: 'Vega\\s+v\\d|vega\\s+scanner|subgraph\\s+vega', severity: 'medium', confidence: 0.85, description: 'Vega vulnerability scanner detection' },
  // ========================================================================
  // EXPLOIT KITS (exploit_kit) - 20 patterns
  // ========================================================================
  { name: 'CVE-2021-44228 - Log4Shell', category: 'exploit_kit', pattern: '\\$\\{jndi:(ldap|rmi|dns|ldaps|iiop|http):', severity: 'critical', confidence: 0.95, cve_id: 'CVE-2021-44228', description: 'Log4Shell RCE via JNDI lookups in Log4j 2.x' },
  { name: 'CVE-2021-45046 - Log4Shell Bypass', category: 'exploit_kit', pattern: '\\$\\{(?:lower|upper|env|sys|date|ctx|log4j|web|main|jndi|base64|java|docker|spring|kubernetes):', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2021-45046', description: 'Log4Shell variant bypass using Log4j lookups' },
  { name: 'CVE-2017-5638 - Struts2 OGNL', category: 'exploit_kit', pattern: '#_memberAccess|#nike|#context|#\\s*_memberAccess|#\\s*context|ognl\\.|#application|#session|#request|#servletResponse', severity: 'critical', confidence: 0.95, cve_id: 'CVE-2017-5638', description: 'Apache Struts2 RCE via OGNL injection (Content-Type header)' },
  { name: 'CVE-2013-2251 - Struts2 Action', category: 'exploit_kit', pattern: 'redirectAction:|redirect:|action:.*?#|method:.*?#', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2013-2251', description: 'Apache Struts2 arbitrary action method execution' },
  { name: 'CVE-2022-22965 - Spring4Shell', category: 'exploit_kit', pattern: 'class\\.module\\.classLoader|class\\.prototype|spring-cloud|Spring4Shell|classLoader\\.URLs|classLoader\\.resources|pwd\\.args|pwd\\.cmd', severity: 'critical', confidence: 0.95, cve_id: 'CVE-2022-22965', description: 'Spring Framework RCE via classLoader injection (Spring4Shell)' },
  { name: 'CVE-2022-22963 - Spring Cloud SpEL', category: 'exploit_kit', pattern: 'spring\\.cloud\\.function\\.routing-expression|T\\(java\\.lang\\.Runtime\\)|T\\(org\\.springframework', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2022-22963', description: 'Spring Cloud Function SpEL expression injection RCE' },
  { name: 'CVE-2014-0160 - Heartbleed', category: 'exploit_kit', pattern: 'Heartbleed|heartbeat.*payload|\\x18\\x03\\x00[\\x00-\\xff]{2}\\x00|TLS.*heartbeat.*overflow', severity: 'high', confidence: 0.9, cve_id: 'CVE-2014-0160', description: 'OpenSSL Heartbleed memory leak attack' },
  { name: 'CVE-2014-6271 - ShellShock', category: 'exploit_kit', pattern: '\\(\\)\\s*\\{[^}]*\\}\\s*;|()\\s*:\\s*[^;]*;\\s*/bin|()\\s*:\\s*[^;]*;\\s*/usr|\\{\\s*:\\s*\\};\\s*ping|\\{\\s*:\\s*\\};\\s*wget', severity: 'critical', confidence: 0.95, cve_id: 'CVE-2014-6271', description: 'Bash ShellShock environment variable injection RCE' },
  { name: 'CVE-2014-3704 - Drupalgeddon', category: 'exploit_kit', pattern: 'drupal.*\\[\\w+\\]\\s*=\\s*[^;]*;|\\$form_state|drupalRender|\\$edit\\[|\\$node->|SA-CORE-2014-005', severity: 'high', confidence: 0.88, cve_id: 'CVE-2014-3704', description: 'Drupal SQL injection via expanded PDO placeholders' },
  { name: 'CVE-2018-7600 - Drupal RCE', category: 'exploit_kit', pattern: '#post_render|#type=markup|#prefix|#suffix|element\\.validate|#pre_render|#lazy_builder|#array_bubble|CVE-2018-7600|Drupalgeddon2', severity: 'critical', confidence: 0.92, cve_id: 'CVE-2018-7600', description: 'Drupal RCE via render array injection (Drupalgeddon2)' },
  { name: 'CVE-2017-10271 - WebLogic XML', category: 'exploit_kit', pattern: '<soapenv:Envelope[^>]*>.*<work:WorkContext[^>]*>.*<java:void|weblogic\\.jndi|WLSAgent|AsyncQueueService', severity: 'critical', confidence: 0.92, cve_id: 'CVE-2017-10271', description: 'Oracle WebLogic RCE via XMLDecoder deserialization' },
  { name: 'CVE-2020-14882 - WebLogic Console', category: 'exploit_kit', pattern: 'console\\.portal|_nfpb=true|_pageLabel|HandleBehavior|com\\.bea|weblogic\\.security', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2020-14882', description: 'Oracle WebLogic console authentication bypass RCE' },
  { name: 'CVE-2019-1003000 - Jenkins RCE', category: 'exploit_kit', pattern: 'sandbox\\s*groovy|script\\s*groovy|__groovy|workflow/job|workflowLibs\\.groovy|jenkins.*sandbox|ScriptApproval', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2019-1003000', description: 'Jenkins RCE via sandbox bypass in pipeline scripts' },
  { name: 'CVE-2016-4437 - Apache Shiro', category: 'exploit_kit', pattern: 'rememberMe=|deleteMe\\s*;|shiro.*cipherKey|AES.*GCM.*padding', severity: 'high', confidence: 0.88, cve_id: 'CVE-2016-4437', description: 'Apache Shiro deserialization RCE via rememberMe cookie' },
  { name: 'ThinkPHP RCE', category: 'exploit_kit', pattern: 'thinkphp|ThinkPHP|\\$\\_REQUEST.*\\[\\\'[^\\\']*\\\'\\].*eval|Think\\b.*InvokeFunction|think\\/app|\\/index\\.php\\/index', severity: 'critical', confidence: 0.9, description: 'ThinkPHP RCE via request parameter injection' },
  { name: 'Laravel RCE (CVE-2021-3129)', category: 'exploit_kit', pattern: 'laravel.*ignition|_ignition|executeSolution|MakeViewVariableOptionalSolution|CVE-2021-3129', severity: 'critical', confidence: 0.92, cve_id: 'CVE-2021-3129', description: 'Laravel Ignition RCE via variable optional solution' },
  { name: 'ElasticSearch RCE (CVE-2015-1427)', category: 'exploit_kit', pattern: 'esapi|elasticsearch.*script_lang|elasticsearch.*groovy|search.*script_fields|CVE-2015-1427', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2015-1427', description: 'ElasticSearch Groovy script engine RCE' },
  { name: 'FastJson RCE', category: 'exploit_kit', pattern: 'fastjson|@type|JdbcRowSetImpl|TemplatesImpl|com\\.sun\\.rowset\\.JdbcRowSetImpl|\\"@type\\":\\s*\\"', severity: 'critical', confidence: 0.92, description: 'FastJson deserialization RCE via @type property' },
  { name: 'Jackson RCE (CVE-2019-12384)', category: 'exploit_kit', pattern: 'jackson.*enableDefaultTyping|@class|com\\.fasterxml.*enableDefaultTyping|logback.*db|ch.qos.logback', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2019-12384', description: 'Jackson deserialization RCE via polymorphic type handling' },
  { name: 'Ruby on Rails RCE (CVE-2019-5418)', category: 'exploit_kit', pattern: 'rails.*render|file:///proc/self|render\s+file:|render\s+action:|accept.*!.*!|rails.*accept.*header|CVE-2019-5418|CVE-2019-5420', severity: 'critical', confidence: 0.9, cve_id: 'CVE-2019-5418', description: 'Ruby on Rails file disclosure and RCE via accept headers' },
  // ========================================================================
  // WEBSHELL DETECTION (webshell) - 15 patterns
  // ========================================================================
  { name: 'WebShell - China Chopper', category: 'webshell', pattern: '\\$_POST\\[.*\\]\\(\\$_POST\\[|\\$_GET\\[.*\\]\\(\\$_GET\\[|eval\\(\\$\\_POST\\[|assert\\(\\$\\_POST\\[', severity: 'critical', confidence: 0.95, description: 'China Chopper webshell eval/assert backdoor pattern' },
  { name: 'WebShell - AntSword', category: 'webshell', pattern: 'AntSword|antsword|@ini_set|set_time_limit.*0;.*eval|base64_decode\\(\\$\\_POST\\[.*\\]\\)|eval\\(base64_decode', severity: 'critical', confidence: 0.95, description: 'AntSword webshell tool detection' },
  { name: 'WebShell - Godzilla', category: 'webshell', pattern: 'Godzilla|godzilla|\\$\\_REQUEST\\[.*\\]\\(\\$\\_REQUEST\\[|\\$_HEADER\\[|\\$_COOKIE\\[.*base64', severity: 'critical', confidence: 0.92, description: 'Godzilla webshell tool detection' },
  { name: 'WebShell - c99shell/r57shell', category: 'webshell', pattern: 'c99shell|c99\\.php|r57shell|r57\\.php|b374k|webshell\\.php|shell\\.php|wso\\.php|cmd\\.php', severity: 'critical', confidence: 0.95, description: 'Known webshell script names (c99, r57, b374k, wso)' },
  { name: 'WebShell - eval/assert/system', category: 'webshell', pattern: 'eval\\(\\$\\_GET|eval\\(\\$\\_REQUEST|assert\\(\\$\\_GET|assert\\(\\$\\_REQUEST|system\\(\\$\\_GET|system\\(\\$\\_REQUEST', severity: 'critical', confidence: 0.95, description: 'Webshell using eval/assert/system with GET/REQUEST input' },
  { name: 'WebShell - base64_decode Command', category: 'webshell', pattern: 'base64_decode\\(\\s*[\"\\\'][A-Za-z0-9+/]{50,}={0,2}[\"\\\']\\s*\\)', severity: 'high', confidence: 0.9, description: 'Webshell using base64_decode with long base64 payload' },
  { name: 'WebShell - proc_open/shell_exec', category: 'webshell', pattern: 'proc_open\\(\\$\\_GET|proc_open\\(\\$\\_POST|shell_exec\\(\\$\\_GET|shell_exec\\(\\$\\_POST|exec\\(\\$\\_GET|exec\\(\\$\\_POST', severity: 'critical', confidence: 0.95, description: 'Webshell using proc_open/shell_exec/exec with user input' },
  { name: 'WebShell - PHP Multifunction Backdoor', category: 'webshell', pattern: 'preg_replace\\(.*\\/e\\s*,|create_function\\(\\$|array_map\\(\\s*\\$\\_|uasort\\(\\s*\\$\\_|array_filter\\(\\s*\\$\\_', severity: 'high', confidence: 0.88, description: 'Hidden webshell using PHP callback functions as backdoor' },
  { name: 'WebShell - ASP/XASP Backdoor', category: 'webshell', pattern: '<%@\\s*Page\\s*Language="JScript"%>|<%eval\\s*\\(Request\\.Item|Execute\\(Request\\.Form|Run\\(Request\\.Form|eval\\(Request\\.Form', severity: 'high', confidence: 0.9, description: 'ASP webshell using eval/Execute/Run with request parameter' },
  { name: 'WebShell - JSP Backdoor', category: 'webshell', pattern: 'Runtime\\.getRuntime\\(\\)\\.exec|ProcessBuilder\\(|Process\\.exec\\(|getRequest\\(\\)\\.getParameter\\(\\)|getServletContext\\(\\)\\.getRealPath', severity: 'critical', confidence: 0.92, description: 'JSP webshell using Java Runtime exec for command execution' },
  { name: 'WebShell - PHP File Manager', category: 'webshell', pattern: 'FileMan|FileManager|filemanager|elFinder|elfinder|KCFinder|tinyMCE.*file_manager', severity: 'medium', confidence: 0.85, description: 'File manager tools often abused as webshells (elFinder, KCFinder)' },
  { name: 'WebShell - .htaccess Backdoor', category: 'webshell', pattern: 'AddType\\s+application/x-httpd-php\\s+\\.|AddHandler\\s+application/x-httpd-php\\.|SetHandler\\s+application/x-httpd-php|php_value\\s+auto_prepend_file', severity: 'high', confidence: 0.88, description: 'HTAccess webshell backdoor using PHP handler injection' },
  { name: 'WebShell - Python Backdoor', category: 'webshell', pattern: 'exec\\(request\\.getParameter|eval\\(request\\.getParameter|subprocess\\.Popen|os\\.system\\(request|os\\.popen\\(request', severity: 'critical', confidence: 0.92, description: 'Python-based webshell using os/subprocess for command execution' },
  { name: 'WebShell - PHP Dynamic Function', category: 'webshell', pattern: '\\$_GET\\[.*\\]\\(\\$_GET\\[|\\$_POST\\[.*\\]\\(\\$_POST\\[|\\$_REQUEST\\[.*\\]\\(\\$_REQUEST\\[', severity: 'critical', confidence: 0.95, description: 'PHP dynamic function call webshell (variable function invocation)' },
  { name: 'WebShell - WordPress Plugin Backdoor', category: 'webshell', pattern: 'wp-config\\.php|wp-content/uploads/.*\\.php|wp-content/plugins/.*\\.php|wp-admin/admin-ajax\\.php|eval\\(gzinflate\\(base64_decode', severity: 'high', confidence: 0.85, description: 'WordPress plugin backdoor webshell detection' },
  // ========================================================================
  // JWT HIJACK (jwt_hijack) - 6 patterns
  // ========================================================================
  { name: 'JWT - None Algorithm Attack', category: 'jwt_hijack', pattern: '"alg"\\s*:\\s*"none"|\\\'alg\\\'\\s*:\\s*\\\'none\\\'|algorithm.*none|\\"none\\"', severity: 'critical', confidence: 0.95, description: 'JWT None algorithm attack bypassing signature verification' },
  { name: 'JWT - RS256 to HS256 Confusion', category: 'jwt_hijack', pattern: '"alg"\\s*:\\s*"HS256"|\\\'alg\\\'\\s*:\\s*\\\'HS256\\\'|"alg"\\s*:\\s*"HS384"|"alg"\\s*:\\s*"HS512"', severity: 'high', confidence: 0.88, description: 'JWT algorithm confusion attack (RS256 to HS256)' },
  { name: 'JWT - Weak Secret Brute Force', category: 'jwt_hijack', pattern: '"secret"\\s*:\\s*"[A-Za-z0-9]{1,8}"|\\"password\\"\\s*:\\s*\\"jwt|\\"key\\"\\s*:\\s*\\"secret|\\"jwt\\"\\s*:\\s*\\"123|\\"kid\\"\\s*:\\s*"0000', severity: 'high', confidence: 0.85, description: 'JWT with weak/guessable secret for brute force attacks' },
  { name: 'JWT - Kid Injection/SQLi', category: 'jwt_hijack', pattern: '"kid"\\s*:\\s*".*(\'|--|#|;|\\.\\./)', severity: 'high', confidence: 0.9, description: 'JWT kid (key ID) injection for path traversal or SQLi' },
  { name: 'JWT - JWK Injection', category: 'jwt_hijack', pattern: '"jwk"\\s*:\\s*\\{|"jku"\\s*:\\s*"http://|"jku"\\s*:\\s*"https?://[^"]*\\/\\/|"x5u"\\s*:\\s*"http://', severity: 'critical', confidence: 0.92, description: 'JWT embedded JWK/JKU key injection for signature bypass' },
  { name: 'JWT - CSRF Token Bypass', category: 'jwt_hijack', pattern: 'csrf.*token.*jwt|jwt.*csrf|bearer.*xsrf|bearer.*csrf', severity: 'medium', confidence: 0.8, description: 'JWT CSRF token bypass via bearer token header injection' },
  // ========================================================================
  // LDAP INJECTION (ldap) - 6 patterns
  // ========================================================================
  { name: 'LDAP - Wildcard Injection', category: 'ldap', pattern: '\\*\\s*\\)\\s*\\(\\s*\\||\\|\\s*\\(\\s*\\w+\\s*=\\s*\\*', severity: 'high', confidence: 0.88, description: 'LDAP injection using wildcard and OR filter manipulation' },
  { name: 'LDAP - Blind LDAP Injection', category: 'ldap', pattern: '\\bAND\\s+\\w+=\\w+|\\bOR\\s+\\w+=\\w+|~\\((\\w+)=\\1\\)', severity: 'high', confidence: 0.85, description: 'Blind LDAP injection via AND/OR condition manipulation' },
  { name: 'LDAP - Unauthenticated Bind', category: 'ldap', pattern: '(!([^)]*))|(\\|([^)]*))|(&([^)]*))', severity: 'high', confidence: 0.85, description: 'LDAP injection via special filter character manipulation' },
  { name: 'LDAP - Attribute Enumeration', category: 'ldap', pattern: 'objectClass=\\*|objectclass=\\*|cn=\\*|uid=\\*|samaccountname=\\*', severity: 'medium', confidence: 0.8, description: 'LDAP attribute enumeration using wildcard queries' },
  { name: 'LDAP - Unicode/Normalization Bypass', category: 'ldap', pattern: '\\\\ef\\\\bc\\\\88|\\\\ef\\\\bc\\\\89|\\\\c0\\\\ae\\\\c0\\\\ae|\\\\u002a|\\\\u0028', severity: 'medium', confidence: 0.8, description: 'LDAP injection via Unicode normalization bypass' },
  { name: 'LDAP - External Service Interaction', category: 'ldap', pattern: 'ldap://|LDAP://|ldaps://', severity: 'high', confidence: 0.85, description: 'LDAP injection targeting external LDAP service interaction' },
  // ========================================================================
  // NOSQL INJECTION (nosql) - 6 patterns
  // ========================================================================
  { name: 'NoSQL - MongoDB $ne Injection', category: 'nosql', pattern: '\\"\\$ne\\"|\\\'\\$ne\\\'|\\$ne\\b|\\"\\$gt\\"|\\\'\\$gt\\\'|\\$gt\\b', severity: 'high', confidence: 0.9, description: 'NoSQL injection using MongoDB $ne/$gt comparison operators' },
  { name: 'NoSQL - MongoDB $regex Injection', category: 'nosql', pattern: '\\"\\$regex\\"|\\\'\\$regex\\\'|\\$regex\\b|\\"\\$nin\\"|\\\'\\$nin\\\'|\\$nin\\b', severity: 'high', confidence: 0.88, description: 'NoSQL injection using MongoDB $regex/$nin operators' },
  { name: 'NoSQL - MongoDB $where Injection', category: 'nosql', pattern: '\\"\\$where\\"|\\\'\\$where\\\'|\\$where\\s*:|\\$where\\s*\\/', severity: 'critical', confidence: 0.95, description: 'NoSQL injection using MongoDB $where operator for JS execution' },
  { name: 'NoSQL - JSON Body Injection', category: 'nosql', pattern: '"\\$ne":""|"\\$gt":""|"\\$regex":".*"|"\\$exists":true|"\\$ne":null', severity: 'high', confidence: 0.9, description: 'NoSQL injection via JSON body with MongoDB operators' },
  { name: 'NoSQL - URL Parameter Injection', category: 'nosql', pattern: '\\[\\$ne\\]|\\[\\$gt\\]|\\[\\$regex\\]|\\[\\$where\\]|\\[\\$nin\\]|\\[\\$exists\\]', severity: 'high', confidence: 0.88, description: 'NoSQL injection via URL query parameters with operator syntax' },
  { name: 'NoSQL - MongoDB $or/$and Injection', category: 'nosql', pattern: '\\"\\$or\\"|\\\'\\$or\\\'|\\"\\$and\\"|\\\'\\$and\\\'|\\"\\$inc\\"|\\\'\\$inc\\\'', severity: 'high', confidence: 0.85, description: 'NoSQL injection using MongoDB $or/$and logical operators' },
  // ========================================================================
  // SMTP INJECTION (smtp) - 6 patterns
  // ========================================================================
  { name: 'SMTP - Header Injection', category: 'smtp', pattern: '%0d%0a(To|Cc|Bcc|Subject|Content-Type|MIME|From|Reply-To|Return-Path):', severity: 'high', confidence: 0.9, description: 'SMTP injection via CRLF to inject email headers' },
  { name: 'SMTP - Body Injection', category: 'smtp', pattern: '%0d%0a%0d%0a|\\r\\n\\r\\n|\\x0d\\x0a\\x0d\\x0a', severity: 'high', confidence: 0.9, description: 'SMTP injection inserting newlines to modify email body' },
  { name: 'SMTP - Bounce/RCPT Manipulation', category: 'smtp', pattern: '%0d%0aRCPT\\s+TO:|%0d%0aMAIL\\s+FROM:|%0d%0aDATA\\s+|%0d%0aRSET|%0d%0aVRFY', severity: 'high', confidence: 0.88, description: 'SMTP injection via SMTP command manipulation (RCPT, MAIL, DATA)' },
  { name: 'SMTP - Attachment Injection', category: 'smtp', pattern: '%0d%0aContent-Disposition:\\s+attachment|%0d%0aContent-Type:\\s+multipart/mixed|%0d%0aContent-Type:\\s+text/html', severity: 'high', confidence: 0.85, description: 'SMTP attachment injection via CRLF in email headers' },
  { name: 'SMTP - Unicode CRLF Bypass', category: 'smtp', pattern: '%E5%98%8A%E5%98%8D|\\u560A\\u560D|\\x0c\\x0a|%0c%0a|\\xc0\\xba\\xc0\\xbb', severity: 'medium', confidence: 0.8, description: 'SMTP injection via Unicode overlong CRLF encoding bypass' },
  { name: 'SMTP - Sendmail Parameter Injection', category: 'smtp', pattern: 'sendmail.*-O\\s*|sendmail.*-f\\s*|sendmail.*-X\\s*|sendmail.*-t\\s*', severity: 'high', confidence: 0.85, description: 'SMTP sendmail parameter injection for log poisoning' },
  // ========================================================================
  // INSECURE DESERIALIZATION (deserialize) - 8 patterns
  // ========================================================================
  { name: 'Deserialize - PHP Serialized Object', category: 'deserialize', pattern: 'O:\\d+:"[^"]+":\\d+:\\{|O:\\d+:"[^"]+":\\d+:\\(|a:\\d+:\\{.*O:\\d+:', severity: 'critical', confidence: 0.92, description: 'PHP insecure deserialization via serialized object injection' },
  { name: 'Deserialize - Java Serialization Stream', category: 'deserialize', pattern: '\\xac\\xed\\x00\\x05|rO0AB|\\xac\\xed.{4}sr|java\\.io\\.ObjectOutputStream|\\xac\\xed\\x00\\x05sr', severity: 'critical', confidence: 0.95, description: 'Java serialized object stream detection for deserialization attacks' },
  { name: 'Deserialize - Python Pickle', category: 'deserialize', pattern: "g\\x80\\x03c\\x08|\\x80\\x03c[^\\n]*\\ns\\n\\(|cPickle|pickle\\.loads|pickle\\.load|\\x80\\x04\\x95|c\\nos\\nsystem|c\\n.*subprocess", severity: 'critical', confidence: 0.92, description: 'Python pickle deserialization attack with code execution' },
  { name: 'Deserialize - .NET BinaryFormatter', category: 'deserialize', pattern: '\\x00\\x01\\x00\\x00\\x00\\xff\\xff|System\\.Windows\\.Forms|System\\.Data|System\\.Web\\.UI|TypeConfuseDelegate|ObjectDataProvider', severity: 'critical', confidence: 0.92, description: '.NET BinaryFormatter deserialization attack detection' },
  { name: 'Deserialize - Ruby YAML/Marshal', category: 'deserialize', pattern: '---\\s+!ruby/object:|---\\s+!ruby/class:|---\\s+!ruby/hash:|\\x04\\x08o\\x3a|ruby/object:ERB|ruby/object:Rake', severity: 'critical', confidence: 0.9, description: 'Ruby YAML/Marshal deserialization attack with object instantiation' },
  { name: 'Deserialize - Jackson JSON Deser', category: 'deserialize', pattern: '\\"@class\\"\\s*:\\s*\\"[a-zA-Z]+\\.[a-zA-Z]+\\.[a-zA-Z]|\\[\\"java\\.lang\\.Runtime\\"|\\"@type\\"\\s*:\\s*\\"[a-zA-Z]', severity: 'high', confidence: 0.88, description: 'Jackson polymorphic deserialization via @class/@type annotation' },
  { name: 'Deserialize - FastJson AutoType', category: 'deserialize', pattern: '\\"@type\\":\\s*\\"com\\.sun\\.|\\"@type\\":\\s*\\"org\\.apache\\.|\\"@type\\":\\s*\\"java\\.net\\.URLClassLoader', severity: 'critical', confidence: 0.92, description: 'FastJson autoType deserialization with dangerous Java classes' },
  { name: 'Deserialize - JNDI Injection', category: 'deserialize', pattern: 'ldap://|rmi://|iiop://|dns://|ldaps://|\\\\x24\\\\x7bjndi:|${jndi', severity: 'critical', confidence: 0.95, description: 'JNDI injection via deserialization for remote code loading' },
  // ========================================================================
  // PROTOCOL VIOLATIONS (protocol) - 12 patterns
  // ========================================================================
  { name: 'Protocol - HTTP Request Smuggling (CL.TE)', category: 'protocol', pattern: 'Transfer-Encoding:\\s*chunked\\s*\\r\\n.*Content-Length:|Content-Length:\\s*\\d+\\s*\\r\\n.*Transfer-Encoding:', severity: 'high', confidence: 0.9, description: 'HTTP request smuggling via Content-Length/Transfer-Encoding conflict (CL.TE)' },
  { name: 'Protocol - HTTP Request Smuggling (TE.CL)', category: 'protocol', pattern: 'Transfer-Encoding:\\s*\\r\\n.*Content-Length:\\s*0|Transfer-Encoding:\\s*[^c]', severity: 'high', confidence: 0.88, description: 'HTTP request smuggling via Transfer-Encoding/Content-Length conflict (TE.CL)' },
  { name: 'Protocol - CRLF Injection/Splitting', category: 'protocol', pattern: '%0d%0a|\\r\\n|%0a|\\r|%0d|\\x0d\\x0a', severity: 'high', confidence: 0.88, description: 'CRLF injection for HTTP response splitting or header injection' },
  { name: 'Protocol - Host Header Injection', category: 'protocol', pattern: 'Host:\\s*\\d+\\.\\d+\\.\\d+\\.\\d+%00|Host:\\s*localhost%00|Host:\\s*[^\\s]+%00', severity: 'high', confidence: 0.85, description: 'Host header injection with null byte for cache poisoning' },
  { name: 'Protocol - X-Forwarded-For Spoofing', category: 'protocol', pattern: 'X-Forwarded-For:\\s*127\\.0\\.0\\.1|X-Forwarded-For:\\s*10\\.|X-Forwarded-For:\\s*0\\.0\\.0\\.0', severity: 'medium', confidence: 0.85, description: 'X-Forwarded-For header spoofing to bypass IP-based restrictions' },
  { name: 'Protocol - HTTP Method Override', category: 'protocol', pattern: 'X-HTTP-Method-Override:\\s*CONNECT|X-HTTP-Method-Override:\\s*TRACE|X-HTTP-Method-Override:\\s*OPTIONS|X-HTTP-Method-Override:\\s*PUT|X-HTTP-Method-Override:\\s*DELETE', severity: 'medium', confidence: 0.85, description: 'HTTP method override bypassing method-level access controls' },
  { name: 'Protocol - Cache Poisoning', category: 'protocol', pattern: 'X-Forwarded-Host:|X-Forwarded-Scheme:\\s*http|X-Originating-URL:|X-Rewrite-URL:', severity: 'medium', confidence: 0.8, description: 'HTTP cache poisoning via forwarded host/scheme manipulation' },
  { name: 'Protocol - HTTP Verb Tampering', category: 'protocol', pattern: '^OPTIONS\\s|^TRACE\\s|^CONNECT\\s|^PATCH\\s|^PROPFIND\\s|^MOVE\\s|^COPY\\s|^MKCOL\\s', severity: 'low', confidence: 0.75, description: 'HTTP verb tampering using non-standard HTTP methods' },
  { name: 'Protocol - Transfer-Encoding Obfuscation', category: 'protocol', pattern: 'Transfer-Encoding:\\s*\\[\\w+|Transfer-Encoding:\\s*x\\s*\\r\\n|Transfer-Encoding:\\s*\\x00', severity: 'high', confidence: 0.88, description: 'HTTP transfer-encoding obfuscation for request smuggling' },
  { name: 'Protocol - Content-Type Manipulation', category: 'protocol', pattern: 'Content-Type:\\s*[^;]*;\\s*charset=\\x00|Content-Type:\\s*[^;]*;\\s*boundary=\\x00', severity: 'medium', confidence: 0.8, description: 'Content-Type header manipulation using null bytes' },
  { name: 'Protocol - HTTP/0.9 Request', category: 'protocol', pattern: '^[A-Z]+\\s+/[^\\s]*$|^GET\\s+/[^\\s]*$|^POST\\s+/[^\\s]*$', severity: 'low', confidence: 0.7, description: 'HTTP/0.9 simple request without HTTP version (protocol downgrade)' },
  { name: 'Protocol - WebSocket Upgrade Abuse', category: 'protocol', pattern: 'Upgrade:\\s*websocket.*Connection:\\s*Upgrade|Sec-WebSocket-Version:\\s*\\d+\\s*\\r\\n.*Sec-WebSocket-Key:', severity: 'medium', confidence: 0.8, description: 'WebSocket protocol upgrade abuse for connection hijacking' },
  // ========================================================================
  // BAD BOTS (bots) - 12 patterns
  // ========================================================================
  { name: 'Bot - Curl (Non-Browser)', category: 'bots', pattern: '^curl/[0-9]|curl\\s+libcurl', severity: 'low', confidence: 0.85, description: 'Curl user-agent (non-browser CLI HTTP client)' },
  { name: 'Bot - Wget (Non-Browser)', category: 'bots', pattern: '^Wget/[0-9]|^wget/[0-9]|Wget\\/[\\d\\.]+\\s+', severity: 'low', confidence: 0.85, description: 'Wget user-agent (non-browser CLI HTTP client)' },
  { name: 'Bot - Python Requests/Urllib', category: 'bots', pattern: 'python-requests|Python-urllib|aiohttp|httpx|python-httpx', severity: 'low', confidence: 0.88, description: 'Python HTTP library user-agent (often used by scrapers)' },
  { name: 'Bot - Go HTTP Client', category: 'bots', pattern: 'Go-http-client|^Go/[\\d]', severity: 'low', confidence: 0.85, description: 'Go HTTP client user-agent' },
  { name: 'Bot - Java HTTP Client', category: 'bots', pattern: '^Java/[\\d]|^Java/.*\\.\\d+\\.\\d+|Jakarta\\s+Commons-HttpClient|Apache-HttpClient', severity: 'low', confidence: 0.85, description: 'Java HTTP client user-agent' },
  { name: 'Bot - MJ12/BotScout/Scraper', category: 'bots', pattern: 'MJ12bot|BotScout|Scraper|DataForSeoBot|SeznamBot|AhrefsBot|SemrushBot|MegaIndex|Trendiction|BLEXBot', severity: 'medium', confidence: 0.85, description: 'Known aggressive scraper/malicious bot user-agent' },
  { name: 'Bot - Mass Scanner/Downloader', category: 'bots', pattern: 'masscan|zgrab|zmap|ncrack|hydra|medusa', severity: 'low', confidence: 0.85, description: 'Mass scanning/downloader tool user-agent detection' },
  { name: 'Bot - PHP Backdoor Bots', category: 'bots', pattern: 'PycURL|PHPDaemon|PHP\\s+Web\\s+Client|WordPress|wp-admin|wp-cron|wp-login', severity: 'medium', confidence: 0.8, description: 'PHP-based bot scripts for automated attacks' },
  { name: 'Bot - Social Engineering Bots', category: 'bots', pattern: 'HeadlessChrome|PhantomJS|Selenium|HtmlUnit|WebDriver|SamsungBrowser/[0-9]', severity: 'medium', confidence: 0.8, description: 'Headless browser automation bots used for scraping/fraud' },
  { name: 'Bot - Security Scanner Bots', category: 'bots', pattern: 'archive\\.org_bot|ia_archiver|heritrix|gigablast|exabot|dotbot|rogerbot', severity: 'low', confidence: 0.75, description: 'Security-related crawler bots' },
  { name: 'Bot - Malicious Chinese/Russian UAs', category: 'bots', pattern: 'YandexBot|Mail\\.RU|Baiduspider|Sogou|YisouSpider|Ezooms|BLEXBot|SafeSearch', severity: 'medium', confidence: 0.75, description: 'Malicious or aggressive web crawler bots from known aggressive sources' },
  { name: 'Bot - Generic Non-Browser CLI', category: 'bots', pattern: '^libwww|^lwp-trivial|^WWW-Mechanize|^Perl\\s+lib|^Net::HTTP|^LWP::Simple|^HTTP::Request', severity: 'low', confidence: 0.85, description: 'Generic Perl/libwww non-browser CLI HTTP client user-agent' },
  // ========================================================================
  // CLOUD/CONTAINER (cv_sources) - 6 patterns
  // ========================================================================
  { name: 'Cloud - Docker API Access', category: 'cv_sources', pattern: 'docker\\.sock|docker\\.socket|tcp://127\\.0\\.0\\.1:2375|tcp://localhost:2375|/var/run/docker\\.sock', severity: 'critical', confidence: 0.95, description: 'Docker daemon API access via socket or TCP for container escape' },
  { name: 'Cloud - Kubernetes API', category: 'cv_sources', pattern: 'kube-apiserver|kubelet|kubernetes\\.default\\.svc|kubernetes\\.svc\\.cluster\\.local|/api/v1/namespaces|/apis/apps/v1/namespaces', severity: 'critical', confidence: 0.92, description: 'Kubernetes API server access for cluster privilege escalation' },
  { name: 'Cloud - AWS EC2 Metadata', category: 'cv_sources', pattern: '169\\.254\\.169\\.254/latest/meta-data|instance-data/latest/meta-data|169\\.254\\.169\\.254/latest/user-data', severity: 'critical', confidence: 0.95, description: 'AWS EC2 instance metadata service for credential theft' },
  { name: 'Cloud - GCP Metadata', category: 'cv_sources', pattern: 'metadata\\.google\\.internal|metadata\\.google\\.computeMetadata/|computeMetadata/v1/project|computeMetadata/v1/instance', severity: 'critical', confidence: 0.95, description: 'GCP metadata endpoint access for service account credential theft' },
  { name: 'Cloud - Azure Instance Metadata', category: 'cv_sources', pattern: '169\\.254\\.169\\.254/metadata/instance|metadata\\.azure\\.com/metadata/instance', severity: 'critical', confidence: 0.95, description: 'Azure instance metadata service access for credential theft' },
  { name: 'Cloud - etcd API', category: 'cv_sources', pattern: 'etcd\\.cluster\\.local|localhost:2379|127\\.0\\.0\\.1:2379/v2/keys|etcd/v3|/v2/keys/kubernetes|/v3alpha/maintenance', severity: 'critical', confidence: 0.92, description: 'etcd key-value store API access for cluster data theft' },
];

const crsCategoryExists = (category) => OWASP_CRS_SIGNATURES.some(s => s.category === category);

app.post('/signatures/import-owasp', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const seen = new Set();
    const deduped = OWASP_CRS_SIGNATURES.filter(sig => {
      const key = sig.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const existing = await pool.query(
      'SELECT name FROM waf_signatures WHERE tenant_id = $1 AND name = ANY($2::text[])',
      [req.tenantId, deduped.map(s => s.name)]
    );
    const existingNames = new Set(existing.rows.map(r => r.name));
    const toInsert = deduped.filter(sig => !existingNames.has(sig.name));

    if (toInsert.length === 0) {
      return res.json({ success: true, message: 'Imported 0 OWASP CRS signatures (all already exist)' });
    }

    const valuePlaceholders = [];
    const flatValues = [];
    let idx = 1;
    for (const sig of toInsert) {
      valuePlaceholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      flatValues.push(
        genId('sig'),
        req.tenantId,
        sig.name,
        sig.description || sig.name,
        sig.category,
        sig.cve_id || null,
        sig.pattern,
        'request_uri',
        sig.severity,
        sig.confidence,
        req.deptId
      );
    }

    await pool.query(
      `INSERT INTO waf_signatures (id, tenant_id, name, description, category, cve_id, pattern, detection_field, severity, confidence, department_id) VALUES ${valuePlaceholders.join(', ')}`,
      flatValues
    );

    res.json({ success: true, message: `Imported ${toInsert.length} OWASP CRS signatures` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/signatures/import-crs', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { category } = req.query;
    if (!category || !crsCategoryExists(category)) {
      return res.status(400).json({ error: 'Valid category query parameter required. Options: ' + [...new Set(OWASP_CRS_SIGNATURES.map(s => s.category))].sort().join(', ') });
    }

    const filtered = OWASP_CRS_SIGNATURES.filter(sig => sig.category === category);

    const seen = new Set();
    const deduped = filtered.filter(sig => {
      const key = sig.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const existing = await pool.query(
      'SELECT name FROM waf_signatures WHERE tenant_id = $1 AND name = ANY($2::text[]) AND category = $3',
      [req.tenantId, deduped.map(s => s.name), category]
    );
    const existingNames = new Set(existing.rows.map(r => r.name));
    const toInsert = deduped.filter(sig => !existingNames.has(sig.name));

    if (toInsert.length === 0) {
      return res.json({ success: true, message: `Imported 0 CRS signatures for category: ${category} (all already exist)` });
    }

    const valuePlaceholders = [];
    const flatValues = [];
    let idx = 1;
    for (const sig of toInsert) {
      valuePlaceholders.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      flatValues.push(
        genId('sig'),
        req.tenantId,
        sig.name,
        sig.description || sig.name,
        sig.category,
        sig.cve_id || null,
        sig.pattern,
        'request_uri',
        sig.severity,
        sig.confidence,
        req.deptId
      );
    }

    await pool.query(
      `INSERT INTO waf_signatures (id, tenant_id, name, description, category, cve_id, pattern, detection_field, severity, confidence, department_id) VALUES ${valuePlaceholders.join(', ')}`,
      flatValues
    );

    res.json({ success: true, message: `Imported ${toInsert.length} CRS signatures for category: ${category}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// GEO-IP RULES
// ========================================================================
app.get('/geoip', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waf_geoip_rules WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/geoip', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, countries, action } = req.body;
    if (!countries || !Array.isArray(countries) || countries.length === 0) return res.status(400).json({ error: 'countries array required' });
    const id = genId('geo');
    const result = await pool.query(
      `INSERT INTO waf_geoip_rules (id, tenant_id, name, countries, action, department_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, req.tenantId, name, countries, action || 'block', req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/geoip/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, countries, action, enabled } = req.body;
    const result = await pool.query(
      `UPDATE waf_geoip_rules SET name = COALESCE($1, name), countries = COALESCE($2, countries),
       action = COALESCE($3, action), enabled = COALESCE($4, enabled), updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6 RETURNING *`,
      [name, countries, action, enabled, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'GeoIP rule not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/geoip/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_geoip_rules WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'GeoIP rule not found' });
    res.json({ success: true, message: 'GeoIP rule deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// IP REPUTATION
// ========================================================================
app.get('/reputation', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { category, min_score, ip } = req.query;
    const { limit, offset } = parsePagination(req.query);
    let query = 'SELECT * FROM waf_ip_reputation WHERE tenant_id = $1';
    const params = [req.tenantId];
    let idx = 2;
    if (category) { params.push(category); query += ` AND category = $${idx++}`; }
    if (min_score) { params.push(parseInt(min_score)); query += ` AND score >= $${idx++}`; }
    if (ip) { params.push(ip); query += ` AND ip_address::text ILIKE $${idx++}`; params[params.length - 1] = `%${ip}%`; }
    query += ' ORDER BY score DESC, last_seen DESC';
    params.push(limit); query += ` LIMIT $${idx++}`;
    params.push(offset); query += ` OFFSET $${idx++}`;
    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_ip_reputation WHERE tenant_id = $1', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/reputation', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { ip_address, score, category, source, expires_at } = req.body;
    const result = await pool.query(
      `INSERT INTO waf_ip_reputation (tenant_id, ip_address, score, category, source, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, ip_address)
       DO UPDATE SET score = EXCLUDED.score, category = EXCLUDED.category,
       source = EXCLUDED.source, expires_at = EXCLUDED.expires_at, last_seen = CURRENT_TIMESTAMP
       RETURNING *`,
      [req.tenantId, ip_address, score || 50, category, source, expires_at]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/reputation/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_ip_reputation WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Reputation entry not found' });
    res.json({ success: true, message: 'Reputation entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// AUTO-BLACKLIST
// ========================================================================
app.get('/auto-blacklist', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const result = await pool.query(
      'SELECT ab.*, wr.name as rule_name FROM waf_auto_blacklist ab LEFT JOIN waf_rules wr ON ab.triggered_by_rule_id = wr.id WHERE ab.tenant_id = $1 AND ab.expires_at > NOW() ORDER BY ab.created_at DESC LIMIT $2 OFFSET $3',
      [req.tenantId, limit, offset]
    );
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_auto_blacklist WHERE tenant_id = $1 AND expires_at > NOW()', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/auto-blacklist', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { ip_address, reason, triggered_by_rule_id, violation_count, score_at_block, expires_at } = req.body;
    const id = genId('abl');
    const result = await pool.query(
      `INSERT INTO waf_auto_blacklist (id, tenant_id, ip_address, reason, triggered_by_rule_id, violation_count, score_at_block, expires_at, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, req.tenantId, ip_address, reason, triggered_by_rule_id, violation_count || 1, score_at_block, expires_at || new Date(Date.now() + 86400000).toISOString(), req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/auto-blacklist/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_auto_blacklist WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Auto-blacklist entry not found' });
    res.json({ success: true, message: 'Auto-blacklist entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// ENHANCED IP MANAGEMENT (WHITELIST / BLACKLIST)
// ========================================================================
app.get('/whitelist', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { enabled, search } = req.query;
    const { limit, offset } = parsePagination(req.query);
    let query = 'SELECT * FROM waf_whitelist WHERE tenant_id = $1';
    const params = [req.tenantId];
    let idx = 2;
    if (enabled !== undefined) { params.push(enabled === 'true'); query += ` AND enabled = $${idx++}`; }
    if (search) { params.push(`%${search}%`); query += ` AND (description ILIKE $${idx} OR ip_address::text ILIKE $${idx} OR cidr_block::text ILIKE $${idx})`; idx++; }
    query += ' ORDER BY created_at DESC';
    params.push(limit); query += ` LIMIT $${idx++}`;
    params.push(offset); query += ` OFFSET $${idx++}`;
    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_whitelist WHERE tenant_id = $1', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/whitelist', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { ip_address, cidr_block, description, source, expires_at } = req.body;
    const id = genId('wl');
    const result = await pool.query(
      `INSERT INTO waf_whitelist (id, tenant_id, ip_address, cidr_block, description, source, expires_at, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, req.tenantId, ip_address, cidr_block, description, source || 'manual', expires_at, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/whitelist/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { description, expires_at, enabled } = req.body;
    const result = await pool.query(
      `UPDATE waf_whitelist SET description = COALESCE($1, description), expires_at = COALESCE($2, expires_at),
       enabled = COALESCE($3, enabled), updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [description, expires_at, enabled, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Whitelist entry not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/whitelist/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_whitelist WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Whitelist entry not found' });
    res.json({ success: true, message: 'Whitelist entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/whitelist/import', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });
    let count = 0;
    for (const e of entries) {
      try {
        await pool.query(
          `INSERT INTO waf_whitelist (id, tenant_id, ip_address, cidr_block, description, source, department_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [genId('wl'), req.tenantId, e.ip_address, e.cidr_block, e.description, e.source || 'import', req.deptId]
        );
        count++;
      } catch (_) {}
    }
    res.json({ success: true, message: `${count} entries imported to whitelist` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/blacklist', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { enabled, search } = req.query;
    const { limit, offset } = parsePagination(req.query);
    let query = 'SELECT * FROM waf_blacklist WHERE tenant_id = $1';
    const params = [req.tenantId];
    let idx = 2;
    if (enabled !== undefined) { params.push(enabled === 'true'); query += ` AND enabled = $${idx++}`; }
    if (search) { params.push(`%${search}%`); query += ` AND (reason ILIKE $${idx} OR ip_address::text ILIKE $${idx} OR cidr_block::text ILIKE $${idx})`; idx++; }
    query += ' ORDER BY created_at DESC';
    params.push(limit); query += ` LIMIT $${idx++}`;
    params.push(offset); query += ` OFFSET $${idx++}`;
    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_blacklist WHERE tenant_id = $1', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/blacklist', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { ip_address, cidr_block, reason, source, expires_at } = req.body;
    const id = genId('bl');
    const result = await pool.query(
      `INSERT INTO waf_blacklist (id, tenant_id, ip_address, cidr_block, reason, source, expires_at, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [id, req.tenantId, ip_address, cidr_block, reason, source || 'manual', expires_at, req.deptId]
    );
    await publishEvent('waf-events', { event: 'ip.blacklisted', tenant_id: req.tenantId, ip_address, reason });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/blacklist/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { reason, expires_at, enabled } = req.body;
    const result = await pool.query(
      `UPDATE waf_blacklist SET reason = COALESCE($1, reason), expires_at = COALESCE($2, expires_at),
       enabled = COALESCE($3, enabled), updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND tenant_id = $5 RETURNING *`,
      [reason, expires_at, enabled, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Blacklist entry not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/blacklist/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_blacklist WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Blacklist entry not found' });
    res.json({ success: true, message: 'Blacklist entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/blacklist/import', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { entries } = req.body;
    if (!entries || !Array.isArray(entries)) return res.status(400).json({ error: 'entries array required' });
    let count = 0;
    for (const e of entries) {
      try {
        await pool.query(
          `INSERT INTO waf_blacklist (id, tenant_id, ip_address, cidr_block, reason, source, department_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
          [genId('bl'), req.tenantId, e.ip_address, e.cidr_block, e.reason, e.source || 'import', req.deptId]
        );
        count++;
      } catch (_) {}
    }
    res.json({ success: true, message: `${count} entries imported to blacklist` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// ENHANCED RATE LIMITING
// ========================================================================
app.get('/rate-limits', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const result = await pool.query(
      'SELECT * FROM waf_rate_limits WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.tenantId, limit, offset]
    );
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_rate_limits WHERE tenant_id = $1', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/rate-limits', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, path_pattern, http_methods, dimension, requests_per_minute, burst, burst_duration_seconds, action, response_code } = req.body;
    const id = genId('rl');
    const result = await pool.query(
      `INSERT INTO waf_rate_limits (id, tenant_id, name, path_pattern, http_methods, dimension, requests_per_minute, burst, burst_duration_seconds, action, response_code, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [id, req.tenantId, name, path_pattern, http_methods || null, dimension || 'ip', requests_per_minute || 60, burst || 10, burst_duration_seconds || 5, action || 'block', response_code || 429, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/rate-limits/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const fields = ['name', 'path_pattern', 'http_methods', 'dimension', 'requests_per_minute', 'burst', 'burst_duration_seconds', 'action', 'response_code', 'enabled'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        vals.push(req.body[f]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(req.params.id, req.tenantId);
    const result = await pool.query(
      `UPDATE waf_rate_limits SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rate limit not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/rate-limits/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_rate_limits WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rate limit not found' });
    res.json({ success: true, message: 'Rate limit deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// REQUEST VALIDATION
// ========================================================================
app.get('/request-validation', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rv.*, wp.name as profile_name FROM waf_request_validation rv
       LEFT JOIN waf_profiles wp ON rv.profile_id = wp.id
       WHERE rv.tenant_id = $1 ORDER BY rv.name`,
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/request-validation', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, profile_id, allowed_methods, allowed_content_types, max_body_size_bytes, max_uri_length, max_query_length, max_headers_count, max_single_header_size, allowed_protocols, enforce_json_schema, json_schema, allowed_extensions, blocked_extensions, enforce_utf8 } = req.body;
    const id = genId('val');
    const result = await pool.query(
      `INSERT INTO waf_request_validation (id, tenant_id, name, profile_id, allowed_methods, allowed_content_types, max_body_size_bytes, max_uri_length, max_query_length, max_headers_count, max_single_header_size, allowed_protocols, enforce_json_schema, json_schema, allowed_extensions, blocked_extensions, enforce_utf8, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING *`,
      [id, req.tenantId, name, profile_id, allowed_methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], allowed_content_types, max_body_size_bytes || 10485760, max_uri_length || 4096, max_query_length || 2048, max_headers_count || 50, max_single_header_size || 8192, allowed_protocols || ['HTTP/1.1', 'HTTP/2', 'HTTP/3'], enforce_json_schema || false, json_schema, allowed_extensions, blocked_extensions || ['.exe', '.dll', '.bat', '.sh', '.jar'], enforce_utf8 !== false, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/request-validation/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const fields = ['name', 'profile_id', 'allowed_methods', 'allowed_content_types', 'max_body_size_bytes', 'max_uri_length', 'max_query_length', 'max_headers_count', 'max_single_header_size', 'allowed_protocols', 'enforce_json_schema', 'json_schema', 'allowed_extensions', 'blocked_extensions', 'enforce_utf8', 'enabled'];
    const sets = [];
    const vals = [];
    let idx = 1;
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        sets.push(`${f} = $${idx++}`);
        vals.push(req.body[f]);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    sets.push('updated_at = CURRENT_TIMESTAMP');
    vals.push(req.params.id, req.tenantId);
    const result = await pool.query(
      `UPDATE waf_request_validation SET ${sets.join(', ')} WHERE id = $${idx} AND tenant_id = $${idx + 1} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request validation not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/request-validation/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_request_validation WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Request validation not found' });
    res.json({ success: true, message: 'Request validation deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/request-validation/:id/validate', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { method, uri, headers, body, content_type } = req.body;
    const val = await pool.query('SELECT * FROM waf_request_validation WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (val.rows.length === 0) return res.status(404).json({ error: 'Request validation config not found' });
    const v = val.rows[0];
    const issues = [];
    if (v.allowed_methods && !v.allowed_methods.includes(method)) issues.push({ field: 'method', message: `Method ${method} not allowed`, allowed: v.allowed_methods });
    if (v.allowed_content_types && content_type && !v.allowed_content_types.some(ct => content_type.includes(ct))) issues.push({ field: 'content_type', message: `Content-Type ${content_type} not allowed`, allowed: v.allowed_content_types });
    if (v.max_uri_length && uri && uri.length > v.max_uri_length) issues.push({ field: 'uri', message: `URI exceeds max length of ${v.max_uri_length}` });
    if (v.max_body_size_bytes && body && Buffer.byteLength(body, 'utf8') > v.max_body_size_bytes) issues.push({ field: 'body', message: `Body exceeds max size of ${v.max_body_size_bytes} bytes` });
    if (v.max_headers_count && headers && Object.keys(headers).length > v.max_headers_count) issues.push({ field: 'headers', message: `Header count exceeds max of ${v.max_headers_count}` });
    if (v.blocked_extensions && uri) {
      const ext = '.' + uri.split('.').pop();
      if (v.blocked_extensions.includes(ext)) issues.push({ field: 'extension', message: `File extension ${ext} is blocked` });
    }
    res.json({ success: true, data: { valid: issues.length === 0, issues, config_name: v.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// RESPONSE SECURITY HEADERS
// ========================================================================
app.get('/response-headers', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rh.*, wp.name as profile_name FROM waf_response_headers rh
       LEFT JOIN waf_profiles wp ON rh.profile_id = wp.id
       WHERE rh.tenant_id = $1 ORDER BY rh.name`,
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/response-headers', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, profile_id, headers } = req.body;
    const id = genId('hdr');
    const defaultHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Content-Security-Policy': "default-src 'self'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Cache-Control': 'no-store, max-age=0',
    };
    const result = await pool.query(
      `INSERT INTO waf_response_headers (id, tenant_id, name, profile_id, headers, department_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [id, req.tenantId, name, profile_id, headers || defaultHeaders, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/response-headers/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, profile_id, headers, enabled } = req.body;
    const result = await pool.query(
      `UPDATE waf_response_headers SET name = COALESCE($1, name), profile_id = COALESCE($2, profile_id),
       headers = COALESCE($3, headers), enabled = COALESCE($4, enabled), updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND tenant_id = $6 RETURNING *`,
      [name, profile_id, headers, enabled, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Response header config not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/response-headers/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_response_headers WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Response header config not found' });
    res.json({ success: true, message: 'Response header config deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/response-headers/preview', async (req, res) => {
  const preview = {
    'X-Content-Type-Options': 'nosniff - Prevents MIME type sniffing',
    'X-Frame-Options': 'DENY - Prevents clickjacking',
    'X-XSS-Protection': '1; mode=block - Enables XSS filter',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains - Enforces HTTPS',
    'Content-Security-Policy': "default-src 'self' - Controls resource loading",
    'Referrer-Policy': 'strict-origin-when-cross-origin - Controls referrer info',
    'Permissions-Policy': 'Controls browser features (camera, mic, etc.)',
    'Cache-Control': 'no-store, max-age=0 - Prevents caching',
    'Access-Control-Allow-Origin': 'CORS policy',
    'Set-Cookie': 'SameSite=Lax; Secure; HttpOnly - Cookie security flags',
  };
  res.json({ success: true, data: preview });
});

// ========================================================================
// ATTACK EVENTS
// ========================================================================
app.get('/attack-events', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { severity, action_taken, source_ip, rule_id, from, to } = req.query;
    const { limit, offset } = parsePagination(req.query);
    let query = 'SELECT * FROM waf_attack_events WHERE tenant_id = $1';
    const params = [req.tenantId];
    let idx = 2;
    if (severity) { params.push(severity); query += ` AND severity = $${idx++}`; }
    if (action_taken) { params.push(action_taken); query += ` AND action_taken = $${idx++}`; }
    if (source_ip) { params.push(source_ip); query += ` AND source_ip::text ILIKE $${idx++}`; params[params.length - 1] = `%${source_ip}%`; }
    if (rule_id) { params.push(rule_id); query += ` AND rule_id = $${idx++}`; }
    if (from) { params.push(from); query += ` AND timestamp >= $${idx++}`; }
    if (to) { params.push(to); query += ` AND timestamp <= $${idx++}`; }
    query += ' ORDER BY timestamp DESC';
    params.push(limit); query += ` LIMIT $${idx++}`;
    params.push(offset); query += ` OFFSET $${idx++}`;
    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM waf_attack_events WHERE tenant_id = $1', [req.tenantId]);
    res.json({ success: true, data: result.rows, total: parseInt(countResult.rows[0].count), page: parseInt(req.query.page) || 1, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/attack-events/:id', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waf_attack_events WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Attack event not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/attack-events', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { rule_id, rule_name, profile_id, signature_id, source_ip, source_country, request_method, request_path, request_query, request_headers, request_body, response_code, response_size, user_agent, referer, matched_field, matched_value, action_taken, severity, score, tags, request_id, session_id, user_id, blocked } = req.body;
    const result = await pool.query(
      `INSERT INTO waf_attack_events (tenant_id, rule_id, rule_name, profile_id, signature_id, source_ip, source_country, request_method, request_path, request_query, request_headers, request_body, response_code, response_size, user_agent, referer, matched_field, matched_value, action_taken, severity, score, tags, request_id, session_id, user_id, blocked, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27) RETURNING *`,
      [req.tenantId, rule_id, rule_name, profile_id, signature_id, source_ip, source_country, request_method, request_path, request_query, request_headers ? JSON.stringify(request_headers) : null, request_body, response_code, response_size, user_agent, referer, matched_field, matched_value, action_taken || 'block', severity || 'medium', score, tags || null, request_id, session_id, user_id, blocked !== false, req.deptId]
    );
    if (blocked && channel) {
      publishEvent('waf-attacks', {
        event: 'attack.blocked',
        tenant_id: req.tenantId,
        event_id: result.rows[0].event_id || result.rows[0].id,
        source_ip,
        rule_name,
        severity,
        action_taken,
        timestamp: new Date(),
      });
    }
    attackEvents.emit('attack', {
      type: 'attack_event',
      data: result.rows[0],
      timestamp: new Date().toISOString(),
    });
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/attack-events', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { before } = req.query;
    if (!before) return res.status(400).json({ error: 'before parameter required (ISO date)' });
    const result = await pool.query(
      'DELETE FROM waf_attack_events WHERE tenant_id = $1 AND timestamp < $2',
      [req.tenantId, before]
    );
    res.json({ success: true, message: `${result.rowCount} events purged` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// ANALYTICS & DASHBOARD
// ========================================================================
app.get('/dashboard', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const [totalRules, activeRules, totalProfiles, blockedToday, totalEvents, topBlockedIPs, recentEvents, severityDist, attackTrend, topRules, geoDist, rateLimitHits] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM waf_rules WHERE tenant_id = $1', [req.tenantId]),
      pool.query('SELECT COUNT(*) as count FROM waf_rules WHERE tenant_id = $1 AND enabled = true', [req.tenantId]),
      pool.query('SELECT COUNT(*) as count FROM waf_profiles WHERE tenant_id = $1', [req.tenantId]),
      pool.query("SELECT COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 AND blocked = true AND timestamp::date = CURRENT_DATE", [req.tenantId]),
      pool.query('SELECT COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1', [req.tenantId]),
      pool.query(`SELECT source_ip, COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '7 days' GROUP BY source_ip ORDER BY count DESC LIMIT 10`, [req.tenantId]),
      pool.query('SELECT * FROM waf_attack_events WHERE tenant_id = $1 ORDER BY timestamp DESC LIMIT 20', [req.tenantId]),
      pool.query('SELECT severity, COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 GROUP BY severity', [req.tenantId]),
      pool.query(`SELECT DATE(timestamp) as date, COUNT(*) as count, SUM(CASE WHEN blocked THEN 1 ELSE 0 END) as blocked FROM waf_attack_events WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '30 days' GROUP BY DATE(timestamp) ORDER BY date`, [req.tenantId]),
      pool.query(`SELECT wr.name, COUNT(*) as count FROM waf_attack_events wae JOIN waf_rules wr ON wae.rule_id = wr.id WHERE wae.tenant_id = $1 AND wae.timestamp > NOW() - INTERVAL '30 days' GROUP BY wr.name ORDER BY count DESC LIMIT 10`, [req.tenantId]),
      pool.query('SELECT source_country, COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 AND source_country IS NOT NULL GROUP BY source_country ORDER BY count DESC LIMIT 20', [req.tenantId]),
      pool.query("SELECT COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 AND action_taken = 'rate_limited' AND timestamp::date = CURRENT_DATE", [req.tenantId]),
    ]);

    res.json({
      success: true,
      data: {
        summary: {
          total_rules: parseInt(totalRules.rows[0].count),
          active_rules: parseInt(activeRules.rows[0].count),
          total_profiles: parseInt(totalProfiles.rows[0].count),
          blocked_today: parseInt(blockedToday.rows[0].count),
          total_events: parseInt(totalEvents.rows[0].count),
          rate_limited_today: parseInt(rateLimitHits.rows[0].count),
        },
        top_blocked_ips: topBlockedIPs.rows,
        recent_events: recentEvents.rows,
        severity_distribution: severityDist.rows,
        attack_trend_30d: attackTrend.rows,
        top_rules_30d: topRules.rows,
        geo_distribution: geoDist.rows,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/dashboard/stream', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const [totalRules, activeRules, totalProfiles, blockedToday, totalEvents, severityDist] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM waf_rules WHERE tenant_id = $1', [req.tenantId]),
      pool.query('SELECT COUNT(*) as count FROM waf_rules WHERE tenant_id = $1 AND enabled = true', [req.tenantId]),
      pool.query('SELECT COUNT(*) as count FROM waf_profiles WHERE tenant_id = $1', [req.tenantId]),
      pool.query("SELECT COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 AND blocked = true AND timestamp::date = CURRENT_DATE", [req.tenantId]),
      pool.query('SELECT COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1', [req.tenantId]),
      pool.query('SELECT severity, COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 GROUP BY severity', [req.tenantId]),
    ]);
    sendEvent('connected', {
      summary: {
        total_rules: parseInt(totalRules.rows[0].count),
        active_rules: parseInt(activeRules.rows[0].count),
        total_profiles: parseInt(totalProfiles.rows[0].count),
        blocked_today: parseInt(blockedToday.rows[0].count),
        total_events: parseInt(totalEvents.rows[0].count),
      },
      severity_distribution: severityDist.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    sendEvent('error', { message: 'Failed to load initial stats' });
  }

  const onAttack = (data) => {
    sendEvent('attack', data);
  };

  attackEvents.on('attack', onAttack);

  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    attackEvents.off('attack', onAttack);
    clearInterval(keepalive);
  });
});

app.get('/analytics/attack-trends', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { days } = req.query;
    const interval = Math.min(90, Math.max(1, parseInt(days) || 30));
    const result = await pool.query(
      `SELECT DATE(timestamp) as date, severity, COUNT(*) as count,
       SUM(CASE WHEN blocked THEN 1 ELSE 0 END) as blocked
       FROM waf_attack_events
       WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '1 day' * $2
       GROUP BY DATE(timestamp), severity
       ORDER BY date, severity`,
      [req.tenantId, interval]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/analytics/top-attackers', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { days, limit } = req.query;
    const interval = Math.min(90, Math.max(1, parseInt(days) || 7));
    const top = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const result = await pool.query(
      `SELECT source_ip, COUNT(*) as total_attacks, COUNT(DISTINCT rule_id) as rules_triggered,
       MAX(severity) as max_severity, MIN(timestamp) as first_seen, MAX(timestamp) as last_seen,
       COUNT(CASE WHEN blocked THEN 1 END) as blocked_count
       FROM waf_attack_events
       WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '1 day' * $2
       GROUP BY source_ip
       ORDER BY total_attacks DESC LIMIT $3`,
      [req.tenantId, interval, top]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/analytics/rule-performance', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { days } = req.query;
    const interval = Math.min(90, Math.max(1, parseInt(days) || 30));
    const result = await pool.query(
      `SELECT wr.id, wr.name, wr.rule_type, wr.severity, wr.action, wr.enabled,
       COUNT(wae.id) as total_matches,
       SUM(CASE WHEN wae.blocked THEN 1 ELSE 0 END) as total_blocks,
       COUNT(DISTINCT wae.source_ip) as unique_attackers,
       MAX(wae.timestamp) as last_match
       FROM waf_rules wr
       LEFT JOIN waf_attack_events wae ON wr.id = wae.rule_id AND wae.tenant_id = wr.tenant_id AND wae.timestamp > NOW() - INTERVAL '1 day' * $2
       WHERE wr.tenant_id = $1
       GROUP BY wr.id, wr.name, wr.rule_type, wr.severity, wr.action, wr.enabled
       ORDER BY total_matches DESC`,
      [req.tenantId, interval]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// REPORTS
// ========================================================================
app.get('/reports', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM waf_reports WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/reports', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { name, type, config, schedule, recipients, format } = req.body;
    const id = genId('rpt');
    const result = await pool.query(
      `INSERT INTO waf_reports (id, tenant_id, name, type, config, schedule, recipients, format, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [id, req.tenantId, name, type || 'summary', config || {}, schedule || 'manual', recipients || [], format || 'pdf', req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/reports/:id/generate', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const report = await pool.query('SELECT * FROM waf_reports WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (report.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    const r = report.rows[0];
    let data;
    switch (r.type) {
      case 'summary':
        data = (await pool.query(`SELECT (SELECT COUNT(*) FROM waf_attack_events WHERE tenant_id = $1) as total_events, (SELECT COUNT(*) FROM waf_attack_events WHERE tenant_id = $1 AND blocked = true) as total_blocked, (SELECT COUNT(*) FROM waf_rules WHERE tenant_id = $1) as total_rules`, [req.tenantId])).rows[0];
        break;
      case 'top_attackers':
        data = (await pool.query('SELECT source_ip, COUNT(*) as count FROM waf_attack_events WHERE tenant_id = $1 GROUP BY source_ip ORDER BY count DESC LIMIT 20', [req.tenantId])).rows;
        break;
      default:
        data = { message: 'Report data generated' };
    }
    await pool.query('UPDATE waf_reports SET last_generated = NOW() WHERE id = $1', [req.params.id]);
    res.json({ success: true, data: { report: r, generated_data: data, generated_at: new Date() } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/reports/:id', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM waf_reports WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Report not found' });
    res.json({ success: true, message: 'Report deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// LEGACY LOGS (backward compatible)
// ========================================================================
app.get('/logs', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { limit, offset } = parsePagination(req.query);
    const result = await pool.query(
      `SELECT wl.*, wr.name as rule_name FROM waf_logs wl
       LEFT JOIN waf_rules wr ON wl.rule_id = wr.id
       WHERE wl.tenant_id = $1 ORDER BY wl.timestamp DESC LIMIT $2 OFFSET $3`,
      [req.tenantId, limit, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/logs', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  try {
    const { rule_id, source_ip, request_path, request_method, user_agent, headers, action_taken, blocked } = req.body;
    const result = await pool.query(
      `INSERT INTO waf_logs (tenant_id, rule_id, source_ip, request_path, request_method, user_agent, headers, action_taken, blocked, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [req.tenantId, rule_id, source_ip, request_path, request_method, user_agent, headers ? JSON.stringify(headers) : null, action_taken, blocked, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================================================
// ENGINE MANAGEMENT
// ========================================================================
app.post('/engine/cache/invalidate', requireTenant, DepartmentScope.requireAccess('w'), (req, res) => {
  wafEngine.invalidateCache();
  res.json({ success: true, message: 'Engine cache invalidated' });
});

app.get('/engine/status', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const redisStatus = await redisLimiter.getStats(req.tenantId);
  res.json({
    success: true,
    data: {
      redis: redisStatus,
      websocket: wsInspector.getStats(),
      geoip_loaded: geoip.loaded,
      geoip_source: geoip.countryDb ? 'maxmind' : 'fallback',
      cache_active: !!wafEngine.ruleCache,
      cache_age_ms: wafEngine.ruleCache ? Date.now() - wafEngine.cacheTime : null,
    },
  });
});

// ========================================================================
// RATE LIMITER MANAGEMENT
// ========================================================================
app.get('/rate-limiter/status', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const stats = await redisLimiter.getStats(req.tenantId);
  res.json({ success: true, data: stats });
});

// ========================================================================
// GEOIP LOOKUP
// ========================================================================
app.post('/geoip/lookup', requireTenant, DepartmentScope.requireAccess('r'), (req, res) => {
  const { ip } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  const result = geoip.lookup(ip);
  res.json({ success: true, data: result || { country: null, source: 'unknown' } });
});

app.post('/geoip/batch-lookup', requireTenant, DepartmentScope.requireAccess('r'), (req, res) => {
  const { ips } = req.body;
  if (!ips || !Array.isArray(ips)) return res.status(400).json({ error: 'ips array required' });
  const results = ips.map(ip => ({ ip, ...(geoip.lookup(ip) || { country: null, source: 'unknown' }) }));
  res.json({ success: true, data: results });
});

// ========================================================================
// BODY PARSER & VALIDATION
// ========================================================================
app.post('/body/parse', requireTenant, DepartmentScope.requireAccess('r'), (req, res) => {
  const { content_type, body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  const result = bodyParser.parse(content_type, body);
  res.json({ success: true, data: result });
});

app.post('/body/validate-schema', requireTenant, DepartmentScope.requireAccess('r'), (req, res) => {
  const { data, schema } = req.body;
  if (!data || !schema) return res.status(400).json({ error: 'data and schema required' });
  const result = bodyParser.validateAgainstSchema(data, schema);
  res.json({ success: true, data: result });
});

app.post('/body/sanitize', requireTenant, DepartmentScope.requireAccess('r'), (req, res) => {
  const { data } = req.body;
  if (data === undefined) return res.status(400).json({ error: 'data required' });
  const sanitized = bodyParser.deepSanitize(data);
  res.json({ success: true, data: sanitized });
});

// ========================================================================
// WEBSOCKET INSPECTION
// ========================================================================
app.post('/websocket/inspect-connect', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const { ip, path, protocol } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip required' });
  const result = await wsInspector.inspectConnect(ip, path, protocol, req.tenantId);
  res.json({ success: true, data: result });
});

app.post('/websocket/inspect-message', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const { connection_id, message } = req.body;
  if (!message) return res.status(400).json({ error: 'message required' });
  const result = await wsInspector.inspectMessage(connection_id, message, req.tenantId);
  res.json({ success: true, data: result });
});

app.get('/websocket/stats', requireTenant, DepartmentScope.requireAccess('r'), (req, res) => {
  res.json({ success: true, data: wsInspector.getStats() });
});

// ========================================================================
// GRPC INSPECTION
// ========================================================================
app.post('/grpc/inspect-unary', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const { method, metadata, payload } = req.body;
  const result = await grpcInspector.inspectUnary(method, metadata, payload, req.tenantId);
  res.json({ success: true, data: result });
});

app.post('/grpc/inspect-stream', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const { method, metadata, messages } = req.body;
  if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array required' });
  const result = await grpcInspector.inspectStream(method, metadata, messages, req.tenantId);
  res.json({ success: true, data: result });
});

// ========================================================================
// START SERVER
// ========================================================================
// ========================================================================
// REVERSE PROXY MANAGEMENT
// ========================================================================
app.post('/proxy/start', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  const result = await proxyEngine.start();
  res.json({ success: true, data: result });
});

app.post('/proxy/stop', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  const result = proxyEngine.stop();
  res.json({ success: true, data: result });
});

app.post('/proxy/refresh', requireTenant, DepartmentScope.requireAccess('w'), async (req, res) => {
  const result = await proxyEngine.refresh();
  res.json({ success: true, data: result });
});

app.get('/proxy/status', requireTenant, DepartmentScope.requireAccess('r'), (req, res) => {
  res.json({ success: true, data: proxyEngine.getStatus() });
});

app.post('/proxy/test-backend', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const { backend_url } = req.body;
  if (!backend_url) return res.status(400).json({ error: 'backend_url required' });
  const result = await proxyEngine.testBackend(backend_url);
  res.json({ success: true, data: result });
});

app.post('/proxy/check-all', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  const results = await proxyEngine.checkAllBackends();
  res.json({ success: true, data: results });
});

// ========================================================================
// START SERVER
// ========================================================================
app.listen(PORT, () => {
  console.log(`WAF Service v2.0 running on port ${PORT}`);
  console.log(`  Engine: ${wafEngine ? 'loaded' : 'error'}`);
  console.log(`  GeoIP: ${geoip.loaded ? 'loaded' : 'fallback'}`);
  console.log(`  Redis Rate Limiter: ${redisLimiter.connected ? 'connected' : 'disconnected'}`);

  // Auto-start proxy if profiles exist with backends
  if (process.env.WAF_PROXY_AUTO_START !== 'false') {
    setTimeout(async () => {
      try {
        const result = await proxyEngine.start();
        console.log(`  Proxy: ${result.status} on port ${proxyEngine.port}`);
      } catch (err) {
        console.log(`  Proxy: auto-start skipped (${err.message})`);
      }
    }, 1000);
  }
});

module.exports = app;
