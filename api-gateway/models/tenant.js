// Tenant Model with in-memory fallback and subscription support
const db = require('../db/client');

// In-memory storage
const tenants = new Map();
const apiKeys = new Map();
const subscriptions = new Map();
const requestLogs = [];
const securityEvents = [];

const AVAILABLE_SERVICES = [
  'iam', 'waf', 'ngfw', 'siem-soar', 'vuln-scanner', 'fraud-detection',
  'awareness', 'grc', 'asset-management', 'cspm', 'edr', 'threat-intel',
  'soar', 'data-security', 'data-lake', 'xdr', 'devsecops', 'deception',
  'password-manager', 'business-continuity', 'risk-engine'
];

class Tenant {
  static async create({ tenantId, name, tier = 'free', metadata = {} }) {
    const tenant = {
      id: Date.now(),
      tenant_id: tenantId,
      name,
      tier,
      status: 'active',
      metadata,
      created_at: new Date(),
      updated_at: new Date()
    };
    
    if (db.isAvailable()) {
      try {
        const result = await db.query(
          `INSERT INTO tenants (tenant_id, name, tier, metadata) VALUES ($1, $2, $3, $4) RETURNING *`,
          [tenantId, name, tier, metadata]
        );
        return result.rows[0];
      } catch (e) {}
    }
    
    tenants.set(tenantId, tenant);
    return tenant;
  }

  static async findByTenantId(tenantId) {
    if (db.isAvailable()) {
      try {
        const result = await db.query('SELECT * FROM tenants WHERE tenant_id = $1', [tenantId]);
        return result.rows[0];
      } catch (e) {}
    }
    return tenants.get(tenantId);
  }

  static async findAll() {
    if (db.isAvailable()) {
      try {
        const result = await db.query('SELECT * FROM tenants ORDER BY created_at DESC');
        return result.rows;
      } catch (e) {}
    }
    return Array.from(tenants.values());
  }

  static async update(tenantId, updates) {
    if (db.isAvailable()) {
      try {
        const setClauses = [];
        const values = [];
        let idx = 1;
        for (const [key, value] of Object.entries(updates)) {
          setClauses.push(`${key} = $${idx}`);
          values.push(value);
          idx++;
        }
        values.push(tenantId);
        const result = await db.query(
          `UPDATE tenants SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = $${idx} RETURNING *`,
          values
        );
        return result.rows[0];
      } catch (e) {}
    }
    
    const tenant = tenants.get(tenantId);
    if (tenant) {
      Object.assign(tenant, updates);
      tenant.updated_at = new Date();
    }
    return tenant;
  }

  static async delete(tenantId) {
    if (db.isAvailable()) {
      try {
        await db.query('DELETE FROM tenant_subscriptions WHERE tenant_id = $1', [tenantId]);
        const result = await db.query('DELETE FROM tenants WHERE tenant_id = $1 RETURNING *', [tenantId]);
        return result.rows[0];
      } catch (e) {}
    }
    subscriptions.delete(tenantId);
    return tenants.delete(tenantId);
  }

  // ==================== SUBSCRIPTIONS ====================

  static async getSubscriptions(tenantId) {
    const mem = subscriptions.get(tenantId);
    if (mem) return mem;
    if (db.isAvailable()) {
      try {
        const result = await db.query(
          'SELECT service_name, enabled, subscribed_at FROM tenant_subscriptions WHERE tenant_id = $1',
          [tenantId]
        );
        if (result.rows.length > 0) {
          subscriptions.set(tenantId, result.rows);
          return result.rows;
        }
      } catch (e) {}
    }
    return [];
  }

  static async setSubscriptions(tenantId, serviceNames) {
    const valid = serviceNames.filter(s => AVAILABLE_SERVICES.includes(s));
    const updated = valid.map(s => ({ service_name: s, enabled: true, subscribed_at: new Date() }));
    subscriptions.set(tenantId, updated);
    if (db.isAvailable()) {
      try {
        await db.query('DELETE FROM tenant_subscriptions WHERE tenant_id = $1', [tenantId]);
        if (valid.length > 0) {
          const values = valid.map((s, i) => `($1, $${i + 2}, true, NOW())`).join(', ');
          const params = [tenantId, ...valid];
          await db.query(
            `INSERT INTO tenant_subscriptions (tenant_id, service_name, enabled, subscribed_at) VALUES ${values}`,
            params
          );
        }
      } catch (e) {
        console.log('Subscription DB error (using in-memory):', e.message);
      }
    }
    return valid;
  }

