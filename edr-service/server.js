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
const PORT = process.env.PORT || 3015;

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
    await channel.assertQueue('edr-events', { durable: true });
    console.log('EDR connected to RabbitMQ');
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
    res.json({ status: 'healthy', service: 'edr', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/edr/agents - List agents
const listAgents = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const cacheKey = `edr:agents:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    
    const result = await pool.query(
      'SELECT * FROM edr_agents WHERE tenant_id = $1 ORDER BY last_checkin DESC',
      [tenantId]
    );
    
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/edr/agents', authenticateToken, requireTenant, DepartmentScope.requireAccess('ea'), listAgents);
app.get('/agents', authenticateToken, requireTenant, DepartmentScope.requireAccess('ea'), listAgents);
app.get('/endpoints', authenticateToken, requireTenant, DepartmentScope.requireAccess('ea'), listAgents);

// POST /api/edr/agents - Register agent
app.post('/api/edr/agents', authenticateToken, requireTenant, DepartmentScope.requireAccess('ea'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { hostname, ip_address, os, os_version, agent_version } = req.body;
    
    const result = await pool.query(
      `INSERT INTO edr_agents (tenant_id, hostname, ip_address, os, os_version, agent_version, last_checkin, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7) RETURNING *`,
      [tenantId, hostname, ip_address, os, os_version, agent_version, req.deptId]
    );
    
    if (channel) {
      channel.sendToQueue('edr-events', Buffer.from(JSON.stringify({
        event: 'agent.registered',
        tenant_id: tenantId,
        agent_id: result.rows[0].id,
        hostname,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    await redisClient.del(`edr:agents:${tenantId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/edr/telemetry - Get telemetry
app.get('/api/edr/telemetry', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { agent_id, event_type, limit } = req.query;
    
    let query = 'SELECT * FROM edr_telemetry WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (agent_id) {
      params.push(agent_id);
      query += ` AND agent_id = $${params.length}`;
    }
    if (event_type) {
      params.push(event_type);
      query += ` AND event_type = $${params.length}`;
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ' + (limit || 100);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/edr/telemetry - Ingest telemetry (service-to-service)
app.post('/api/edr/telemetry', async (req, res) => {
  try {
    const { tenant_id, agent_id, event_type, event_data } = req.body;
    
    await pool.query(
      `INSERT INTO edr_telemetry (tenant_id, agent_id, event_type, event_data, department_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenant_id, agent_id, event_type, event_data, req.deptId]
    );
    
    res.status(201).json({ message: 'Telemetry recorded' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/edr/detections - List detections
app.get('/api/edr/detections', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM edr_detections WHERE tenant_id = $1 AND status != $2 ORDER BY created_at DESC',
      [tenantId, 'resolved']
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/edr/response - Trigger response action
app.post('/api/edr/response', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { agent_id, detection_id, action_type } = req.body;
    
    const result = await pool.query(
      `INSERT INTO edr_response_actions (tenant_id, agent_id, detection_id, action_type, status, department_id)
       VALUES ($1, $2, $3, $4, 'pending', $5)
       RETURNING *`,
      [tenantId, agent_id, detection_id, action_type, req.deptId]
    );
    
    if (channel) {
      channel.sendToQueue('edr-events', Buffer.from(JSON.stringify({
        event: 'response.action_required',
        tenant_id: tenantId,
        action_id: result.rows[0].id,
        agent_id,
        action_type,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/edr/metrics - Get EDR metrics
app.get('/api/edr/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    const agentsResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM edr_agents WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    );
    
    const detectionsResult = await pool.query(
      `SELECT severity, COUNT(*) as count FROM edr_detections 
       WHERE tenant_id = $1 AND status = 'open' GROUP BY severity`,
      [tenantId]
    );
    
    res.json({
      agent_status: agentsResult.rows,
      open_detections_by_severity: detectionsResult.rows,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`EDR Service running on port ${PORT}`);
});
