const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');
const amqp = require('amqplib');
const axios = require('axios');
const { DepartmentScope } = require('./department-scope');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3011;

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
    await channel.assertQueue('cspm-events', { durable: true });
    console.log('CSPM connected to RabbitMQ');
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
    res.json({ status: 'healthy', service: 'cspm', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/cspm/accounts - List cloud accounts
app.get('/api/cspm/accounts', authenticateToken, requireTenant, DepartmentScope.requireAccess('ca'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT id, cloud_provider, account_name, status, created_at FROM cspm_accounts WHERE tenant_id = $1',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cspm/accounts - Register cloud account
app.post('/api/cspm/accounts', authenticateToken, requireTenant, DepartmentScope.requireAccess('ca'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { cloud_provider, account_id, account_name, credentials_encrypted } = req.body;
    
    const result = await pool.query(
      `INSERT INTO cspm_accounts (tenant_id, cloud_provider, account_id, account_name, credentials_encrypted, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, cloud_provider, account_id, account_name, credentials_encrypted, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cspm/findings - List findings
const listFindings = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { severity, status } = req.query;
    
    let query = 'SELECT * FROM cspm_findings WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }
    if (status) {
      params.push(status);
      query += ` AND status = $${params.length}`;
    }
    
    query += ' ORDER BY discovered_at DESC';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/cspm/findings', authenticateToken, listFindings);
app.get('/findings', authenticateToken, listFindings);

// POST /api/cspm/scan - Trigger compliance scan
app.post('/api/cspm/scan', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { account_id } = req.body;
    
    // In production, this would trigger async scan via cloud APIs
    // For now, simulate scan completion
    setTimeout(async () => {
      if (channel) {
        channel.sendToQueue('cspm-events', Buffer.from(JSON.stringify({
          event: 'scan.completed',
          tenant_id: tenantId,
          account_id,
          findings_count: Math.floor(Math.random() * 10),
          timestamp: new Date()
        })), { persistent: true });
      }
    }, 1000);
    
    res.status(202).json({ message: 'Scan initiated', status: 'pending' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cspm/compliance - Get compliance score
app.get('/api/cspm/compliance', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const cacheKey = `cspm:compliance:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    
    const result = await pool.query(
      'SELECT standard, AVG(score) as avg_score FROM cspm_compliance_scores WHERE tenant_id = $1 GROUP BY standard',
      [tenantId]
    );
    
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cspm/policies - List CSPM policies
app.get('/api/cspm/policies', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM cspm_policies WHERE tenant_id = $1 AND enabled = true',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cspm/policies - Add custom policy
app.post('/api/cspm/policies', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, cloud_provider, policy_type, rules } = req.body;
    
    const result = await pool.query(
      `INSERT INTO cspm_policies (tenant_id, name, cloud_provider, policy_type, rules, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, name, cloud_provider, policy_type, rules, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cspm/metrics - Get metrics
app.get('/api/cspm/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    const findingsResult = await pool.query(
      `SELECT severity, COUNT(*) as count FROM cspm_findings 
       WHERE tenant_id = $1 AND status = 'open' GROUP BY severity`,
      [tenantId]
    );
    
    const accountsResult = await pool.query(
      'SELECT COUNT(*) as total FROM cspm_accounts WHERE tenant_id = $1',
      [tenantId]
    );
    
    res.json({
      total_accounts: parseInt(accountsResult.rows[0].total),
      open_findings_by_severity: findingsResult.rows,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`CSPM Service running on port ${PORT}`);
});
