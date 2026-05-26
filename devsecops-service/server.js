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
const PORT = process.env.PORT || 3014;

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
    await channel.assertQueue('devsecops-events', { durable: true });
    console.log('DevSecOps connected to RabbitMQ');
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
    res.json({ status: 'healthy', service: 'devsecops', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/devsecops/pipelines - List CI/CD pipelines
app.get('/api/devsecops/pipelines', authenticateToken, requireTenant, DepartmentScope.requireAccess('dp'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT id, name, ci_cd_platform, status, created_at FROM devsecops_pipelines WHERE tenant_id = $1',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devsecops/pipelines - Register pipeline
app.post('/api/devsecops/pipelines', authenticateToken, requireTenant, DepartmentScope.requireAccess('dp'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, ci_cd_platform, repo_url, webhook_secret_encrypted } = req.body;
    
    const result = await pool.query(
      `INSERT INTO devsecops_pipelines (tenant_id, name, ci_cd_platform, repo_url, webhook_secret_encrypted, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, name, ci_cd_platform, repo_url, webhook_secret_encrypted, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devsecops/scans - List security scans
app.get('/api/devsecops/scans', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { status } = req.query;
    
    let query = 'SELECT s.*, p.name as pipeline_name FROM security_scans s LEFT JOIN devsecops_pipelines p ON s.pipeline_id = p.id WHERE s.tenant_id = $1';
    const params = [tenantId];
    
    if (status) {
      params.push(status);
      query += ` AND s.status = $${params.length}`;
    }
    
    query += ' ORDER BY s.started_at DESC LIMIT 100';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devsecops/scans - Trigger security scan
app.post('/api/devsecops/scans', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { pipeline_id, scan_type, target } = req.body;
    
    const result = await pool.query(
      `INSERT INTO security_scans (tenant_id, pipeline_id, scan_type, target, status, started_at, department_id)
       VALUES ($1, $2, $3, $4, 'running', NOW(), $5) RETURNING *`,
      [tenantId, pipeline_id, scan_type, target, req.deptId]
    );
    
    // Simulate scan completion after delay
    setTimeout(async () => {
      await pool.query(
        `UPDATE security_scans SET status = 'completed', completed_at = NOW(),
         findings_count = $1, severity_breakdown = $2
         WHERE id = $3`,
        [Math.floor(Math.random() * 20), JSON.stringify({critical: 0, high: 2, medium: 5, low: 3}), result.rows[0].id]
      );
      
      if (channel) {
        channel.sendToQueue('devsecops-events', Buffer.from(JSON.stringify({
          event: 'scan.completed',
          tenant_id: tenantId,
          scan_id: result.rows[0].id,
          findings_count: 10
        })), { persistent: true });
      }
    }, 5000);
    
    res.status(202).json({ message: 'Scan initiated', scan_id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devsecops/policies - List deployment policies
app.get('/api/devsecops/policies', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT * FROM deployment_policies WHERE tenant_id = $1 AND enabled = true',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/devsecops/policies - Create deployment policy
app.post('/api/devsecops/policies', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, rules, enforcement_mode } = req.body;
    
    const result = await pool.query(
      `INSERT INTO deployment_policies (tenant_id, name, rules, enforcement_mode, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, name, rules, enforcement_mode || 'audit', req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devsecops/gates - Check deployment gate status
app.get('/api/devsecops/gates', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { deployment_id } = req.query;
    
    const result = await pool.query(
      'SELECT * FROM deployment_gates WHERE tenant_id = $1 AND deployment_id = $2 ORDER BY gated_at DESC LIMIT 1',
      [tenantId, deployment_id]
    );
    
    if (result.rows.length === 0) return res.json({ gate_status: 'no_gate', deployment_id });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/devsecops/metrics - Get metrics
app.get('/api/devsecops/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    const scansResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM security_scans WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    );
    
    const pipelinesResult = await pool.query(
      'SELECT COUNT(*) as total FROM devsecops_pipelines WHERE tenant_id = $1',
      [tenantId]
    );
    
    res.json({
      scans_by_status: scansResult.rows,
      total_pipelines: parseInt(pipelinesResult.rows[0].total),
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`DevSecOps Service running on port ${PORT}`);
});
