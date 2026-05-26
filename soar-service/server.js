const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');
const amqp = require('amqplib');
const axios = require('axios');
const { DepartmentScope } = require('../common/department-scope');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3018;

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
    await channel.assertQueue('soar-execution', { durable: true });
    await channel.assertQueue('siem-alerts', { durable: true });
    
    // Consume SIEM alerts
    await channel.consume('siem-alerts', async (msg) => {
      if (msg) {
        const alert = JSON.parse(msg.content.toString());
        console.log('SOAR received SIEM alert:', alert);
        // Execute matching playbook
        await executePlaybookForAlert(alert);
        channel.ack(msg);
      }
    });
    
    console.log('SOAR connected to RabbitMQ and consuming alerts');
  } catch (err) {
    console.error('RabbitMQ error:', err);
  }
}
setupRabbitMQ();

async function executePlaybookForAlert(alert) {
  try {
    // Find matching playbook
    const playbooks = await pool.query(
      'SELECT * FROM soar_playbooks WHERE enabled = true AND tenant_id = $1',
      [alert.tenant_id]
    );
    
    for (const playbook of playbooks.rows) {
      // Simple matching logic - in production would evaluate workflow conditions
      const execution = await pool.query(
        `INSERT INTO soar_executions (tenant_id, playbook_id, status, started_at, department_id)
         VALUES ($1, $2, 'running', NOW(), $3) RETURNING id`,
        [alert.tenant_id, playbook.id, req.deptId]
      );
      
      // Simulate playbook execution
      setTimeout(async () => {
        await pool.query(
          `UPDATE soar_executions SET status = 'completed', completed_at = NOW(),
           execution_log = $1 WHERE id = $2`,
          [JSON.stringify({ steps: playbook.workflow, alert }), execution.rows[0].id]
        );
      }, 2000);
    }
  } catch (err) {
    console.error('Playbook execution error:', err);
  }
}

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
    res.json({ status: 'healthy', service: 'soar', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/soar/playbooks - List playbooks
app.get('/api/soar/playbooks', authenticateToken, requireTenant, DepartmentScope.requireAccess('sp'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT * FROM soar_playbooks WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/soar/playbooks - Create playbook
app.post('/api/soar/playbooks', authenticateToken, requireTenant, DepartmentScope.requireAccess('sp'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, description, workflow } = req.body;
    
    const result = await pool.query(
      `INSERT INTO soar_playbooks (tenant_id, name, description, workflow, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, name, description, workflow, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/soar/playbooks/:id/execute - Execute playbook
app.post('/api/soar/playbooks/:id/execute', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { case_id } = req.body;
    
    const playbook = await pool.query(
      'SELECT * FROM soar_playbooks WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    
    if (playbook.rows.length === 0) return res.status(404).json({ error: 'Playbook not found' });
    
    const execution = await pool.query(
      `INSERT INTO soar_executions (tenant_id, playbook_id, case_id, status, started_at, department_id)
       VALUES ($1, $2, $3, 'running', NOW(), $4) RETURNING *`,
      [tenantId, req.params.id, case_id, req.deptId]
    );
    
    // Simulate async execution
    setTimeout(async () => {
      await pool.query(
        `UPDATE soar_executions SET status = 'completed', completed_at = NOW(),
         execution_log = $1 WHERE id = $2`,
        [JSON.stringify({ steps_completed: playbook.rows[0].workflow }), execution.rows[0].id]
      );
    }, 3000);
    
    res.status(202).json({ message: 'Playbook execution started', execution_id: execution.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/soar/cases - List cases
app.get('/api/soar/cases', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT * FROM soar_cases WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/soar/cases - Create case
app.post('/api/soar/cases', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { title, description, severity } = req.body;
    
    const result = await pool.query(
      `INSERT INTO soar_cases (tenant_id, title, description, severity, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, title, description, severity, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/soar/connectors - List connectors
app.get('/api/soar/connectors', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const result = await pool.query(
      'SELECT id, name, connector_type, enabled, created_at FROM soar_connectors WHERE tenant_id = $1',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/soar/connectors - Configure connector
app.post('/api/soar/connectors', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { name, connector_type, config_encrypted } = req.body;
    
    const result = await pool.query(
      `INSERT INTO soar_connectors (tenant_id, name, connector_type, config_encrypted, department_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tenantId, name, connector_type, config_encrypted, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/soar/metrics - Get metrics
app.get('/api/soar/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    const casesResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM soar_cases WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    );
    
    const executionsResult = await pool.query(
      `SELECT status, COUNT(*) as count FROM soar_executions WHERE tenant_id = $1 GROUP BY status`,
      [tenantId]
    );
    
    res.json({
      cases_by_status: casesResult.rows,
      executions_by_status: executionsResult.rows,
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`SOAR Service running on port ${PORT}`);
});
