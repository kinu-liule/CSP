-- CyberSec Platform - Unified Database Schema
-- Generated from prompt specifications for all 21 services
-- PostgreSQL 16

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CORE TABLES (from API Gateway)
-- ============================================

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  plan VARCHAR(50) DEFAULT 'basic',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  key_hash VARCHAR(255) NOT NULL,
  scopes TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  rules JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_logs (
  id SERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  service VARCHAR(50),
  endpoint VARCHAR(255),
  status_code INT,
  ip_address INET,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- IAM SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret_encrypted TEXT,
  status VARCHAR(20) DEFAULT 'active',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  permissions TEXT[] DEFAULT '{}',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  token_hash VARCHAR(255) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sso_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  provider VARCHAR(50),
  config_encrypted JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  details JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- WAF SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS waf_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  pattern_type VARCHAR(50),
  pattern TEXT NOT NULL,
  target VARCHAR(50),
  action VARCHAR(20) DEFAULT 'block',
  enabled BOOLEAN DEFAULT true,
  match_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waf_blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  ip_address INET NOT NULL,
  reason VARCHAR(255),
  blocked_by_rule UUID REFERENCES waf_rules(id),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waf_attacks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  rule_id UUID REFERENCES waf_rules(id),
  attacker_ip INET NOT NULL,
  attack_type VARCHAR(100),
  target_url VARCHAR(500),
  matched_pattern TEXT,
  request_headers JSONB,
  request_body TEXT,
  blocked BOOLEAN DEFAULT true,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS waf_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  ip_address INET,
  user_agent_pattern VARCHAR(500),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- NGFW SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS ngfw_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  action VARCHAR(20) NOT NULL,
  source_ip CIDR[],
  dest_ip CIDR[],
  source_port INT[],
  dest_port INT[],
  protocol VARCHAR(20),
  application VARCHAR(100),
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ngfw_geo_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  country_code CHAR(2) NOT NULL,
  action VARCHAR(20) DEFAULT 'deny',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ngfw_traffic_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  source_ip INET NOT NULL,
  dest_ip INET NOT NULL,
  source_port INT,
  dest_port INT,
  protocol VARCHAR(20),
  action VARCHAR(20),
  rule_id UUID REFERENCES ngfw_rules(id),
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ngfw_ips_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  signature_id VARCHAR(100),
  severity VARCHAR(20),
  source_ip INET,
  dest_ip INET,
  description TEXT,
  action_taken VARCHAR(50),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SIEM/XDR SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS siem_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  event_id UUID DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20),
  raw_event JSONB NOT NULL,
  normalized_event JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS siem_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20),
  status VARCHAR(20) DEFAULT 'open',
  attack_tactic VARCHAR(100),
  source_events UUID[],
  assigned_to UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS correlation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  rule_logic JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  severity_override VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS xdr_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  incident_id UUID REFERENCES siem_incidents(id),
  detection_method VARCHAR(50),
  affected_assets UUID[],
  response_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- VULNERABILITY SCANNER TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS vuln_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  asset_id UUID,
  scan_type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'pending',
  vulnerabilities_found INT DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  cve_id VARCHAR(50),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  cvss_score DECIMAL(3,1),
  cvss_vector VARCHAR(100),
  epss_score DECIMAL(5,4),
  severity VARCHAR(20),
  exploit_available BOOLEAN DEFAULT false,
  kev_catalog BOOLEAN DEFAULT false,
  status VARCHAR(20) DEFAULT 'open',
  discovered_at TIMESTAMP DEFAULT NOW(),
  patched_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS asset_vulnerabilities (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  asset_id UUID,
  vuln_id UUID REFERENCES vulnerabilities(id),
  first_seen TIMESTAMP DEFAULT NOW(),
  last_seen TIMESTAMP DEFAULT NOW(),
  occurrences INT DEFAULT 1
);

CREATE TABLE IF NOT EXISTS patch_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  vuln_id UUID REFERENCES vulnerabilities(id),
  asset_id UUID,
  patch_id VARCHAR(255),
  status VARCHAR(20),
  sla_deadline DATE,
  applied_at TIMESTAMP
);