  static async isSubscribed(tenantId, serviceName) {
    const subs = await Tenant.getSubscriptions(tenantId);
    if (subs.length === 0) return true;
    return subs.some(s => s.service_name === serviceName && s.enabled !== false);
  }

  static async hasSubscriptions(tenantId) {
    const subs = await Tenant.getSubscriptions(tenantId);
    return subs.length > 0;
  }

  static getAvailableServices() {
    return [...AVAILABLE_SERVICES];
  }

  // ==================== ORGANIZATION REQUESTS ====================

  static async createRequest({ companyName, contactName, contactEmail, domain, phone, services, message }) {
    const request = {
      id: 'req_' + require('crypto').randomBytes(6).toString('hex'),
      companyName, contactName, contactEmail, domain: domain || '', phone: phone || '',
      services: services || [],
      message: message || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedBy: null,
      rejectionReason: ''
    };
    orgRequests.set(request.id, request);
    if (db.isAvailable()) {
      try {
        await db.query(
          `INSERT INTO tenant_requests (id, company_name, contact_name, contact_email, domain, phone, services, message)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO NOTHING`,
          [request.id, companyName, contactName, contactEmail, domain, phone || '', JSON.stringify(services), message || '']
        );
      } catch (e) {}
    }
    return request;
  }

