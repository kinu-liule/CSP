const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { DepartmentScope } = require('./department-scope');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3004;

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
  res.json({ status: 'healthy', service: 'vuln-scanner', version: '1.0.0', timestamp: new Date().toISOString() });
});

const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};

// ==================== ASSETS ====================
app.get('/assets', requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM assets WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/assets/:id', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM assets WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/assets', requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const { name, asset_type, ip_address, hostname, os, owner, tags } = req.body;
    const id = 'ast_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO assets (id, tenant_id, name, asset_type, ip_address, hostname, os, owner, tags, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, req.tenantId, name, asset_type, ip_address, hostname, os, owner, tags ? JSON.stringify(tags) : null, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/assets/:id', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const { name, asset_type, ip_address, hostname, os, owner, tags } = req.body;
    const result = await pool.query(
      `UPDATE assets SET name = $1, asset_type = $2, ip_address = $3, hostname = $4, os = $5, owner = $6, tags = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 AND tenant_id = $9 RETURNING *`,
      [name, asset_type, ip_address, hostname, os, owner, tags ? JSON.stringify(tags) : null, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/assets/:id', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM assets WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json({ success: true, message: 'Asset deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== VULNERABILITIES ====================
app.get('/vulnerabilities', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const { severity, status } = req.query;
    let query = 'SELECT v.*, a.name as asset_name FROM vulnerabilities v LEFT JOIN assets a ON v.affected_asset = a.name WHERE v.tenant_id = $1';
    const params = [req.tenantId];
    if (severity) { params.push(severity); query += ` AND v.severity = $${params.length}`; }
    if (status) { params.push(status); query += ` AND v.status = $${params.length}`; }
    query += ' ORDER BY v.cvss_score DESC, v.discovered_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/vulnerabilities/:id', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vulnerabilities WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vulnerability not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/vulnerabilities', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const { cve_id, title, description, severity, cvss_score, affected_asset, asset_type, port, protocol, solution, references, status } = req.body;
    const id = 'vul_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO vulnerabilities (id, tenant_id, cve_id, title, description, severity, cvss_score, affected_asset, asset_type, port, protocol, solution, references, status, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [id, req.tenantId, cve_id, title, description, severity, cvss_score, affected_asset, asset_type, port, protocol, solution, references, status || 'open', req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/vulnerabilities/:id', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const { cve_id, title, description, severity, cvss_score, affected_asset, status, solution } = req.body;
    const result = await pool.query(
      `UPDATE vulnerabilities SET cve_id = $1, title = $2, description = $3, severity = $4, cvss_score = $5, affected_asset = $6, status = $7, solution = $8, updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 AND tenant_id = $10 RETURNING *`,
      [cve_id, title, description, severity, cvss_score, affected_asset, status, solution, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Vulnerability not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SCANS ====================
app.get('/scans', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM scans WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/scans', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const { scan_type, target, scan_config } = req.body;
    const id = 'scn_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO scans (id, tenant_id, scan_type, target, status, started_at, scan_config, department_id)
       VALUES ($1, $2, $3, $4, 'running', CURRENT_TIMESTAMP, $5, $6)
       RETURNING *`,
      [id, req.tenantId, scan_type, target, scan_config ? JSON.stringify(scan_config) : null, req.deptId]
    );

    // Simulate scan completion (in production, this would be async)
    setTimeout(async () => {
      try {
        await pool.query(
          `UPDATE scans SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
           vulnerabilities_found = FLOOR(RANDOM() * 10 + 1),
           critical_count = FLOOR(RANDOM() * 3),
           high_count = FLOOR(RANDOM() * 5),
           medium_count = FLOOR(RANDOM() * 8),
           low_count = FLOOR(RANDOM() * 10)
           WHERE id = $1`,
          [id]
        );
      } catch (e) { console.error('Scan update error:', e); }
    }, 5000);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DASHBOARD ====================
app.get('/dashboard', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const totalAssets = await pool.query('SELECT COUNT(*) as count FROM assets WHERE tenant_id = $1', [req.tenantId]);
    const totalVulns = await pool.query('SELECT COUNT(*) as count FROM vulnerabilities WHERE tenant_id = $1', [req.tenantId]);
    const criticalVulns = await pool.query("SELECT COUNT(*) as count FROM vulnerabilities WHERE tenant_id = $1 AND severity = 'critical'", [req.tenantId]);
    const highVulns = await pool.query("SELECT COUNT(*) as count FROM vulnerabilities WHERE tenant_id = $1 AND severity = 'high'", [req.tenantId]);
    const mediumVulns = await pool.query("SELECT COUNT(*) as count FROM vulnerabilities WHERE tenant_id = $1 AND severity = 'medium'", [req.tenantId]);
    const lowVulns = await pool.query("SELECT COUNT(*) as count FROM vulnerabilities WHERE tenant_id = $1 AND severity = 'low'", [req.tenantId]);
    const openVulns = await pool.query("SELECT COUNT(*) as count FROM vulnerabilities WHERE tenant_id = $1 AND status = 'open'", [req.tenantId]);
    const recentScans = await pool.query(
      'SELECT * FROM scans WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5',
      [req.tenantId]
    );

    res.json({
      success: true,
      data: {
        total_assets: parseInt(totalAssets.rows[0].count),
        total_vulnerabilities: parseInt(totalVulns.rows[0].count),
        critical: parseInt(criticalVulns.rows[0].count),
        high: parseInt(highVulns.rows[0].count),
        medium: parseInt(mediumVulns.rows[0].count),
        low: parseInt(lowVulns.rows[0].count),
        open: parseInt(openVulns.rows[0].count),
        recent_scans: recentScans.rows
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SEVERITY DISTRIBUTION ====================
app.get('/severity-distribution', requireTenant, DepartmentScope.requireAccess('v'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT severity, COUNT(*) as count FROM vulnerabilities WHERE tenant_id = $1 GROUP BY severity ORDER BY severity',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Vulnerability Scanner running on port ${PORT}`));
