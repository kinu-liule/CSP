-- =========================================================
-- HUMAN RISK AWARENESS PLATFORM - FULL SCHEMA
-- =========================================================

-- Core Tables
CREATE TABLE IF NOT EXISTS departments (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  content JSONB,
  target_users TEXT[],
  schedule JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_targets (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS simulations (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  campaign_id VARCHAR(50),
  type VARCHAR(50) NOT NULL,
  target_user VARCHAR(50) NOT NULL,
  payload JSONB,
  result VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS simulation_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  campaign_id VARCHAR(50),
  event_type VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_modules (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  content JSONB,
  duration INT,
  certification BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS incidents (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  type VARCHAR(50),
  severity VARCHAR(20),
  description TEXT,
  status VARCHAR(20) DEFAULT 'open',
  triage_result VARCHAR(50),
  response_action JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  alert_type VARCHAR(50),
  severity VARCHAR(20),
  metadata JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_scores (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  score DECIMAL(5,2),
  factors JSONB,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_history (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  score DECIMAL(5,2),
  factors JSONB,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS templates (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  type VARCHAR(50),
  name VARCHAR(255),
  content JSONB,
  locale VARCHAR(10) DEFAULT 'en',
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS landing_pages (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  campaign_id VARCHAR(50),
  template_id VARCHAR(50),
  config JSONB,
  analytics JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  action VARCHAR(100),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RBAC Tables
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  permissions TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  role_id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auth Tables
CREATE TABLE IF NOT EXISTS api_tokens (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(50) PRIMARY KEY,
  user_id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign Execution Tables
CREATE TABLE IF NOT EXISTS campaign_executions (
  id SERIAL PRIMARY KEY,
  campaign_id VARCHAR(50) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL,
  status VARCHAR(20),
  results JSONB,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaign_deliveries (
  id SERIAL PRIMARY KEY,
  execution_id INT,
  user_id VARCHAR(50),
  channel VARCHAR(50),
  status VARCHAR(20),
  delivered_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simulation Payloads
CREATE TABLE IF NOT EXISTS payloads (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  type VARCHAR(50),
  name VARCHAR(255),
  data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- SAMPLE DATA
-- =========================================================

-- Sample Campaign
INSERT INTO campaigns (id, tenant_id, name, type, status, content)
VALUES (
  'camp1', 'tenant1', 'Phishing Awareness Q1', 'phishing', 'active',
  '{"subject": "Important: Update Your Account", "body": "Click here to verify", "landing_page": "cred_capture"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Sample Training Module
INSERT INTO training_modules (id, tenant_id, title, type, content, duration, certification)
VALUES (
  'mod1', 'tenant1', 'Phishing Recognition Basics', 'phishing',
  '{"lessons": ["What is phishing", "How to identify", "What to do"]}'::jsonb,
  30, FALSE
) ON CONFLICT (id) DO NOTHING;

-- Sample Department
INSERT INTO departments (id, tenant_id, name)
VALUES ('dept1', 'tenant1', 'Engineering')
ON CONFLICT (id) DO NOTHING;

-- Sample Template
INSERT INTO templates (id, tenant_id, type, name, content)
VALUES (
  'tpl1', 'tenant1', 'email', 'Basic Phishing Template',
  '{"subject": "{{subject}}", "body": "{{body}}", "sender": "{{sender}}"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

SELECT 'Full schema created successfully' as status;
