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
const PORT = process.env.PORT || 3017;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));

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
    
    // Consume events from all services
    const queues = ['waf-events', 'ngfw-events', 'siem-events', 'edr-events', 'cspm-events', 'deception-events'];
    for (const queue of queues) {
      await channel.assertQueue(queue, { durable: true });
      await channel.consume(queue, async (msg) => {
        if (msg) {
          await ingestEvent(queue, JSON.parse(msg.content.toString()));
          channel.ack(msg);
        }
      });
    }
    
    console.log('Data Lake consuming events from all services');
  } catch (err) {
    console.error('RabbitMQ error:', err);
  }
}
setupRabbitMQ();

async function ingestEvent(sourceQueue, eventData) {
  try {
    const source = sourceQueue.replace('-events', '');
    await pool.query(
      `INSERT INTO security_events (tenant_id, source_service, event_type, severity, event_data, raw_event, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventData.tenant_id, source, eventData.event || 'unknown', eventData.severity || 'low', eventData, eventData, req.deptId]
    );
    
    // Update cache
    const cacheKey = `events:count:${eventData.tenant_id}`;
    await redisClient.incr(cacheKey);
    await redisClient.expire(cacheKey, 3600);
  } catch (err) {
    console.error('Event ingestion error:', err);
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
    res.json({ status: 'healthy', service: 'data-lake', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// POST /api/data-lake/events - Ingest events (service-to-service)
app.post('/api/data-lake/events', async (req, res) => {
  try {
    const { tenant_id, event_type, severity, event_data } = req.body;
    
    const result = await pool.query(
      `INSERT INTO security_events (tenant_id, source_service, event_type, severity, event_data, raw_event, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [tenant_id, 'api', event_type, severity || 'low', event_data, event_data, req.deptId]
    );
    
    res.status(201).json({ id: result.rows[0].id, message: 'Event ingested' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-lake/events - Query events
app.get('/api/data-lake/events', authenticateToken, requireTenant, DepartmentScope.requireAccess('se'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { event_type, severity, limit, offset } = req.query;
    
    let query = 'SELECT * FROM security_events WHERE tenant_id = $1';
    const params = [tenantId];
    let paramCount = 2;
    
    if (event_type) {
      query += ` AND event_type = $${paramCount++}`;
      params.push(event_type);
    }
    if (severity) {
      query += ` AND severity = $${paramCount++}`;
      params.push(severity);
    }
    
    query += ' ORDER BY timestamp DESC LIMIT ' + (limit || 100) + ' OFFSET ' + (offset || 0);
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-lake/search - Full-text search
app.get('/api/data-lake/search', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { q } = req.query;
    
    const result = await pool.query(
      `SELECT * FROM security_events 
       WHERE tenant_id = $1 AND event_data::text ILIKE $2
       ORDER BY timestamp DESC LIMIT 100`,
      [tenantId, `%${q}%`]
    );
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-lake/aggregations - Get aggregated stats
app.get('/api/data-lake/aggregations', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { time_range } = req.query; // e.g., '24h', '7d', '30d'
    
    let timeFilter = "timestamp > NOW() - INTERVAL '24 hours'";
    if (time_range === '7d') timeFilter = "timestamp > NOW() - INTERVAL '7 days'";
    if (time_range === '30d') timeFilter = "timestamp > NOW() - INTERVAL '30 days'";
    
    const eventsBySource = await pool.query(
      `SELECT source_service, COUNT(*) as count FROM security_events 
       WHERE tenant_id = $1 AND ${timeFilter}
       GROUP BY source_service`,
      [tenantId]
    );
    
    const eventsByType = await pool.query(
      `SELECT event_type, COUNT(*) as count FROM security_events 
       WHERE tenant_id = $1 AND ${timeFilter}
       GROUP BY event_type`,
      [tenantId]
    );
    
    res.json({
      time_range: time_range || '24h',
      events_by_source: eventsBySource.rows,
      events_by_type: eventsByType.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/data-lake/export - Export events for compliance
app.post('/api/data-lake/export', authenticateToken, requireTenant, DepartmentScope.requireAccess('se'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const { start_date, end_date, format } = req.body;
    
    const result = await pool.query(
      `SELECT * FROM security_events 
       WHERE tenant_id = $1 AND timestamp BETWEEN $2 AND $3
       ORDER BY timestamp ASC`,
      [tenantId, start_date, end_date]
    );
    
    // In production, this would generate a downloadable file
    res.json({
      export_id: require('crypto').randomUUID(),
      record_count: result.rows.length,
      format: format || 'json',
      status: 'ready'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/data-lake/metrics - Get ingestion metrics
app.get('/api/data-lake/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    const totalResult = await pool.query(
      'SELECT COUNT(*) as total FROM security_events WHERE tenant_id = $1',
      [tenantId]
    );
    
    const todayResult = await pool.query(
      `SELECT COUNT(*) as today FROM security_events 
       WHERE tenant_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'`,
      [tenantId]
    );
    
    res.json({
      total_events: parseInt(totalResult.rows[0].total),
      events_last_24h: parseInt(todayResult.rows[0].today),
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Security Data Lake running on port ${PORT}`);
});
