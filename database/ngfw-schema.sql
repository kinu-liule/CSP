-- NGFW (Next-Generation Firewall) Database Schema
CREATE TABLE IF NOT EXISTS firewall_rules (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_ip VARCHAR(45),
    source_zone VARCHAR(50),
    dest_ip VARCHAR(45),
    dest_zone VARCHAR(50),
    dest_port VARCHAR(100),
    protocol VARCHAR(10),
    action VARCHAR(20) DEFAULT 'allow',
    enabled BOOLEAN DEFAULT true,
    hit_count INTEGER DEFAULT 0,
    last_hit TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS firewall_logs (
    id SERIAL PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    rule_id VARCHAR(50),
    source_ip VARCHAR(45),
    dest_ip VARCHAR(45),
    dest_port INTEGER,
    protocol VARCHAR(10),
    action VARCHAR(20),
    reason TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rule_id) REFERENCES firewall_rules(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS zones (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    interface_name VARCHAR(50),
    subnet VARCHAR(50),
    security_level INTEGER DEFAULT 50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS nat_rules (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    nat_type VARCHAR(20),
    original_source VARCHAR(45),
    translated_source VARCHAR(45),
    original_dest VARCHAR(45),
    translated_dest VARCHAR(45),
    original_port VARCHAR(20),
    translated_port VARCHAR(20),
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS vpn_connections (
    id VARCHAR(50) PRIMARY KEY,
    tenant_id VARCHAR(50) NOT NULL,
    name VARCHAR(255),
    vpn_type VARCHAR(20),
    remote_gateway VARCHAR(45),
    local_network VARCHAR(50),
    remote_network VARCHAR(50),
    status VARCHAR(20) DEFAULT 'disconnected',
    bytes_in BIGINT DEFAULT 0,
    bytes_out BIGINT DEFAULT 0,
    connected_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fw_rules_tenant ON firewall_rules(tenant_id);
CREATE INDEX idx_fw_logs_tenant ON firewall_logs(tenant_id, timestamp);
CREATE INDEX idx_zones_tenant ON zones(tenant_id);

-- Sample data
INSERT INTO zones (id, tenant_id, name, description, interface_name, subnet, security_level)
VALUES
('zone_001', 'tenant1', 'Internal', 'Internal trusted network', 'eth0', '10.0.0.0/24', 100),
('zone_002', 'tenant1', 'DMZ', 'Demilitarized zone', 'eth1', '10.0.1.0/24', 50),
('zone_003', 'tenant1', 'External', 'Internet facing', 'eth2', '0.0.0.0/0', 0)
ON CONFLICT DO NOTHING;

INSERT INTO firewall_rules (id, tenant_id, name, source_zone, dest_zone, dest_port, protocol, action)
VALUES
('fw_001', 'tenant1', 'Allow HTTP Outbound', 'Internal', 'External', '80', 'TCP', 'allow'),
('fw_002', 'tenant1', 'Allow HTTPS Outbound', 'Internal', 'External', '443', 'TCP', 'allow'),
('fw_003', 'tenant1', 'Block Telnet', 'External', 'Internal', '23', 'TCP', 'deny')
ON CONFLICT DO NOTHING;
