-- Complete Awareness Platform Schema (Gophish-style)

-- Campaigns table (enhanced)
CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'phishing',
  status VARCHAR(20) DEFAULT 'draft',
  content JSONB,
  target_users TEXT[],
  template_id VARCHAR(50),
  landing_page_id VARCHAR(50),
  sending_profile_id VARCHAR(50),
  url VARCHAR(500),
  launch_date TIMESTAMP,
  send_emails_by TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simulation events
CREATE TABLE IF NOT EXISTS simulation_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  campaign_id VARCHAR(50),
  event_type VARCHAR(50),
  channel VARCHAR(20) DEFAULT 'email',
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training modules
CREATE TABLE IF NOT EXISTS training_modules (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  content JSONB,
  duration INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User training
CREATE TABLE IF NOT EXISTS user_training (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  module_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'assigned',
  score INT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk scores
CREATE TABLE IF NOT EXISTS risk_scores (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  score DECIMAL(5,2),
  factors JSONB,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- NEW TABLES FOR GOPHISH FEATURES
-- =========================================================

-- Email Templates
CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'email',
  name VARCHAR(255) NOT NULL,
  content JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Landing Pages
CREATE TABLE IF NOT EXISTS landing_pages (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sending Profiles (SMTP configurations)
CREATE TABLE IF NOT EXISTS sending_profiles (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  config JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Groups
CREATE TABLE IF NOT EXISTS groups (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group Members
CREATE TABLE IF NOT EXISTS group_members (
  id SERIAL PRIMARY KEY,
  group_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  position VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, email)
);

-- Campaign Targeting
CREATE TABLE IF NOT EXISTS campaign_targeting (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id VARCHAR(50),
  channel VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign Deliveries
CREATE TABLE IF NOT EXISTS campaign_deliveries (
  id VARCHAR(50) PRIMARY KEY,
  campaign_id VARCHAR(50) NOT NULL,
  target_user_id VARCHAR(50),
  target_entity_id VARCHAR(50),
  target_email VARCHAR(255),
  target_phone VARCHAR(50),
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  type VARCHAR(100),
  severity VARCHAR(20) DEFAULT 'medium',
  description TEXT,
  triage_result TEXT,
  response_action TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  alert_type VARCHAR(100),
  severity VARCHAR(20),
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- External Entities (suppliers, public bodies, etc.)
CREATE TABLE IF NOT EXISTS external_entities (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employee Groups (for advanced targeting)
CREATE TABLE IF NOT EXISTS employee_groups (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  group_type VARCHAR(50) DEFAULT 'department',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- SAMPLE DATA
-- =========================================================

-- Sample email template
INSERT INTO templates (id, tenant_id, type, name, content)
VALUES ('tpl_1', 'tenant1', 'email', 'Office 365 Security Alert', 
  '{"subject": "Important: Unusual sign-in activity detected", "html": "<html><body><p>Dear {{.FirstName}},</p><p>We detected unusual sign-in activity on your account.</p><p>Please verify your identity: <a href=\"{{.URL}}\">Click here</a></p></body></html>", "text": "Please verify: {{.URL}}"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Sample landing page
INSERT INTO landing_pages (id, tenant_id, name, config)
VALUES ('lp_1', 'tenant1', 'Office 365 Login Page',
  '{"html": "<html><body><h1>Office 365 Login</h1><form><input type=\"text\" placeholder=\"Email\"><input type=\"password\" placeholder=\"Password\"><button>Sign in</button></form></body></html>", "capture_credentials": true, "capture_passwords": false, "redirect_url": "https://office.com"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Sample sending profile
INSERT INTO sending_profiles (id, tenant_id, name, config)
VALUES ('sp_1', 'tenant1', 'Default SMTP',
  '{"from_address": "security@company.com", "host": "smtp.gmail.com", "port": 587, "username": "security@company.com", "password": "password", "use_tls": true, "ignore_cert_errors": false}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Sample group
INSERT INTO groups (id, tenant_id, name, description)
VALUES ('grp_1', 'tenant1', 'All Employees', 'All company employees')
ON CONFLICT (id) DO NOTHING;

-- Sample group members
INSERT INTO group_members (group_id, email, first_name, last_name, position)
VALUES 
  ('grp_1', 'john.doe@company.com', 'John', 'Doe', 'Manager'),
  ('grp_1', 'jane.smith@company.com', 'Jane', 'Smith', 'Developer'),
  ('grp_1', 'bob.wilson@company.com', 'Bob', 'Wilson', 'Analyst')
ON CONFLICT (group_id, email) DO NOTHING;

-- Sample campaign
INSERT INTO campaigns (id, tenant_id, name, type, status, template_id, landing_page_id, sending_profile_id, url)
VALUES ('camp_1', 'tenant1', 'Q1 Phishing Test', 'phishing', 'active', 'tpl_1', 'lp_1', 'sp_1', 'http://localhost:3006/landing-pages/lp_1/capture')
ON CONFLICT (id) DO NOTHING;

SELECT 'Complete schema created successfully!' as status;
