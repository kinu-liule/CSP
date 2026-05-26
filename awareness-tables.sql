-- Awareness Platform Tables
CREATE TABLE IF NOT EXISTS campaigns (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'draft',
  content JSONB,
  target_users TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS simulation_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50),
  campaign_id VARCHAR(50),
  event_type VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_modules (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  type VARCHAR(50),
  content JSONB,
  duration INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_training (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  module_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'assigned',
  score INT,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_scores (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  user_id VARCHAR(50) NOT NULL,
  score DECIMAL(5,2),
  factors JSONB,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample data
INSERT INTO campaigns (id, tenant_id, name, type, status, content)
VALUES ('camp1', 'tenant1', 'Phishing Awareness Q1', 'phishing', 'active', 
  '{"subject": "Important: Update Your Account", "body": "Click here to verify"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO training_modules (id, tenant_id, title, type, content, duration)
VALUES ('mod1', 'tenant1', 'Phishing Recognition Basics', 'phishing', 
  '{"lessons": ["What is phishing", "How to identify"]}'::jsonb, 30)
ON CONFLICT (id) DO NOTHING;

SELECT 'Tables created' as status;
