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
const PORT = process.env.PORT || 3013;

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
    await channel.assertQueue('deception-events', { durable: true });
    console.log('Deception Service connected to RabbitMQ');
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
    res.json({ status: 'healthy', service: 'deception', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/deception/honeypots - List honeypots
app.get('/api/deception/honeypots', authenticateToken, requireTenant, DepartmentScope.requireAccess('dh'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const cacheKey = `honeypots:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    
    const result = await pool.query(
      'SELECT * FROM honeypots WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deception/honeypots - Deploy honeypot
app.post('/api/deception/honeypots', authenticateToken, requireTenant, DepartmentScope.requireAccess('dh'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, type, ip_address, port, config } = req.body;
    
    const result = await pool.query(
      `INSERT INTO honeypots (tenant_id, name, type, ip_address, port, config, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [tenantId, name, type, ip_address, port, config || {}, req.deptId]
    );
    
    if (channel) {
      channel.sendToQueue('deception-events', Buffer.from(JSON.stringify({
        event: 'honeypot.deployed',
        tenant_id: tenantId,
        honeypot_id: result.rows[0].id,
        type,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    await redisClient.del(`honeypots:${tenantId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deception/attacks - List attack attempts
app.get('/api/deception/attacks', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT a.*, h.name as honeypot_name FROM attack_attempts a LEFT JOIN honeypots h ON a.honeypot_id = h.id WHERE a.tenant_id = $1 ORDER BY timestamp DESC LIMIT 100',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deception/honeytokens - List honeytokens
app.get('/api/deception/honeytokens', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT id, token_type, status, created_at FROM honeytokens WHERE tenant_id = $1',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deception/honeytokens - Generate honeytoken
app.post('/api/deception/honeytokens', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { token_type, decoy_location } = req.body;
    
    // Generate fake credential (in production, use proper crypto)
    const fakeToken = require('crypto').randomBytes(32).toString('hex');
    const encrypted = Buffer.from(fakeToken).toString('base64'); // Simplified encryption
    
    const result = await pool.query(
      `INSERT INTO honeytokens (tenant_id, token_type, token_value_encrypted, decoy_location, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, token_type, encrypted, decoy_location, req.deptId]
    );
    
    res.status(201).json({ id: result.rows[0].id, status: 'active' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/deception/metrics - Get metrics
app.get('/api/deception/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    const attacksResult = await pool.query(
      `SELECT attack_type, COUNT(*) as count FROM attack_attempts 
       WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '7 days'
       GROUP BY attack_type`,
      [tenantId]
    );
    
    const honeypotsResult = await pool.query(
      'SELECT COUNT(*) as total FROM honeypots WHERE tenant_id = $1',
      [tenantId]
    );
    
    res.json({
      attacks_by_type: attacksResult.rows,
      total_honeypots: parseInt(honeypotsResult.rows[0].total),
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Deception Service running on port ${PORT}`);
});
