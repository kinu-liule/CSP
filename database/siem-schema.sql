-- SIEM Database Schema (Fixed)
CREATE TABLE IF NOT EXISTS log_sources (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50),
    ip_address VARCHAR(45),
    port INTEGER,
    protocol VARCHAR(10) DEFAULT 'UDP',
    format VARCHAR(50),
    enabled BOOLEAN DEFAULT true,
    last_seen TIMESTAMP,
    events_count BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    source_id VARCHAR(50),
    event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    severity VARCHAR(20),
    event_type VARCHAR(100),
    source_ip VARCHAR(45),
    dest_ip VARCHAR(45),
    dest_port INTEGER,
    user_id VARCHAR(100),
    message TEXT,
    raw_log TEXT,
    tags TEXT[],
    FOREIGN KEY (source_id) REFERENCES log_sources(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    event_id VARCHAR(50),
    alert_name VARCHAR(255) NOT NULL,
    severity VARCHAR(20),
    description TEXT,
    status VARCHAR(20) DEFAULT 'new',
    assigned_to VARCHAR(100),
    rule_id VARCHAR(50),
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS alert_rules (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    query TEXT,
    condition_expression TEXT,
    severity VARCHAR(20),
    enabled BOOLEAN DEFAULT true,
    match_count INTEGER DEFAULT 0,
    last_matched TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS threat_intel (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    indicator_type VARCHAR(20),
    indicator_value VARCHAR(255),
    threat_type VARCHAR(50),
    confidence INTEGER,
    source VARCHAR(100),
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_tenant_time ON events(tenant_id, event_time);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_alerts_tenant ON alerts(tenant_id, status);

-- Sample data
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM log_sources WHERE id = 'src_001') THEN
    INSERT INTO log_sources (id, tenant_id, name, source_type, ip_address, port)
    VALUES('src_001', 'tenant1', 'Firewall Logs', 'firewall', '10.0.0.1', 514);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM alert_rules WHERE id = 'rule_001') THEN
    INSERT INTO alert_rules (id, tenant_id, name, description, severity, query, enabled)
    VALUES('rule_001', 'tenant1', 'Multiple Failed Logins', 'Detect brute force attempts', 'high', 'event_type="login_failed" AND count > 5', true);
  END IF;
END
$$;
