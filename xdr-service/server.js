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
const PORT = process.env.PORT || 3020;

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
    await channel.assertQueue('xdr-incidents', { durable: true });
    await channel.assertQueue('xdr-response', { durable: true });
    console.log('XDR connected to RabbitMQ');
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
    res.json({ status: 'healthy', service: 'xdr', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/xdr/alerts - Get cross-domain alerts
app.get('/api/xdr/alerts', authenticateToken, requireTenant, DepartmentScope.requireAccess('xa'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM xdr_alerts WHERE tenant_id = $1 AND status != $2 ORDER BY created_at DESC LIMIT 100',
      [tenantId, 'resolved']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/xdr/alerts/:id - Get alert with full context
app.get('/api/xdr/alerts/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM xdr_alerts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/xdr/alerts/:id/respond - Trigger response action
app.post('/api/xdr/alerts/:id/respond', authenticateToken, requireTenant, DepartmentScope.requireAccess('xa'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { action_type } = req.body;
    
    const updateResult = await pool.query(
      `UPDATE xdr_alerts SET response_status = $3 
       WHERE id = $1 AND tenant_id = $2 
       RETURNING *`,
      [req.params.id, tenantId, 'actioned']
    );
    
    if (updateResult.rows.length === 0) return res.status(404).json({ error: 'Alert not found' });
    
    if (channel) {
      channel.sendToQueue('xdr-response', Buffer.from(JSON.stringify({
        alert_id: req.params.id,
        tenant_id: tenantId,
        action_type,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    res.json({ message: 'Response action triggered', alert: updateResult.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/xdr/incidents - List XDR incidents
const listIncidents = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM xdr_incidents WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/xdr/incidents', authenticateToken, listIncidents);
app.get('/incidents', authenticateToken, listIncidents);

// POST /api/xdr/hunt - Start threat hunt query
app.post('/api/xdr/hunt', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { query_text, data_sources } = req.body;
    
    const result = await pool.query(
      `INSERT INTO threat_hunts (tenant_id, query_text, data_sources, status, department_id)
       VALUES ($1, $2, $3, 'running', $4)
       RETURNING *`,
       [tenantId, query_text, data_sources || [], req.deptId]
    );
    
    // Simulate async hunt
    setTimeout(async () => {
      await pool.query(
        `UPDATE threat_hunts SET status = 'completed', results_count = $1, findings = $2
         WHERE id = $3`,
        [Math.floor(Math.random() * 50), JSON.stringify({ matches: [] }), result.rows[0].id]
      );
    }, 3000);
    
    res.status(202).json({ message: 'Hunt started', hunt_id: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/xdr/hunt/:id - Get hunt results
app.get('/api/xdr/hunt/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM threat_hunts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Hunt not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/xdr/correlations - List correlation rules
app.get('/api/xdr/correlations', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM xdr_correlations WHERE tenant_id = $1 AND enabled = true',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/xdr/correlations - Create correlation rule
app.post('/api/xdr/correlations', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, logic } = req.body;
    
    const result = await pool.query(
      `INSERT INTO xdr_correlations (tenant_id, name, logic, department_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, name, logic, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/xdr/metrics - Get XDR metrics
app.get('/api/xdr/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    const alertsResult = await pool.query(
      `SELECT severity, COUNT(*) as count FROM xdr_alerts 
       WHERE tenant_id = $1 AND status != 'resolved' GROUP BY severity`,
      [tenantId]
    );
    
    const incidentsResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM xdr_incidents 
       WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    );
    
    res.json({
      open_alerts_by_severity: alertsResult.rows,
      incidents_by_status: incidentsResult.rows,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`XDR Service running on port ${PORT}`);
});
