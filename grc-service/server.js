const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { DepartmentScope } = require('../common/department-scope');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3007;

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword'
});

app.use(express.json());
app.use(DepartmentScope.middleware());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-tenant-id, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'grc', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Middleware to extract tenant
const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};

// ==================== POLICIES ====================
app.get('/policies', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM policies WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/policies/:id', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM policies WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/policies', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { name, description, policy_type, framework, status, version } = req.body;
    const id = 'pol_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO policies (id, tenant_id, name, description, policy_type, framework, status, version, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, req.tenantId, name, description, policy_type, framework, status || 'active', version || '1.0', req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/policies/:id', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { name, description, policy_type, framework, status, version } = req.body;
    const result = await pool.query(
      `UPDATE policies SET name = $1, description = $2, policy_type = $3, framework = $4, status = $5, version = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [name, description, policy_type, framework, status, version, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/policies/:id', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM policies WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Policy not found' });
    res.json({ success: true, message: 'Policy deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONTROLS ====================
app.get('/controls', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT c.*, p.name as policy_name FROM controls c LEFT JOIN policies p ON c.policy_id = p.id WHERE c.tenant_id = $1 ORDER BY c.created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/controls', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { policy_id, name, description, control_type, framework, implementation_status } = req.body;
    const id = 'ctrl_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO controls (id, tenant_id, policy_id, name, description, control_type, framework, implementation_status, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, req.tenantId, policy_id, name, description, control_type, framework, implementation_status || 'not_started', req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/controls/:id', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { policy_id, name, description, control_type, framework, implementation_status } = req.body;
    const result = await pool.query(
      `UPDATE controls SET policy_id = $1, name = $2, description = $3, control_type = $4, framework = $5, implementation_status = $6, updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [policy_id, name, description, control_type, framework, implementation_status, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Control not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/controls/:id', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM controls WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Control not found' });
    res.json({ success: true, message: 'Control deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RISKS ====================
app.get('/risks', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM risks WHERE tenant_id = $1 ORDER BY risk_score DESC, created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/risks', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { title, description, category, likelihood, impact, treatment, owner, mitigation_plan } = req.body;
    const id = 'risk_' + crypto.randomBytes(8).toString('hex');
    const risk_score = (likelihood || 1) * (impact || 1);
    const result = await pool.query(
      `INSERT INTO risks (id, tenant_id, title, description, category, likelihood, impact, risk_score, treatment, owner, mitigation_plan, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [id, req.tenantId, title, description, category, likelihood, impact, risk_score, treatment, owner, mitigation_plan, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/risks/:id', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { title, description, category, likelihood, impact, treatment, status, owner, mitigation_plan } = req.body;
    const risk_score = (likelihood || 1) * (impact || 1);
    const result = await pool.query(
      `UPDATE risks SET title = $1, description = $2, category = $3, likelihood = $4, impact = $5, risk_score = $6, treatment = $7, status = $8, owner = $9, mitigation_plan = $10, updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND tenant_id = $12 RETURNING *`,
      [title, description, category, likelihood, impact, risk_score, treatment, status, owner, mitigation_plan, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Risk not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/risks/:id', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM risks WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Risk not found' });
    res.json({ success: true, message: 'Risk deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== COMPLIANCE FRAMEWORKS ====================
app.get('/frameworks', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM compliance_frameworks WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/frameworks', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { name, version, description, requirements_count } = req.body;
    const id = 'frm_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO compliance_frameworks (id, tenant_id, name, version, description, requirements_count, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, req.tenantId, name, version, description, requirements_count, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== COMPLIANCE SCORES ====================
app.get('/compliance-scores', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cs.*, cf.name as framework_name FROM compliance_scores cs
       JOIN compliance_frameworks cf ON cs.framework_id = cf.id
       WHERE cs.tenant_id = $1 ORDER BY cs.assessed_at DESC`,
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/compliance-scores', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { framework_id, score } = req.body;
    const result = await pool.query(
      `INSERT INTO compliance_scores (tenant_id, framework_id, score, department_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.tenantId, framework_id, score, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== AUDITS ====================
app.get('/audits', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM audits WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/audits', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const { audit_type, scope, start_date, end_date, auditor } = req.body;
    const id = 'aud_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO audits (id, tenant_id, audit_type, scope, start_date, end_date, auditor, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, req.tenantId, audit_type, scope, start_date, end_date, auditor, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DASHBOARD SUMMARY ====================
app.get('/dashboard', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const policies = await pool.query('SELECT COUNT(*) as count FROM policies WHERE tenant_id = $1', [req.tenantId]);
    const controls = await pool.query('SELECT COUNT(*) as count FROM controls WHERE tenant_id = $1', [req.tenantId]);
    const controlsImplemented = await pool.query("SELECT COUNT(*) as count FROM controls WHERE tenant_id = $1 AND implementation_status = 'implemented'", [req.tenantId]);
    const risks = await pool.query('SELECT COUNT(*) as count, AVG(risk_score) as avg_risk FROM risks WHERE tenant_id = $1', [req.tenantId]);
    const openRisks = await pool.query("SELECT COUNT(*) as count FROM risks WHERE tenant_id = $1 AND status = 'open'", [req.tenantId]);
    const criticalRisks = await pool.query("SELECT COUNT(*) as count FROM risks WHERE tenant_id = $1 AND risk_score >= 15", [req.tenantId]);
    const audits = await pool.query('SELECT COUNT(*) as count FROM audits WHERE tenant_id = $1', [req.tenantId]);
    const frameworks = await pool.query('SELECT COUNT(*) as count FROM compliance_frameworks WHERE tenant_id = $1', [req.tenantId]);

    res.json({
      success: true,
      data: {
        policies: parseInt(policies.rows[0].count),
        controls: parseInt(controls.rows[0].count),
        controls_implemented: parseInt(controlsImplemented.rows[0].count),
        risks: parseInt(risks.rows[0].count),
        avg_risk: parseFloat(risks.rows[0].avg_risk) || 0,
        open_risks: parseInt(openRisks.rows[0].count),
        critical_risks: parseInt(criticalRisks.rows[0].count),
        audits: parseInt(audits.rows[0].count),
        frameworks: parseInt(frameworks.rows[0].count)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RISK MATRIX ====================
app.get('/risk-matrix', requireTenant, DepartmentScope.requireAccess('p'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT likelihood, impact, COUNT(*) as count FROM risks
       WHERE tenant_id = $1 GROUP BY likelihood, impact ORDER BY likelihood, impact`,
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`GRC Platform running on port ${PORT}`));
