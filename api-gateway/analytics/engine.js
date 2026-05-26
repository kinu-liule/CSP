// Real-time Analytics Engine
const EventEmitter = require('events');

class AnalyticsEngine extends EventEmitter {
  constructor() {
    super();
    this.metrics = {
      requests: 0,
      errors: 0,
      blocked: 0,
      byEndpoint: new Map(),
      byTenant: new Map(),
      responseTimes: [],
      securityEvents: []
    };
    this.windowMs = 60000; // 1 minute window
    this.resetInterval = setInterval(() => this.resetWindow(), this.windowMs);
  }

  trackRequest(req, res, startTime) {
    this.metrics.requests++;
    
    const endpoint = req.route?.path || req.path;
    const tenantId = req.tenant?.id || 'anonymous';
    const duration = Date.now() - startTime;

    // Track by endpoint
    if (!this.metrics.byEndpoint.has(endpoint)) {
      this.metrics.byEndpoint.set(endpoint, {
        count: 0,
        errors: 0,
        avgResponseTime: 0
      });
    }
    const epMetrics = this.metrics.byEndpoint.get(endpoint);
    epMetrics.count++;
    epMetrics.avgResponseTime = 
      (epMetrics.avgResponseTime * (epMetrics.count - 1) + duration) / epMetrics.count;

    // Track by tenant
    if (!this.metrics.byTenant.has(tenantId)) {
      this.metrics.byTenant.set(tenantId, {
        requests: 0,
        blocked: 0,
        lastSeen: null
      });
    }
    const tenantMetrics = this.metrics.byTenant.get(tenantId);
    tenantMetrics.requests++;
    tenantMetrics.lastSeen = new Date();

    // Track response time
    this.metrics.responseTimes.push(duration);
    if (this.metrics.responseTimes.length > 1000) {
      this.metrics.responseTimes = this.metrics.responseTimes.slice(-1000);
    }

    // Track errors
    if (res.statusCode >= 400) {
      this.metrics.errors++;
      if (res.statusCode === 403 || res.statusCode === 401) {
        this.metrics.blocked++;
        tenantMetrics.blocked++;
      }
    }

    this.emit('request', { endpoint, tenantId, duration, status: res.statusCode });
  }

  trackSecurityEvent(event) {
    const securityEvent = {
      timestamp: new Date(),
      ...event
    };
    this.metrics.securityEvents.push(securityEvent);
    if (this.metrics.securityEvents.length > 500) {
      this.metrics.securityEvents = this.metrics.securityEvents.slice(-500);
    }
    this.emit('security', securityEvent);
  }

  getMetrics() {
    const avgResponseTime = this.metrics.responseTimes.length > 0
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
      : 0;

    return {
      windowMs: this.windowMs,
      totalRequests: this.metrics.requests,
      totalErrors: this.metrics.errors,
      totalBlocked: this.metrics.blocked,
      avgResponseTime: Math.round(avgResponseTime),
      requestsPerSecond: this.metrics.requests / (this.windowMs / 1000),
      topEndpoints: Array.from(this.metrics.byEndpoint.entries())
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([path, m]) => ({ path, ...m })),
      topTenants: Array.from(this.metrics.byTenant.entries())
        .sort((a, b) => b[1].requests - a[1].requests)
        .slice(0, 10)
        .map(([id, m]) => ({ tenantId: id, ...m })),
      recentSecurityEvents: this.metrics.securityEvents.slice(-20)
    };
  }

  async logRequest({ tenantId, method, path, statusCode, responseTime, ipAddress, userAgent, requestId }) {
    try {
      const db = require('../db/client');
      await db.pool.query(
        'INSERT INTO request_logs (tenant_id, method, path, status_code, response_time, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [tenantId, method, path, statusCode, responseTime, ipAddress, userAgent]
      );
    } catch (err) {
      console.error('Failed to log request:', err.message);
    }
  }

  resetWindow() {
    this.metrics.requests = 0;
    this.metrics.errors = 0;
    this.metrics.blocked = 0;
    this.metrics.byEndpoint.clear();
    this.metrics.byTenant.clear();
    this.metrics.responseTimes = [];
  }
}

module.exports = new AnalyticsEngine();
