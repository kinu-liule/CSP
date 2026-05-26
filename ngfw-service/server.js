const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { DepartmentScope } = require('../common/department-scope');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

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
  res.json({ status: 'healthy', service: 'ngfw', version: '1.0.0', timestamp: new Date().toISOString() });
});

const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};

// ==================== FIREWALL RULES ====================
app.get('/rules', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT fr.*, sz.name as source_zone_name, dz.name as dest_zone_name FROM firewall_rules fr LEFT JOIN zones sz ON fr.source_zone = sz.name LEFT JOIN zones dz ON fr.dest_zone = dz.name WHERE fr.tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/rules', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { name, description, source_ip, source_zone, dest_ip, dest_zone, dest_port, protocol, action, enabled } = req.body;
    const id = 'fw_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO firewall_rules (id, tenant_id, name, description, source_ip, source_zone, dest_ip, dest_zone, dest_port, protocol, action, enabled, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [id, req.tenantId, name, description, source_ip, source_zone, dest_ip, dest_zone, dest_port, protocol, action || 'allow', enabled !== false, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/rules/:id', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { name, description, source_ip, source_zone, dest_ip, dest_zone, dest_port, protocol, action, enabled } = req.body;
    const result = await pool.query(
      `UPDATE firewall_rules SET name = $1, description = $2, source_ip = $3, source_zone = $4, dest_ip = $5, dest_zone = $6, dest_port = $7, protocol = $8, action = $9, enabled = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND tenant_id = $12 RETURNING *`,
      [name, description, source_ip, source_zone, dest_ip, dest_zone, dest_port, protocol, action, enabled, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/rules/:id', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM firewall_rules WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ success: true, message: 'Rule deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FIREWALL LOGS ====================
app.get('/logs', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await pool.query(
      `SELECT fl.*, fr.name as rule_name FROM firewall_logs fl
       LEFT JOIN firewall_rules fr ON fl.rule_id = fr.id
       WHERE fl.tenant_id = $1 ORDER BY fl.timestamp DESC LIMIT $2`,
      [req.tenantId, limit]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/logs', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { rule_id, source_ip, dest_ip, dest_port, protocol, action, reason } = req.body;
    const result = await pool.query(
      `INSERT INTO firewall_logs (tenant_id, rule_id, source_ip, dest_ip, dest_port, protocol, action, reason, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.tenantId, rule_id, source_ip, dest_ip, dest_port, protocol, action, reason, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ZONES ====================
app.get('/zones', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM zones WHERE tenant_id = $1 ORDER BY security_level DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/zones', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { name, description, interface_name, subnet, security_level } = req.body;
    const id = 'zone_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO zones (id, tenant_id, name, description, interface_name, subnet, security_level, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, req.tenantId, name, description, interface_name, subnet, security_level || 50, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NAT RULES ====================
app.get('/nat', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM nat_rules WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/nat', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { name, nat_type, original_source, translated_source, original_dest, translated_dest, original_port, translated_port, enabled } = req.body;
    const id = 'nat_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO nat_rules (id, tenant_id, name, nat_type, original_source, translated_source, original_dest, translated_dest, original_port, translated_port, enabled, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [id, req.tenantId, name, nat_type, original_source, translated_source, original_dest, translated_dest, original_port, translated_port, enabled !== false, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== VPN CONNECTIONS ====================
app.get('/vpn', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vpn_connections WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/vpn', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const { name, vpn_type, remote_gateway, local_network, remote_network } = req.body;
    const id = 'vpn_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO vpn_connections (id, tenant_id, name, vpn_type, remote_gateway, local_network, remote_network, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, req.tenantId, name, vpn_type, remote_gateway, local_network, remote_network, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DASHBOARD ====================
app.get('/dashboard', requireTenant, DepartmentScope.requireAccess('r'), async (req, res) => {
  try {
    const totalRules = await pool.query('SELECT COUNT(*) as count FROM firewall_rules WHERE tenant_id = $1', [req.tenantId]);
    const activeRules = await pool.query("SELECT COUNT(*) as count FROM firewall_rules WHERE tenant_id = $1 AND enabled = true", [req.tenantId]);
    const totalZones = await pool.query('SELECT COUNT(*) as count FROM zones WHERE tenant_id = $1', [req.tenantId]);
    const blockedToday = await pool.query(
      "SELECT COUNT(*) as count FROM firewall_logs WHERE tenant_id = $1 AND action = 'deny' AND timestamp::date = CURRENT_DATE",
      [req.tenantId]
    );
    const topBlockedIPs = await pool.query(
      `SELECT source_ip, COUNT(*) as count FROM firewall_logs
       WHERE tenant_id = $1 AND action = 'deny' AND timestamp > NOW() - INTERVAL '7 days'
       GROUP BY source_ip ORDER BY count DESC LIMIT 5`,
      [req.tenantId]
    );
    const recentLogs = await pool.query(
      `SELECT fl.*, fr.name as rule_name FROM firewall_logs fl
       LEFT JOIN firewall_rules fr ON fl.rule_id = fr.id
       WHERE fl.tenant_id = $1 ORDER BY fl.timestamp DESC LIMIT 10`,
      [req.tenantId]
    );

    res.json({
      success: true,
      data: {
        total_rules: parseInt(totalRules.rows[0].count),
        active_rules: parseInt(activeRules.rows[0].count),
        total_zones: parseInt(totalZones.rows[0].count),
        blocked_today: parseInt(blockedToday.rows[0].count),
        top_blocked_ips: topBlockedIPs.rows,
        recent_logs: recentLogs.rows
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`NGFW Service running on port ${PORT}`));
