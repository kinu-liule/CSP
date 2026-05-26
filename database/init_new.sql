-- Cybersec Platform Database Schema (Complete)
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================
-- CORE TABLES
-- =========================================================

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    plan VARCHAR(50) DEFAULT 'basic',
    active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{"dataRetentionDays": 30, "maxRequestsPerSecond": 100, "enabledModules": ["waf", "ngfw"], "alertChannels": []}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'user_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    roles TEXT[] DEFAULT ARRAY['user'],
    department_id INTEGER,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    permissions TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, name)
);

-- User Roles junction table
CREATE TABLE IF NOT EXISTS user_roles (
    user_id VARCHAR(50) REFERENCES users(id),
    role_id VARCHAR(50) REFERENCES roles(id),
    PRIMARY KEY (user_id, role_id)
);

-- Departments
CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- AWARENESS PLATFORM TABLES
-- =========================================================

-- Campaigns table (enhanced)
CREATE TABLE IF NOT EXISTS campaigns (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
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
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) REFERENCES users(id),
    campaign_id VARCHAR(50) REFERENCES campaigns(id),
    event_type VARCHAR(50),
    channel VARCHAR(20) DEFAULT 'email',
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Training modules
CREATE TABLE IF NOT EXISTS training_modules (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    content JSONB,
    duration INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User training
CREATE TABLE IF NOT EXISTS user_training (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id),
    module_id VARCHAR(50) NOT NULL REFERENCES training_modules(id),
    status VARCHAR(20) DEFAULT 'assigned',
    score INT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk scores
CREATE TABLE IF NOT EXISTS risk_scores (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) NOT NULL REFERENCES users(id),
    score DECIMAL(5,2),
    factors JSONB,
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email Templates
CREATE TABLE IF NOT EXISTS templates (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    type VARCHAR(50) NOT NULL DEFAULT 'email',
    name VARCHAR(255) NOT NULL,
    content JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Landing Pages
CREATE TABLE IF NOT EXISTS landing_pages (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sending Profiles (SMTP configurations)
CREATE TABLE IF NOT EXISTS sending_profiles (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Groups
CREATE TABLE IF NOT EXISTS groups (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group Members
CREATE TABLE IF NOT EXISTS group_members (
    id SERIAL PRIMARY KEY,
    group_id VARCHAR(50) NOT NULL REFERENCES groups(id),
    user_id VARCHAR(50) REFERENCES users(id),
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
    campaign_id VARCHAR(50) NOT NULL REFERENCES campaigns(id),
    target_type VARCHAR(50) NOT NULL,
    target_id VARCHAR(50),
    channel VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign Deliveries
CREATE TABLE IF NOT EXISTS campaign_deliveries (
    id VARCHAR(50) PRIMARY KEY,
    campaign_id VARCHAR(50) NOT NULL REFERENCES campaigns(id),
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
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) REFERENCES users(id),
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
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) REFERENCES users(id),
    alert_type VARCHAR(100),
    severity VARCHAR(20),
    metadata JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- External Entities (suppliers, public bodies, etc.)
CREATE TABLE IF NOT EXISTS external_entities (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    entity_type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employee Groups (for advanced targeting)
CREATE TABLE IF NOT EXISTS employee_groups (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    group_type VARCHAR(50) DEFAULT 'department',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- OTHER PLATFORM TABLES
-- =========================================================

-- WAF Rules table
CREATE TABLE IF NOT EXISTS waf_rules (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'waf_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    pattern VARCHAR(500) NOT NULL,
    action VARCHAR(20) DEFAULT 'block',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- NGFW Rules table
CREATE TABLE IF NOT EXISTS ngfw_rules (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'ngfw_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    source_ip VARCHAR(100),
    destination_port INTEGER,
    protocol VARCHAR(20),
    action VARCHAR(20) DEFAULT 'allow',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SIEM Events table
CREATE TABLE IF NOT EXISTS siem_events (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'event_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    source VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium',
    description TEXT,
    raw_data JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Vulnerability Scans table
CREATE TABLE IF NOT EXISTS vuln_scans (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'scan_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    target VARCHAR(500) NOT NULL,
    scan_type VARCHAR(50) DEFAULT 'web',
    status VARCHAR(20) DEFAULT 'pending',
    results JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Fraud Alerts table
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'fraud_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) REFERENCES users(id),
    alert_type VARCHAR(100) NOT NULL,
    risk_score DECIMAL(3,2),
    details JSONB,
    status VARCHAR(20) DEFAULT 'open',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- GRC Controls table
CREATE TABLE IF NOT EXISTS grc_controls (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'ctrl_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    framework VARCHAR(100),
    status VARCHAR(20) DEFAULT 'compliant',
    evidence JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================
-- SAMPLE DATA
-- =========================================================

-- Insert default tenant
INSERT INTO tenants (id, name, domain, plan, settings)
VALUES ('tenant1', 'Default Tenant', 'default.cybersec.com', 'enterprise', '{"dataRetentionDays": 90, "maxRequestsPerSecond": 1000, "enabledModules": ["waf", "ngfw", "siem-soar", "vuln-scanner", "fraud-detection", "awareness", "grc"], "alertChannels": [{"type": "email", "config": {"email": "admin@cybersec.com"}}]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert default admin user (password: admin123)
INSERT INTO users (id, tenant_id, username, email, password_hash, roles)
VALUES ('user_admin', 'tenant1', 'admin', 'admin@cybersec.com', '$2b$10$rG8xGxvXZK7xhF7GxZ8H.8GGQxvXZK7xhF7GxZ8H.8GGQxvX', ARRAY['admin'])
ON CONFLICT (id) DO NOTHING;

-- Insert sample departments
INSERT INTO departments (tenant_id, name) VALUES 
('tenant1', 'IT'),
('tenant1', 'Finance'),
('tenant1', 'HR'),
('tenant1', 'Sales'),
('tenant1', 'Executive')
ON CONFLICT DO NOTHING;

-- Insert sample email template
INSERT INTO templates (id, tenant_id, type, name, content)
VALUES ('tpl_1', 'tenant1', 'email', 'Office 365 Security Alert', 
  '{"subject": "Important: Unusual sign-in activity detected", "html": "<html><body><p>Dear {{.FirstName}},</p><p>We detected unusual sign-in activity on your account.</p><p>Please verify your identity: <a href=\"{{.URL}}\">Click here</a></p></body></html>", "text": "Please verify: {{.URL}}"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert sample landing page
INSERT INTO landing_pages (id, tenant_id, name, config)
VALUES ('lp_1', 'tenant1', 'Office 365 Login Page',
  '{"html": "<html><body><h1>Office 365 Login</h1><form><input type=\"text\" placeholder=\"Email\"><input type=\"password\" placeholder=\"Password\"><button>Sign in</button></form></body></html>", "capture_credentials": true, "capture_passwords": false, "redirect_url": "https://office.com"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert sample sending profile
INSERT INTO sending_profiles (id, tenant_id, name, config)
VALUES ('sp_1', 'tenant1', 'Default SMTP',
  '{"from_address": "security@company.com", "host": "smtp.gmail.com", "port": 587, "username": "security@company.com", "password": "password", "use_tls": true, "ignore_cert_errors": false}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Insert sample group
INSERT INTO groups (id, tenant_id, name, description)
VALUES ('grp_1', 'tenant1', 'All Employees', 'All company employees')
ON CONFLICT (id) DO NOTHING;

-- Insert sample group members
INSERT INTO group_members (group_id, email, first_name, last_name, position)
VALUES 
  ('grp_1', 'john.doe@company.com', 'John', 'Doe', 'Manager'),
  ('grp_1', 'jane.smith@company.com', 'Jane', 'Smith', 'Developer'),
  ('grp_1', 'bob.wilson@company.com', 'Bob', 'Wilson', 'Analyst')
ON CONFLICT (group_id, email) DO NOTHING;

-- =========================================================
-- INDEXES
-- =========================================================

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siem_events_tenant_time ON siem_events(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_vuln_scans_tenant ON vuln_scans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_tenant ON fraud_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_time ON audit_logs(tenant_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant ON campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_simulation_events_tenant ON simulation_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_simulation_events_campaign ON simulation_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_landing_pages_tenant ON landing_pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sending_profiles_tenant ON sending_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id);

SELECT 'Database initialized successfully!' as status;
