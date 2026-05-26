-- GRC Platform Schema

-- Policies
CREATE TABLE IF NOT EXISTS policies (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    policy_type VARCHAR(50),
    version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(20) DEFAULT 'draft',
    framework VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Controls
CREATE TABLE IF NOT EXISTS controls (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    policy_id VARCHAR(50) REFERENCES policies(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    control_type VARCHAR(50),
    framework VARCHAR(100),
    status VARCHAR(20) DEFAULT 'compliant',
    effectiveness_score DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risks
CREATE TABLE IF NOT EXISTS risks (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    likelihood INTEGER CHECK (likelihood BETWEEN 1 AND 5),
    impact INTEGER CHECK (impact BETWEEN 1 AND 5),
    risk_score DECIMAL(5,2),
    treatment VARCHAR(50),
    status VARCHAR(20) DEFAULT 'open',
    owner_id VARCHAR(50) REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Compliance Frameworks
CREATE TABLE IF NOT EXISTS compliance_frameworks (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Control Mappings
CREATE TABLE IF NOT EXISTS control_mappings (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    policy_id VARCHAR(50) REFERENCES policies(id),
    control_id VARCHAR(50) REFERENCES controls(id),
    framework_id VARCHAR(50) REFERENCES compliance_frameworks(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(policy_id, control_id, framework_id)
);

-- Audit Findings
CREATE TABLE IF NOT EXISTS audit_findings (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    audit_id VARCHAR(50),
    control_id VARCHAR(50) REFERENCES controls(id),
    severity VARCHAR(20),
    description TEXT,
    recommendation TEXT,
    status VARCHAR(20) DEFAULT 'open',
    due_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Compliance Scores
CREATE TABLE IF NOT EXISTS compliance_scores (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    framework_id VARCHAR(50) REFERENCES compliance_frameworks(id),
    score DECIMAL(5,2),
    calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample data
INSERT INTO policies (id, tenant_id, name, policy_type, framework)
VALUES ('pol_1', 'tenant1', 'Password Policy', 'security', 'ISO 27001')
ON CONFLICT (id) DO NOTHING;

INSERT INTO controls (id, tenant_id, policy_id, name, control_type, framework, status)
VALUES ('ctrl_1', 'tenant1', 'pol_1', 'Password Complexity', 'technical', 'ISO 27001', 'compliant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO risks (id, tenant_id, title, category, likelihood, impact, risk_score, status)
VALUES ('risk_1', 'tenant1', 'Phishing Attack', 'cybersecurity', 4, 5, 20.00, 'open')
ON CONFLICT (id) DO NOTHING;

INSERT INTO compliance_frameworks (id, tenant_id, name, version)
VALUES ('frm_1', 'tenant1', 'ISO 27001', '2013')
ON CONFLICT (id) DO NOTHING;

SELECT 'GRC schema created!' as status;
