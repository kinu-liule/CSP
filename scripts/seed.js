const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cybersec:securepassword@localhost:5432/cybersec_platform'
});

const DEFAULT_ROLES = [
  {
    name: 'Super Admin',
    permissions: ['*'],
    isSystem: true,
  },
  {
    name: 'Admin',
    permissions: [
      'users:read', 'users:write', 'users:delete', 'users:roles',
      'tenants:read',
      'iam:access', 'iam:write',
      'waf:access', 'waf:write',
      'ngfw:access', 'ngfw:write',
      'siem:access',
      'vuln-scanner:access',
      'fraud:access',
      'awareness:access',
      'grc:access', 'grc:write',
      'asset-mgmt:access',
      'cspm:access',
      'edr:access',
      'threat-intel:access',
      'soar:access',
      'data-security:access',
      'data-lake:access',
      'xdr:access',
      'devsecops:access',
      'deception:access',
      'password-mgr:access',
      'bcp:access',
      'risk-engine:access',
      'admin:audit', 'admin:analytics', 'admin:policies',
    ],
    isSystem: true,
  },
  {
    name: 'Manager',
    permissions: [
      'users:read',
      'iam:access', 'iam:write',
      'waf:access', 'waf:write',
      'ngfw:access', 'ngfw:write',
      'siem:access',
      'vuln-scanner:access',
      'fraud:access',
      'awareness:access',
      'grc:access', 'grc:write',
      'asset-mgmt:access',
      'cspm:access',
      'edr:access',
      'threat-intel:access',
      'soar:access',
      'data-security:access',
      'data-lake:access',
      'xdr:access',
      'devsecops:access',
      'deception:access',
      'password-mgr:access',
      'bcp:access',
      'risk-engine:access',
      'admin:audit',
    ],
    isSystem: true,
  },
  {
    name: 'Analyst',
    permissions: [
      'users:read',
      'iam:access',
      'waf:access',
      'ngfw:access',
      'siem:access',
      'vuln-scanner:access',
      'fraud:access',
      'awareness:access',
      'grc:access',
      'asset-mgmt:access',
      'cspm:access',
      'edr:access',
      'threat-intel:access',
      'soar:access',
      'data-security:access',
      'data-lake:access',
      'xdr:access',
      'devsecops:access',
      'deception:access',
      'password-mgr:access',
      'bcp:access',
      'risk-engine:access',
    ],
    isSystem: true,
  },
  {
    name: 'User',
    permissions: [
      'iam:access',
      'waf:access',
      'ngfw:access',
    ],
    isSystem: true,
  },
];

const DEFAULT_TENANTS = [
  { tenantId: 'tenant1', name: 'Acme Corporation', domain: 'acme.com', tier: 'enterprise' },
  { tenantId: 'tenant2', name: 'Globex Inc', domain: 'globex.com', tier: 'professional' },
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Connected to database. Starting seed...');

    // Create tenants
    for (const t of DEFAULT_TENANTS) {
      const existing = await client.query('SELECT tenant_id FROM tenants WHERE tenant_id = $1', [t.tenantId]);
      if (existing.rows.length === 0) {
        await client.query(
          'INSERT INTO tenants (tenant_id, name, domain, tier) VALUES ($1, $2, $3, $4)',
          [t.tenantId, t.name, t.domain, t.tier]
        );
        console.log(`Created tenant: ${t.name} (${t.tenantId})`);
      } else {
        console.log(`Tenant ${t.tenantId} already exists. Skipping.`);
      }
    }

    // Create default roles for each tenant
    for (const t of DEFAULT_TENANTS) {
      const existingRoles = await client.query(
        'SELECT name FROM roles WHERE tenant_id = $1 AND is_system = true',
        [t.tenantId]
      );
      const existingRoleNames = existingRoles.rows.map(r => r.name);

      for (const role of DEFAULT_ROLES) {
        if (existingRoleNames.includes(role.name)) {
          console.log(`Role "${role.name}" already exists for ${t.tenantId}. Skipping.`);
          continue;
        }
        const crypto = require('crypto');
        await client.query(
          `INSERT INTO roles (id, tenant_id, name, permissions, is_system)
           VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`,
          ['role_' + crypto.randomBytes(4).toString('hex'), t.tenantId, role.name, role.permissions, role.isSystem]
        );
        console.log(`Created role: ${role.name} for ${t.tenantId}`);
      }
    }

    // Create default admin users for each tenant
    for (const t of DEFAULT_TENANTS) {
      const existing = await client.query(
        'SELECT username FROM users WHERE tenant_id = $1 AND username = $2',
        [t.tenantId, 'admin']
      );
      if (existing.rows.length === 0) {
        const passwordHash = await bcrypt.hash('admin123', 10);
        const adminRole = 'admin';
        await client.query(
          `INSERT INTO users (tenant_id, username, email, password_hash, roles, active)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [t.tenantId, 'admin', `admin@${t.domain}`, passwordHash, [adminRole]]
        );
        console.log(`Created admin user for ${t.tenantId} (username: admin, password: admin123)`);
      } else {
        console.log(`Admin user already exists for ${t.tenantId}. Skipping.`);
      }
    }

    console.log('\nSeed completed successfully!');
    console.log('Default credentials:');
    console.log('  Tenant: tenant1');
    console.log('  Username: admin');
    console.log('  Password: admin123');
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
