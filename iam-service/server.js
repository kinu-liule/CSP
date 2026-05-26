const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3008;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const { Pool } = require('pg');
const mq = require('../common/message-queue');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cybersec:securepassword@localhost:5432/cybersec_platform'
});

app.use(express.json());

// Initialize Message Queue
mq.connect(process.env.RABBITMQ_URL).catch(err => console.log('RabbitMQ not available, running without MQ'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'iam', timestamp: new Date().toISOString() });
});

// Tenant isolation middleware
const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'];
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};

// Auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token required' });
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// Tenant Management
app.post('/tenants', [
  body('name').notEmpty(),
  body('domain').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { id, name, domain, plan } = req.body;
    await pool.query(
      'INSERT INTO tenants (id, name, domain, plan) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [id || 'tenant_' + require('crypto').randomBytes(8).toString('hex'), name, domain, plan || 'basic']
    );
    res.json({ success: true, data: { id, name, domain } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Registration
app.post('/users', requireTenant, [
  body('username').notEmpty(),
  body('email').isEmail(),
  body('password').isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { username, email, password, roles } = req.body;
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (tenant_id, username, email, password_hash, roles) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, roles',
      [req.tenantId, username, email, passwordHash, roles || ['user']]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/auth/login', requireTenant, [
  body('username').notEmpty(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { username, password } = req.body;
    const result = await pool.query(
      'SELECT * FROM users WHERE tenant_id = $1 AND username = $2 AND active = true',
      [req.tenantId, username]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

    const deptResult = await pool.query(
      'SELECT d.id FROM departments d JOIN user_departments ud ON d.id = ud.department_id WHERE ud.user_id = $1',
      [user.id]
    );
    const departmentIds = deptResult.rows.map(r => r.id);

    const token = jwt.sign({
      userId: user.id,
      tenantId: user.tenant_id,
      roles: user.roles,
      departments: departmentIds
    }, JWT_SECRET, { expiresIn: '24h' });

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    await mq.publish('iam.events', 'user.login', { userId: user.id, tenantId: req.tenantId });
    res.json({ success: true, data: { token, user: { id: user.id, username: user.username, email: user.email, roles: user.roles, departments: departmentIds } } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/users/me', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, roles, active, last_login FROM users WHERE id = $1 AND tenant_id = $2',
      [req.user.userId, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/users/me', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, roles, active, last_login, created_at FROM users WHERE id = $1 AND tenant_id = $2',
      [req.user.userId, req.user.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const deptResult = await pool.query(
      'SELECT d.id, d.name FROM departments d JOIN user_departments ud ON d.id = ud.department_id WHERE ud.user_id = $1',
      [req.user.userId]
    );

    res.json({ success: true, data: { ...result.rows[0], departments: deptResult.rows } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get('/users', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, roles, active, last_login, created_at FROM users WHERE tenant_id = $1',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Roles Management
app.post('/roles', requireTenant, authenticateToken, [
  body('name').notEmpty(),
  body('permissions').isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { name, permissions } = req.body;
    const result = await pool.query(
      'INSERT INTO roles (id, tenant_id, name, permissions) VALUES ($1, $2, $3, $4) RETURNING *',
      ['role_' + require('crypto').randomBytes(8).toString('hex'), req.tenantId, name, permissions]
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all roles
app.get('/roles', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, permissions, is_system, created_at FROM roles WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single role
app.get('/roles/:id', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, permissions, is_system, created_at FROM roles WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Role not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update role
app.put('/roles/:id', requireTenant, authenticateToken, [
  body('name').optional().notEmpty(),
  body('permissions').optional().isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { name, permissions } = req.body;
    const sets = []; const vals = []; let idx = 1;
    if (name) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (permissions) { sets.push(`permissions = $${idx++}`); vals.push(permissions); }
    vals.push(req.params.id); vals.push(req.tenantId);
    const result = await pool.query(
      `UPDATE roles SET ${sets.join(', ')} WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *`,
      vals
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Role not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete role
app.delete('/roles/:id', requireTenant, authenticateToken, async (req, res) => {
  try {
    const role = await pool.query('SELECT is_system FROM roles WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    if (role.rows.length === 0) return res.status(404).json({ error: 'Role not found' });
    if (role.rows[0].is_system) return res.status(400).json({ error: 'Cannot delete system role' });
    await pool.query('DELETE FROM roles WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    res.json({ success: true, message: 'Role deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign role to user
app.put('/users/:id/roles', requireTenant, authenticateToken, [
  body('roles').isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const result = await pool.query(
      'UPDATE users SET roles = $1 WHERE id = $2 AND tenant_id = $3 RETURNING id, username, email, roles',
      [req.body.roles, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID
app.get('/users/:id', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, roles, active, last_login, created_at FROM users WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
app.delete('/users/:id', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =========================================================
// DEPARTMENTS MANAGEMENT
// =========================================================

app.post('/departments', requireTenant, authenticateToken, [
  body('name').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'INSERT INTO departments (id, tenant_id, name, description) VALUES ($1, $2, $3, $4) RETURNING *',
      ['dept_' + require('crypto').randomBytes(6).toString('hex'), req.tenantId, name, description || '']
    );
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/departments', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT d.*, COUNT(ud.user_id) as user_count FROM departments d LEFT JOIN user_departments ud ON d.id = ud.department_id WHERE d.tenant_id = $1 GROUP BY d.id ORDER BY d.name',
      [req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/departments/:id', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT d.*, COUNT(ud.user_id) as user_count FROM departments d LEFT JOIN user_departments ud ON d.id = ud.department_id WHERE d.id = $1 AND d.tenant_id = $2 GROUP BY d.id',
      [req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/departments/:id', requireTenant, authenticateToken, async (req, res) => {
  try {
    const { name, description } = req.body;
    const result = await pool.query(
      'UPDATE departments SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 AND tenant_id = $4 RETURNING *',
      [name, description, req.params.id, req.tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/departments/:id', requireTenant, authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM user_departments WHERE department_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM departments WHERE id = $1 AND tenant_id = $2 RETURNING id', [req.params.id, req.tenantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Department not found' });
    res.json({ success: true, message: 'Department deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User-Department assignments
app.get('/users/:id/departments', requireTenant, authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT d.id, d.name, d.description FROM departments d JOIN user_departments ud ON d.id = ud.department_id WHERE ud.user_id = $1 AND d.tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/users/:id/departments', requireTenant, authenticateToken, [
  body('department_ids').isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  try {
    const { department_ids } = req.body;
    await pool.query('DELETE FROM user_departments WHERE user_id = $1', [req.params.id]);
    for (const deptId of department_ids) {
      await pool.query(
        'INSERT INTO user_departments (user_id, department_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, deptId]
      );
    }
    res.json({ success: true, data: { user_id: req.params.id, department_ids } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get audit logs
app.get('/audit/logs', requireTenant, authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const result = await pool.query(
      `SELECT ual.id, ual.user_id, u.username, ual.action, ual.details, ual.ip_address, ual.created_at
       FROM user_audit_logs ual LEFT JOIN users u ON ual.user_id = u.id
       WHERE ual.tenant_id = $1 ORDER BY ual.created_at DESC LIMIT $2 OFFSET $3`,
      [req.tenantId, limit, offset]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize tables
async function initTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(64) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(tenant_id, name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_departments (
        user_id VARCHAR(64) NOT NULL,
        department_id VARCHAR(64) NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        PRIMARY KEY (user_id, department_id)
      )
    `);
    console.log('Department tables initialized');
  } catch (e) { console.log('Department table init skipped:', e.message); }
}

initTables();

// Initialize default roles
async function initDefaultRoles() {
  try {
    const tenants = await pool.query('SELECT DISTINCT tenant_id FROM users');
    for (const row of tenants.rows) {
      const existing = await pool.query('SELECT 1 FROM roles WHERE tenant_id = $1 AND is_system = true', [row.tenant_id]);
      if (existing.rows.length === 0) {
        const defaultRoles = [
          { name: 'Admin', permissions: ['*'] },
          { name: 'Manager', permissions: ['users:read', 'iam:write', 'waf:write', 'ngfw:write', 'grc:write', 'audit:read'] },
          { name: 'Analyst', permissions: ['users:read', 'iam:access', 'waf:access', 'ngfw:access', 'siem:access', 'threat-intel:access'] },
          { name: 'User', permissions: ['iam:access'] },
        ];
        for (const role of defaultRoles) {
          await pool.query(
            `INSERT INTO roles (id, tenant_id, name, permissions, is_system) VALUES ($1, $2, $3, $4, true) ON CONFLICT DO NOTHING`,
            ['role_' + require('crypto').randomBytes(4).toString('hex'), row.tenant_id, role.name, role.permissions]
          );
        }
      }
    }
  } catch (e) { console.log('Default roles init skipped:', e.message); }
}

initDefaultRoles();

app.listen(PORT, () => console.log(`IAM service running on port ${PORT}`));
