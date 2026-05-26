-- ============================================
-- CyberSec Platform - Comprehensive Seed Data
-- ============================================

BEGIN;

-- ============================================
-- 1. ROLES (RBAC)
-- ============================================
INSERT INTO roles (id, tenant_id, name, permissions) VALUES
  ('role_admin',          'tenant1', 'Admin',            ARRAY['read','write','delete','manage_users','manage_roles','view_audit']),
  ('role_sec_analyst',   'tenant1', 'Security Analyst',  ARRAY['read','write','manage_alerts','view_events','view_incidents']),
  ('role_net_operator',  'tenant1', 'Network Operator',  ARRAY['read','write','manage_firewall','manage_vpn','view_logs']),
  ('role_compliance',    'tenant1', 'Compliance Officer', ARRAY['read','manage_audit','view_reports','manage_policies']),
  ('role_readonly',      'tenant1', 'Read Only',         ARRAY['read']),
  ('role_billing',       'tenant1', 'Billing Manager',   ARRAY['read','view_invoices','manage_payments']);

-- ============================================
-- 2. COMPLIANCE FRAMEWORKS
-- ============================================
INSERT INTO compliance_frameworks (id, tenant_id, name, version, description, requirements_count) VALUES
  ('fw_soc2',     'tenant1', 'SOC 2',      '2.0', 'Service Organization Control 2 - Trust Services Criteria', 65),
  ('fw_gdpr',     'tenant1', 'GDPR',       '4.0', 'General Data Protection Regulation - EU Data Privacy',     72),
  ('fw_iso27001', 'tenant1', 'ISO 27001',  '2022','Information Security Management System Standard',          58),
  ('fw_pci_dss',  'tenant1', 'PCI DSS',    '4.0', 'Payment Card Industry Data Security Standard',             45),
  ('fw_hipaa',    'tenant1', 'HIPAA',      '2024','Health Insurance Portability and Accountability Act',       52);

-- ============================================
-- 3. CONTROLS (linked to policies)
-- ============================================
INSERT INTO controls (id, tenant_id, policy_id, name, description, control_type, framework, status, implementation_status) VALUES
  ('ctrl_data_enc',      'tenant1', 'pol_001', 'Data Encryption at Rest',     'All sensitive data encrypted using AES-256',         'technical',  'SOC 2',     'active', 'implemented'),
  ('ctrl_access_rev',    'tenant1', 'pol_002', 'Access Review Quarterly',     'Quarterly review of all user access permissions',    'administrative', 'ISO27001','active', 'implemented'),
  ('ctrl_incident_resp', 'tenant1', 'pol_001', 'Incident Response Plan',      'Documented IRP with defined roles and procedures',   'administrative', 'GDPR',    'active', 'implemented'),
  ('ctrl_mfa',           'tenant1', 'pol_002', 'Multi-Factor Authentication', 'MFA enforced for all privileged accounts',           'technical',  'PCI DSS',   'active', 'implemented'),
  ('ctrl_audit_log',     'tenant1', 'pol_001', 'Audit Logging',               'All system events logged with tamper protection',    'technical',  'SOC 2',     'active', 'partial'),
  ('ctrl_backup',        'tenant1', 'pol_001', 'Data Backup & Recovery',      'Daily encrypted backups with quarterly DR tests',    'technical',  'HIPAA',     'active', 'implemented'),
  ('ctrl_vuln_scan',     'tenant1', 'pol_002', 'Vulnerability Scanning',      'Weekly automated vulnerability scanning',            'technical',  'PCI DSS',   'active', 'implemented'),
  ('ctrl_third_party',   'tenant1', 'pol_001', 'Third-Party Risk Management', 'Annual security assessment of all vendors',          'administrative', 'ISO27001','active', 'planned');

-- ============================================
-- 4. GRC CONTROLS
-- ============================================
INSERT INTO grc_controls (id, tenant_id, name, framework, status, evidence) VALUES
  ('ctrl_grc_enc',    'tenant1', 'Encryption Standard',       'SOC 2',    'compliant',  '{"policy_ref": "pol_001", "last_audit": "2026-04-15", "auditor": "Deloitte"}'),
  ('ctrl_grc_access', 'tenant1', 'Access Management',         'ISO27001', 'compliant',  '{"policy_ref": "pol_002", "users_reviewed": 142, "last_review": "2026-05-01"}'),
  ('ctrl_grc_gdpr',   'tenant1', 'GDPR Data Subject Rights',  'GDPR',     'non_compliant', '{"gap": "DSAR response time > 30 days", "remediation_plan": "Automate DSAR workflow"}'),
  ('ctrl_grc_pci',    'tenant1', 'PCI Cardholder Data',       'PCI DSS',  'compliant',  '{"scope": "payment-processing", "qsa": "Coalfire", "last_assessment": "2026-03-20"}');

-- ============================================
-- 5. COMPLIANCE SCORES
-- ============================================
INSERT INTO compliance_scores (tenant_id, framework_id, score) VALUES
  ('tenant1', 'fw_soc2',     92.50),
  ('tenant1', 'fw_gdpr',     78.30),
  ('tenant1', 'fw_iso27001', 88.00),
  ('tenant1', 'fw_pci_dss',  95.20),
  ('tenant1', 'fw_hipaa',    85.75);

-- ============================================
-- 6. AUDITS
-- ============================================
INSERT INTO audits (id, tenant_id, audit_type, scope, status, start_date, end_date, auditor, findings_count) VALUES
  ('audit_q1_2026', 'tenant1', 'internal', 'SOC 2 Type II - All trust criteria',                          'completed', '2026-02-01', '2026-03-15', 'Internal Audit Team',  3),
  ('audit_ext_01',  'tenant1', 'external', 'PCI DSS Annual Assessment - Cardholder Data Environment',     'in_progress', '2026-04-01', '2026-06-30', 'Coalfire',            0),
  ('audit_gdpr_01', 'tenant1', 'external', 'GDPR Compliance Audit - EU Data Processing',                 'planned',   '2026-07-01', '2026-08-15', 'KPMG',                0);

-- ============================================
-- 7. ASSETS
-- ============================================
INSERT INTO assets (id, tenant_id, name, asset_type, ip_address, hostname, os, owner, tags, vulnerability_count) VALUES
  ('asset_web_01',  'tenant1', 'Production Web Server',    'server',   '10.0.1.10',  'web01.cybersec.com',     'Ubuntu 22.04',   'security_analyst',  ARRAY['production','web','critical'],   2),
  ('asset_api_01',  'tenant1', 'API Gateway Server',       'server',   '10.0.1.11',  'api.cybersec.com',       'Ubuntu 22.04',   'security_analyst',  ARRAY['production','api','critical'],   1),
  ('asset_db_01',   'tenant1', 'Primary Database',         'database', '10.0.2.5',   'db01.cybersec.com',      'Debian 12',      'compliance_officer', ARRAY['production','database','critical'], 0),
  ('asset_app_01',  'tenant1', 'Customer Portal App',      'application', NULL,     'app.cybersec.com',       NULL,             'platform_admin',    ARRAY['production','web','high'],       1),
  ('asset_waf_01',  'tenant1', 'WAF Appliance',            'network',  '10.0.0.20',  'waf.cybersec.com',       'Ubuntu 22.04',   'network_operator',  ARRAY['security','network'],            0),
  ('asset_vpn_01',  'tenant1', 'VPN Concentrator',         'network',  '203.0.113.5','vpn.cybersec.com',       'OpenBSD 7.4',    'network_operator',  ARRAY['network','remote-access'],       0),
  ('asset_siem_01', 'tenant1', 'SIEM Collector',           'server',   '10.0.3.10',  'siem.cybersec.com',      'Ubuntu 22.04',   'security_analyst',  ARRAY['security','monitoring'],         0),
  ('asset_work_01', 'tenant1', 'Employee Laptop Pool',     'endpoint', '10.0.100.50','CORP-LT-050',             'Windows 11',     'support_agent',     ARRAY['endpoint','corp'],               0);