  static async getRequests(status) {
    if (db.isAvailable()) {
      try {
        const query = status ? 'SELECT * FROM tenant_requests WHERE status = $1 ORDER BY created_at DESC' : 'SELECT * FROM tenant_requests ORDER BY created_at DESC';
        const params = status ? [status] : [];
        const result = await db.query(query, params);
        return result.rows.map(r => ({ ...r, services: typeof r.services === 'string' ? JSON.parse(r.services) : (r.services || []) }));
      } catch (e) {}
    }
    const all = Array.from(orgRequests.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  static async getRequestById(id) {
    const mem = orgRequests.get(id);
    if (mem) return mem;
    if (db.isAvailable()) {
      try {
        const result = await db.query('SELECT * FROM tenant_requests WHERE id = $1', [id]);
        if (result.rows.length > 0) {
          const r = result.rows[0];
          r.services = typeof r.services === 'string' ? JSON.parse(r.services) : (r.services || []);
          orgRequests.set(id, r);
          return r;
        }
      } catch (e) {}
    }
    return null;
  }

  static async approveRequest(id, reviewedBy) {
    const request = await Tenant.getRequestById(id);
    if (!request) return null;
    if (request.status !== 'pending') return { error: 'Request already ' + request.status };

    const tenantId = 'tenant_' + require('crypto').randomBytes(6).toString('hex');
    const adminUsername = (request.contactName || 'admin').toLowerCase().replace(/\s+/g, '_') + '_' + require('crypto').randomBytes(3).toString('hex');
    const tempPassword = require('crypto').randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);

    try {
      // Create tenant in IAM service
      const http = require('http');
      const tenantResult = await new Promise((resolve, reject) => {
        const domain = request.domain || request.companyName?.toLowerCase().replace(/\s+/g, '-') + '.onboarded';
        const b = JSON.stringify({ id: tenantId, name: request.companyName, domain, plan: 'free' });
        const opts = { hostname: 'iam', port: 3008, path: '/tenants', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } };
        const req = http.request(opts, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ success: false }); } }); });
        req.on('error', reject); req.write(b); req.end();
      });
      if (!tenantResult.success) return { error: 'Failed to create tenant' };

      // Create admin user
      const userResult = await new Promise((resolve, reject) => {
        const b = JSON.stringify({ username: adminUsername, email: request.contactEmail, password: tempPassword, roles: ['admin'] });
        const opts = { hostname: 'iam', port: 3008, path: '/users', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), 'x-tenant-id': tenantId } };
        const req = http.request(opts, (res) => { let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ success: false }); } }); });
        req.on('error', reject); req.write(b); req.end();
      });
      if (!userResult.success) return { error: 'Failed to create admin user' };

      // Create tenant in API gateway with subscriptions
      await Tenant.create({ tenantId, name: request.companyName, tier: 'free', metadata: { domain: request.domain || '', contact: request.contactEmail } });
      const services = request.services && request.services.length > 0 ? [...new Set(['iam', ...request.services])] : ['iam'];
      await Tenant.setSubscriptions(tenantId, services);

      // Update request status
      request.status = 'approved';
      request.reviewedBy = reviewedBy;
      request.tenantId = tenantId;
      request.adminUsername = adminUsername;
      request.tempPassword = tempPassword;
      request.updatedAt = new Date().toISOString();
      orgRequests.set(id, request);

      if (db.isAvailable()) {
        try {
          await db.query('UPDATE tenant_requests SET status = $1, reviewed_by = $2, tenant_id = $3, updated_at = NOW() WHERE id = $4',
            ['approved', reviewedBy, tenantId, id]);
        } catch (e) {}
      }

      return { success: true, request, tenantId, adminUsername, tempPassword };
    } catch (err) {
      return { error: err.message };
    }
  }

  static async rejectRequest(id, reviewedBy, reason) {
    const request = await Tenant.getRequestById(id);
    if (!request) return null;
    if (request.status !== 'pending') return { error: 'Request already ' + request.status };

    request.status = 'rejected';
    request.reviewedBy = reviewedBy;
    request.rejectionReason = reason || '';
    request.updatedAt = new Date().toISOString();
    orgRequests.set(id, request);

    if (db.isAvailable()) {
      try {
        await db.query('UPDATE tenant_requests SET status = $1, reviewed_by = $2, rejection_reason = $3, updated_at = NOW() WHERE id = $4',
          ['rejected', reviewedBy, reason || '', id]);
      } catch (e) {}
    }

    return { success: true, request };
  }

  // ==================== SERVICE REQUESTS (add-on services) ====================

  static async createServiceRequest({ tenantId, tenantName, contactEmail, services, message }) {
    const request = {
      id: 'svcreq_' + require('crypto').randomBytes(6).toString('hex'),
      tenantId, tenantName, contactEmail,
      services: services || [],
      message: message || '',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      reviewedBy: null,
      rejectionReason: ''
    };
    serviceRequests.set(request.id, request);
    if (db.isAvailable()) {
      try {
        await db.query(
          `INSERT INTO tenant_requests (id, company_name, contact_email, services, message, status)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING`,
          [request.id, tenantName, contactEmail, JSON.stringify(services), message || '', 'pending']
        );
      } catch (e) {}
    }
    return request;
  }

  static async getAllServiceRequests(status) {
    if (db.isAvailable()) {
      try {
        const query = status ? 'SELECT * FROM tenant_requests WHERE status = $1 ORDER BY created_at DESC' : 'SELECT * FROM tenant_requests ORDER BY created_at DESC';
        const params = status ? [status] : [];
        const result = await db.query(query, params);
        return result.rows.map(r => ({ ...r, services: typeof r.services === 'string' ? JSON.parse(r.services) : (r.services || []) }));
      } catch (e) {}
    }
    const all = Array.from(serviceRequests.values());
    return status ? all.filter(r => r.status === status) : all;
  }

  static async getTenantServiceRequests(tenantId) {
    const all = Array.from(serviceRequests.values()).filter(r => r.tenantId === tenantId);
    return all;
  }

  static async approveServiceRequest(id, reviewedBy) {
    const request = serviceRequests.get(id);
    if (!request) return null;
    if (request.status !== 'pending') return { error: 'Request already ' + request.status };

    request.status = 'approved';
    request.reviewedBy = reviewedBy;
    request.updatedAt = new Date().toISOString();
    serviceRequests.set(id, request);

    const services = [...new Set(['iam', ...(request.services || [])])];
    await Tenant.setSubscriptions(request.tenantId, services);

    if (db.isAvailable()) {
      try {
        await db.query('UPDATE tenant_requests SET status = $1, reviewed_by = $2, updated_at = NOW() WHERE id = $3',
          ['approved', reviewedBy, id]);
      } catch (e) {}
    }

    return { success: true, request };
  }

  static async rejectServiceRequest(id, reviewedBy, reason) {
    const request = serviceRequests.get(id);
    if (!request) return null;
    if (request.status !== 'pending') return { error: 'Request already ' + request.status };

    request.status = 'rejected';
    request.reviewedBy = reviewedBy;
    request.rejectionReason = reason || '';
    request.updatedAt = new Date().toISOString();
    serviceRequests.set(id, request);

    if (db.isAvailable()) {
      try {
        await db.query('UPDATE tenant_requests SET status = $1, reviewed_by = $2, rejection_reason = $3, updated_at = NOW() WHERE id = $4',
          ['rejected', reviewedBy, reason || '', id]);
      } catch (e) {}
    }

    return { success: true, request };
  }
}

const orgRequests = new Map();
const serviceRequests = new Map();

module.exports = Tenant;
