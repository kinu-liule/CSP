-- Cybersec Platform Database Schema (Complete)
-- Run this directly in psql or pgAdmin

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenants
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

-- Users
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY DEFAULT 'user_' || uuid_generate_v4()::text,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    roles TEXT[] DEFAULT ARRAY['user'],
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP
);

-- Campaigns
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

-- Templates
CREATE TABLE IF NOT EXISTS templates (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    type VARCHAR(50) NOT NULL DEFAULT 'email',
    name VARCHAR(255) NOT NULL,
    content JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Landing pages
CREATE TABLE IF NOT EXISTS landing_pages (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sending profiles
CREATE TABLE IF NOT EXISTS sending_profiles (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Groups
CREATE TABLE IF NOT EXISTS groups (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Group members
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

-- Sample data
INSERT INTO tenants (id, name, domain, plan) VALUES ('tenant1', 'Default Tenant', 'default.cybersec.com', 'enterprise') ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, tenant_id, username, email, password_hash, roles) VALUES ('user_admin', 'tenant1', 'admin', 'admin@cybersec.com', '$2b$10$rG8xGxvXZK7xhF7GxZ8H.8GGQxvX', ARRAY['admin']) ON CONFLICT (id) DO NOTHING;

SELECT 'Database ready!' as status;