-- ============================================
-- 8. LOG SOURCES
-- ============================================
INSERT INTO log_sources (id, tenant_id, name, source_type, ip_address, port, protocol, format, enabled, events_count) VALUES
  ('ls_web_01',    'tenant1', 'Web Server Logs',    'nginx',     '10.0.1.10', 514, 'UDP', 'syslog',   true, 125000),
  ('ls_fw_01',     'tenant1', 'Firewall Logs',      'paloalto',  '10.0.0.1',  514, 'UDP', 'syslog',   true, 890000),
  ('ls_waf_01',    'tenant1', 'WAF Logs',           'modsec',    '10.0.0.20', 514, 'UDP', 'syslog',   true, 345000),
  ('ls_db_01',     'tenant1', 'Database Audit Logs', 'postgres', '10.0.2.5',  5432,'TCP', 'json',     true, 45000),
  ('ls_app_01',    'tenant1', 'Application Logs',    'custom',    '10.0.1.11', 5050,'TCP', 'json',     true, 98000),
  ('ls_vpn_01',    'tenant1', 'VPN Authentication',  'openbsd',   '203.0.113.5',514,'UDP', 'syslog',   true, 12000),
  ('ls_cloudtrail','tenant1', 'AWS CloudTrail',      'aws',       NULL,        443,  'TCP', 'json',     true, 560000);

-- ============================================
-- 9. EVENTS (core event store)
-- ============================================
INSERT INTO events (id, tenant_id, source_id, severity, event_type, source_ip, dest_ip, dest_port, user_id, message, tags) VALUES
  ('evt_0001', 'tenant1', 'ls_fw_01',  'high',   'FW_BLOCK',        '185.220.101.42',  '10.0.1.10', 443,  NULL,              'Blocked inbound connection from known bad IP',           ARRAY['firewall','blocked','c2']),
  ('evt_0002', 'tenant1', 'ls_waf_01', 'critical','WAF_SQLI',       '45.33.32.156',    '10.0.1.11', 80,   NULL,              'SQL injection attempt blocked on /api/login endpoint',   ARRAY['waf','sqli','blocked']),
  ('evt_0003', 'tenant1', 'ls_waf_01', 'high',   'WAF_XSS',         '91.121.87.34',    '10.0.1.11', 80,   NULL,              'Cross-site scripting attempt blocked on /search',         ARRAY['waf','xss','blocked']),
  ('evt_0004', 'tenant1', 'ls_web_01', 'medium', 'AUTH_FAIL',       '10.0.100.50',     '10.0.1.11', 443,  'user_admin',       'Multiple failed login attempts detected',                ARRAY['auth','brute-force']),
  ('evt_0005', 'tenant1', 'ls_db_01',  'low',    'DB_QUERY_SLOW',   '10.0.1.10',       '10.0.2.5',  5432, 'user_admin',       'Slow query detected on transactions table (>5s)',        ARRAY['database','performance']),
  ('evt_0006', 'tenant1', 'ls_vpn_01', 'medium', 'VPN_CONNECT',     '203.0.113.50',    '10.0.0.20', 500,  'network_operator', 'VPN tunnel established to remote site',                   ARRAY['vpn','connectivity']),
  ('evt_0007', 'tenant1', 'ls_app_01', 'high',   'APP_ERROR',       NULL,               NULL,         NULL, 'security_analyst', 'Application error in payment processing module',          ARRAY['application','error','payment']),
  ('evt_0008', 'tenant1', 'ls_fw_01',  'low',    'FW_ALLOW',        '10.0.1.0/24',     '10.0.2.0/24',5432,'billing_mgr',       'Allowed database traffic from web tier',                  ARRAY['firewall','allowed']),
  ('evt_0009', 'tenant1', 'ls_cloudtrail','critical','IAM_KEY_ROTATE','72.14.192.10',   NULL,        NULL, 'cloud_admin',      'AWS IAM access key rotated outside policy window',       ARRAY['aws','iam','compliance']),
  ('evt_0010', 'tenant1', 'ls_web_01', 'critical','MALWARE_DETECT',  '10.0.100.55',     '10.0.1.10', 443,  'support_agent',    'Malware signature detected on endpoint CORP-LT-055',      ARRAY['malware','endpoint','critical']);

-- ============================================
-- 10. INCIDENTS
-- ============================================
INSERT INTO incidents (id, tenant_id, user_id, type, severity, description, status, triage_result, response_action) VALUES
  ('inc_0001', 'tenant1', 'security_analyst', 'malware',      'critical', 'Malware detected on endpoint CORP-LT-055 - potential ransomware','open',    'confirmed',          '{"isolated": true, "contained_at": "2026-05-25T14:30:00Z", "forensic_collection": true}'),
  ('inc_0002', 'tenant1', 'security_analyst', 'web_attack',   'high',     'SQL injection attempt on /api/login from 45.33.32.156',       'triage',  'investigating',      '{"waf_blocked": true, "ip_blocked": true, "affected_endpoints": ["/api/login"]}'),
  ('inc_0003', 'tenant1', 'security_analyst', 'phishing',     'medium',   'Employee reported suspicious email claiming to be from IT',   'open',    'pending_analysis',   '{"reported_by": "jdoe", "email_quarantined": true, "campaign_id": null}'),
  ('inc_0004', 'tenant1', 'network_operator', 'network_breach','high',    'Unauthorized access attempt on VPN gateway from external IP', 'resolved','false_positive',    '{"source_ip": "203.0.113.50", "action": "already_blocked", "notes": "Legitimate pen test"}'),
  ('inc_0005', 'tenant1', 'compliance_officer','compliance',   'medium',  'GDPR DSAR response exceeded 30-day SLA',                      'open',    'confirmed',          '{"days_overdue": 14, "affected_user": "user_gdpr_01", "remediation": "automation_required"}');

