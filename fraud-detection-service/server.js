const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { DepartmentScope } = require('./department-scope');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

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
  res.json({ status: 'healthy', service: 'fraud-detection', version: '1.0.0', timestamp: new Date().toISOString() });
});

const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.query.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};

// ==================== TRANSACTIONS ====================
app.get('/transactions', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const { status, is_fraud } = req.query;
    let query = 'SELECT t.*, up.risk_level FROM transactions t LEFT JOIN user_profiles up ON t.user_id = up.user_id AND t.tenant_id = up.tenant_id WHERE t.tenant_id = $1';
    const params = [req.tenantId];
    if (status) { params.push(status); query += ` AND t.status = $${params.length}`; }
    if (is_fraud !== undefined) { params.push(is_fraud === 'true'); query += ` AND t.is_fraud = $${params.length}`; }
    query += ' ORDER BY t.created_at DESC LIMIT 100';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/transactions', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const { transaction_id, user_id, amount, currency, transaction_type, payment_method, ip_address, device_id, location, merchant_id } = req.body;
    const id = 'txn_' + crypto.randomBytes(8).toString('hex');
    const risk_score = amount > 10000 ? 80 : amount > 5000 ? 50 : 20;
    const result = await pool.query(
      `INSERT INTO transactions (id, tenant_id, transaction_id, user_id, amount, currency, transaction_type, payment_method, risk_score, ip_address, device_id, location, merchant_id, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [id, req.tenantId, transaction_id || id, user_id, amount, currency || 'USD', transaction_type, payment_method, risk_score, ip_address, device_id, location, merchant_id, req.deptId]
    );

    // Create alert if high risk
    if (risk_score >= 50) {
      await pool.query(
        `INSERT INTO fraud_alerts (id, tenant_id, transaction_id, alert_type, severity, description, department_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        ['frd_' + crypto.randomBytes(8).toString('hex'), req.tenantId, id, 'high_risk', 'high', `High risk transaction: $${amount}`, req.deptId]
      );
    }

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FRAUD RULES ====================
app.get('/rules', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM fraud_rules WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/rules', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const { name, description, rule_type, condition_expression, action, enabled } = req.body;
    const id = 'frd_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO fraud_rules (id, tenant_id, name, description, rule_type, condition_expression, action, enabled, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, req.tenantId, name, description, rule_type, condition_expression, action, enabled !== false, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FRAUD ALERTS ====================
app.get('/alerts', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const { status } = req.query;
    let query = 'SELECT * FROM fraud_alerts WHERE tenant_id = $1';
    const params = [req.tenantId];
    if (status) { params.push(status); query += ` AND status = $${params.length}`; }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/alerts/:id', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const { status, assigned_to } = req.body;
    const updateFields = [];
    const params = [];
    if (status !== undefined) { params.push(status); updateFields.push(`status = $${params.length}`); }
    if (assigned_to !== undefined) { params.push(assigned_to); updateFields.push(`assigned_to = $${params.length}`); }
    if (status === 'resolved') { updateFields.push('resolved_at = CURRENT_TIMESTAMP'); }
    if (updateFields.length === 0) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id, req.tenantId);
    const query = `UPDATE fraud_alerts SET ${updateFields.join(', ')} WHERE id = $${params.length-1} AND tenant_id = $${params.length} RETURNING *`;
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== USER PROFILES ====================
app.get('/profiles', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_profiles WHERE tenant_id = $1 ORDER BY transaction_count DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/profiles', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const { user_id, risk_level, typical_locations, devices } = req.body;
    const id = 'up_' + crypto.randomBytes(8).toString('hex');
    const result = await pool.query(
      `INSERT INTO user_profiles (id, tenant_id, user_id, risk_level, typical_locations, devices, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, req.tenantId, user_id, risk_level || 'low', typical_locations ? JSON.stringify(typical_locations) : null, devices ? JSON.stringify(devices) : null, req.deptId]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ML MODELS ====================
app.get('/models', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM ml_models WHERE tenant_id = $1 ORDER BY created_at DESC',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DASHBOARD ====================
app.get('/dashboard', requireTenant, DepartmentScope.requireAccess('t'), async (req, res) => {
  try {
    const totalTransactions = await pool.query('SELECT COUNT(*) as count FROM transactions WHERE tenant_id = $1', [req.tenantId]);
    const totalAmount = await pool.query('SELECT SUM(amount) as sum FROM transactions WHERE tenant_id = $1', [req.tenantId]);
    const fraudDetected = await pool.query("SELECT COUNT(*) as count FROM transactions WHERE tenant_id = $1 AND is_fraud = true", [req.tenantId]);
    const pendingAlerts = await pool.query("SELECT COUNT(*) as count FROM fraud_alerts WHERE tenant_id = $1 AND status = 'new'", [req.tenantId]);
    const riskDist = await pool.query(
      'SELECT risk_level, COUNT(*) as count FROM user_profiles WHERE tenant_id = $1 GROUP BY risk_level',
      [req.tenantId]
    );
    const recentAlerts = await pool.query(
      'SELECT * FROM fraud_alerts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 10',
      [req.tenantId]
    );

    res.json({
      success: true,
      data: {
        total_transactions: parseInt(totalTransactions.rows[0].count),
        total_amount: parseFloat(totalAmount.rows[0].sum) || 0,
        fraud_detected: parseInt(fraudDetected.rows[0].count),
        pending_alerts: parseInt(pendingAlerts.rows[0].count),
        risk_distribution: riskDist.rows,
        recent_alerts: recentAlerts.rows
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Fraud Detection running on port ${PORT}`));
