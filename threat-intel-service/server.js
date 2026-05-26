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
const PORT = process.env.PORT || 3019;

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
    await channel.assertQueue('threat-intel-events', { durable: true });
    console.log('Threat Intel connected to RabbitMQ');
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
    res.json({ status: 'healthy', service: 'threat-intel', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/threat-intel/iocs - List IOCs
const listIocs = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { ioc_type, severity } = req.query;
    
    let query = 'SELECT * FROM threat_iocs WHERE tenant_id = $1';
    const params = [tenantId];
    
    if (ioc_type) {
      params.push(ioc_type);
      query += ` AND ioc_type = $${params.length}`;
    }
    if (severity) {
      params.push(severity);
      query += ` AND severity = $${params.length}`;
    }
    
    query += ' ORDER BY last_seen DESC LIMIT 1000';
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

app.get('/api/threat-intel/iocs', authenticateToken, requireTenant, DepartmentScope.requireAccess('ti'), listIocs);
app.get('/iocs', authenticateToken, requireTenant, DepartmentScope.requireAccess('ti'), listIocs);
app.get('/indicators', authenticateToken, requireTenant, DepartmentScope.requireAccess('ti'), listIocs);

// POST /api/threat-intel/iocs - Submit IOC
app.post('/api/threat-intel/iocs', authenticateToken, requireTenant, DepartmentScope.requireAccess('ti'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { ioc_type, ioc_value, threat_type, severity, confidence_score, mitre_tactic, source_feed } = req.body;
    
    const result = await pool.query(
      `INSERT INTO threat_iocs (tenant_id, ioc_type, ioc_value, threat_type, severity, confidence_score, mitre_tactic, source_feed, first_seen, last_seen, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, NOW())
       ON CONFLICT (tenant_id, ioc_type, ioc_value) 
       DO UPDATE SET last_seen = NOW(), severity = EXCLUDED.severity
       RETURNING *`,
      [tenantId, ioc_type, ioc_value, threat_type, severity, confidence_score, mitre_tactic, source_feed, req.deptId]
    );
    
    // Cache in Redis for fast lookups
    await redisClient.setEx(`ioc:${tenantId}:${ioc_value}`, 3600, JSON.stringify(result.rows[0]));
    
    if (channel) {
      channel.sendToQueue('threat-intel-events', Buffer.from(JSON.stringify({
        event: 'ioc.new',
        tenant_id: tenantId,
        ioc_id: result.rows[0].id,
        ioc_value,
        severity,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/threat-intel/iocs/:id - Get IOC details
app.get('/api/threat-intel/iocs/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT * FROM threat_iocs WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'IOC not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/threat-intel/scan - Scan IOC against feeds
app.post('/api/threat-intel/scan', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { ioc_value, ioc_type } = req.body;
    
    // Check cache first
    const cached = await redisClient.get(`ioc:${tenantId}:${ioc_value}`);
    if (cached) {
      return res.json({ cached: true, ioc: JSON.parse(cached) });
    }
    
    // In production, this would query VirusTotal, OTX, etc.
    // Simulated response
    const mockResult = {
      ioc_value,
      ioc_type,
      malicious: Math.random() > 0.5,
      sources: ['virustotal', 'otx'],
      reputation_score: Math.floor(Math.random() * 100)
    };
    
    res.json(mockResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/threat-intel/feeds - List threat feeds
app.get('/api/threat-intel/feeds', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      'SELECT id, name, feed_type, enabled, last_sync FROM threat_feeds WHERE tenant_id = $1',
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/threat-intel/feeds - Add custom feed
app.post('/api/threat-intel/feeds', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { name, feed_type, url, api_key_encrypted } = req.body;
    
    const result = await pool.query(
      `INSERT INTO threat_feeds (tenant_id, name, feed_type, url, api_key_encrypted, department_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, name, feed_type, url, api_key_encrypted, req.deptId]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/threat-intel/ttps - Get MITRE ATT&CK mappings
app.get('/api/threat-intel/ttps', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const result = await pool.query(
      `SELECT mitre_tactic, mitre_technique, COUNT(*) as count 
       FROM threat_iocs 
       WHERE tenant_id = $1 AND mitre_tactic IS NOT NULL
       GROUP BY mitre_tactic, mitre_technique
       ORDER BY count DESC`,
      [tenantId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/threat-intel/metrics - Get metrics
app.get('/api/threat-intel/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    
    const iocsResult = await pool.query(
      `SELECT ioc_type, COUNT(*) as count FROM threat_iocs WHERE tenant_id = $1 GROUP BY ioc_type`,
      [tenantId]
    );
    
    const feedsResult = await pool.query(
      'SELECT COUNT(*) as total FROM threat_feeds WHERE tenant_id = $1',
      [tenantId]
    );
    
    res.json({
      iocs_by_type: iocsResult.rows,
      total_feeds: parseInt(feedsResult.rows[0].total),
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Threat Intel Service running on port ${PORT}`);
});