-- ============================================
-- 11. ALERT RULES
-- ============================================
INSERT INTO alert_rules (id, tenant_id, name, description, query, condition_expression, severity, enabled, match_count, last_matched) VALUES
  ('ar_001', 'tenant1', 'Multiple Failed Logins',     'Alert when >5 failed logins in 10 minutes',         'failed_login',     'count > 5 within 10m',   'medium',  true, 12, NOW() - INTERVAL '2 hours'),
  ('ar_002', 'tenant1', 'SQL Injection Detected',     'Alert on SQL injection attempts',                   'sqli',             'event_type = ''sqli''',  'critical', true, 3,   NOW() - INTERVAL '1 hour'),
  ('ar_003', 'tenant1', 'New Malware Signature',      'Alert on malware detection',                        'malware',          'event_type = ''malware''','critical', true, 1,   NOW() - INTERVAL '30 minutes'),
  ('ar_004', 'tenant1', 'Unusual VPN Connection',     'Alert on VPN from unusual location',                'vpn_geo',          'geo NOT IN usual_regions','medium', true, 0,   NULL),
  ('ar_005', 'tenant1', 'Data Exfiltration Attempt',  'Alert on large outbound data transfer',             'data_exfil',       'bytes_out > 1GB',        'high',    true, 0,   NULL);

-- ============================================
-- 12. ALERTS
-- ============================================
INSERT INTO alerts (id, tenant_id, event_id, alert_name, severity, description, status, assigned_to, rule_id, triggered_at) VALUES
  ('alert_001', 'tenant1', 'evt_0001', 'Blocked C2 Communication',  'high',    'Known C2 IP attempted connection - blocked by firewall',     'new',       'security_analyst', 'ar_001', NOW() - INTERVAL '3 hours'),
  ('alert_002', 'tenant1', 'evt_0002', 'SQL Injection Attempt',     'critical','SQL injection payload detected in login request',           'acknowledged', 'security_analyst', 'ar_002', NOW() - INTERVAL '2 hours'),
  ('alert_003', 'tenant1', 'evt_0004', 'Brute Force Login',         'medium',  '6 failed login attempts from internal IP',                   'in_progress', 'security_analyst', 'ar_001', NOW() - INTERVAL '1 hour'),
  ('alert_004', 'tenant1', 'evt_0010', 'Malware Detection',         'critical','Ransomware signature detected on endpoint',                   'new',       NULL,               'ar_003', NOW() - INTERVAL '30 minutes'),
  ('alert_005', 'tenant1', NULL,       'SSL Certificate Expiring',  'medium',  'Wildcard SSL cert for *.cybersec.com expires in 7 days',     'new',       'network_operator', NULL,     NOW() - INTERVAL '6 hours');

-- ============================================
-- 13. SIEM EVENTS
-- ============================================
INSERT INTO siem_events (id, tenant_id, source, event_type, severity, description, raw_data) VALUES
  (DEFAULT, 'tenant1', 'firewall',      'TRAFFIC_BLOCK',    'high',    'Inbound traffic from known malicious IP 185.220.101.42 blocked at firewall',   '{"src_ip": "185.220.101.42", "dst_ip": "10.0.1.10", "dst_port": 443, "protocol": "TCP", "rule": "fw_blacklist_01"}'),
  (DEFAULT, 'tenant1', 'waf',           'SQL_INJECTION',    'critical','SQL injection pattern detected in /api/login body parameter',                  '{"src_ip": "45.33.32.156", "uri": "/api/login", "payload": "1 OR 1=1--", "rule": "waf_rule_001"}'),
  (DEFAULT, 'tenant1', 'waf',           'XSS_ATTACK',       'high',    'XSS payload in search query parameter',                                        '{"src_ip": "91.121.87.34", "uri": "/search", "payload": "<script>alert(1)</script>"}'),
  (DEFAULT, 'tenant1', 'endpoint',      'MALWARE_DETECTED', 'critical','CrowdStrike detected ransomware on workstation CORP-LT-055',                   '{"hostname": "CORP-LT-055", "user": "jdoe", "signature": "WannaCry variant", "action": "isolated"}'),
  (DEFAULT, 'tenant1', 'identity',      'BRUTE_FORCE',      'medium',  'Multiple failed authentication attempts on admin portal',                      '{"username": "admin", "source_ips": ["10.0.100.50","10.0.100.51"], "attempts": 12}'),
  (DEFAULT, 'tenant1', 'database',      'SLOW_QUERY',       'low',     'Query execution time exceeded threshold on transactions table',                '{"query_time_ms": 5230, "table": "transactions", "user": "app_service"}'),
  (DEFAULT, 'tenant1', 'network',       'PORT_SCAN',        'medium',  'Port scan detected from external IP 198.51.100.23',                            '{"scanned_ports": [22,80,443,3389,8080], "duration_sec": 45}'),
  (DEFAULT, 'tenant1', 'application',   'AUTH_BYPASS',      'critical','Potential authentication bypass attempt on /api/admin',                        '{"src_ip": "203.0.113.100", "method": "GET", "cookies_modified": true}');

INSERT INTO siem_events (id, tenant_id, source, event_type, severity, description, raw_data, "timestamp") VALUES
  (DEFAULT, 'tenant1', 'firewall', 'TRAFFIC_BLOCK', 'high', 'Ongoing DDoS attempt from multiple IPs', '{"src_ips": ["198.51.100.0/24"], "pps": 15000, "action": "rate_limited"}', NOW() - INTERVAL '5 minutes');

-- ============================================
-- 14. THREAT INTEL
-- ============================================
INSERT INTO threat_intel (id, tenant_id, indicator_type, indicator_value, threat_type, confidence, source, expires_at) VALUES
  ('ti_001', 'tenant1', 'ip',       '185.220.101.42',     'c2',         95, 'AlienVault OTX',     NOW() + INTERVAL '30 days'),
  ('ti_002', 'tenant1', 'ip',       '45.33.32.156',       'scanner',     80, 'Shodan',             NOW() + INTERVAL '14 days'),
  ('ti_003', 'tenant1', 'domain',   'evil-malware.xyz',   'malware',     90, 'VirusTotal',         NOW() + INTERVAL '60 days'),
  ('ti_004', 'tenant1', 'hash',     'a1b2c3d4e5f6...',    'ransomware',  85, 'CrowdStrike',        NOW() + INTERVAL '90 days'),
  ('ti_005', 'tenant1', 'url',      'http://phish.xyz/login', 'phishing',75, 'PhishTank',          NOW() + INTERVAL '7 days'),
  ('ti_006', 'tenant1', 'email',    'spoofed@bank-secure.com', 'phishing',88, 'AbuseIPDB',          NOW() + INTERVAL '30 days');

-- ============================================
-- 15. VULN SCANS
-- ============================================
INSERT INTO vuln_scans (id, tenant_id, target, scan_type, status, results, completed_at) VALUES
  (DEFAULT, 'tenant1', '10.0.1.0/24',    'web',   'completed', '{"total": 45, "critical": 1, "high": 3, "medium": 12, "low": 29, "findings": ["CVE-2024-1234", "CVE-2024-5678"]}',   NOW() - INTERVAL '2 days'),
  (DEFAULT, 'tenant1', 'api.cybersec.com','api',   'completed', '{"total": 22, "critical": 0, "high": 2, "medium": 8, "low": 12, "findings": ["CVE-2025-0001"]}',                     NOW() - INTERVAL '1 day'),
  (DEFAULT, 'tenant1', '10.0.2.0/24',    'web',   'in_progress', '{"progress": 65, "hosts_scanned": 8, "vulns_found": 17}',                                                             NULL);

