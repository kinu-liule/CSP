const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');
const amqp = require('amqplib');
const { DepartmentScope } = require('./department-scope');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3012;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' || process.env.DB_SSL === true ? { rejectUnauthorized: false } : false
});

const redisClient = redis.createClient({ url: process.env.REDIS_URL });
redisClient.connect().catch(console.error);

let channel;
async function setupRabbitMQ() {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue('data-security-events', { durable: true });
    console.log('Data Security connected to RabbitMQ');
  } catch (err) {
    console.error('RabbitMQ error:', err);
  }
}
setupRabbitMQ();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);
  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Tenant middleware
const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.user?.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};


// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', service: 'data-security', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/data-security/assets - List data assets
app.get('/api/data-security/assets', authenticateToken, requireTenant, DepartmentScope.requireAccess('da'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const cacheKey = `data-assets:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    
    const result = await pool.query(
      'SELECT * FROM data_assets WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data-security/assets - Register data asset
app.post('/api/data-security/assets', authenticateToken, requireTenant, DepartmentScope.requireAccess('da'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, asset_type, location, classification, data_types, encryption_status, owner } = req.body;
    
    const result = await pool.query(
      `INSERT INTO data_assets (tenant_id, name, asset_type, location, classification, data_types, encryption_status, owner, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
       [tenantId, name, asset_type, location, classification, data_types || [], encryption_status || 'unknown', owner, req.deptId]
    );
    
    await redisClient.del(`data-assets:${tenantId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data-security/scan - Trigger data discovery scan
app.post('/api/data-security/scan', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { asset_id } = req.body;
    
    // Simulate async scan
    setTimeout(async () => {
      if (channel) {
        channel.sendToQueue('data-security-events', Buffer.from(JSON.stringify({
          event: 'scan.completed',
          tenant_id: tenantId,
          asset_id,
          classification: 'confidential',
          data_types: ['PII', 'PHI'],
          timestamp: new Date()
        })), { persistent: true });
      }
    }, 2000);
    
    res.status(202).json({ message: 'Scan initiated', status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-security/policies - List DLP policies
const listPolicies = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM dlp_policies WHERE tenant_id = $1 AND enabled = true',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/data-security/policies', authenticateToken, listPolicies);
app.get('/policies', authenticateToken, listPolicies);

// POST /api/data-security/policies - Create DLP policy
app.post('/api/data-security/policies', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, rules, action } = req.body;
    
    const result = await pool.query(
      `INSERT INTO dlp_policies (tenant_id, name, rules, action, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, name, rules, action || 'alert', req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-security/violations - List policy violations
app.get('/api/data-security/violations', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      `SELECT dv.*, da.name as asset_name FROM data_violations dv
       LEFT JOIN data_assets da ON dv.asset_id = da.id
       WHERE dv.tenant_id = $1 AND dv.status = 'open'
       ORDER BY dv.created_at DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-security/metrics - Get metrics
app.get('/api/data-security/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    const assetsResult = await pool.query(
      'SELECT classification, COUNT(*) as count FROM data_assets WHERE tenant_id = $1 GROUP BY classification',
      [tenantId]
    );
    
    const violationsResult = await pool.query(
      `SELECT severity, COUNT(*) as count FROM data_violations 
       WHERE tenant_id = $1 AND status = 'open' GROUP BY severity`,
      [tenantId]
    );
    
    res.json({
      assets_by_classification: assetsResult.rows,
      open_violations_by_severity: violationsResult.rows,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Data Security Service running on port ${PORT}`);
});
