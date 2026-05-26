-- Advanced Campaign Targeting Schema
-- Run this in addition to the existing awareness-full-schema.sql

-- External entities table (suppliers, public bodies, partners)
CREATE TABLE IF NOT EXISTS external_entities (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('supplier', 'public_body', 'partner', 'contractor')),
    name VARCHAR(255) NOT NULL,
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    contact_person VARCHAR(255),
    address TEXT,
    risk_level VARCHAR(20) DEFAULT 'medium' CHECK (risk_level IN ('low', 'medium', 'high')),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Employee groups for targeting
CREATE TABLE IF NOT EXISTS employee_groups (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    group_type VARCHAR(50) NOT NULL CHECK (group_type IN ('department', 'management', 'all_employees', 'custom')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign targeting rules (which groups/channels to target)
CREATE TABLE IF NOT EXISTS campaign_targeting (
    id SERIAL PRIMARY KEY,
    campaign_id VARCHAR(255) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('all_employees', 'management', 'department', 'supplier', 'public_body', 'custom_group')),
    target_id INTEGER, -- NULL for 'all_employees' and 'management', otherwise references department/group/entity id
    channel VARCHAR(50) NOT NULL CHECK (channel IN ('email', 'sms', 'voice', 'usb', 'in_person')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign deliveries (tracking actual sends)
CREATE TABLE IF NOT EXISTS campaign_deliveries (
    id SERIAL PRIMARY KEY,
    campaign_id VARCHAR(255) NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    target_user_id VARCHAR(255), -- NULL for external entities
    target_entity_id INTEGER REFERENCES external_entities(id) ON DELETE SET NULL,
    target_email VARCHAR(255),
    target_phone VARCHAR(50),
    channel VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
    sent_at TIMESTAMP,
    error_message TEXT,
    tracking_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enhanced simulation events to track channel and campaign delivery
ALTER TABLE simulation_events ADD COLUMN IF NOT EXISTS channel VARCHAR(50);
ALTER TABLE simulation_events ADD COLUMN IF NOT EXISTS delivery_id INTEGER REFERENCES campaign_deliveries(id) ON DELETE SET NULL;

-- Sample data: Employee groups
INSERT INTO employee_groups (tenant_id, name, description, group_type) VALUES
('tenant1', 'All Employees', 'All company employees', 'all_employees'),
('tenant1', 'Top Management', 'C-level executives and VPs', 'management'),
('tenant1', 'IT Department', 'Information Technology Department', 'department'),
('tenant1', 'HR Department', 'Human Resources Department', 'department'),
('tenant1', 'Finance Department', 'Finance and Accounting Department', 'department')
ON CONFLICT DO NOTHING;

-- Sample data: External entities (suppliers and public bodies)
INSERT INTO external_entities (tenant_id, entity_type, name, contact_email, contact_phone, contact_person, risk_level) VALUES
('tenant1', 'supplier', 'TechSupply Inc.', 'contact@techsupply.com', '+1234567890', 'John Smith', 'medium'),
('tenant1', 'supplier', 'CloudServices Ltd.', 'security@cloudservices.com', '+1987654321', 'Jane Doe', 'high'),
('tenant1', 'public_body', 'Data Protection Authority', 'incidents@dpa.gov', '+1122334455', 'Regulator Office', 'low'),
('tenant1', 'public_body', 'Cybersecurity Agency', 'alerts@cyberagency.gov', '+5566778899', 'Security Desk', 'low'),
('tenant1', 'partner', 'Legal Consultants LLC', 'info@legalconsult.com', '+3344556677', 'Mike Wilson', 'medium')
ON CONFLICT DO NOTHING;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaign_targeting_campaign ON campaign_targeting(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_deliveries_campaign ON campaign_deliveries(campaign_id);
CREATE INDEX IF NOT EXISTS idx_external_entities_tenant ON external_entities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_groups_tenant ON employee_groups(tenant_id);

SELECT 'Advanced targeting schema created successfully' AS status;