-- ============================================
-- 16. SCANS (legacy scans table)
-- ============================================
INSERT INTO scans (id, tenant_id, scan_type, target, status, started_at, completed_at, vulnerabilities_found, critical_count, high_count, medium_count, low_count, scan_config) VALUES
  ('scan_001', 'tenant1', 'vulnerability', 'web01.cybersec.com',   'completed', NOW() - INTERVAL '3 days',  NOW() - INTERVAL '3 days' + INTERVAL '45 minutes', 12, 1, 2, 5, 4, '{"scanner": "nessus", "port_range": "1-1024", "auth_scan": true}'),
  ('scan_002', 'tenant1', 'vulnerability', 'app.cybersec.com',     'completed', NOW() - INTERVAL '1 day',   NOW() - INTERVAL '1 day' + INTERVAL '30 minutes',  8,  0, 1, 4, 3, '{"scanner": "openvas", "port_range": "1-65535", "auth_scan": false}'),
  ('scan_003', 'tenant1', 'compliance',    'db01.cybersec.com',    'pending',   NULL,                      NULL,                                              0,  0, 0, 0, 0, '{"framework": "cis_benchmark", "target_os": "debian_12"}');

-- ============================================
-- 17. FIREWALL RULES
-- ============================================
INSERT INTO firewall_rules (id, tenant_id, name, description, source_ip, source_zone, dest_ip, dest_zone, dest_port, protocol, action, enabled, hit_count, last_hit) VALUES
  ('fw_rule_001', 'tenant1', 'Allow Web Traffic',     'Permit HTTP/HTTPS to web servers',       '0.0.0.0/0',     'untrust',  '10.0.1.10',    'dmz',    '80,443',        'TCP', 'allow',  true, 45200, NOW() - INTERVAL '2 minutes'),
  ('fw_rule_002', 'tenant1', 'Allow API Traffic',     'Permit API traffic to API gateway',      '0.0.0.0/0',     'untrust',  '10.0.1.11',    'dmz',    '443',           'TCP', 'allow',  true, 18900, NOW() - INTERVAL '1 minute'),
  ('fw_rule_003', 'tenant1', 'DB Access from Web',    'Allow database from web tier',           '10.0.1.0/24',   'dmz',      '10.0.2.5',     'internal','5432',         'TCP', 'allow',  true, 8900,  NOW() - INTERVAL '5 minutes'),
  ('fw_rule_004', 'tenant1', 'Admin Access',          'Allow SSH from management network',      '10.0.100.0/24', 'mgmt',     '10.0.0.0/24',  'internal','22',           'TCP', 'allow',  true, 340,   NOW() - INTERVAL '30 minutes'),
  ('fw_rule_005', 'tenant1', 'Block Known Bad IPs',   'Block traffic from threat intel IPs',    NULL,            'untrust',  NULL,            'any',    'any',           'ANY', 'deny',  true, 156,   NOW() - INTERVAL '10 minutes'),
  ('fw_rule_006', 'tenant1', 'Allow VPN Traffic',     'Permit IPSEC VPN traffic',               '0.0.0.0/0',     'untrust',  '203.0.113.5',  'dmz',    '500,4500',      'UDP', 'allow',  true, 2300,  NOW() - INTERVAL '1 hour');

-- ============================================
-- 18. FIREWALL LOGS
-- ============================================
INSERT INTO firewall_logs (tenant_id, rule_id, source_ip, dest_ip, dest_port, protocol, action, reason, "timestamp") VALUES
  ('tenant1', 'fw_rule_005', '185.220.101.42',  '10.0.1.10', 443,  'TCP', 'deny',  'BLOCKED - Known C2 IP (threat intel match)',         NOW() - INTERVAL '3 hours'),
  ('tenant1', 'fw_rule_005', '45.33.32.156',    '10.0.1.11', 80,   'TCP', 'deny',  'BLOCKED - Scanner IP (threat intel match)',            NOW() - INTERVAL '2 hours'),
  ('tenant1', 'fw_rule_001', '198.51.100.23',   '10.0.1.10', 443,  'TCP', 'allow', 'ALLOWED - Legitimate HTTPS traffic',                 NOW() - INTERVAL '1 hour'),
  ('tenant1', 'fw_rule_002', '203.0.113.100',   '10.0.1.11', 443,  'TCP', 'allow', 'ALLOWED - API request from external partner',        NOW() - INTERVAL '30 minutes'),
  ('tenant1', 'fw_rule_003', '10.0.1.10',       '10.0.2.5',  5432, 'TCP', 'allow', 'ALLOWED - Database query from web01',                NOW() - INTERVAL '5 minutes'),
  ('tenant1', NULL,          '91.121.87.34',    '10.0.1.11', 443,  'TCP', 'deny',  'BLOCKED - No matching rule (default deny)',          NOW() - INTERVAL '15 minutes');

-- ============================================
-- 19. NGFW RULES
-- ============================================
INSERT INTO ngfw_rules (id, tenant_id, name, source_ip, destination_port, protocol, action, enabled) VALUES
  (DEFAULT, 'tenant1', 'Allow HTTPS Inbound',    '0.0.0.0/0',   443, 'TCP', 'allow', true),
  (DEFAULT, 'tenant1', 'Allow DNS Outbound',     '10.0.0.0/16', 53,  'UDP', 'allow', true),
  (DEFAULT, 'tenant1', 'Block SSH from WAN',     '0.0.0.0/0',   22,  'TCP', 'deny',  true),
  (DEFAULT, 'tenant1', 'Allow SMTP to Mail',     '10.0.1.0/24', 25,  'TCP', 'allow', true),
  (DEFAULT, 'tenant1', 'Block Telnet',           '0.0.0.0/0',   23,  'TCP', 'deny',  true);

-- ============================================
-- 20. WAF LOGS
-- ============================================
INSERT INTO waf_logs (tenant_id, rule_id, source_ip, request_path, request_method, user_agent, headers, action_taken, blocked, "timestamp") VALUES
  ('tenant1', 'rule_001', '45.33.32.156',   '/api/login',    'POST', 'Mozilla/5.0',              '{"content-type": "application/json"}', 'block',  true, NOW() - INTERVAL '2 hours'),
  ('tenant1', 'rule_002', '91.121.87.34',   '/search',       'GET',  'curl/7.68.0',              '{"accept": "text/html"}',             'block',  true, NOW() - INTERVAL '1 hour'),
  ('tenant1', NULL,       '198.51.100.23',  '/api/v1/users', 'GET',  'python-requests/2.28.0',  '{"authorization": "Bearer ***"}',     'allow',  false, NOW() - INTERVAL '30 minutes'),
  ('tenant1', NULL,       '10.0.100.50',    '/dashboard',    'GET',  'Chrome/120',               '{"cookie": "session=***"}',           'allow',  false, NOW() - INTERVAL '5 minutes');

