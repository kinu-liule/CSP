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
const PORT = process.env.PORT || 3010;

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
    await channel.assertQueue('bcp-events', { durable: true });
    console.log('Business Continuity connected to RabbitMQ');
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
    res.json({ status: 'healthy', service: 'business-continuity', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/bcp/processes - List business processes
app.get('/api/bcp/processes', authenticateToken, requireTenant, DepartmentScope.requireAccess('bp'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const cacheKey = `bcp:processes:${tenantId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    
    const result = await pool.query(
      'SELECT * FROM bcp_processes WHERE tenant_id = $1 ORDER BY criticality DESC, created_at DESC',
      [tenantId]
    );
    
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bcp/processes - Add business process
app.post('/api/bcp/processes', authenticateToken, requireTenant, DepartmentScope.requireAccess('bp'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, description, criticality, rto_minutes, rpo_minutes, owner, dependencies } = req.body;
    
    const result = await pool.query(
      `INSERT INTO bcp_processes (tenant_id, name, description, criticality, rto_minutes, rpo_minutes, owner, dependencies, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
       [tenantId, name, description, criticality || 'medium', rto_minutes, rpo_minutes, owner, dependencies || [], req.deptId]
    );
    
    await redisClient.del(`bcp:processes:${tenantId}`);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bcp/plans - List DR plans
app.get('/api/bcp/plans', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT * FROM bcp_plans WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bcp/plans - Create DR plan
app.post('/api/bcp/plans', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { process_id, name, content } = req.body;
    
    const result = await pool.query(
      `INSERT INTO bcp_plans (tenant_id, process_id, name, content, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, process_id, name, content, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bcp/plans/:id/activate - Activate DR plan
app.post('/api/bcp/plans/:id/activate', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    const plan = await pool.query(
      'SELECT * FROM bcp_plans WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    
    if (plan.rows.length === 0) return res.status(404).json({ error: 'Plan not found' });
    
    const incident = await pool.query(
      `INSERT INTO bcp_incidents (tenant_id, process_id, incident_name, activated_plan_id, status, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, plan.rows[0].process_id, 'DR Plan Activated: ' + plan.rows[0].name, req.params.id, 'active', req.deptId]
    );
    
    if (channel) {
      channel.sendToQueue('bcp-events', Buffer.from(JSON.stringify({
        event: 'plan.activated',
        tenant_id: tenantId,
        plan_id: req.params.id,
        incident_id: incident.rows[0].id,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    res.status(202).json({ message: 'DR plan activation initiated', incident: incident.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bcp/tests - List continuity tests
app.get('/api/bcp/tests', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      `SELECT bt.*, bp.name as plan_name FROM bcp_tests bt
       LEFT JOIN bcp_plans bp ON bt.plan_id = bp.id
       WHERE bt.tenant_id = $1 ORDER BY bt.scheduled_date DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bcp/tests - Schedule test
app.post('/api/bcp/tests', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { plan_id, test_type, scheduled_date } = req.body;
    
    const result = await pool.query(
      `INSERT INTO bcp_tests (tenant_id, plan_id, test_type, scheduled_date, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, plan_id, test_type, scheduled_date, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/bcp/metrics - Get BCP metrics
app.get('/api/bcp/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    const processesResult = await pool.query(
      `SELECT criticality, COUNT(*) as count FROM bcp_processes WHERE tenant_id = $1 GROUP BY criticality`,
      [tenantId]
    );
    
    const incidentsResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM bcp_incidents WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    );
    
    res.json({
      processes_by_criticality: processesResult.rows,
      incidents_by_status: incidentsResult.rows,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Business Continuity Service running on port ${PORT}`);
});
