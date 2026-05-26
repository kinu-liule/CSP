-- Fraud Detection Database Schema
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(100) UNIQUE,
    user_id VARCHAR(100),
    amount DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'USD',
    transaction_type VARCHAR(50),
    payment_method VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    risk_score DECIMAL(5,2),
    is_fraud BOOLEAN DEFAULT false,
    ip_address VARCHAR(45),
    device_id VARCHAR(100),
    location VARCHAR(100),
    merchant_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fraud_rules (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    rule_type VARCHAR(50),
    condition_expression TEXT,
    action VARCHAR(20),
    enabled BOOLEAN DEFAULT true,
    trigger_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fraud_alerts (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(50),
    rule_id VARCHAR(50),
    alert_type VARCHAR(50),
    severity VARCHAR(20),
    description TEXT,
    status VARCHAR(20) DEFAULT 'new',
    assigned_to VARCHAR(100),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL,
    FOREIGN KEY (rule_id) REFERENCES fraud_rules(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS user_profiles (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(100) NOT NULL,
    risk_level VARCHAR(20) DEFAULT 'low',
    transaction_count INTEGER DEFAULT 0,
    avg_transaction_amount DECIMAL(15,2),
    typical_locations TEXT[],
    devices TEXT[],
    last_activity TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ml_models (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    model_name VARCHAR(100),
    model_type VARCHAR(50),
    version VARCHAR(20),
    accuracy DECIMAL(5,4),
    trained_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'training',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_tenant ON transactions(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_tenant ON fraud_alerts(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_tenant_time ON transactions(tenant_id, created_at);

-- Sample data
INSERT INTO fraud_rules (id, tenant_id, name, description, rule_type, condition_expression, action, enabled)
VALUES
('frd_001', 'tenant1', 'High Amount Transaction', 'Flag transactions over $10,000', 'amount', 'amount > 10000', 'review', true),
('frd_002', 'tenant1', 'Rapid Transactions', 'Detect multiple quick transactions', 'velocity', 'count > 5 in 5 minutes', 'block', true),
('frd_003', 'tenant1', 'New Device', 'Flag transactions from new devices', 'device', 'device_id NOT IN user_devices', 'review', true)
ON CONFLICT DO NOTHING;