-- ============================================
-- 21. WAF BLACKLIST / WHITELIST / RATE LIMITS
-- ============================================
INSERT INTO waf_blacklist (id, tenant_id, ip_address, reason, expires_at) VALUES
  ('waf_bl_001', 'tenant1', '185.220.101.42',   'Known C2 infrastructure',     NOW() + INTERVAL '7 days'),
  ('waf_bl_002', 'tenant1', '45.33.32.156',     'Automated scanner',           NOW() + INTERVAL '1 day'),
  ('waf_bl_003', 'tenant1', '91.121.87.34',     'XSS attack source',           NOW() + INTERVAL '3 days');

INSERT INTO waf_whitelist (id, tenant_id, ip_address, description) VALUES
  ('waf_wl_001', 'tenant1', '10.0.100.0/24',    'Corporate office IP range'),
  ('waf_wl_002', 'tenant1', '203.0.113.50/32',  'VPN exit IP');

INSERT INTO waf_rate_limits (id, tenant_id, path_pattern, requests_per_minute, burst, enabled) VALUES
  ('waf_rl_001', 'tenant1', '/api/login',            20,  5,  true),
  ('waf_rl_002', 'tenant1', '/api/register',         10,  3,  true),
  ('waf_rl_003', 'tenant1', '/api/v1/*',             100, 20, true),
  ('waf_rl_004', 'tenant1', '/dashboard',            200, 50, true);

-- ============================================
-- 22. TRANSACTIONS (for fraud detection)
-- ============================================
INSERT INTO transactions (id, tenant_id, transaction_id, user_id, amount, currency, transaction_type, payment_method, status, risk_score, is_fraud, ip_address, device_id, location, merchant_id) VALUES
  ('txn_001', 'tenant1', 'TXN-20260501-001', 'user_admin',    1500.00, 'USD', 'purchase',   'credit_card',  'completed', 0.15, false, '10.0.100.50',   'device_001', 'New York, US',    'merchant_001'),
  ('txn_002', 'tenant1', 'TXN-20260501-002', 'user_admin',    25000.00,'USD', 'transfer',   'wire',         'pending',   0.85, true,  '185.220.101.42','device_999', 'Moscow, RU',     'merchant_002'),
  ('txn_003', 'tenant1', 'TXN-20260501-003', 'billing_mgr',   500.00,  'USD', 'refund',     'credit_card',  'completed', 0.10, false, '10.0.100.51',   'device_002', 'Chicago, US',    'merchant_001'),
  ('txn_004', 'tenant1', 'TXN-20260501-004', 'jane_doe',      3200.00, 'EUR', 'purchase',   'paypal',       'completed', 0.40, false, '91.121.87.34',  'device_003', 'Paris, FR',      'merchant_003'),
  ('txn_005', 'tenant1', 'TXN-20260501-005', 'user_admin',    75.00,   'USD', 'purchase',   'debit_card',   'completed', 0.05, false, '10.0.100.50',   'device_001', 'New York, US',   'merchant_001'),
  ('txn_006', 'tenant1', 'TXN-20260501-006', 'bob_47be18',    12000.00,'USD', 'transfer',   'wire',         'review',    0.75, true,  '203.0.113.200','device_004', 'Lagos, NG',      'merchant_004'),
  ('txn_007', 'tenant1', 'TXN-20260501-007', 'jane_doe',      250.00,  'USD', 'purchase',   'credit_card',  'failed',    0.20, false, '10.0.100.52',   'device_005', 'Boston, US',     'merchant_001');

-- ============================================
-- 23. FRAUD ALERTS
-- ============================================
INSERT INTO fraud_alerts (id, tenant_id, user_id, alert_type, risk_score, details, status) VALUES
  (DEFAULT, 'tenant1', 'user_admin',                                           'high_amount',   0.85, '{"amount": 25000, "threshold": 10000, "rule": "High Amount Transaction"}',              'open'),
  (DEFAULT, 'tenant1', 'user_ef1c0647-3eb7-432e-8cd9-45d762d593e2',           'new_location',  0.75, '{"location": "Lagos, NG", "usual_locations": ["US"], "rule": "New Device"}',             'investigating'),
  (DEFAULT, 'tenant1', 'user_admin',                                           'rapid_velocity',0.60, '{"transactions_5min": 6, "threshold": 5, "rule": "Rapid Transactions"}',                  'open'),
  (DEFAULT, 'tenant1', 'user_0a01e166-55d4-48d9-83b7-455190d1b767',           'new_device',    0.40, '{"device_id": "device_003", "known_devices": ["device_005"], "rule": "New Device"}',      'closed');

-- ============================================
-- 24. RISK SCORES
-- ============================================
INSERT INTO risk_scores (tenant_id, user_id, score, factors) VALUES
  ('tenant1', 'user_admin',          45.50, '{"login_frequency": "daily", "failed_logins": 3, "location_changes": 2, "device_count": 2, "transaction_velocity": "low"}'),
  ('tenant1', 'billing_mgr',         22.00, '{"login_frequency": "daily", "failed_logins": 1, "location_changes": 1, "device_count": 1, "transaction_velocity": "low"}'),
  ('tenant1', 'jane_doe',            78.30, '{"login_frequency": "weekly", "failed_logins": 8, "location_changes": 3, "device_count": 4, "transaction_velocity": "medium"}'),
  ('tenant1', 'bob_47be18',          88.00, '{"login_frequency": "monthly", "failed_logins": 0, "location_changes": 0, "device_count": 1, "transaction_velocity": "low", "high_value_txn": true}'),
  ('tenant1', 'security_analyst',    15.00, '{"login_frequency": "hourly", "failed_logins": 0, "location_changes": 1, "device_count": 2, "transaction_velocity": "none"}');

-- ============================================
-- 25. RISK HISTORY
-- ============================================
INSERT INTO risk_history (tenant_id, user_id, score, factors, calculated_at) VALUES
  ('tenant1', 'user_admin',      65.00, '{"old_score": true}',     NOW() - INTERVAL '30 days'),
  ('tenant1', 'user_admin',      55.00, '{"old_score": true}',     NOW() - INTERVAL '14 days'),
  ('tenant1', 'user_admin',      45.50, '{"current": true}',       NOW()),
  ('tenant1', 'jane_doe',        70.00, '{"old_score": true}',     NOW() - INTERVAL '7 days'),
  ('tenant1', 'jane_doe',        78.30, '{"current": true}',       NOW()),
  ('tenant1', 'bob_47be18',      50.00, '{"old_score": true}',     NOW() - INTERVAL '2 days'),
  ('tenant1', 'bob_47be18',      88.00, '{"current": true}',       NOW());

