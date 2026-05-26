const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const redis = require('redis');
const amqp = require('amqplib');
const crypto = require('crypto');
const { DepartmentScope } = require('../common/department-scope');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3016;

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
    await channel.assertQueue('password-manager-events', { durable: true });
    console.log('Password Manager connected to RabbitMQ');
  } catch (err) {
    console.error('RabbitMQ error:', err);
  }
}
setupRabbitMQ();

// Simple encryption (in production, use proper key management)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-32-chars-long-123456';
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
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
    res.json({ status: 'healthy', service: 'password-manager', timestamp: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// GET /api/password-manager/vault - List vault entries
app.get('/api/password-manager/vault', authenticateToken, requireTenant, DepartmentScope.requireAccess('pv'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const userId = req.user.user_id;
    const cacheKey = `vault:${tenantId}:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json(JSON.parse(cached));
    
    const result = await pool.query(
      'SELECT id, title, username, url, category, created_at, updated_at FROM password_vault WHERE tenant_id = $1 AND user_id = $2',
      [tenantId, userId]
    );
    
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(result.rows));
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/password-manager/vault - Add password entry
app.post('/api/password-manager/vault', authenticateToken, requireTenant, DepartmentScope.requireAccess('pv'), async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const userId = req.user.user_id;
    const { title, username, password, url, notes, category } = req.body;
    
    const encryptedPassword = encrypt(password);
    const encryptedNotes = notes ? encrypt(notes) : null;
    
    const result = await pool.query(
      `INSERT INTO password_vault (tenant_id, user_id, title, username, password_encrypted, url, notes_encrypted, category, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title, username, url, category, created_at`,
      [tenantId, userId, title, username, encryptedPassword, url, encryptedNotes, category, req.deptId]
    );
    
    await redisClient.del(`vault:${tenantId}:${userId}`);
    
    if (channel) {
      channel.sendToQueue('password-manager-events', Buffer.from(JSON.stringify({
        event: 'vault.entry_added',
        tenant_id: tenantId,
        user_id: userId,
        entry_id: result.rows[0].id,
        timestamp: new Date()
      })), { persistent: true });
    }
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/password-manager/vault/:id - Get decrypted entry
app.get('/api/password-manager/vault/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const userId = req.user.user_id;
    
    const result = await pool.query(
      'SELECT * FROM password_vault WHERE id = $1 AND tenant_id = $2 AND user_id = $3',
      [req.params.id, tenantId, userId]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    
    const entry = result.rows[0];
    entry.password = decrypt(entry.password_encrypted);
    if (entry.notes_encrypted) entry.notes = decrypt(entry.notes_encrypted);
    delete entry.password_encrypted;
    delete entry.notes_encrypted;
    
    // Log access
    await pool.query(
      `INSERT INTO vault_audit (tenant_id, user_id, action, entry_id, ip_address, department_id)
       VALUES ($1, $2, 'read', $3, $4, $5)`,
      [tenantId, userId, entry.id, req.ip, req.deptId]
    );
    
    res.json(entry);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/password-manager/generate - Generate strong password
app.post('/api/password-manager/generate', authenticateToken, (req, res) => {
  try {
    const { length = 16, symbols = true, numbers = true } = req.body;
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    const numChars = '0123456789';
    const symChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let charset = chars;
    if (numbers) charset += numChars;
    if (symbols) charset += symChars;
    
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    res.json({ password, length: password.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/password-manager/share - Share password securely
app.post('/api/password-manager/share', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    const userId = req.user.user_id;
    const { vault_entry_id, max_views = 1, expires_in_hours = 24 } = req.body;
    
    const shareToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + expires_in_hours * 60 * 60 * 1000);
    
    await pool.query(
      `INSERT INTO shared_passwords (tenant_id, vault_entry_id, share_token, expires_at, max_views, created_by, department_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tenantId, vault_entry_id, shareToken, expiresAt, max_views, userId, req.deptId]
    );
    
    res.status(201).json({
      share_url: `${req.protocol}://${req.get('host')}/api/password-manager/shared/${shareToken}`,
      expires_at: expiresAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/password-manager/shared/:token - Retrieve shared password
app.get('/api/password-manager/shared/:token', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sp.*, pv.password_encrypted, pv.title 
       FROM shared_passwords sp 
       LEFT JOIN password_vault pv ON sp.vault_entry_id = pv.id
       WHERE sp.share_token = $1`,
      [req.params.token]
    );
    
    if (result.rows.length === 0) return res.status(404).json({ error: 'Share link invalid or expired' });
    
    const share = result.rows[0];
    
    if (share.view_count >= share.max_views) {
      return res.status(410).json({ error: 'Maximum views exceeded' });
    }
    
    if (new Date() > new Date(share.expires_at)) {
      return res.status(410).json({ error: 'Share link expired' });
    }
    
    // Increment view count
    await pool.query(
      'UPDATE shared_passwords SET view_count = view_count + 1 WHERE id = $1',
      [share.id]
    );
    
    const password = decrypt(share.password_encrypted);
    
    res.json({ title: share.title, password });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/password-manager/metrics - Get metrics
app.get('/api/password-manager/metrics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;
    
    const vaultResult = await pool.query(
      'SELECT COUNT(*) as total FROM password_vault WHERE tenant_id = $1',
      [tenantId]
    );
    
    const sharesResult = await pool.query(
      'SELECT COUNT(*) as active_shares FROM shared_passwords WHERE tenant_id = $1 AND expires_at > NOW()',
      [tenantId]
    );
    
    res.json({
      total_entries: parseInt(vaultResult.rows[0].total),
      active_shares: parseInt(sharesResult.rows[0].active_shares),
      timestamp: new Date()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Password Manager Service running on port ${PORT}`);
});
