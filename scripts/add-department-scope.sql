-- =========================================================
-- Horizontal Access Control: Add department_id to all services
-- Run: psql -U cybersec -d cybersec_platform -f scripts/add-department-scope.sql
-- =========================================================

-- IAM
ALTER TABLE users ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- WAF
ALTER TABLE waf_rules ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE waf_requests ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE waf_ip_blacklist ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- NGFW
ALTER TABLE firewall_rules ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE firewall_policies ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE firewall_nat_rules ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE firewall_vpn ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- SIEM
ALTER TABLE siem_logs ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE siem_rules ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE siem_alerts ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Vulnerability Scanner
ALTER TABLE vuln_scans ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE vuln_findings ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE vuln_templates ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE vuln_reports ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Fraud Detection
ALTER TABLE fraud_rules ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE fraud_transactions ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE fraud_cases ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Awareness
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE training_modules ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE templates ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- GRC
ALTER TABLE policies ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE controls ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE risks ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE audits ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE findings ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Asset Management
ALTER TABLE assets ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE asset_groups ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- CSPM
ALTER TABLE cloud_accounts ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE cloud_findings ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- EDR
ALTER TABLE endpoints ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE endpoint_alerts ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE endpoint_policies ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Threat Intel
ALTER TABLE threat_feeds ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE threat_indicators ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE threat_reports ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- SOAR
ALTER TABLE playbooks ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Data Security
ALTER TABLE data_classifications ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE data_policies ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE data_incidents ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Data Lake
ALTER TABLE datasets ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE dataset_queries ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- XDR
ALTER TABLE xdr_alerts ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE xdr_cases ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE xdr_detections ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- DevSecOps
ALTER TABLE devsecops_pipelines ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE devsecops_scans ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE devsecops_vulnerabilities ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Deception
ALTER TABLE deception_decoys ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE deception_honeypots ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE deception_engagements ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Password Manager
ALTER TABLE password_vaults ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE password_entries ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Business Continuity
ALTER TABLE bc_plans ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE bc_tests ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE bc_incidents ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);
ALTER TABLE bc_processes ADD COLUMN IF NOT EXISTS department_id VARCHAR(64);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dept_assets ON assets(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_waf_rules ON waf_rules(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_ngfw_rules ON firewall_rules(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_siem_alerts ON siem_alerts(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_vuln_findings ON vuln_findings(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_fraud_cases ON fraud_cases(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_campaigns ON campaigns(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_policies ON policies(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_endpoints ON endpoints(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_threat_indicators ON threat_indicators(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_soar_incidents ON incidents(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_xdr_alerts ON xdr_alerts(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_pipelines ON devsecops_pipelines(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_honeypots ON deception_honeypots(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_vaults ON password_vaults(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_bc_plans ON bc_plans(department_id);

SELECT 'Department scope migration completed' as status;