-- ============================================
-- 26. RISKS (risk register)
-- ============================================
INSERT INTO risks (id, tenant_id, title, description, category, likelihood, impact, risk_score, treatment, status, owner, mitigation_plan) VALUES
  ('risk_001', 'tenant1', 'Data Breach via Web App',      'SQL injection or XSS leading to data exfiltration',   'technical',   4, 5, 20, 'mitigate', 'open',   'security_analyst',  'WAF rules + code review + DAST scanning'),
  ('risk_002', 'tenant1', 'Insider Threat',               'Malicious employee exfiltrating sensitive data',       'operational', 2, 5, 10, 'accept',   'open',   'compliance_officer','DLP solution + user behavior analytics'),
  ('risk_003', 'tenant1', 'Ransomware Attack',            'Ransomware encrypting critical systems',              'technical',   3, 5, 15, 'mitigate', 'open',   'security_analyst',  'EDR + offline backups + user training'),
  ('risk_004', 'tenant1', 'Third-Party Vendor Breach',    'Vendor compromise affecting our data',                'third_party', 3, 4, 12, 'transfer', 'open',   'compliance_officer','Vendor security assessments + cyber insurance'),
  ('risk_005', 'tenant1', 'Compliance Non-Adherence',     'Failing GDPR DSAR SLA requirements',                  'compliance',  3, 3, 9,  'mitigate', 'open',   'compliance_officer','Automate DSAR workflow + add staff');

-- ============================================
-- 27. AUDIT LOGS
-- ============================================
INSERT INTO audit_logs (id, tenant_id, user_id, action, resource, resource_id, details, "timestamp") VALUES
  (DEFAULT, 'tenant1', 'user_admin',                                           'LOGIN',          'session',  'sess_001', '{"source_ip": "10.0.100.50", "method": "password"}',                           NOW() - INTERVAL '1 hour'),
  (DEFAULT, 'tenant1', 'user_admin',                                           'CREATE_POLICY',  'policy',   'pol_003',  '{"name": "Data Retention Policy"}',                                              NOW() - INTERVAL '4 hours'),
  (DEFAULT, 'tenant1', 'user_c8fbdd64-f7e2-4ea4-bece-eee955aeb08d',           'UPDATE_ALERT',   'alert',    'alert_002','{"status": "acknowledged", "assigned_to": "security_analyst"}',                    NOW() - INTERVAL '2 hours'),
  (DEFAULT, 'tenant1', 'user_e6b27bd2-eaae-4e2c-8500-bcfbc8c7d9d0',           'CREATE_FW_RULE', 'firewall', 'fw_rule_007','{"action": "deny", "source": "0.0.0.0/0", "port": "3389"}',                       NOW() - INTERVAL '3 hours'),
  (DEFAULT, 'tenant1', 'user_529bd0d4-35f7-44d4-b435-8e3441e94427',           'EXPORT_REPORT',  'report',   'rpt_001',  '{"type": "compliance_summary", "framework": "SOC 2"}',                              NOW() - INTERVAL '1 day'),
  (DEFAULT, 'tenant1', 'user_ea780a51-c496-43fb-82c2-ea3c01ab2b5a',           'CREATE_USER',    'user',     'user_new', '{"username": "new_hire_01", "role": "user"}',                                       NOW() - INTERVAL '2 days'),
  (DEFAULT, 'tenant1', 'user_38fe1afa-825e-41f7-83de-60a8313554e1',           'MODIFY_SYSTEM',  'tenant',   'tenant1',  '{"changed_field": "max_requests", "old_value": 100, "new_value": 200}',              NOW() - INTERVAL '7 days');

-- ============================================
-- 28. REQUEST LOGS
-- ============================================
INSERT INTO request_logs ("timestamp", tenant_id, method, path, status_code, response_time, ip_address, user_agent) VALUES
  (NOW() - INTERVAL '1 hour',   'tenant1', 'GET',    '/api/v1/assets',          200, 45,  '10.0.100.50',  'Mozilla/5.0 Chrome/120'),
  (NOW() - INTERVAL '1 hour',   'tenant1', 'POST',   '/api/v1/incidents',       201, 120, '10.0.100.51',  'Mozilla/5.0 Chrome/120'),
  (NOW() - INTERVAL '30 minutes','tenant1','GET',    '/api-docs/',              200, 12,  '10.0.100.50',  'curl/7.68.0'),
  (NOW() - INTERVAL '15 minutes','tenant1','POST',   '/api/v1/auth/login',       401, 8,   '45.33.32.156', 'python-requests/2.28.0'),
  (NOW() - INTERVAL '10 minutes','tenant1','GET',    '/api/v1/tenants/metrics',  200, 67,  '10.0.100.50',  'Mozilla/5.0 Chrome/120'),
  (NOW() - INTERVAL '5 minutes','tenant1', 'DELETE', '/api/v1/users/user_old',   403, 5,   '10.0.100.52',  'Mozilla/5.0 Chrome/120'),
  (NOW() - INTERVAL '1 minute', 'tenant1', 'GET',    '/api/v1/incidents/inc_0001', 200, 32, '10.0.100.50','Mozilla/5.0 Chrome/120');

-- ============================================
-- 29. USER PROFILES
-- ============================================
INSERT INTO user_profiles (id, tenant_id, user_id, risk_level, transaction_count, avg_transaction_amount, typical_locations, devices, last_activity) VALUES
  ('prof_admin', 'tenant1', 'user_admin',          'low',    15,  1875.00, ARRAY['New York, US'],                    ARRAY['device_001','device_002'],                NOW()),
  ('prof_jane',  'tenant1', 'jane_doe_157915',     'medium', 8,   2450.00, ARRAY['Paris, FR','Boston, US'],           ARRAY['device_003','device_005'],                NOW() - INTERVAL '2 hours'),
  ('prof_bob',   'tenant1', 'bob_47be18',          'high',   3,   8500.00, ARRAY['London, UK'],                      ARRAY['device_004'],                             NOW() - INTERVAL '1 day');

-- ============================================
-- 30. SESSIONS
-- ============================================
INSERT INTO sessions (id, user_id, tenant_id, expires_at) VALUES
  ('sess_admin', 'user_admin',       'tenant1', NOW() + INTERVAL '24 hours'),
  ('sess_sec',   'security_analyst', 'tenant1', NOW() + INTERVAL '8 hours'),
  ('sess_net',   'network_operator', 'tenant1', NOW() + INTERVAL '4 hours');

-- ============================================
-- 31. VPN CONNECTIONS
-- ============================================
INSERT INTO vpn_connections (id, tenant_id, name, vpn_type, remote_gateway, local_network, remote_network, status, bytes_in, bytes_out, connected_at) VALUES
  ('vpn_01', 'tenant1', 'AWS-VPC-Peering',  'IPSec',  '18.192.100.1',  '10.0.0.0/16',  '172.31.0.0/16', 'connected',    1250000000, 750000000,  NOW() - INTERVAL '2 days'),
  ('vpn_02', 'tenant1', 'Azure-Spoke-Hub',  'IPSec',  '52.183.25.10',  '10.0.0.0/16',  '10.1.0.0/16',  'connected',    800000000,  400000000,  NOW() - INTERVAL '5 days'),
  ('vpn_03', 'tenant1', 'Partner-Direct',    'WireGuard', '88.99.70.50','10.0.0.0/16',  '192.168.50.0/24','disconnected', 0,          0,           NULL);

