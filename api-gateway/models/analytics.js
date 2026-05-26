// Analytics Model with in-memory fallback
const db = require('../db/client');

const metrics = {
  totalRequests: 0,
  totalErrors: 0,
  totalBlocked: 0,
  responseTimes: [],
  endpoints: new Map(),
  tenants: new Map()
};

const securityEventsMemory = [];

class Analytics {
  static async logRequest({ tenantId, method, path, statusCode, responseTime, ipAddress, userAgent, requestId }) {
    metrics.totalRequests++;
    if (statusCode >= 400) metrics.totalErrors++;
    if (statusCode === 401 || statusCode === 403) metrics.totalBlocked++;
    metrics.responseTimes.push(responseTime);
    if (metrics.responseTimes.length > 1000) metrics.responseTimes.shift();
    
    if (!metrics.endpoints.has(path)) {
      metrics.endpoints.set(path, { path, count: 0, errors: 0, avgResponseTime: 0 });
    }
    const ep = metrics.endpoints.get(path);
    ep.count++;
    if (statusCode >= 400) ep.errors++;
    ep.avgResponseTime = (ep.avgResponseTime * (ep.count - 1) + responseTime) / ep.count;
    
    if (tenantId) {
      if (!metrics.tenants.has(tenantId)) {
        metrics.tenants.set(tenantId, { tenantId, requests: 0, blocked: 0, lastSeen: null });
      }
      const t = metrics.tenants.get(tenantId);
      t.requests++;
      if (statusCode === 401 || statusCode === 403) t.blocked++;
      t.lastSeen = new Date();
    }

    if (db.isAvailable()) {
      try {
        await db.query(
          `INSERT INTO request_logs (tenant_id, method, path, status_code, response_time, ip_address, user_agent, request_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, method, path, statusCode, responseTime, ipAddress, userAgent, requestId]
        );
      } catch (e) {}
    }
  }

  static async logSecurityEvent({ eventType, tenantId, sourceIp, description, severity = 'medium', metadata = {} }) {
    const event = {
      timestamp: new Date(),
      event_type: eventType,
      tenant_id: tenantId,
      source_ip: sourceIp,
      description,
      severity,
      metadata
    };
    
    securityEventsMemory.unshift(event);
    if (securityEventsMemory.length > 100) securityEventsMemory.pop();

    if (db.isAvailable()) {
      try {
        await db.query(
          `INSERT INTO security_events (event_type, tenant_id, source_ip, description, severity, metadata) VALUES ($1, $2, $3, $4, $5, $6)`,
          [eventType, tenantId, sourceIp, description, severity, metadata]
        );
      } catch (e) {}
    }
  }

  static async getMetrics() {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT 
            COUNT(*) as total_requests,
            COUNT(*) FILTER (WHERE status_code >= 400) as total_errors,
            COUNT(*) FILTER (WHERE status_code IN (401, 403)) as total_blocked,
            AVG(response_time) as avg_response_time
          FROM request_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
        `);
        return result.rows[0];
      } catch (e) {}
    }
    
    return {
      total_requests: metrics.totalRequests,
      total_errors: metrics.totalErrors,
      total_blocked: metrics.totalBlocked,
      avg_response_time: metrics.responseTimes.length > 0 
        ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length 
        : 0
    };
  }

  static async getTopEndpoints(limit = 10) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT path, COUNT(*) as count, COUNT(*) FILTER (WHERE status_code >= 400) as errors, AVG(response_time) as avg_response_time
          FROM request_logs WHERE timestamp > NOW() - INTERVAL '24 hours'
          GROUP BY path ORDER BY count DESC LIMIT $1
        `, [limit]);
        return result.rows;
      } catch (e) {}
    }
    
    return Array.from(metrics.endpoints.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  static async getTopTenants(limit = 10) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`
          SELECT tenant_id, COUNT(*) as requests, COUNT(*) FILTER (WHERE status_code IN (401, 403)) as blocked, MAX(timestamp) as last_seen
          FROM request_logs WHERE timestamp > NOW() - INTERVAL '24 hours' AND tenant_id IS NOT NULL
          GROUP BY tenant_id ORDER BY requests DESC LIMIT $1
        `, [limit]);
        return result.rows;
      } catch (e) {}
    }
    
    return Array.from(metrics.tenants.values())
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);
  }

  static async getRecentSecurityEvents(limit = 20) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(`SELECT * FROM security_events ORDER BY timestamp DESC LIMIT $1`, [limit]);
        return result.rows;
      } catch (e) {}
    }
    return securityEventsMemory.slice(0, limit);
  }
}

module.exports = Analytics;
