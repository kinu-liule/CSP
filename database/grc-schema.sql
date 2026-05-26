-- GRC Platform Database Schema
CREATE TABLE IF NOT EXISTS policies (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    policy_type VARCHAR(50),
    framework VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    version VARCHAR(20) DEFAULT '1.0',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS controls (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    policy_id VARCHAR(50),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    control_type VARCHAR(50),
    framework VARCHAR(100),
    status VARCHAR(20) DEFAULT 'active',
    implementation_status VARCHAR(20) DEFAULT 'not_started',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (policy_id) REFERENCES policies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS risks (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    likelihood INTEGER CHECK (likelihood BETWEEN 1 AND 5),
    impact INTEGER CHECK (impact BETWEEN 1 AND 5),
    risk_score INTEGER,
    treatment VARCHAR(50),
    status VARCHAR(20) DEFAULT 'open',
    owner VARCHAR(100),
    mitigation_plan TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compliance_frameworks (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20),
    description TEXT,
    requirements_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compliance_scores (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    framework_id VARCHAR(50),
    score DECIMAL(5,2),
    assessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audits (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    audit_type VARCHAR(50),
    scope TEXT,
    status VARCHAR(20) DEFAULT 'planned',
    start_date DATE,
    end_date DATE,
    auditor VARCHAR(100),
    findings_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_policies_tenant ON policies(tenant_id);
CREATE INDEX idx_controls_tenant ON controls(tenant_id);
CREATE INDEX idx_risks_tenant ON risks(tenant_id);
CREATE INDEX idx_compliance_scores_tenant ON compliance_scores(tenant_id);
CREATE INDEX idx_audits_tenant ON audits(tenant_id);

-- Sample data
INSERT INTO policies (id, tenant_id, name, description, policy_type, framework, status)
VALUES 
('pol_001', 'tenant1', 'Data Protection Policy', 'Protect sensitive data', 'security', 'GDPR', 'active'),
('pol_002', 'tenant1', 'Access Control Policy', 'Control system access', 'security', 'ISO27001', 'active')
ON CONFLICT DO NOTHING;

INSERT INTO compliance_frameworks (id, tenant_id, name, version, description, requirements_count)
VALUES
('frm_001', 'tenant1', 'GDPR', '2018', 'General Data Protection Regulation', 12),
('frm_002', 'tenant1', 'ISO 27001', '2022', 'Information Security Management', 14)
ON CONFLICT DO NOTHING;