-- ============================================
-- 32. ZONES
-- ============================================
INSERT INTO zones (id, tenant_id, name, description, interface_name, subnet, security_level) VALUES
  ('zone_untrust',  'tenant1', 'Untrust',   'Internet / WAN',      'eth0',     '0.0.0.0/0',        0),
  ('zone_dmz',      'tenant1', 'DMZ',       'Public-facing servers','eth1',    '10.0.1.0/24',      50),
  ('zone_internal', 'tenant1', 'Internal',  'Internal network',     'eth2',     '10.0.2.0/24',      70),
  ('zone_mgmt',     'tenant1', 'Management','Management network',   'eth3',     '10.0.100.0/24',    90);

-- ============================================
-- 33. NAT RULES
-- ============================================
INSERT INTO nat_rules (id, tenant_id, name, nat_type, original_source, translated_source, original_dest, translated_dest, original_port, translated_port, enabled) VALUES
  ('nat_001', 'tenant1', 'Web Server SNAT',  'snat', '10.0.1.10',  '203.0.113.10',  NULL, NULL,           NULL, NULL, true),
  ('nat_002', 'tenant1', 'API Gateway DNAT', 'dnat', NULL,         NULL,            '203.0.113.11', '10.0.1.11', '443', '443', true);

-- ============================================
-- 34. ML MODELS
-- ============================================
INSERT INTO ml_models (id, tenant_id, model_name, model_type, version, accuracy, trained_at, status) VALUES
  ('ml_001', 'tenant1', 'Fraud Detection v3',    'random_forest', '3.1.0', 0.9720, NOW() - INTERVAL '15 days', 'active'),
  ('ml_002', 'tenant1', 'Anomaly Detection',     'isolation_forest','2.0.0', 0.9430, NOW() - INTERVAL '7 days',  'active'),
  ('ml_003', 'tenant1', 'Phishing Classifier',   'bert',          '1.5.0', 0.9840, NOW() - INTERVAL '2 days',  'training');

-- ============================================
-- 35. DEPARTMENTS & EMPLOYEE GROUPS
-- ============================================
INSERT INTO departments (id, tenant_id, name) VALUES
  ('dept_eng', 'tenant1', 'Engineering'),
  ('dept_fin', 'tenant1', 'Finance'),
  ('dept_hr',  'tenant1', 'Human Resources'),
  ('dept_mkt', 'tenant1', 'Marketing'),
  ('dept_sec', 'tenant1', 'Security'),
  ('dept_ops', 'tenant1', 'Operations');

INSERT INTO employee_groups (tenant_id, name, description, group_type) VALUES
  ('tenant1', 'All Employees',      'All company employees',          'all_employees'),
  ('tenant1', 'C-Level',            'Executive management team',      'management'),
  ('tenant1', 'Engineering Dept',   'Engineering department members', 'department'),
  ('tenant1', 'Contractors',        'External contractors',           'custom');

-- ============================================
-- 36. EXTERNAL ENTITIES
-- ============================================
INSERT INTO external_entities (tenant_id, entity_type, name, contact_email, contact_phone, contact_person, address, risk_level, notes) VALUES
  ('tenant1', 'supplier',   'CloudHost Inc.',      'security@cloudhost.com',  '+1-800-555-0101', 'John Smith',   '123 Cloud St, San Francisco, CA',       'medium', 'Primary cloud infrastructure provider'),
  ('tenant1', 'public_body','EU Data Protection','dpo@eudataprotection.eu','+32-2-555-0202', 'Maria Lopez',  'Rue de la Loi 200, Brussels, Belgium', 'low',    'Regulatory body for GDPR'),
  ('tenant1', 'partner',    'SecurePay Gateway',   'ops@securepay.io',       '+1-888-555-0303', 'David Chen',   '456 Payment Ave, New York, NY',         'high',   'Payment processing partner - PCI DSS scope'),
  ('tenant1', 'contractor', 'PenTest Solutions',   'eng@pentsolutions.com',  '+44-20-5555-0404','Alice Brown',  '789 Security Ln, London, UK',           'medium', 'Annual penetration testing contractor');

-- ============================================
-- 37. AWARENESS CAMPAIGNS
-- ============================================
INSERT INTO awareness_campaigns (id, tenant_id, name, type, status, content) VALUES
  (DEFAULT, 'tenant1', 'Q2 2026 Phishing Simulation',  'phishing',     'active',  '{"template": "IT_Password_Reset", "sender": "it@cybersec.com", "subject": "Password Expiry Notice"}'),
  (DEFAULT, 'tenant1', 'Ransomware Awareness',         'training',     'draft',   '{"modules": ["what_is_ransomware", "detection", "response"], "duration_min": 30}'),
  (DEFAULT, 'tenant1', 'New Hire Security Onboarding',  'onboarding',  'active',  '{"modules": ["security_policy", "password_basics", "phishing_101"], "auto_assign": true}');

-- ============================================
-- 38. CAMPAIGNS (phishing sim)
-- ============================================
INSERT INTO campaigns (id, tenant_id, name, type, status, content, target_users, schedule) VALUES
  ('camp_phish_01', 'tenant1', 'May 2026 Phishing Test',  'phishing', 'active',  '{"email_template": "urgent_password_reset", "landing_page": "fake_office365"}',  ARRAY['all'], '{"start": "2026-05-15T09:00:00Z", "end": "2026-05-20T17:00:00Z"}'),
  ('camp_train_01', 'tenant1', 'Security Awareness Q2',   'training', 'completed','{"modules": ["phishing","ransomware","social_engineering"]}',                    ARRAY['engineering','finance','hr'], '{"start": "2026-04-01T09:00:00Z", "end": "2026-04-30T17:00:00Z"}');

-- ============================================
-- 39. CAMPAIGN TARGETS
-- ============================================
INSERT INTO campaign_targets (campaign_id, user_id, tenant_id, status, sent_at) VALUES
  ('camp_phish_01', 'user_admin',       'tenant1', 'clicked',  NOW() - INTERVAL '1 day'),
  ('camp_phish_01', 'billing_mgr',      'tenant1', 'reported', NOW() - INTERVAL '1 day'),
  ('camp_phish_01', 'jane_doe_157915',  'tenant1', 'pending',  NULL),
  ('camp_phish_01', 'bob_47be18',       'tenant1', 'sent',     NOW() - INTERVAL '2 days'),
  ('camp_phish_01', 'security_analyst', 'tenant1', 'clicked',  NOW() - INTERVAL '1 day'),
  ('camp_phish_01', 'network_operator', 'tenant1', 'pending',  NULL);

-- ============================================
-- 40. CAMPAIGN EXECUTIONS
-- ============================================
INSERT INTO campaign_executions (campaign_id, tenant_id, status, results) VALUES
  ('camp_phish_01', 'tenant1', 'in_progress',  '{"sent": 45, "opened": 28, "clicked": 12, "reported": 3, "phish_prone_percentage": 26.7}'),
  ('camp_train_01', 'tenant1', 'completed',    '{"assigned": 120, "completed": 98, "passed": 92, "failed": 6, "completion_rate": 81.7}');

-- ============================================
-- 41. CAMPAIGN TARGETING
-- ============================================
INSERT INTO campaign_targeting (campaign_id, target_type, target_id, channel) VALUES
  ('camp_phish_01', 'all_employees', NULL, 'email'),
  ('camp_train_01', 'department',    1,    'email'),
  ('camp_train_01', 'department',    2,    'email');

