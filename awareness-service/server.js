const express = require('express');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { DepartmentScope } = require('./department-scope');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3006;

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword'
});

app.use(express.json());
app.use(DepartmentScope.middleware());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, x-tenant-id');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Health
app.get('/health', (req, res) => {
  res.json({ service: 'awareness', status: 'healthy', timestamp: new Date().toISOString() });
});

// =====================================================================
// DATABASE INIT
// =====================================================================
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS awareness_campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        name VARCHAR(500) NOT NULL,
        template_id UUID,
        page_id UUID,
        smtp_id UUID,
        target_group_id UUID,
        status VARCHAR(50) DEFAULT 'draft',
        sent_count INT DEFAULT 0,
        opened_count INT DEFAULT 0,
        clicked_count INT DEFAULT 0,
        submitted_count INT DEFAULT 0,
        reported_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        launch_date TIMESTAMP,
        completed_date TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS awareness_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        name VARCHAR(500) NOT NULL,
        subject VARCHAR(500),
        text_body TEXT,
        html_body TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS awareness_landing_pages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        name VARCHAR(500) NOT NULL,
        html_content TEXT,
        capture_credentials BOOLEAN DEFAULT false,
        capture_passwords BOOLEAN DEFAULT false,
        redirect_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS awareness_smtp (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        name VARCHAR(500) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INT DEFAULT 587,
        username VARCHAR(255),
        password_encrypted TEXT,
        from_address VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS awareness_groups (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        name VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS awareness_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        group_id UUID REFERENCES awareness_groups(id) ON DELETE CASCADE,
        email VARCHAR(500) NOT NULL,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        position VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS awareness_results (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        campaign_id UUID REFERENCES awareness_campaigns(id) ON DELETE CASCADE,
        user_id UUID REFERENCES awareness_users(id) ON DELETE SET NULL,
        email VARCHAR(500),
        status VARCHAR(50) DEFAULT 'sent',
        opened_at TIMESTAMP,
        clicked_at TIMESTAMP,
        submitted_at TIMESTAMP,
        reported_at TIMESTAMP,
        ip_address VARCHAR(50),
        user_agent TEXT,
        payload JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS awareness_training_modules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id VARCHAR(255) NOT NULL,
        title VARCHAR(500) NOT NULL,
        type VARCHAR(50) DEFAULT 'video',
        duration INT DEFAULT 0,
        assigned_to TEXT[] DEFAULT '{}',
        completions INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Awareness database tables initialized');
  } finally {
    client.release();
  }
}

// =====================================================================
// SEED DATA
// =====================================================================
async function seedData() {
  const client = await pool.connect();
  try {
    // Clear any stale seed data (from prior failed attempts)
    await client.query('DELETE FROM awareness_results');
    await client.query('DELETE FROM awareness_campaigns');
    await client.query('DELETE FROM awareness_users');
    await client.query('DELETE FROM awareness_groups');
    await client.query('DELETE FROM awareness_smtp');
    await client.query('DELETE FROM awareness_landing_pages');
    await client.query('DELETE FROM awareness_templates');
    await client.query('DELETE FROM awareness_training_modules');

    const tenantId = 'tenant1';

    // Templates
    const templates = [
      { name: 'Password Reset Notice', subject: 'Action Required: Your password has expired', text_body: 'Dear employee, your corporate password has expired. Please click the link to reset within 24 hours.', html_body: '<h2>Password Expiry Notice</h2><p>Your corporate password has expired.</p><a href="{{.URL}}">Reset Password Now</a>' },
      { name: 'Suspicious Login Alert', subject: 'Security Alert: New login detected', text_body: 'We detected a login from an unrecognized device. Verify your account immediately.', html_body: '<h2>Security Alert</h2><p>Unrecognized login detected.</p><a href="{{.URL}}">Verify Account</a>' },
      { name: 'IT Survey Invitation', subject: 'Employee IT Satisfaction Survey', text_body: 'Please complete this 2-minute survey about our IT services.', html_body: '<h2>IT Survey</h2><p>Help us improve. Take the 2-minute survey.</p><a href="{{.URL}}">Start Survey</a>' }
    ];
    for (const t of templates) {
      await client.query(
        'INSERT INTO awareness_templates (tenant_id, name, subject, text_body, html_body) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, t.name, t.subject, t.text_body, t.html_body]
      );
    }

    // Landing pages
    const pages = [
      { name: 'Office 365 Login', html: '<form><input type="email" placeholder="Email"><input type="password" placeholder="Password"><button>Sign In</button></form>', capture_creds: true, capture_passwords: true },
      { name: 'IT Portal Notice', html: '<h1>System Update Required</h1><p>Please verify your credentials.</p><form><input name="username"><input name="password" type="password"><button>Continue</button></form>', capture_creds: true, capture_passwords: false }
    ];
    for (const p of pages) {
      await client.query(
        'INSERT INTO awareness_landing_pages (tenant_id, name, html_content, capture_credentials, capture_passwords) VALUES ($1, $2, $3, $4, $5)',
        [tenantId, p.name, p.html, p.capture_creds, p.capture_passwords]
      );
    }

    // SMTP
    await client.query(
      "INSERT INTO awareness_smtp (tenant_id, name, host, port, username, from_address) VALUES ($1, 'Corporate Mail Server', 'smtp.corp.com', 587, 'notifications@corp.com', 'notifications@corp.com')",
      [tenantId]
    );

    // Groups
    const groupResult = await client.query(
      "INSERT INTO awareness_groups (tenant_id, name) VALUES ($1, 'IT Department'), ($1, 'Finance Team'), ($1, 'Executive Staff') RETURNING id",
      [tenantId]
    );
    const groupIds = groupResult.rows.map(r => r.id);

    // Users
    const users = [
      { email: 'jdoe@corp.com', first: 'John', last: 'Doe', pos: 'IT Engineer', groupIdx: 0 },
      { email: 'asmith@corp.com', first: 'Alice', last: 'Smith', pos: 'Network Admin', groupIdx: 0 },
      { email: 'bwilson@corp.com', first: 'Bob', last: 'Wilson', pos: 'Security Analyst', groupIdx: 0 },
      { email: 'cjones@corp.com', first: 'Carol', last: 'Jones', pos: 'Accountant', groupIdx: 1 },
      { email: 'dlee@corp.com', first: 'David', last: 'Lee', pos: 'Financial Analyst', groupIdx: 1 },
      { email: 'egarcia@corp.com', first: 'Elena', last: 'Garcia', pos: 'CFO', groupIdx: 2 },
      { email: 'fmartin@corp.com', first: 'Frank', last: 'Martin', pos: 'CEO', groupIdx: 2 }
    ];
    const userResult = [];
    for (const u of users) {
      const r = await client.query(
        'INSERT INTO awareness_users (tenant_id, group_id, email, first_name, last_name, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [tenantId, groupIds[u.groupIdx], u.email, u.first, u.last, u.pos]
      );
      userResult.push(r.rows[0].id);
    }

    // Campaigns
    const tmplIds = (await client.query('SELECT id FROM awareness_templates WHERE tenant_id = $1', [tenantId])).rows.map(r => r.id);
    const pageIds = (await client.query('SELECT id FROM awareness_landing_pages WHERE tenant_id = $1', [tenantId])).rows.map(r => r.id);
    const smtpIds = (await client.query('SELECT id FROM awareness_smtp WHERE tenant_id = $1', [tenantId])).rows.map(r => r.id);

    const campaigns = [
      { name: 'Q1 Security Awareness - Password Reset', tmplIdx: 0, pageIdx: 0, smtpIdx: 0, groupIdx: 0, status: 'completed', sent: 3, opened: 2, clicked: 1, submitted: 0, reported: 1 },
      { name: 'Phishing Drill - Suspicious Login', tmplIdx: 1, pageIdx: 1, smtpIdx: 0, groupIdx: 1, status: 'running', sent: 2, opened: 1, clicked: 0, submitted: 0, reported: 0 },
      { name: 'IT Survey Campaign', tmplIdx: 2, pageIdx: 0, smtpIdx: 0, groupIdx: 2, status: 'draft', sent: 0, opened: 0, clicked: 0, submitted: 0, reported: 0 }
    ];
    for (let i = 0; i < campaigns.length; i++) {
      const c = campaigns[i];
      const launchDate = new Date(Date.now() - i * 2 * 86400000).toISOString();
      const completedDate = c.status === 'completed' ? new Date(Date.now() - (i * 2 + 1) * 86400000).toISOString() : null;
      const cr = await client.query(
        `INSERT INTO awareness_campaigns (tenant_id, name, template_id, page_id, smtp_id, target_group_id, status, sent_count, opened_count, clicked_count, submitted_count, reported_count, launch_date, completed_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
        [tenantId, c.name, tmplIds[c.tmplIdx], pageIds[c.pageIdx], smtpIds[c.smtpIdx], groupIds[c.groupIdx], c.status, c.sent, c.opened, c.clicked, c.submitted, c.reported, launchDate, completedDate]
      );
      const campaignId = cr.rows[0].id;

      // Results for completed campaign
      if (c.status === 'completed') {
        const groupUsers = users.filter((_, idx) => idx >= 0 && idx <= 2);
        for (let j = 0; j < Math.min(c.sent, groupUsers.length); j++) {
          await client.query(
            `INSERT INTO awareness_results (tenant_id, campaign_id, user_id, email, status, opened_at, clicked_at, reported_at)
             VALUES ($1, $2, $3, $4, 'sent', CASE WHEN $5 <= $6 THEN NOW() - interval '${c.opened} hours' ELSE NULL END, CASE WHEN $5 <= $7 THEN NOW() - interval '${c.clicked} hours' ELSE NULL END, CASE WHEN $5 <= $8 THEN NOW() - interval '${c.reported} hours' ELSE NULL END)`,
            [tenantId, campaignId, userResult[j], groupUsers[j].email, j + 1, c.opened, c.clicked, c.reported]
          );
        }
      }
    }

    // Training modules
    await client.query(
      `INSERT INTO awareness_training_modules (tenant_id, title, type, duration, assigned_to, completions) VALUES
       ($1, 'Phishing Awareness Basics', 'video', 15, $2::text[], 42),
       ($1, 'Social Engineering Defense', 'quiz', 10, $2::text[], 28),
       ($1, 'Incident Reporting Simulation', 'simulation', 20, $2::text[], 15)`,
      [tenantId, [userResult[0], userResult[1], userResult[2]]]
    );

    console.log('Awareness data seeded successfully');
  } finally {
    client.release();
  }
}

// =====================================================================
// TEMPLATES
// =====================================================================
app.get('/api/templates', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT * FROM awareness_templates WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.post('/api/templates', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { name, subject, text_body, html_body } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO awareness_templates (tenant_id, name, subject, text_body, html_body) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tenantId, name, subject, text_body || '', html_body || '']
    );
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/templates/:id', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT * FROM awareness_templates WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Template not found' });
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// LANDING PAGES
// =====================================================================
app.get('/api/pages', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT * FROM awareness_landing_pages WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.post('/api/pages', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { name, html_content, capture_credentials, capture_passwords, redirect_url } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO awareness_landing_pages (tenant_id, name, html_content, capture_credentials, capture_passwords, redirect_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [tenantId, name, html_content || '', !!capture_credentials, !!capture_passwords, redirect_url || '']
    );
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/pages/:id', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT * FROM awareness_landing_pages WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Page not found' });
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// SMTP (Sending Profiles)
// =====================================================================
app.get('/api/smtp', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT id, tenant_id, name, host, port, username, from_address, created_at FROM awareness_smtp WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.post('/api/smtp', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { name, host, port, username, password, from_address } = req.body;
    const encrypted = password ? crypto.createHash('sha256').update(password).digest('hex') : '';
    const { rows } = await pool.query(
      'INSERT INTO awareness_smtp (tenant_id, name, host, port, username, password_encrypted, from_address) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, tenant_id, name, host, port, username, from_address, created_at',
      [tenantId, name, host, port || 587, username || '', encrypted, from_address || '']
    );
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// GROUPS
// =====================================================================
app.get('/api/groups', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows: groups } = await pool.query('SELECT g.*, (SELECT COUNT(*) FROM awareness_users WHERE group_id = g.id) as member_count FROM awareness_groups g WHERE g.tenant_id = $1 ORDER BY g.created_at DESC', [tenantId]);
    res.json({ success: true, data: groups, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.post('/api/groups', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { name } = req.body;
    const { rows } = await pool.query('INSERT INTO awareness_groups (tenant_id, name) VALUES ($1, $2) RETURNING *', [tenantId, name]);
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/groups/:id', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT * FROM awareness_groups WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Group not found' });
    const { rows: members } = await pool.query('SELECT * FROM awareness_users WHERE group_id = $1 ORDER BY email', [req.params.id]);
    rows[0].members = members;
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// USERS
// =====================================================================
app.get('/api/users', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query(
      'SELECT u.*, g.name as group_name FROM awareness_users u LEFT JOIN awareness_groups g ON u.group_id = g.id WHERE u.tenant_id = $1 ORDER BY u.email',
      [tenantId]
    );
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.post('/api/users', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { email, first_name, last_name, position, group_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO awareness_users (tenant_id, group_id, email, first_name, last_name, position) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [tenantId, group_id, email, first_name || '', last_name || '', position || '']
    );
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/users/:id', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query(
      'SELECT u.*, g.name as group_name FROM awareness_users u LEFT JOIN awareness_groups g ON u.group_id = g.id WHERE u.id = $1 AND u.tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// CAMPAIGNS
// =====================================================================
app.get('/api/campaigns', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query(
      `SELECT c.*, t.name as template_name, p.name as page_name, s.name as smtp_name, g.name as group_name,
        (SELECT COUNT(*) FROM awareness_results WHERE campaign_id = c.id) as result_count
       FROM awareness_campaigns c
       LEFT JOIN awareness_templates t ON c.template_id = t.id
       LEFT JOIN awareness_landing_pages p ON c.page_id = p.id
       LEFT JOIN awareness_smtp s ON c.smtp_id = s.id
       LEFT JOIN awareness_groups g ON c.target_group_id = g.id
       WHERE c.tenant_id = $1 ORDER BY c.created_at DESC`,
      [tenantId]
    );
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.post('/api/campaigns', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { name, template_id, page_id, smtp_id, target_group_id } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO awareness_campaigns (tenant_id, name, template_id, page_id, smtp_id, target_group_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [tenantId, name, template_id, page_id, smtp_id, target_group_id]
    );
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/campaigns/:id', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query(
      `SELECT c.*, t.name as template_name, t.subject as template_subject, t.html_body as template_html,
        p.name as page_name, p.html_content as page_html,
        s.name as smtp_name, s.host as smtp_host,
        g.name as group_name
       FROM awareness_campaigns c
       LEFT JOIN awareness_templates t ON c.template_id = t.id
       LEFT JOIN awareness_landing_pages p ON c.page_id = p.id
       LEFT JOIN awareness_smtp s ON c.smtp_id = s.id
       LEFT JOIN awareness_groups g ON c.target_group_id = g.id
       WHERE c.id = $1 AND c.tenant_id = $2`,
      [req.params.id, tenantId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.put('/api/campaigns/:id', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { name, template_id, page_id, smtp_id, target_group_id, status } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (template_id !== undefined) { fields.push(`template_id = $${idx++}`); values.push(template_id); }
    if (page_id !== undefined) { fields.push(`page_id = $${idx++}`); values.push(page_id); }
    if (smtp_id !== undefined) { fields.push(`smtp_id = $${idx++}`); values.push(smtp_id); }
    if (target_group_id !== undefined) { fields.push(`target_group_id = $${idx++}`); values.push(target_group_id); }
    if (status !== undefined) { fields.push(`status = $${idx++}`); values.push(status); }
    if (fields.length === 0) return res.status(400).json({ success: false, error: 'No fields to update' });
    values.push(req.params.id, tenantId);
    const { rows } = await pool.query(
      `UPDATE awareness_campaigns SET ${fields.join(', ')}, launch_date = CASE WHEN $${idx} = 'running' AND launch_date IS NULL THEN NOW() ELSE launch_date END WHERE id = $${idx + 1} AND tenant_id = $${idx + 2} RETURNING *`,
      [...values, req.params.id, tenantId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.delete('/api/campaigns/:id', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rowCount } = await pool.query('DELETE FROM awareness_campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (rowCount === 0) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: { deleted: true }, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// Launch campaign
app.post('/api/campaigns/:id/launch', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query(
      `UPDATE awareness_campaigns SET status = 'running', launch_date = COALESCE(launch_date, NOW()), sent_count = COALESCE((SELECT COUNT(*) FROM awareness_users WHERE group_id = awareness_campaigns.target_group_id), 0) WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, tenantId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// Complete campaign
app.post('/api/campaigns/:id/complete', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query(
      `UPDATE awareness_campaigns SET status = 'completed', completed_date = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, tenantId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Campaign not found' });
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// CAMPAIGN RESULTS
// =====================================================================
app.get('/api/campaigns/:id/results', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query(
      `SELECT r.*, u.email, u.first_name, u.last_name
       FROM awareness_results r
       LEFT JOIN awareness_users u ON r.user_id = u.id
       WHERE r.campaign_id = $1 AND r.tenant_id = $2
       ORDER BY r.created_at DESC`,
      [req.params.id, tenantId]
    );
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.get('/api/campaigns/:id/summary', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT * FROM awareness_campaigns WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
    if (!rows[0]) return res.status(404).json({ success: false, error: 'Campaign not found' });
    const c = rows[0];
    res.json({
      success: true,
      data: {
        id: c.id,
        name: c.name,
        status: c.status,
        total_sent: parseInt(c.sent_count) || 0,
        total_opened: parseInt(c.opened_count) || 0,
        total_clicked: parseInt(c.clicked_count) || 0,
        total_submitted: parseInt(c.submitted_count) || 0,
        total_reported: parseInt(c.reported_count) || 0,
        open_rate: c.sent_count > 0 ? Math.round((parseInt(c.opened_count) / parseInt(c.sent_count)) * 100) : 0,
        click_rate: c.sent_count > 0 ? Math.round((parseInt(c.clicked_count) / parseInt(c.sent_count)) * 100) : 0,
        phish_prone: c.sent_count > 0 ? Math.round(((parseInt(c.clicked_count) + parseInt(c.submitted_count)) / parseInt(c.sent_count)) * 100) : 0,
        report_rate: c.sent_count > 0 ? Math.round((parseInt(c.reported_count) / parseInt(c.sent_count)) * 100) : 0,
        launch_date: c.launch_date,
        completed_date: c.completed_date
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// TRAINING MODULES
// =====================================================================
app.get('/api/training', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows } = await pool.query('SELECT * FROM awareness_training_modules WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
    res.json({ success: true, data: rows, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

app.post('/api/training', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { title, type, duration, assigned } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO awareness_training_modules (tenant_id, title, type, duration, assigned_to) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tenantId, title, type || 'video', duration || 0, assigned || []]
    );
    res.json({ success: true, data: rows[0], timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// DASHBOARD / STATS
// =====================================================================
app.get('/api/dashboard', DepartmentScope.middleware(), async (req, res) => {
  try {
    const tenantId = req.tenantContext?.tenantId || 'tenant1';
    const { rows: stats } = await pool.query(`
      SELECT
        COUNT(*)::int as total_campaigns,
        COALESCE(SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END), 0)::int as active_campaigns,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0)::int as completed_campaigns,
        COALESCE(SUM(sent_count), 0)::int as total_sent,
        COALESCE(SUM(opened_count), 0)::int as total_opened,
        COALESCE(SUM(clicked_count), 0)::int as total_clicked,
        COALESCE(SUM(submitted_count), 0)::int as total_submitted,
        COALESCE(SUM(reported_count), 0)::int as total_reported
      FROM awareness_campaigns WHERE tenant_id = $1
    `, [tenantId]);
    const s = stats[0];
    const sent = parseInt(s.total_sent) || 0;
    res.json({
      success: true,
      data: {
        ...s,
        open_rate: sent > 0 ? Math.round((parseInt(s.total_opened) / sent) * 100) : 0,
        click_rate: sent > 0 ? Math.round((parseInt(s.total_clicked) / sent) * 100) : 0,
        phish_prone_percentage: sent > 0 ? Math.round(((parseInt(s.total_clicked) + parseInt(s.total_submitted)) / sent) * 100) : 0,
        total_users: (await pool.query('SELECT COUNT(*)::int as cnt FROM awareness_users WHERE tenant_id = $1', [tenantId])).rows[0].cnt,
        total_templates: (await pool.query('SELECT COUNT(*)::int as cnt FROM awareness_templates WHERE tenant_id = $1', [tenantId])).rows[0].cnt,
        total_training: (await pool.query('SELECT COUNT(*)::int as cnt FROM awareness_training_modules WHERE tenant_id = $1', [tenantId])).rows[0].cnt
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, timestamp: new Date().toISOString() });
  }
});

// =====================================================================
// START
// =====================================================================
async function start() {
  try {
    await initializeDatabase();
    await seedData();
    app.listen(PORT, () => {
      console.log(`Awareness Platform service running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start awareness service:', err);
    process.exit(1);
  }
}

start();
