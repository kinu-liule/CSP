const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');
const amqp = require('amqplib');
const { DepartmentScope } = require('../common/department-scope');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3009;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === true ? { rejectUnauthorized: false } : false
});

// Redis
const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

// RabbitMQ
let channel;
async function setupRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('asset-events', { durable: true });
    console.log('Connected to RabbitMQ');
  } catch (err) {
    console.error('RabbitMQ connection error:', err);
  }
}
setupRabbitMQ();

// Tenant & Department middleware
function requireTenant(req, res, next) {
  const tenantId = req.headers['x-tenant-id'] || req.user?.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
}

// JWT Middleware (reads from x-user-* headers when proxied, falls back to JWT)
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    req.tenantId = req.tenantId || user.tenant_id;
    next();
  });
}

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', service: 'asset-management', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/assets - List assets (with horizontal department scoping)
app.get('/api/assets', authenticateToken, requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const cacheKey = `assets:${tenantId}:dept:${(req.user.departments || []).join(',')}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    
    const query = req.departmentScope.isBypassed()
      ? 'SELECT a.* FROM assets a WHERE a.tenant_id = $1 ORDER BY a.created_at DESC'
      : `SELECT a.* FROM assets a WHERE a.tenant_id = $1 AND ${req.deptFilter} ORDER BY a.created_at DESC`;
    
    const result = await pool.query(query, [tenantId]);
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assets - Register asset (auto-tagged with creator's department)
app.post('/api/assets', authenticateToken, requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const deptId = req.departmentScope.isBypassed() ? (req.body.department_id || null) : (req.user.departments?.[0] || null);
    const { name, asset_type, ip_address, mac_address, os, owner, tags, criticality, cloud_provider } = req.body;
    
    const result = await pool.query(
       `INSERT INTO assets (tenant_id, name, asset_type, ip_address, mac_address, os, owner, tags, criticality, cloud_provider, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [tenantId, name, asset_type, ip_address, mac_address, os, owner, tags || [], criticality || 'medium', cloud_provider, deptId]
    );
    
    if (channel) {
      channel.sendToQueue('asset-events', Buffer.from(JSON.stringify({
        event: 'asset.created',
        tenant_id: tenantId,
        asset_id: result.rows[0].id,
        department_id: deptId,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    await redisClient.del(`assets:${tenantId}`);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assets/:id - Get asset details (with department scoping)
app.get('/api/assets/:id', authenticateToken, requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const query = req.departmentScope.isBypassed()
      ? 'SELECT a.* FROM assets a WHERE a.id = $1 AND a.tenant_id = $2'
      : `SELECT a.* FROM assets a WHERE a.id = $1 AND a.tenant_id = $2 AND ${req.deptFilter}`;
    const result = await pool.query(query, [req.params.id, tenantId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/assets/:id - Update asset
app.put('/api/assets/:id', authenticateToken, requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { name, asset_type, ip_address, mac_address, os, owner, tags, criticality, status, cloud_provider } = req.body;
    
    const checkQuery = req.departmentScope.isBypassed()
      ? 'SELECT id FROM assets WHERE id = $1 AND tenant_id = $2'
      : `SELECT id FROM assets WHERE id = $1 AND tenant_id = $2 AND ${req.deptFilter}`;
    const check = await pool.query(checkQuery, [req.params.id, tenantId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Asset not found or access denied' });
    
    const result = await pool.query(
      `UPDATE assets SET name = COALESCE($3, name), asset_type = COALESCE($4, asset_type), 
       ip_address = COALESCE($5, ip_address), mac_address = COALESCE($6, mac_address),
       os = COALESCE($7, os), owner = COALESCE($8, owner), tags = COALESCE($9, tags),
       criticality = COALESCE($10, criticality), status = COALESCE($11, status),
       cloud_provider = COALESCE($12, cloud_provider), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, tenantId, name, asset_type, ip_address, mac_address, os, owner, tags, criticality, status, cloud_provider]
    );
    
    await redisClient.del(`assets:${tenantId}`);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/assets/:id - Decommission asset
app.delete('/api/assets/:id', authenticateToken, requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const checkQuery = req.departmentScope.isBypassed()
      ? 'SELECT id FROM assets WHERE id = $1 AND tenant_id = $2'
      : `SELECT id FROM assets WHERE id = $1 AND tenant_id = $2 AND ${req.deptFilter}`;
    const check = await pool.query(checkQuery, [req.params.id, tenantId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Asset not found or access denied' });
    
    const result = await pool.query(
      'UPDATE assets SET status = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *',
      [req.params.id, tenantId, 'decommissioned']
    );
    
    if (channel) {
      channel.sendToQueue('asset-events', Buffer.from(JSON.stringify({
        event: 'asset.decommissioned',
        tenant_id: tenantId,
        asset_id: req.params.id,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    await redisClient.del(`assets:${tenantId}`);
    res.json({ message: 'Asset decommissioned successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/assets/:id/vulns - Get vulnerabilities for asset
app.get('/api/assets/:id/vulns', authenticateToken, requireTenant, DepartmentScope.requireAccess('a'), async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const checkQuery = req.departmentScope.isBypassed()
      ? 'SELECT id FROM assets WHERE id = $1 AND tenant_id = $2'
      : `SELECT id FROM assets WHERE id = $1 AND tenant_id = $2 AND ${req.deptFilter}`;
    const assetCheck = await pool.query(checkQuery, [req.params.id, tenantId]);
    if (assetCheck.rows.length === 0) return res.status(404).json({ error: 'Asset not found' });
    
    const result = await pool.query(
      'SELECT * FROM asset_vulnerabilities av JOIN vulnerabilities v ON av.vuln_id = v.id WHERE av.asset_id = $1 AND av.tenant_id = $2',
      [req.params.id, tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Asset Management Service running on port ${PORT}`);
});