-- ============================================
-- FRAUD DETECTION TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS fraud_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID,
  transaction_id VARCHAR(255),
  risk_score DECIMAL(5,2),
  alert_type VARCHAR(100),
  severity VARCHAR(20),
  status VARCHAR(20) DEFAULT 'open',
  event_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fraud_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  conditions JSONB NOT NULL,
  action VARCHAR(50),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fraud_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  entity_type VARCHAR(50),
  entity_value VARCHAR(255) NOT NULL,
  reason TEXT,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fraud_scores (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID,
  entity_id VARCHAR(255),
  score DECIMAL(5,2),
  factors JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- AWARENESS PLATFORM TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS awareness_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  status VARCHAR(20) DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  content_url VARCHAR(500),
  duration_minutes INT,
  quiz_questions JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_training (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID NOT NULL,
  course_id UUID REFERENCES training_courses(id),
  campaign_id UUID REFERENCES awareness_campaigns(id),
  status VARCHAR(20) DEFAULT 'assigned',
  quiz_score DECIMAL(5,2),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS phishing_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  campaign_id UUID REFERENCES awareness_campaigns(id),
  template_name VARCHAR(255),
  target_users UUID[],
  emails_sent INT DEFAULT 0,
  clicks_count INT DEFAULT 0,
  credentials_submitted INT DEFAULT 0,
  reported_count INT DEFAULT 0,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS human_risk_scores (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID NOT NULL,
  risk_score DECIMAL(5,2),
  contributing_factors JSONB,
  calculated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- GRC SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS grc_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  inherent_score DECIMAL(5,2),
  residual_score DECIMAL(5,2),
  likelihood INT,
  impact INT,
  owner VARCHAR(255),
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grc_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  control_id VARCHAR(50) NOT NULL,
  framework VARCHAR(50),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'compliant',
  evidence JSONB,
  last_assessed TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grc_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  audit_name VARCHAR(255) NOT NULL,
  framework VARCHAR(50),
  auditor VARCHAR(255),
  status VARCHAR(20) DEFAULT 'planned',
  findings_count INT DEFAULT 0,
  start_date DATE,
  end_date DATE,
  report_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grc_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  title VARCHAR(255) NOT NULL,
  version VARCHAR(20) DEFAULT '1.0',
  content TEXT,
  mandatory BOOLEAN DEFAULT true,
  acceptance_required BOOLEAN DEFAULT false,
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grc_user_attestations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID NOT NULL,
  policy_id UUID REFERENCES grc_policies(id),
  accepted_at TIMESTAMP DEFAULT NOW(),
  ip_address INET
);

-- ============================================
-- ASSET MANAGEMENT TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  ip_address INET,
  mac_address VARCHAR(17),
  os VARCHAR(100),
  owner VARCHAR(255),
  tags TEXT[] DEFAULT '{}',
  criticality VARCHAR(20) DEFAULT 'medium',
  status VARCHAR(20) DEFAULT 'active',
  cloud_provider VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  policy_name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL,
  details JSONB,
  checked_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- CSPM SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS cspm_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  cloud_provider VARCHAR(20) NOT NULL,
  account_id VARCHAR(255) NOT NULL,
  account_name VARCHAR(255),
  credentials_encrypted TEXT NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cspm_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  account_id UUID REFERENCES cspm_accounts(id),
  finding_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  compliance_standard VARCHAR(50),
  status VARCHAR(20) DEFAULT 'open',
  remediation TEXT,
  discovered_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cspm_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  cloud_provider VARCHAR(20),
  policy_type VARCHAR(50),
  rules JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cspm_compliance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  account_id UUID REFERENCES cspm_accounts(id),
  standard VARCHAR(50),
  score DECIMAL(5,2),
  checked_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- EDR SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS edr_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  hostname VARCHAR(255) NOT NULL,
  ip_address INET,
  os VARCHAR(100),
  os_version VARCHAR(100),
  agent_version VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  last_checkin TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edr_telemetry (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  agent_id UUID REFERENCES edr_agents(id),
  event_type VARCHAR(50),
  event_data JSONB NOT NULL,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edr_detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  agent_id UUID REFERENCES edr_agents(id),
  detection_type VARCHAR(100),
  severity VARCHAR(20),
  rule_id VARCHAR(255),
  event_data JSONB,
  response_action VARCHAR(50),
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS edr_response_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  agent_id UUID REFERENCES edr_agents(id),
  detection_id UUID REFERENCES edr_detections(id),
  action_type VARCHAR(50),
  status VARCHAR(20),
  result JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- THREAT INTEL TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS threat_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  feed_type VARCHAR(50),
  url VARCHAR(500),
  api_key_encrypted TEXT,
  enabled BOOLEAN DEFAULT true,
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS threat_iocs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  ioc_type VARCHAR(50) NOT NULL,
  ioc_value VARCHAR(500) NOT NULL,
  threat_type VARCHAR(100),
  severity VARCHAR(20),
  confidence_score INT,
  mitre_tactic VARCHAR(100),
  mitre_technique VARCHAR(100),
  source_feed UUID REFERENCES threat_feeds(id),
  first_seen TIMESTAMP,
  last_seen TIMESTAMP DEFAULT NOW(),
  tags TEXT[],
  UNIQUE(tenant_id, ioc_type, ioc_value)
);

CREATE TABLE IF NOT EXISTS ioc_matches (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  ioc_id UUID REFERENCES threat_iocs(id),
  matched_in VARCHAR(50),
  matched_at TIMESTAMP DEFAULT NOW(),
  alert_generated BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS threat_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255),
  description TEXT,
  related_iocs UUID[],
  mitre_tactics TEXT[],
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SOAR SERVICE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS soar_playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  workflow JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  version INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS soar_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  severity VARCHAR(20),
  status VARCHAR(20) DEFAULT 'open',
  incident_id UUID,
  assigned_to UUID,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS soar_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  playbook_id UUID REFERENCES soar_playbooks(id),
  case_id UUID REFERENCES soar_cases(id),
  status VARCHAR(20),
  execution_log JSONB,
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS soar_connectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  connector_type VARCHAR(50),
  config_encrypted JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- DATA SECURITY TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS data_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  location VARCHAR(255),
  classification VARCHAR(50),
  data_types TEXT[] DEFAULT '{}',
  encryption_status VARCHAR(20) DEFAULT 'unknown',
  owner VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dlp_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  rules JSONB NOT NULL,
  action VARCHAR(20) DEFAULT 'alert',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  asset_id UUID REFERENCES data_assets(id),
  policy_id UUID REFERENCES dlp_policies(id),
  violation_type VARCHAR(100),
  severity VARCHAR(20),
  content_excerpt TEXT,
  action_taken VARCHAR(20),
  status VARCHAR(20) DEFAULT 'open',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  key_id VARCHAR(255) NOT NULL,
  key_provider VARCHAR(50),
  algorithm VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- PASSWORD MANAGER TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS password_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID NOT NULL,
  title VARCHAR(255) NOT NULL,
  username VARCHAR(255),
  password_encrypted TEXT NOT NULL,
  url VARCHAR(500),
  notes_encrypted TEXT,
  category VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shared_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  vault_entry_id UUID REFERENCES password_vault(id),
  share_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  max_views INT DEFAULT 1,
  view_count INT DEFAULT 0,
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vault_audit (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID NOT NULL,
  action VARCHAR(50),
  entry_id UUID REFERENCES password_vault(id),
  ip_address INET,
  user_agent TEXT,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS breach_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID NOT NULL,
  breach_source VARCHAR(255),
  affected_entries INT,
  notified_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- BUSINESS CONTINUITY TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS bcp_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  criticality VARCHAR(20) DEFAULT 'medium',
  rto_minutes INT NOT NULL,
  rpo_minutes INT NOT NULL,
  owner VARCHAR(255),
  dependencies TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bcp_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  process_id UUID REFERENCES bcp_processes(id),
  name VARCHAR(255) NOT NULL,
  version VARCHAR(20) DEFAULT '1.0',
  content JSONB NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bcp_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  plan_id UUID REFERENCES bcp_plans(id),
  test_type VARCHAR(50),
  scheduled_date DATE,
  completed_date DATE,
  result VARCHAR(20),
  findings TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bcp_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  process_id UUID REFERENCES bcp_processes(id),
  incident_name VARCHAR(255),
  severity VARCHAR(20),
  activated_plan_id UUID REFERENCES bcp_plans(id),
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- ============================================
-- DEVSECOPS TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS devsecops_pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  ci_cd_platform VARCHAR(50),
  repo_url VARCHAR(500),
  webhook_secret_encrypted TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS security_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  pipeline_id UUID REFERENCES devsecops_pipelines(id),
  scan_type VARCHAR(50) NOT NULL,
  target VARCHAR(500),
  status VARCHAR(20) DEFAULT 'pending',
  findings_count INT DEFAULT 0,
  severity_breakdown JSONB,
  scan_results JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployment_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  rules JSONB NOT NULL,
  enforcement_mode VARCHAR(20) DEFAULT 'audit',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deployment_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  pipeline_id UUID REFERENCES devsecops_pipelines(id),
  deployment_id VARCHAR(255),
  gate_status VARCHAR(20),
  policy_results JSONB,
  gated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- DECEPTION/HONEYPOT TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS honeypots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  ip_address INET NOT NULL,
  port INT NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  config JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS honeytokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  token_type VARCHAR(50),
  token_value_encrypted TEXT NOT NULL,
  decoy_location TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS attack_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  honeypot_id UUID REFERENCES honeypots(id),
  honeytoken_id UUID REFERENCES honeytokens(id),
  attacker_ip INET NOT NULL,
  attacker_port INT,
  attack_type VARCHAR(100),
  ttp_mapping TEXT[],
  session_data JSONB,
  severity VARCHAR(20),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- SECURITY DATA LAKE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS security_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  event_id UUID DEFAULT gen_random_uuid(),
  source_service VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20),
  timestamp TIMESTAMP DEFAULT NOW(),
  source_ip INET,
  destination_ip INET,
  source_port INT,
  dest_port INT,
  protocol VARCHAR(20),
  event_data JSONB NOT NULL,
  raw_event JSONB,
  tags TEXT[]
);

CREATE TABLE IF NOT EXISTS data_lake_retention (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  data_type VARCHAR(50),
  retention_days INT DEFAULT 365,
  archive_location VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_lake_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),
  user_id UUID,
  query_text TEXT NOT NULL,
  executed_at TIMESTAMP DEFAULT NOW(),
  result_count INT
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_waf_rules_tenant ON waf_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ngfw_rules_tenant ON ngfw_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_siem_events_tenant_time ON siem_events(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_tenant ON vulnerabilities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_tenant ON fraud_alerts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_awareness_tenant ON awareness_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_grc_tenant ON grc_risks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cspm_tenant ON cspm_findings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_edr_tenant ON edr_agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_threat_iocs_tenant_value ON threat_iocs(tenant_id, ioc_value);
CREATE INDEX IF NOT EXISTS idx_soar_tenant ON soar_playbooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_data_lake_tenant_time ON security_events(tenant_id, timestamp DESC);

-- ============================================
-- INITIAL DATA
-- ============================================

-- Create default tenant
INSERT INTO tenants (id, name, plan) VALUES 
('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'enterprise')
ON CONFLICT DO NOTHING;

-- Create default admin user (password: admin123)
INSERT INTO users (id, tenant_id, email, password_hash, first_name, last_name, role, status)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'admin@cybersec.com',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- bcrypt hash for 'admin123'
  'Admin',
  'User',
  'admin',
  'active'
) ON CONFLICT DO NOTHING;

-- Create system roles
INSERT INTO roles (tenant_id, name, permissions, is_system) VALUES
('00000000-0000-0000-0000-000000000001', 'admin', ARRAY['*'], true),
('00000000-0000-0000-0000-000000000001', 'analyst', ARRAY['read', 'write', 'investigate'], true),
('00000000-0000-0000-0000-000000000001', 'user', ARRAY['read'], true),
('00000000-0000-0000-0000-000000000001', 'auditor', ARRAY['read', 'audit'], true)
ON CONFLICT DO NOTHING;
