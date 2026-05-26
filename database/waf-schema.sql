-- WAF Service Database Schema v2.0
-- Enhanced with profiles, signatures, geo-ip, reputation, auto-blacklist, response headers, request validation

-- ==================== CORE ENTITIES ====================

CREATE TABLE IF NOT EXISTS waf_profiles (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    mode VARCHAR(20) DEFAULT 'blocking' CHECK (mode IN ('blocking', 'detection', 'simulation')),
    paranoia_level INTEGER DEFAULT 1 CHECK (paranoia_level BETWEEN 1 AND 4),
    target_protocol VARCHAR(10) DEFAULT 'https',
    target_domains TEXT[],
    backend_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS waf_rule_groups (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'custom' CHECK (category IN ('owasp', 'custom', 'pci-dss', 'vendor', 'threat-intel')),
    version VARCHAR(20),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS waf_rules (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    group_id VARCHAR(50) REFERENCES waf_rule_groups(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN (
        'regex', 'signature', 'anomaly', 'correlation', 'behavioral',
        'input_validation', 'csrf', 'directory_traversal', 'file_inclusion',
        'command_injection', 'ldap_injection', 'ssrf', 'xxe'
    )),
    detection_field VARCHAR(50) DEFAULT 'request_uri' CHECK (detection_field IN (
        'request_uri', 'request_body', 'request_headers', 'request_cookies',
        'query_string', 'request_method', 'user_agent', 'referer',
        'content_type', 'response_body', 'response_headers', 'all'
    )),
    pattern TEXT,
    pattern_type VARCHAR(20) DEFAULT 'regex' CHECK (pattern_type IN ('regex', 'exact', 'prefix', 'suffix', 'contains', 'signature_id')),
    action VARCHAR(20) NOT NULL DEFAULT 'block' CHECK (action IN ('block', 'allow', 'log', 'redirect', 'challenge', 'drop', 'delay')),
    action_value TEXT,
    severity VARCHAR(20) DEFAULT 'medium' CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
    priority INTEGER DEFAULT 100,
    score DECIMAL(5,2) DEFAULT 5.0,
    enabled BOOLEAN DEFAULT true,
    is_negated BOOLEAN DEFAULT false,
    tags TEXT[],
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS waf_profile_rules (
    id SERIAL PRIMARY KEY,
    profile_id VARCHAR(50) REFERENCES waf_profiles(id) ON DELETE CASCADE,
    rule_id VARCHAR(50) REFERENCES waf_rules(id) ON DELETE CASCADE,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, rule_id)
);

-- ==================== SIGNATURE DATABASE ====================

CREATE TABLE IF NOT EXISTS waf_signatures (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) CHECK (category IN (
        'sqli', 'xss', 'lfi', 'rfi', 'cmd_exec', 'path_traversal',
        'csrf', 'ssrf', 'ldap', 'xxe', 'smuggling', 'bots',
        'scanners', 'exploit_kit', 'malware', 'cve'
    )),
    cve_id VARCHAR(20),
    pattern TEXT NOT NULL,
    detection_field VARCHAR(50) DEFAULT 'request_uri',
    severity VARCHAR(20) DEFAULT 'medium',
    confidence DECIMAL(3,2) DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
    references_url TEXT[],
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

-- ==================== GEO-IP & REPUTATION ====================

CREATE TABLE IF NOT EXISTS waf_geoip_rules (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    countries TEXT[] NOT NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'block' CHECK (action IN ('block', 'allow', 'challenge', 'log')),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS waf_ip_reputation (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    ip_address INET NOT NULL,
    score INTEGER DEFAULT 0 CHECK (score >= 0 AND score <= 100),
    category VARCHAR(50) CHECK (category IN (
        'tor', 'proxy', 'vpn', 'datacenter', 'scanner', 'spammer',
        'malicious', 'botnet', 'phishing', 'trusted'
    )),
    source VARCHAR(100),
    expires_at TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, ip_address)
);

CREATE TABLE IF NOT EXISTS waf_auto_blacklist (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    ip_address INET NOT NULL,
    reason TEXT,
    triggered_by_rule_id VARCHAR(50),
    violation_count INTEGER DEFAULT 1,
    score_at_block INTEGER,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

-- ==================== ADVANCED LOGGING ====================

CREATE TABLE IF NOT EXISTS waf_attack_events (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    event_id UUID DEFAULT gen_random_uuid(),
    rule_id VARCHAR(50),
    rule_name VARCHAR(255),
    profile_id VARCHAR(50),
    signature_id VARCHAR(50),
    source_ip INET NOT NULL,
    source_country VARCHAR(2),
    request_method VARCHAR(10),
    request_path TEXT,
    request_query TEXT,
    request_headers JSONB,
    request_body TEXT,
    response_code INTEGER,
    response_size INTEGER,
    user_agent TEXT,
    referer TEXT,
    matched_field VARCHAR(50),
    matched_value TEXT,
    action_taken VARCHAR(20),
    severity VARCHAR(20),
    score DECIMAL(5,2),
    tags TEXT[],
    request_id VARCHAR(50),
    session_id VARCHAR(50),
    user_id VARCHAR(50),
    blocked BOOLEAN DEFAULT false,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_attack_events_tenant_time ON waf_attack_events(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attack_events_source_ip ON waf_attack_events(source_ip);
CREATE INDEX IF NOT EXISTS idx_attack_events_severity ON waf_attack_events(severity);
CREATE INDEX IF NOT EXISTS idx_attack_events_event_id ON waf_attack_events(event_id);

-- ==================== RATE LIMITING ENHANCED ====================

CREATE TABLE IF NOT EXISTS waf_rate_limits (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    path_pattern TEXT,
    http_methods TEXT[],
    dimension VARCHAR(20) DEFAULT 'ip' CHECK (dimension IN ('ip', 'session', 'user', 'api_key', 'global')),
    requests_per_minute INTEGER DEFAULT 60,
    burst INTEGER DEFAULT 10,
    burst_duration_seconds INTEGER DEFAULT 5,
    action VARCHAR(20) DEFAULT 'block' CHECK (action IN ('block', 'delay', 'challenge')),
    response_code INTEGER DEFAULT 429,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

-- ==================== REQUEST VALIDATION ====================

CREATE TABLE IF NOT EXISTS waf_request_validation (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    profile_id VARCHAR(50) REFERENCES waf_profiles(id) ON DELETE CASCADE,
    allowed_methods TEXT[] DEFAULT ARRAY['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowed_content_types TEXT[],
    max_body_size_bytes BIGINT DEFAULT 10485760,
    max_query_length INTEGER DEFAULT 2048,
    max_uri_length INTEGER DEFAULT 4096,
    max_headers_count INTEGER DEFAULT 50,
    max_single_header_size INTEGER DEFAULT 8192,
    allowed_protocols TEXT[] DEFAULT ARRAY['HTTP/1.1', 'HTTP/2', 'HTTP/3'],
    enforce_json_schema BOOLEAN DEFAULT false,
    json_schema JSONB,
    allowed_extensions TEXT[],
    blocked_extensions TEXT[] DEFAULT ARRAY['.exe', '.dll', '.bat', '.sh', '.jar', '.class'],
    enforce_utf8 BOOLEAN DEFAULT true,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

-- ==================== RESPONSE SECURITY HEADERS ====================

CREATE TABLE IF NOT EXISTS waf_response_headers (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    profile_id VARCHAR(50) REFERENCES waf_profiles(id) ON DELETE CASCADE,
    headers JSONB NOT NULL DEFAULT '{
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "X-XSS-Protection": "1; mode=block",
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Content-Security-Policy": "default-src ''self''",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        "Cache-Control": "no-store, max-age=0"
    }',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

-- ==================== WHITELIST & BLACKLIST (ENHANCED) ====================

CREATE TABLE IF NOT EXISTS waf_whitelist (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    ip_address INET,
    cidr_block CIDR,
    description TEXT,
    source VARCHAR(100),
    expires_at TIMESTAMP,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS waf_blacklist (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    ip_address INET,
    cidr_block CIDR,
    reason TEXT,
    source VARCHAR(100) DEFAULT 'manual',
    expires_at TIMESTAMP,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

-- ==================== ANALYTICS & REPORTS ====================

CREATE TABLE IF NOT EXISTS waf_reports (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN (
        'summary', 'top_attackers', 'attack_trends', 'rule_performance',
        'compliance', 'custom'
    )),
    config JSONB,
    schedule VARCHAR(30) CHECK (schedule IN ('daily', 'weekly', 'monthly', 'manual')),
    recipients TEXT[],
    last_generated TIMESTAMP,
    format VARCHAR(10) DEFAULT 'pdf' CHECK (format IN ('pdf', 'csv', 'json', 'html')),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    department_id VARCHAR(50)
);

-- ==================== INDEXES ====================

CREATE INDEX IF NOT EXISTS idx_waf_rules_tenant_group ON waf_rules(tenant_id, group_id);
CREATE INDEX IF NOT EXISTS idx_waf_rules_type ON waf_rules(rule_type);
CREATE INDEX IF NOT EXISTS idx_waf_rules_severity ON waf_rules(severity);
CREATE INDEX IF NOT EXISTS idx_waf_rules_enabled ON waf_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_waf_profiles_tenant ON waf_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waf_signatures_category ON waf_signatures(category);
CREATE INDEX IF NOT EXISTS idx_waf_geoip_tenant ON waf_geoip_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waf_ip_rep_score ON waf_ip_reputation(score DESC);
CREATE INDEX IF NOT EXISTS idx_waf_auto_blacklist_ip ON waf_auto_blacklist(ip_address);
CREATE INDEX IF NOT EXISTS idx_waf_auto_blacklist_expires ON waf_auto_blacklist(expires_at);
CREATE INDEX IF NOT EXISTS idx_waf_rate_limits_tenant ON waf_rate_limits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_waf_request_val_profile ON waf_request_validation(profile_id);
CREATE INDEX IF NOT EXISTS idx_waf_response_headers_profile ON waf_response_headers(profile_id);

-- ==================== SAMPLE DATA ====================

DO $$
DECLARE
    grp_owasp VARCHAR(50) := 'grp_' || encode(gen_random_bytes(6), 'hex');
    grp_custom VARCHAR(50) := 'grp_' || encode(gen_random_bytes(6), 'hex');
    prof_default VARCHAR(50) := 'prof_' || encode(gen_random_bytes(6), 'hex');
BEGIN
    IF NOT EXISTS (SELECT 1 FROM waf_rule_groups WHERE name = 'OWASP Top 10') THEN
        INSERT INTO waf_rule_groups (id, tenant_id, name, description, category, version)
        VALUES (grp_owasp, 'default', 'OWASP Top 10', 'OWASP Top 10 attack detection rules', 'owasp', '2021');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_rule_groups WHERE name = 'Custom Rules') THEN
        INSERT INTO waf_rule_groups (id, tenant_id, name, description, category)
        VALUES (grp_custom, 'default', 'Custom Rules', 'User-defined custom rules', 'custom');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_rules WHERE name = 'SQL Injection - Basic') THEN
        INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, action, severity, priority, score)
        VALUES ('rule_' || encode(gen_random_bytes(6), 'hex'), 'default', grp_owasp,
            'SQL Injection - Basic',
            'Detects basic SQL injection attempts via UNION, OR 1=1, etc.',
            'regex', 'request_uri',
            '(union\s+.*select|select\s+.*from|or\s+1\s*=\s*1|drop\s+table|--\s|;\s*--)',
            'block', 'critical', 10, 9.5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_rules WHERE name = 'Cross-Site Scripting (XSS)') THEN
        INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, action, severity, priority, score)
        VALUES ('rule_' || encode(gen_random_bytes(6), 'hex'), 'default', grp_owasp,
            'Cross-Site Scripting (XSS)',
            'Detects reflected/stored XSS attack patterns',
            'regex', 'request_uri',
            '<script[^>]*>|javascript:\s*\(|onerror\s*=|onload\s*=|onclick\s*=|alert\s*\(|prompt\s*\(|confirm\s*\(',
            'block', 'high', 20, 8.0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_rules WHERE name = 'Path Traversal') THEN
        INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, action, severity, priority, score)
        VALUES ('rule_' || encode(gen_random_bytes(6), 'hex'), 'default', grp_owasp,
            'Path Traversal',
            'Detects directory traversal attempts',
            'path_traversal', 'request_uri',
            '\.\.\\/|\.\.\/|%2e%2e%2f|%2e%2e\/|\.\.%5c|\.\.\\|%252e%252e%252f',
            'block', 'high', 30, 8.5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_rules WHERE name = 'Local File Inclusion') THEN
        INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, action, severity, priority, score)
        VALUES ('rule_' || encode(gen_random_bytes(6), 'hex'), 'default', grp_owasp,
            'Local File Inclusion',
            'Detects LFI attack attempts',
            'file_inclusion', 'query_string',
            'file=|include=|require=|include_once=|require_once=|page=.*\.\.|etc/passwd|etc/shadow|proc/self/environ|boot\.ini',
            'block', 'high', 40, 8.0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_rules WHERE name = 'Command Injection') THEN
        INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, action, severity, priority, score)
        VALUES ('rule_' || encode(gen_random_bytes(6), 'hex'), 'default', grp_owasp,
            'Command Injection',
            'Detects OS command injection attempts',
            'command_injection', 'request_uri',
            ';\s*(ls|cat|id|whoami|pwd|rm|chmod|chown|wget|curl|nc|bash|sh|powershell|cmd)|\|\s*(ls|cat|id|whoami)',
            'block', 'critical', 50, 9.5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_rules WHERE name = 'Remote File Inclusion') THEN
        INSERT INTO waf_rules (id, tenant_id, group_id, name, description, rule_type, detection_field, pattern, action, severity, priority, score)
        VALUES ('rule_' || encode(gen_random_bytes(6), 'hex'), 'default', grp_owasp,
            'Remote File Inclusion',
            'Detects RFI attack attempts',
            'regex', 'query_string',
            '(http|https|ftp):\/\/.*\.(php|asp|jsp|pl|cgi|py)',
            'block', 'critical', 60, 8.5);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_profiles WHERE name = 'Default Profile') THEN
        INSERT INTO waf_profiles (id, tenant_id, name, description, mode, paranoia_level)
        VALUES (prof_default, 'default', 'Default Profile', 'Standard web application protection', 'blocking', 2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_response_headers WHERE name = 'Default Security Headers') THEN
        INSERT INTO waf_response_headers (id, tenant_id, name, headers)
        VALUES ('hdr_' || encode(gen_random_bytes(6), 'hex'), 'default',
            'Default Security Headers',
            '{"X-Content-Type-Options": "nosniff","X-Frame-Options": "DENY","X-XSS-Protection": "1; mode=block","Strict-Transport-Security": "max-age=31536000; includeSubDomains","Content-Security-Policy": "default-src ''self''","Referrer-Policy": "strict-origin-when-cross-origin","Permissions-Policy": "camera=(), microphone=(), geolocation=()","Cache-Control": "no-store, max-age=0"}');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM waf_request_validation WHERE name = 'Default Validation') THEN
        INSERT INTO waf_request_validation (id, tenant_id, name, allowed_methods, allowed_content_types, max_body_size_bytes, max_uri_length)
        VALUES ('val_' || encode(gen_random_bytes(6), 'hex'), 'default',
            'Default Validation',
            ARRAY['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            ARRAY['application/json', 'application/xml', 'application/x-www-form-urlencoded', 'multipart/form-data'],
            20971520, 8192);
    END IF;
END $$;