-- ============================================
-- 42. TRAINING MODULES
-- ============================================
INSERT INTO training_modules (id, tenant_id, title, type, content, duration, certification) VALUES
  ('mod_phish_01',  'tenant1', 'Phishing Awareness 101',           'video',     '{"url": "https://training.cybersec.com/phishing101.mp4", "quiz_required": true}',      20, true),
  ('mod_rw_01',     'tenant1', 'Ransomware Prevention',            'interactive','{"scenarios": ["email_attachment", "malicious_ad", "usb_drop"], "pass_score": 80}', 45, true),
  ('mod_pass_01',   'tenant1', 'Password & MFA Best Practices',     'article',   '{"content_md": "password-best-practices.md", "quiz_id": "quiz_003"}',                 15, false),
  ('mod_dlp_01',    'tenant1', 'Data Protection for Employees',     'video',     '{"url": "https://training.cybersec.com/dlp.mp4", "quiz_id": "quiz_004"}',             30, false);

-- ============================================
-- 43. USER TRAINING
-- ============================================
INSERT INTO user_training (tenant_id, user_id, module_id, status, score, completed_at) VALUES
  ('tenant1', 'user_admin',       'mod_phish_01', 'completed', 95,  NOW() - INTERVAL '10 days'),
  ('tenant1', 'user_admin',       'mod_rw_01',    'completed', 88,  NOW() - INTERVAL '5 days'),
  ('tenant1', 'billing_mgr',      'mod_phish_01', 'completed', 100, NOW() - INTERVAL '7 days'),
  ('tenant1', 'jane_doe_157915',  'mod_phish_01', 'in_progress', NULL, NULL),
  ('tenant1', 'bob_47be18',       'mod_phish_01', 'assigned',   NULL, NULL),
  ('tenant1', 'security_analyst', 'mod_rw_01',    'completed', 92,  NOW() - INTERVAL '3 days');

-- ============================================
-- 44. TEMPLATES
-- ============================================
INSERT INTO templates (id, tenant_id, type, name, content, locale) VALUES
  ('tpl_phish_01', 'tenant1', 'email', 'IT Password Reset',            '{"subject": "Action Required: Password Expiry", "body_html": "Your password expires in 24 hours. Reset at: {{link}}", "sender": "it@cybersec.com"}', 'en'),
  ('tpl_phish_02', 'tenant1', 'email', 'HR Benefits Update',           '{"subject": "Updated Benefits Package", "body_html": "Review your updated benefits: {{link}}", "sender": "hr@cybersec.com"}',                       'en'),
  ('tpl_lp_01',    'tenant1', 'landing_page', 'Office 365 Login',      '{"url": "https://phish.cybersec.com/login", "html": "fake_office365.html"}',                             'en'),
  ('tpl_sms_01',   'tenant1', 'sms',   'Urgent Security Alert',        '{"message": "Suspicious login detected. Verify: {{link}}"}',                                                 'en');

-- ============================================
-- 45. LANDING PAGES
-- ============================================
INSERT INTO landing_pages (id, tenant_id, campaign_id, template_id, config, analytics) VALUES
  ('lp_phish_01', 'tenant1', 'camp_phish_01', 'tpl_lp_01', '{"redirect_to": "https://www.cybersec.com", "capture_credentials": true}', '{"visits": 28, "credential_submissions": 12, "avg_time_seconds": 45}');

-- ============================================
-- 46. PAYLOADS
-- ============================================
INSERT INTO payloads (id, tenant_id, type, name, data) VALUES
  ('pay_phish_01', 'tenant1', 'email', 'Password Reset Link',    '{"link": "https://phish.cybersec.com/reset?token={{token}}", "tracking_pixel": true}'),
  ('pay_phish_02', 'tenant1', 'attachment', 'Invoice PDF',       '{"filename": "invoice_2026.pdf", "type": "pdf", "macro_enabled": false, "url": "https://phish.cybersec.com/download/invoice"}');

-- ============================================
-- 47. SIMULATIONS
-- ============================================
INSERT INTO simulations (id, tenant_id, campaign_id, type, target_user, payload, result, metadata) VALUES
  ('sim_phish_01', 'tenant1', 'camp_phish_01', 'phishing', 'user_admin',       '{"type": "email", "template": "tpl_phish_01", "landing_page": "lp_phish_01"}', 'clicked',  '{"opened": true, "clicked": true, "credentials_submitted": false, "reported": false}'),
  ('sim_phish_02', 'tenant1', 'camp_phish_01', 'phishing', 'billing_mgr',      '{"type": "email", "template": "tpl_phish_01", "landing_page": "lp_phish_01"}', 'reported', '{"opened": true, "reported": true, "time_to_report_sec": 120}'),
  ('sim_phish_03', 'tenant1', 'camp_phish_01', 'phishing', 'security_analyst', '{"type": "email", "template": "tpl_phish_02", "landing_page": "lp_phish_01"}', 'clicked',  '{"opened": true, "clicked": true, "credentials_submitted": true, "reported": false}');

-- ============================================
-- 48. API TOKENS
-- ============================================
INSERT INTO api_tokens (id, user_id, token_hash, expires_at) VALUES
  ('api_tkn_001', 'user_admin',       '$2b$10$hashed_token_example_001', NOW() + INTERVAL '90 days'),
  ('api_tkn_002', 'security_analyst', '$2b$10$hashed_token_example_002', NOW() + INTERVAL '365 days'),
  ('api_tkn_003', 'network_operator', '$2b$10$hashed_token_example_003', NOW() + INTERVAL '180 days');

-- ============================================
-- 49. SIMULATION EVENTS
-- ============================================
INSERT INTO simulation_events (tenant_id, user_id, campaign_id, event_type, metadata, channel, delivery_id) VALUES
  ('tenant1', 'user_admin',       'camp_phish_01', 'email_sent',     '{"email": "admin@cybersec.com", "template": "tpl_phish_01"}',              'email', NULL),
  ('tenant1', 'user_admin',       'camp_phish_01', 'email_opened',   '{"user_agent": "Chrome/120", "ip": "10.0.100.50", "timestamp": "..."}',   'email', NULL),
  ('tenant1', 'user_admin',       'camp_phish_01', 'link_clicked',   '{"landing_page": "lp_phish_01", "timestamp": "..."}',                      'email', NULL),
  ('tenant1', 'billing_mgr',      'camp_phish_01', 'email_sent',     '{"email": "billing@cybersec.com"}',                                       'email', NULL),
  ('tenant1', 'billing_mgr',      'camp_phish_01', 'reported',       '{"reported_to": "security@cybersec.com", "method": "outlook_plugin"}',    'email', NULL),
  ('tenant1', 'security_analyst', 'camp_phish_01', 'email_sent',     '{"email": "security@cybersec.com"}',                                      'email', NULL),
  ('tenant1', 'security_analyst', 'camp_phish_01', 'credentials_submitted', '{"username": "security_analyst", "page": "lp_phish_01"}',         'email', NULL);

COMMIT;
