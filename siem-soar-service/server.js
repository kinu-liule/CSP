const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { DepartmentScope } = require('../common/department-scope');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword'
});

app.use(express.json());
app.use(DepartmentScope.middleware());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-tenant-id, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'siem', version: '1.0.0', timestamp: new Date().toISOString() });
});

const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};

// ==================== LOG SOURCES ====================
app.get('/sources', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM log_sources WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/sources', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { name, source_type, ip_address, port, protocol, format, enabled } = req.body;
    const id = 'src_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO log_sources (id, tenant_id, name, source_type, ip_address, port, protocol, format, enabled, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, req.tenantId, name, source_type, ip_address, port, protocol || 'UDP', format, enabled !== false, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== EVENTS ====================
app.get('/events', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { severity, limit } = req.query;
    let query = 'SELECT e.*, ls.name as source_name FROM events e LEFT JOIN log_sources ls ON e.source_id = ls.id WHERE e.tenant_id = $1';
    const params = [req.tenantId];
    if (severity) { params.push(severity); query += ` AND e.severity = $${params.length}`; }
    query += ' ORDER BY e.event_time DESC';
    const limitVal = parseInt(limit) || 100;
    params.push(limitVal);
    query += ` LIMIT $${params.length}`;
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/events', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { source_id, event_time, severity, event_type, source_ip, dest_ip, dest_port, user_id, message, raw_log, tags } = req.body;
    const id = 'evt_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO events (id, tenant_id, source_id, event_time, severity, event_type, source_ip, dest_ip, dest_port, user_id, message, raw_log, tags, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [id, req.tenantId, source_id, event_time || new Date(), severity, event_type, source_ip, dest_ip, dest_port, user_id, message, raw_log, tags ? JSON.stringify(tags) : null, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ALERTS ====================
app.get('/alerts', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { status, severity } = req.query;
    let query = 'SELECT a.*, e.event_type, e.source_ip FROM alerts a LEFT JOIN events e ON a.event_id = e.id WHERE a.tenant_id = $1';
    const params = [req.tenantId];
    if (status) { params.push(status); query += ` AND a.status = $${params.length}`; }
    if (severity) { params.push(severity); query += ` AND a.severity = $${params.length}`; }
    query += ' ORDER BY a.triggered_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/alerts', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { event_id, alert_name, severity, description, rule_id, status } = req.body;
    const id = 'alt_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO alerts (id, tenant_id, event_id, alert_name, severity, description, rule_id, status, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, req.tenantId, event_id, alert_name, severity, description, rule_id, status || 'new', req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/alerts/:id', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { status, assigned_to } = req.body;
    const result = await pool.query(
      `UPDATE alerts SET status = $1, assigned_to = $2 WHERE id = $3 AND tenant_id = $4 RETURNING *`,
      [status, assigned_to, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ALERT RULES ====================
app.get('/rules', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM alert_rules WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/rules', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { name, description, query, condition_expression, severity, enabled } = req.body;
    const id = 'rule_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO alert_rules (id, tenant_id, name, description, query, condition_expression, severity, enabled, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, req.tenantId, name, description, query, condition_expression, severity, enabled !== false, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== THREAT INTEL ====================
app.get('/threat-intel', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM threat_intel WHERE tenant_id = $1 AND (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/threat-intel', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const { indicator_type, indicator_value, threat_type, confidence, source, expires_at } = req.body;
    const id = 'ti_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO threat_intel (id, tenant_id, indicator_type, indicator_value, threat_type, confidence, source, expires_at, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, req.tenantId, indicator_type, indicator_value, threat_type, confidence, source, expires_at, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DASHBOARD ====================
app.get('/dashboard', requireTenant, DepartmentScope.requireAccess('e'), async (req, res) => {
  try {
    const totalEvents = await pool.query('SELECT COUNT(*) as count FROM events WHERE tenant_id = $1', [req.tenantId]);
    const totalAlerts = await pool.query('SELECT COUNT(*) as count FROM alerts WHERE tenant_id = $1', [req.tenantId]);
    const newAlerts = await pool.query("SELECT COUNT(*) as count FROM alerts WHERE tenant_id = $1 AND status = 'new'", [req.tenantId]);
    const criticalEvents = await pool.query("SELECT COUNT(*) as count FROM events WHERE tenant_id = $1 AND severity = 'critical'", [req.tenantId]);
    const sevDist = await pool.query(
      'SELECT severity, COUNT(*) as count FROM events WHERE tenant_id = $1 GROUP BY severity ORDER BY severity',
      [req.tenantId]
    );
    const recentAlerts = await pool.query(
      `SELECT a.*, e.event_type, e.source_ip FROM alerts a
       LEFT JOIN events e ON a.event_id = e.id
       WHERE a.tenant_id = $1 ORDER BY a.triggered_at DESC LIMIT 10`,
      [req.tenantId]
    );

    res.json({
      success: true,
      data: {
        total_events: parseInt(totalEvents.rows[0].count),
        total_alerts: parseInt(totalAlerts.rows[0].count),
        new_alerts: parseInt(newAlerts.rows[0].count),
        critical_events: parseInt(criticalEvents.rows[0].count),
        severity_distribution: sevDist.rows,
        recent_alerts: recentAlerts.rows
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`SIEM Service running on port ${PORT}`));
