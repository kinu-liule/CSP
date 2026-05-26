-- Vulnerability Scanner Database Schema (Fixed)
CREATE TABLE IF NOT EXISTS vulnerabilities (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    cve_id VARCHAR(50),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    cvss_score DECIMAL(3,1),
    status VARCHAR(20) DEFAULT 'open',
    affected_asset VARCHAR(255),
    asset_type VARCHAR(50),
    port INTEGER,
    protocol VARCHAR(10),
    solution TEXT,
    references TEXT,
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scans (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    scan_type VARCHAR(50),
    target VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending',
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    vulnerabilities_found INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    scan_config JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(50),
    ip_address VARCHAR(45),
    hostname VARCHAR(255),
    os VARCHAR(100),
    owner VARCHAR(100),
    tags TEXT[],
    last_scan TIMESTAMP,
    vulnerability_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS scan_results (
    id SERIAL PRIMARY KEY,
    scan_id VARCHAR(50),
    vulnerability_id VARCHAR(50),
    tenant_id VARCHAR(50) NOT NULL,
    raw_output TEXT,
    FOREIGN KEY (scan_id) REFERENCES scans(id) ON DELETE CASCADE,
    FOREIGN KEY (vulnerability_id) REFERENCES vulnerabilities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_vulns_tenant ON vulnerabilities(tenant_id, severity);
CREATE INDEX IF NOT EXISTS idx_scans_tenant ON scans(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_assets_tenant ON assets(tenant_id);

-- Sample data
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM assets WHERE id = 'ast_001') THEN
    INSERT INTO assets (id, tenant_id, name, asset_type, ip_address, os)
    VALUES('ast_001', 'tenant1', 'Web Server 1', 'server', '10.0.0.10', 'Ubuntu 22.04');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM assets WHERE id = 'ast_002') THEN
    INSERT INTO assets (id, tenant_id, name, asset_type, ip_address, os)
    VALUES('ast_002', 'tenant1', 'Database Server', 'server', '10.0.0.20', 'Windows Server 2019');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vulnerabilities WHERE id = 'vul_001') THEN
    INSERT INTO vulnerabilities (id, tenant_id, cve_id, title, severity, cvss_score, affected_asset)
    VALUES('vul_001', 'tenant1', 'CVE-2024-1234', 'Apache Log4j Remote Code Execution', 'critical', 10.0, 'Web Server 1');
  END IF;
END
$$;
