-- Enhanced GRC Database Schema (Production-Ready)

-- =======================
-- CORE TABLES
-- =======================

-- Users (extends existing)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) REFERENCES tenants(id),
    username VARCHAR(100) UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    department_id INTEGER,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- ASSETS
-- =======================
CREATE TABLE IF NOT EXISTS assets (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(100), -- server, database, application, network
    criticality VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    owner_id VARCHAR(50) REFERENCES users(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- POLICIES
-- =======================
CREATE TABLE IF NOT EXISTS policies (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    policy_type VARCHAR(50), -- security, privacy, compliance
    framework VARCHAR(100), -- ISO 27001, NIST, CIS
    version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(20) DEFAULT 'draft', -- draft, active, archived
    owner_id VARCHAR(50) REFERENCES users(id),
    approved_by VARCHAR(50) REFERENCES users(id),
    effective_date DATE,
    review_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Policy Documents
CREATE TABLE IF NOT EXISTS policy_documents (
    id VARCHAR(50) PRIMARY KEY,
    policy_id VARCHAR(50) REFERENCES policies(id) ON DELETE CASCADE,
    version VARCHAR(20),
    content TEXT,
    uploaded_by VARCHAR(50) REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- CONTROLS
-- =======================
CREATE TABLE IF NOT EXISTS controls (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    policy_id VARCHAR(50) REFERENCES policies(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    control_type VARCHAR(50), -- preventive, detective, corrective
    framework VARCHAR(100),
    status VARCHAR(20) DEFAULT 'compliant', -- compliant, non-compliant, partial
    effectiveness_score DECIMAL(5,2),
    owner_id VARCHAR(50) REFERENCES users(id),
    test_frequency VARCHAR(20), -- monthly, quarterly, annually
    last_tested DATE,
    next_test_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Control Mappings (Many-to-Many: Controls ↔ Frameworks)
CREATE TABLE IF NOT EXISTS control_mappings (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    control_id VARCHAR(50) REFERENCES controls(id) ON DELETE CASCADE,
    framework_id VARCHAR(50) REFERENCES compliance_frameworks(id),
    mapping_ref VARCHAR(100), -- e.g., "A.12.1.1"
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(control_id, framework_id)
);

-- =======================
-- RISKS
-- =======================
CREATE TABLE IF NOT EXISTS risks (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- cyber, operational, strategic, compliance
    likelihood INTEGER CHECK (likelihood BETWEEN 1 AND 5),
    impact INTEGER CHECK (impact BETWEEN 1 AND 5),
    risk_score DECIMAL(5,2), -- likelihood × impact × asset_criticality
    treatment VARCHAR(50), -- accept, mitigate, transfer, avoid
    status VARCHAR(20) DEFAULT 'open', -- open, in-progress, closed
    owner_id VARCHAR(50) REFERENCES users(id),
    asset_id INTEGER REFERENCES assets(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Risk Treatments
CREATE TABLE IF NOT EXISTS risk_treatments (
    id VARCHAR(50) PRIMARY KEY,
    risk_id VARCHAR(50) REFERENCES risks(id) ON DELETE CASCADE,
    treatment_type VARCHAR(50),
    description TEXT,
    cost DECIMAL(10,2),
    implemented_by VARCHAR(50) REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- COMPLIANCE
-- =======================
CREATE TABLE IF NOT EXISTS compliance_frameworks (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(100) NOT NULL,
    version VARCHAR(20),
    description TEXT,
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

-- =======================
-- AUDITS
-- =======================
CREATE TABLE IF NOT EXISTS audits (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    auditor_id VARCHAR(50) REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'planned', -- planned, in-progress, completed
    start_date DATE,
    end_date DATE,
    summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit Findings
CREATE TABLE IF NOT EXISTS audit_findings (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    audit_id VARCHAR(50) REFERENCES audits(id) ON DELETE CASCADE,
    control_id VARCHAR(50) REFERENCES controls(id),
    severity VARCHAR(20), -- low, medium, high, critical
    description TEXT,
    recommendation TEXT,
    status VARCHAR(20) DEFAULT 'open', -- open, resolved, accepted
    due_date DATE,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- VULNERABILITIES
-- =======================
CREATE TABLE IF NOT EXISTS vulnerabilities (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    asset_id INTEGER REFERENCES assets(id),
    cve_id VARCHAR(50),
    severity VARCHAR(20),
    description TEXT,
    status VARCHAR(20) DEFAULT 'open',
    discovered_date DATE,
    remediation_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- VENDORS & THIRD PARTY
-- =======================
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    risk_rating VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vendor_risks (
    id VARCHAR(50) PRIMARY KEY,
    vendor_id INTEGER REFERENCES vendors(id),
    risk_id VARCHAR(50) REFERENCES risks(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =======================
-- AUDIT LOGS (Enhanced)
-- =======================
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL REFERENCES tenants(id),
    user_id VARCHAR(50) REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    resource_type VARCHAR(50), -- risk, policy, control, asset
    resource_id VARCHAR(50),
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO compliance_frameworks (id, tenant_id, name, version)
VALUES ('frm_1', 'tenant1', 'ISO 27001', '2013'),
       ('frm_2', 'tenant1', 'NIST CSF', '1.1'),
       ('frm_3', 'tenant1', 'CIS Controls', 'v8')
ON CONFLICT (id) DO NOTHING;

INSERT INTO policies (id, tenant_id, name, policy_type, framework, status)
VALUES ('pol_1', 'tenant1', 'Information Security Policy', 'security', 'ISO 27001', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO controls (id, tenant_id, policy_id, name, control_type, framework, status)
VALUES ('ctrl_1', 'tenant1', 'pol_1', 'Access Control', 'preventive', 'ISO 27001', 'compliant')
ON CONFLICT (id) DO NOTHING;

INSERT INTO risks (id, tenant_id, title, category, likelihood, impact, risk_score, status)
VALUES ('risk_1', 'tenant1', 'Phishing Attack', 'cyber', 4, 5, 20.00, 'open')
ON CONFLICT (id) DO NOTHING;

SELECT 'Production-ready GRC schema created!' as status;
