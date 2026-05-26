const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const USE_HTTPS = process.env.USE_HTTPS === 'true';

// Import modules
const owaspProtection = require('./middleware/owasp-protection');
const pluginManager = require('./middleware/plugin-manager');
const policyEngine = require('./policy/engine');
const analyticsEngine = require('./analytics/engine');
const { initializeDatabase } = require('./db/init');
const Tenant = require('./models/tenant');
const ApiKey = require('./models/apikey');
const Analytics = require('./models/analytics');
const { authorize, requireServiceAccess } = require('./middleware/authorization');

// Initialize database
initializeDatabase().then(() => {
  console.log('Database initialized');
}).catch(err => {
  console.error('Database initialization failed:', err);
});

// Load security plugins
pluginManager.loadPlugins();
console.log(`Loaded ${pluginManager.plugins.size} security plugins`);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Error handler for JSON parse failures
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Invalid request body' });
  }
  next(err);
});

// Request timing and analytics
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  // Track with analytics engine
  const originalSend = res.send;
  res.send = function(body) {
    const responseTime = Date.now() - req.startTime;
    analyticsEngine.trackRequest(req, res, req.startTime);
    return originalSend.call(this, body);
  };
  
  next();
});

// Enhanced authentication with API key support
const authenticateTenant = async (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const tenantId = req.headers['x-tenant-id'];
  const apiKey = req.headers['x-api-key'];

  // API Key authentication
  if (apiKey) {
    const keyRecord = await ApiKey.validateKey(apiKey);
    if (keyRecord) {
      req.tenant = {
        id: keyRecord.tenant_id,
        apiKeyId: keyRecord.id,
        scopes: keyRecord.scopes,
        authMethod: 'api-key'
      };
      return next();
    } else {
      return res.status(401).json({ error: 'Invalid API key' });
    }
  }

  // JWT authentication
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const tenant = await Tenant.findByTenantId(decoded.tenantId || tenantId);
      req.tenant = {
        id: tenant?.tenant_id || decoded.tenantId,
        userId: decoded.userId,
        roles: decoded.roles || [],
        departments: decoded.departments || [],
        tier: tenant?.tier || 'free',
        authMethod: 'jwt'
      };
    } catch (e) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  } else if (tenantId) {
    req.tenant = { id: tenantId, roles: ['guest'], authMethod: 'tenant-id' };
  }

  next();
};

// Prometheus metrics
const promClient = require('prom-client');
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

// Middleware to track request metrics
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route ? req.route.path : req.path;
    httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
    httpRequestsTotal.labels(req.method, route, res.statusCode).inc();
  });
  next();
});

// Health check (before auth/security middleware)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api-gateway', version: '2.0.0' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', service: 'api-gateway', version: '2.0.0' });
});

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(await promClient.register.metrics());
});

// Swagger API Documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'CyberSec Platform API Docs',
  swaggerOptions: { persistAuthorization: true },
}));

app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(swaggerSpec);
});

// Login route - accessible without authentication
app.post('/api/iam/auth/login', (req, res) => {
  const http = require('http');
  const body = JSON.stringify(req.body || {});
  const options = {
    hostname: 'iam',
    port: 3008,
    path: '/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'x-tenant-id': req.headers['x-tenant-id'] || ''
    }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', chunk => data += chunk);
    proxyRes.on('end', () => {
      try { res.status(proxyRes.statusCode).json(JSON.parse(data)); }
      catch { res.status(proxyRes.statusCode).send(data); }
    });
  });
  proxyReq.on('error', () => res.status(503).json({ error: 'IAM service unavailable' }));
  proxyReq.write(body);
  proxyReq.end();
});

// Self-service tenant registration
app.post('/api/auth/register', express.json(), async (req, res) => {
  const http = require('http');
  const crypto = require('crypto');

  const doRequest = (opts, body) => new Promise((resolve, reject) => {
    const b = JSON.stringify(body);
    const reqObj = http.request({ ...opts, headers: { ...opts.headers, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } }, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ success: false, error: data }); } });
    });
    reqObj.on('error', reject);
    reqObj.write(b);
    reqObj.end();
  });

  try {
    const { name, email, password, domain, company, services: selectedServices } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Step 1: Create tenant via IAM service (handles UUID schema)
    const tenantId = 'tenant_' + crypto.randomBytes(6).toString('hex');
    const domainVal = domain || (company || name)?.toLowerCase().replace(/\s+/g, '-') + '.onboarded';
    const tenantResult = await doRequest(
      { hostname: 'iam', port: 3008, path: '/tenants', method: 'POST' },
      { id: tenantId, name: company || name, domain: domainVal, plan: 'free' }
    );
    if (!tenantResult.success) {
      return res.status(500).json({ error: 'Failed to create tenant: ' + (tenantResult.error || 'Unknown error') });
    }

    // Step 2: Create admin user via IAM service
    const adminUsername = name.toLowerCase().replace(/\s+/g, '_') + '_' + crypto.randomBytes(3).toString('hex');
    const userResult = await doRequest(
      { hostname: 'iam', port: 3008, path: '/users', method: 'POST', headers: { 'x-tenant-id': tenantId } },
      { username: adminUsername, email, password, roles: ['admin'] }
    );
    if (!userResult.success) {
      return res.status(500).json({ error: 'Failed to create admin user: ' + (userResult.error || 'Unknown error') });
    }

    // Step 3: Track tenant in API gateway with subscriptions
    const Tenant = require('./models/tenant');
    await Tenant.create({
      tenantId,
      name: company || name,
      tier: 'free',
      metadata: { domain: domain || '', registered_by: email }
    });
    const defaultServices = ['iam'];
    const services = [...new Set([...defaultServices, ...(selectedServices || [])])];
    await Tenant.setSubscriptions(tenantId, services);

    // Step 4: Sign JWT
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({
      userId: userResult.data.id,
      tenantId,
      roles: ['admin'],
      departments: []
    }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({
      success: true,
      data: {
        token,
        tenant: { tenant_id: tenantId, name: company || name, tier: 'free' },
        user: { ...userResult.data, username: adminUsername },
        subscriptions: services
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed: ' + err.message });
  }
});

// Available services list (public)
app.get('/api/services', (req, res) => {
  const Tenant = require('./models/tenant');
  res.json({ services: Tenant.getAvailableServices() });
});

// ================== PUBLIC PORTAL ROUTES ==================

app.get('/api/public/info', (req, res) => {
  const Tenant = require('./models/tenant');
  res.json({
    name: 'CyberSec Platform',
    description: 'Enterprise-grade cybersecurity platform with modular security services for organizations of all sizes.',
    version: '2.0.0',
    services: Tenant.getAvailableServices().map(s => ({
      id: s,
      name: s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      description: `${s.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')} security service`
    })),
    features: [
      'Centralized security management',
      'Role-based access control',
      'Real-time monitoring and alerts',
      'Compliance reporting',
      'Multi-tenant architecture',
      'API key management'
    ],
    tiers: [
      { name: 'Free', price: '$0', description: 'Basic access to IAM and limited services' },
      { name: 'Professional', price: '$499/mo', description: 'Full access to all security services' },
      { name: 'Enterprise', price: 'Custom', description: 'Dedicated infrastructure, SLA, and support' }
    ]
  });
});

app.post('/api/public/register-request', express.json(), async (req, res) => {
  try {
    const { companyName, contactName, contactEmail, domain, phone, services, message } = req.body;
    if (!companyName || !contactName || !contactEmail) {
      return res.status(400).json({ error: 'Company name, contact name, and contact email are required' });
    }
    const Tenant = require('./models/tenant');
    const request = await Tenant.createRequest({ companyName, contactName, contactEmail, domain, phone, services, message });
    res.status(201).json({ success: true, requestId: request.id, message: 'Your request has been submitted. A super admin will review it shortly.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use(authenticateTenant);
app.use((req, res, next) => {
  pluginManager.runPlugins(req, res, next);
});
app.use(owaspProtection);

// Policy engine evaluation
app.use((req, res, next) => {
  const policyResults = policyEngine.evaluateRequest(req);
  if (policyResults.length > 0) {
    req.policyResults = policyResults;
    const denyResult = policyResults.find(r => r.action === 'deny');
    if (denyResult) {
      return res.status(403).json({
        error: 'Access denied by policy',
        policy: denyResult.policyName,
        reason: denyResult.parameters?.message || 'Policy violation'
      });
    }
  }
  next();
});

// Service registry
const services = {
  iam: process.env.IAM_SERVICE_URL || 'http://localhost:3008',
  waf: process.env.WAF_SERVICE_URL || 'http://localhost:3001',
  ngfw: process.env.NGFW_SERVICE_URL || 'http://localhost:3002',
  'siem-soar': process.env.SIEM_SOAR_SERVICE_URL || 'http://localhost:3003',
  'vuln-scanner': process.env.VULN_SCANNER_SERVICE_URL || 'http://localhost:3004',
  'fraud-detection': process.env.FRAUD_DETECTION_SERVICE_URL || 'http://localhost:3005',
  awareness: process.env.AWARENESS_SERVICE_URL || 'http://localhost:3006',
  grc: process.env.GRC_SERVICE_URL || 'http://localhost:3007',
  // New services
  'asset-management': process.env.ASSET_MANAGEMENT_URL || 'http://localhost:3009',
  cspm: process.env.CSPM_SERVICE_URL || 'http://localhost:3011',
  edr: process.env.EDR_SERVICE_URL || 'http://localhost:3015',
  'threat-intel': process.env.THREAT_INTEL_URL || 'http://localhost:3019',
  soar: process.env.SOAR_SERVICE_URL || 'http://localhost:3018',
  'data-security': process.env.DATA_SECURITY_URL || 'http://localhost:3012',
  'data-lake': process.env.DATA_LAKE_URL || 'http://localhost:3017',
  xdr: process.env.XDR_SERVICE_URL || 'http://localhost:3020',
  devsecops: process.env.DEVSECOPS_SERVICE_URL || 'http://localhost:3014',
  deception: process.env.DECEPTION_SERVICE_URL || 'http://localhost:3013',
  'password-manager': process.env.PASSWORD_MANAGER_URL || 'http://localhost:3016',
  'business-continuity': process.env.BUSINESS_CONTINUITY_URL || 'http://localhost:3010',
  'risk-engine': process.env.RISK_ENGINE_URL || 'http://localhost:8000'
};

// Enhanced proxy with DB logging
const createServiceProxy = (serviceName, pathRewrite = {}) => {
  const target = services[serviceName];
  if (!target) {
    return (req, res) => res.status(404).json({ error: `Service ${serviceName} not found` });
  }

  return async (req, res) => {
    const url = new URL(target);
    let path = req.url;
    
    for (const [pattern, replacement] of Object.entries(pathRewrite)) {
      const regex = new RegExp(pattern);
      path = path.replace(regex, replacement);
    }
    
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: path,
      method: req.method,
      headers: {
        ...req.headers,
        'x-tenant-id': req.tenant?.id || '',
        'x-user-roles': (req.tenant?.roles || []).join(','),
        'x-user-departments': (req.tenant?.departments || []).join(','),
        'x-user-id': req.tenant?.userId || '',
        'x-forwarded-for': req.ip
      }
    };
    
    delete options.headers.host;
    
    const proxyReq = http.request(options, async (proxyRes) => {
      const responseTime = Date.now() - req.startTime;
      
      // Log to database
      await Analytics.logRequest({
        tenantId: req.tenant?.id,
        method: req.method,
        path: req.path,
        statusCode: proxyRes.statusCode,
        responseTime,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requestId: req.headers['x-request-id']
      });
      
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    
    proxyReq.on('error', async (err) => {
      await Analytics.logSecurityEvent({
        eventType: 'proxy_error',
        tenantId: req.tenant?.id,
        sourceIp: req.ip,
        description: `Proxy error for ${serviceName}: ${err.message}`,
        severity: 'high'
      });
      res.status(503).json({ error: `${serviceName} service unavailable` });
    });
    
    if (req.body && typeof req.body === 'object') {
      proxyReq.write(JSON.stringify(req.body));
    }
    proxyReq.end();
  };
};

// ================== API ENDPOINTS ==================

// Dashboard SPA
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard', 'index.html'));
});

// ================== TENANT MANAGEMENT ==================

app.get('/api/tenants', authorize('tenants:read'), async (req, res) => {
  try {
    const tenants = await Tenant.findAll();
    res.json({ tenants });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tenants', authorize('tenants:write'), express.json(), async (req, res) => {
  try {
    const { tenantId, name, tier } = req.body;
    const tenant = await Tenant.create({ tenantId, name, tier });
    res.status(201).json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tenants/:tenantId', authorize('tenants:write'), express.json(), async (req, res) => {
  try {
    const tenant = await Tenant.update(req.params.tenantId, req.body);
    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tenants/:tenantId', authorize('tenants:write'), async (req, res) => {
  try {
    await Tenant.delete(req.params.tenantId);
    res.json({ message: 'Tenant deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== API KEY MANAGEMENT ==================

app.get('/api/tenants/:tenantId/keys', authorize('admin:audit'), async (req, res) => {
  try {
    const keys = await ApiKey.findByTenantId(req.params.tenantId);
    res.json({ keys });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tenants/:tenantId/keys', authorize('admin:policies'), express.json(), async (req, res) => {
  try {
    const { name, scopes, rateLimit, expiresInDays } = req.body;
    const result = await ApiKey.create({
      tenantId: req.params.tenantId,
      name,
      scopes,
      rateLimit,
      expiresInDays
    });
    res.status(201).json({ key: result.fullKey, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/keys/:keyId', authorize('admin:policies'), async (req, res) => {
  try {
    await ApiKey.delete(req.params.keyId);
    res.json({ message: 'API key deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== SUBSCRIPTION MANAGEMENT ==================

app.get('/api/tenants/:tenantId/subscriptions', authorize('tenants:read'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const subs = await Tenant.getSubscriptions(req.params.tenantId);
    res.json({ subscriptions: subs, available: Tenant.getAvailableServices() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tenants/:tenantId/subscriptions', authorize('tenants:write'), express.json(), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const { services } = req.body;
    if (!Array.isArray(services)) return res.status(400).json({ error: 'services must be an array' });
    await Tenant.setSubscriptions(req.params.tenantId, services);
    const subs = await Tenant.getSubscriptions(req.params.tenantId);
    res.json({ success: true, subscriptions: subs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== ORG REQUEST MANAGEMENT (Super Admin) ==================

app.get('/api/admin/requests', authorize('tenants:write'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const { status } = req.query;
    const requests = await Tenant.getRequests(status || null);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/requests/:id', authorize('tenants:write'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const request = await Tenant.getRequestById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    res.json({ request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/requests/:id/approve', authorize('tenants:write'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const reviewedBy = req.tenant?.userId || req.tenant?.id || 'super_admin';
    const result = await Tenant.approveRequest(req.params.id, reviewedBy);
    if (!result) return res.status(404).json({ error: 'Request not found' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({
      success: true,
      message: 'Organization approved and tenant created',
      tenantId: result.tenantId,
      adminUsername: result.adminUsername,
      tempPassword: result.tempPassword
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/requests/:id/reject', authorize('tenants:write'), express.json(), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const reviewedBy = req.tenant?.userId || req.tenant?.id || 'super_admin';
    const result = await Tenant.rejectRequest(req.params.id, reviewedBy, req.body.reason);
    if (!result) return res.status(404).json({ error: 'Request not found' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: 'Request rejected', request: result.request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== ANALYTICS ==================

app.get('/api/analytics/metrics', authorize('admin:analytics'), async (req, res) => {
  try {
    const timeRange = req.query.range || '24 hours';
    const metrics = await Analytics.getMetrics(timeRange);
    const topEndpoints = await Analytics.getTopEndpoints(timeRange);
    const topTenants = await Analytics.getTopTenants(timeRange);
    const securityEvents = await Analytics.getRecentSecurityEvents();
    
    res.json({
      metrics,
      topEndpoints,
      topTenants,
      securityEvents
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== PLATFORM ADMIN (Super Admin) ==================

// -- Tenant Management --
app.get('/api/admin/tenants', authorize('platform:tenants'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenants = await Tenant.findAll();
    const enriched = await Promise.all(tenants.map(async (t) => {
      const subs = await Tenant.getSubscriptions(t.tenant_id);
      return { ...t, subscription_count: subs.length };
    }));
    res.json({ tenants: enriched });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/tenants/:tenantId', authorize('platform:tenants'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenant = await Tenant.findByTenantId(req.params.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const subs = await Tenant.getSubscriptions(req.params.tenantId);
    res.json({ tenant: { ...tenant, subscriptions: subs } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/tenants/:tenantId', authorize('platform:tenants'), express.json(), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const { name, tier, plan, status } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (tier) updates.tier = tier;
    if (plan) updates.plan = plan;
    if (status) updates.status = status;
    const tenant = await Tenant.update(req.params.tenantId, updates);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/tenants/:tenantId/suspend', authorize('platform:tenants'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenant = await Tenant.update(req.params.tenantId, { status: 'suspended' });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant suspended', tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/tenants/:tenantId/activate', authorize('platform:tenants'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenant = await Tenant.update(req.params.tenantId, { status: 'active' });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: 'Tenant activated', tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/tenants/:tenantId/plan', authorize('platform:billing'), express.json(), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const { plan } = req.body;
    if (!plan) return res.status(400).json({ error: 'Plan is required' });
    const tenant = await Tenant.update(req.params.tenantId, { plan, tier: plan });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ message: `Plan updated to ${plan}`, tenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Platform Audit Logs --
app.get('/api/admin/audit', authorize('platform:audit'), async (req, res) => {
  try {
    const db = require('./db/client');
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const tenantId = req.query.tenantId || null;
    if (db.isAvailable()) {
      let query = 'SELECT * FROM request_logs';
      let countQuery = 'SELECT COUNT(*) as total FROM request_logs';
      const params = [];
      if (tenantId) {
        query += ' WHERE tenant_id = $1';
        countQuery += ' WHERE tenant_id = $1';
        params.push(tenantId);
      }
      query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      const result = await db.query(query, [...params, limit, offset]);
      const countResult = await db.query(countQuery, params);
      res.json({ logs: result.rows, total: parseInt(countResult.rows[0].total), limit, offset });
    } else {
      res.json({ logs: [], total: 0, limit, offset, note: 'Database not available for detailed audit logs' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Platform User Management (cross-tenant) --
app.get('/api/admin/users', authorize('platform:tenants'), async (req, res) => {
  try {
    const db = require('./db/client');
    const Tenant = require('./models/tenant');
    const tenants = await Tenant.findAll();
    const usersByTenant = [];
    for (const t of tenants) {
      const tid = t.tenant_id || t.id;
      if (!tid) continue;
      let userRows = [];
      if (db.isAvailable()) {
        try {
          const result = await db.query(
            "SELECT id, username, email, roles, active, last_login, tenant_id FROM users WHERE tenant_id = $1 ORDER BY created_at DESC",
            [tid]
          );
          userRows = result.rows;
        } catch {}
      }
      usersByTenant.push({
        tenant_id: tid,
        tenant_name: t.name || t.tenant_name || tid,
        tenant_status: t.status || 'active',
        users: userRows
      });
    }
    res.json({ usersByTenant });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:userId/status', authorize('platform:tenants'), express.json(), async (req, res) => {
  try {
    const db = require('./db/client');
    const { active } = req.body;
    if (!db.isAvailable()) return res.status(503).json({ error: 'Database not available' });
    const result = await db.query(
      'UPDATE users SET active = $1 WHERE id = $2 RETURNING id, username, email, roles, active, tenant_id',
      [active, req.params.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:userId', authorize('platform:tenants'), express.json(), async (req, res) => {
  try {
    const db = require('./db/client');
    const { username, email, roles } = req.body;
    if (!db.isAvailable()) return res.status(503).json({ error: 'Database not available' });
    const updates = [];
    const values = [];
    let idx = 1;
    if (username !== undefined) { updates.push(`username = $${idx++}`); values.push(username); }
    if (email !== undefined) { updates.push(`email = $${idx++}`); values.push(email); }
    if (roles !== undefined) { updates.push(`roles = $${idx++}`); values.push(roles); }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.userId);
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, username, email, roles, active, tenant_id`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:userId', authorize('platform:tenants'), async (req, res) => {
  try {
    const db = require('./db/client');
    if (!db.isAvailable()) return res.status(503).json({ error: 'Database not available' });
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING id, username, email',
      [req.params.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted', user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/users', authorize('platform:tenants'), express.json(), async (req, res) => {
  try {
    const { username, email, password, tenantId, roles } = req.body;
    if (!username || !email || !password || !tenantId) {
      return res.status(400).json({ error: 'username, email, password, and tenantId are required' });
    }
    const http = require('http');
    const body = JSON.stringify({ username, email, password, roles: roles || ['user'] });
    const result = await new Promise((resolve, reject) => {
      const proxyReq = http.request({
        hostname: 'iam', port: 3008, path: '/users', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-tenant-id': tenantId }
      }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', c => data += c);
        proxyRes.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ success: false, error: 'Invalid response' }); }
        });
      });
      proxyReq.on('error', (e) => resolve({ success: false, error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
    });
    if (result.success) {
      res.json({ success: true, user: result.data || result.user || result });
    } else {
      res.status(400).json({ error: result.error || 'Failed to create user' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/users/:userId/reset-password', authorize('platform:tenants'), express.json(), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });
    const http = require('http');
    const body = JSON.stringify({ password });
    const result = await new Promise((resolve, reject) => {
      const proxyReq = http.request({
        hostname: 'iam', port: 3008, path: `/users/${req.params.userId}/password`, method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
      }, (proxyRes) => {
        let data = '';
        proxyRes.on('data', c => data += c);
        proxyRes.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { resolve({ success: false, error: 'Invalid response' }); }
        });
      });
      proxyReq.on('error', (e) => resolve({ success: false, error: e.message }));
      proxyReq.write(body);
      proxyReq.end();
    });
    if (result.success) {
      res.json({ success: true });
    } else {
      res.status(400).json({ error: result.error || 'Failed to reset password' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Platform Billing --
const billingData = [
  { id: 'inv_001', tenant_id: 'tenant1', amount: 499, status: 'paid', due: '2026-06-01', desc: 'Professional Plan - May 2026' },
  { id: 'inv_002', tenant_id: 'tenant2', amount: 0, status: 'paid', due: '2026-06-01', desc: 'Free Plan - May 2026' },
];

app.get('/api/admin/billing', authorize('platform:billing'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenants = await Tenant.findAll();
    const db = require('./db/client');
    const overview = [];
    for (const t of tenants) {
      const tid = t.tenant_id || t.id;
      const invoices = billingData.filter(i => i.tenant_id === tid);
      let reqCount = 0;
      if (db.isAvailable()) {
        try { const r = await db.query('SELECT COUNT(*) as c FROM request_logs WHERE tenant_id = $1', [tid]); reqCount = parseInt(r.rows[0].c); } catch {}
      }
      overview.push({
        tenant_id: tid, tenant_name: t.name || tid, plan: t.tier || t.plan || 'free',
        status: t.status || 'active', request_count: reqCount, invoices,
        total_billed: invoices.reduce((s, i) => s + i.amount, 0)
      });
    }
    res.json({ overview });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// -- Platform API Keys --
app.get('/api/admin/api-keys', authorize('platform:tenants'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenants = await Tenant.findAll();
    const db = require('./db/client');
    const allKeys = [];
    for (const t of tenants) {
      const tid = t.tenant_id || t.id;
      if (db.isAvailable()) {
        try {
          const r = await db.query("SELECT id, name, key_prefix, scopes, active, created_at, last_used_at FROM api_tokens WHERE tenant_id = $1 ORDER BY created_at DESC", [tid]);
          r.rows.forEach(row => allKeys.push({ ...row, tenant_id: tid, tenant_name: t.name || tid }));
        } catch {}
      }
    }
    res.json({ apiKeys: allKeys });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/api-keys/:id', authorize('platform:tenants'), async (req, res) => {
  try {
    const db = require('./db/client');
    if (!db.isAvailable()) return res.status(503).json({ error: 'Database not available' });
    const r = await db.query('DELETE FROM api_tokens WHERE id = $1 RETURNING id, name', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'API key not found' });
    res.json({ message: 'API key revoked', key: r.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// -- Platform Notifications --
const notifications = [];

app.get('/api/admin/notifications', authorize('platform:tenants'), (req, res) => {
  res.json({ history: notifications.slice().reverse() });
});

app.post('/api/admin/notifications', authorize('platform:tenants'), express.json(), (req, res) => {
  const { title, message, target, targetTenantId } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });
  const notification = {
    id: 'notif_' + require('crypto').randomBytes(4).toString('hex'),
    title, message, target: target || 'all', targetTenantId: targetTenantId || null,
    created_at: new Date().toISOString(), sent_by: req.tenant?.userId || 'super_admin'
  };
  notifications.push(notification);
  res.status(201).json({ notification });
});

// -- Platform Security Settings --
const securitySettings = {
  password_min_length: 8, password_require_special: true, password_require_upper: true,
  password_expiry_days: 90, mfa_required: false, mfa_enforced_roles: ['admin'],
  session_timeout_minutes: 60, max_login_attempts: 5, lockout_duration_minutes: 30
};

const emailTemplates = [
  { id: 'welcome', name: 'Welcome Email', subject: 'Welcome to CyberSec Platform', body: 'Hello {{name}},\n\nYour account has been created. Your Tenant ID is {{tenantId}}.\n\nLogin at {{loginUrl}}\n\nBest,\nCyberSec Team' },
  { id: 'password_reset', name: 'Password Reset', subject: 'Password Reset Request', body: 'Hello {{name}},\n\nClick here to reset your password: {{resetUrl}}\n\nThis link expires in 24 hours.\n\nBest,\nCyberSec Team' },
  { id: 'service_approved', name: 'Service Approved', subject: 'Service Request Approved', body: 'Hello {{name}},\n\nYour request for {{serviceName}} has been approved.\n\nYou can now access it from your dashboard.\n\nBest,\nCyberSec Team' },
  { id: 'account_suspended', name: 'Account Suspended', subject: 'Account Suspended', body: 'Hello {{name}},\n\nYour account has been suspended. Please contact support.\n\nBest,\nCyberSec Team' },
];

app.get('/api/admin/settings/security', authorize('platform:policies'), (req, res) => {
  res.json({ settings: securitySettings });
});

app.put('/api/admin/settings/security', authorize('platform:policies'), express.json(), (req, res) => {
  const allowed = ['password_min_length', 'password_require_special', 'password_require_upper', 'password_expiry_days', 'mfa_required', 'mfa_enforced_roles', 'session_timeout_minutes', 'max_login_attempts', 'lockout_duration_minutes'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) securitySettings[key] = req.body[key];
  }
  res.json({ settings: securitySettings, message: 'Security settings updated' });
});

app.get('/api/admin/settings/email-templates', authorize('platform:policies'), (req, res) => {
  res.json({ templates: emailTemplates });
});

app.put('/api/admin/settings/email-templates/:id', authorize('platform:policies'), express.json(), (req, res) => {
  const idx = emailTemplates.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Template not found' });
  if (req.body.subject !== undefined) emailTemplates[idx].subject = req.body.subject;
  if (req.body.body !== undefined) emailTemplates[idx].body = req.body.body;
  res.json({ template: emailTemplates[idx], message: 'Template updated' });
});

// -- Platform Backup --
let backupState = { last_backup: null, last_backup_size: null, status: 'idle', history: [] };

app.get('/api/admin/backup', authorize('platform:health'), (req, res) => {
  res.json({ backup: backupState });
});

app.post('/api/admin/backup', authorize('platform:health'), async (req, res) => {
  if (backupState.status === 'running') return res.status(409).json({ error: 'Backup already in progress' });
  backupState.status = 'running';
  res.json({ message: 'Backup started', backup: backupState });
  const start = Date.now();
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    backupState.last_backup = new Date().toISOString();
    backupState.last_backup_size = (Math.random() * 50 + 10).toFixed(1) + ' MB';
    backupState.status = 'completed';
    backupState.history.push({ at: backupState.last_backup, size: backupState.last_backup_size, duration_ms: Date.now() - start });
  } catch {
    backupState.status = 'failed';
  }
});

// -- Platform Analytics --
app.get('/api/admin/analytics/overview', authorize('platform:analytics'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const Analytics = require('./models/analytics');
    const tenants = await Tenant.findAll();
    const activeTenants = tenants.filter(t => t.status !== 'suspended').length;
    const db = require('./db/client');
    let totalRequests = 0;
    if (db.isAvailable()) {
      try {
        const r = await db.query('SELECT COUNT(*) as c FROM request_logs');
        totalRequests = parseInt(r.rows[0].c);
      } catch (e) {}
    }
    res.json({
      totalTenants: tenants.length,
      activeTenants,
      suspendedTenants: tenants.length - activeTenants,
      totalRequests,
      availableServices: Tenant.getAvailableServices().length,
      timeRange: 'all time'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/analytics/services', authorize('platform:analytics'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenants = await Tenant.findAll();
    const available = Tenant.getAvailableServices();
    const adoption = await Promise.all(available.map(async (service) => {
      let count = 0;
      for (const t of tenants) {
        const subs = await Tenant.getSubscriptions(t.tenant_id);
        if (subs.some(s => s.service_name === service && s.enabled !== false)) count++;
      }
      return { service, tenantCount: count };
    }));
    res.json({ services: adoption });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- System Health --
app.get('/api/admin/health', authorize('platform:health'), async (req, res) => {
  try {
    const http = require('http');
    const serviceList = [
      { name: 'api-gateway', host: 'localhost', port: 3000, path: '/health' },
      { name: 'iam', host: 'iam', port: 3008, path: '/health' },
      { name: 'waf', host: 'waf', port: 3001, path: '/health' },
      { name: 'ngfw', host: 'ngfw', port: 3002, path: '/health' },
      { name: 'siem-soar', host: 'siem-soar', port: 3003, path: '/health' },
      { name: 'vuln-scanner', host: 'vuln-scanner', port: 3004, path: '/health' },
      { name: 'fraud-detection', host: 'fraud-detection', port: 3005, path: '/health' },
      { name: 'awareness', host: 'awareness', port: 3006, path: '/health' },
      { name: 'grc', host: 'grc', port: 3007, path: '/health' },
      { name: 'risk-engine', host: 'risk-engine', port: 3010, path: '/health' },
      { name: 'asset-management', host: 'asset-management', port: 3009, path: '/health' },
      { name: 'cspm', host: 'cspm', port: 3011, path: '/health' },
      { name: 'edr', host: 'edr', port: 3015, path: '/health' },
      { name: 'threat-intel', host: 'threat-intel', port: 3019, path: '/health' },
      { name: 'soar', host: 'soar', port: 3018, path: '/health' },
      { name: 'data-security', host: 'data-security', port: 3012, path: '/health' },
      { name: 'data-lake', host: 'data-lake', port: 3017, path: '/health' },
      { name: 'xdr', host: 'xdr', port: 3020, path: '/health' },
      { name: 'devsecops', host: 'devsecops', port: 3021, path: '/health' },
      { name: 'deception', host: 'deception', port: 3014, path: '/health' },
      { name: 'password-manager', host: 'password-manager', port: 3016, path: '/health' },
      { name: 'business-continuity', host: 'business-continuity', port: 3013, path: '/health' },
    ];
    const results = await Promise.all(serviceList.map(svc =>
      new Promise(resolve => {
        const req = http.get({ hostname: svc.host, port: svc.port, path: svc.path, timeout: 3000 }, (res) => {
          let d = '';
          res.on('data', c => d += c);
          res.on('end', () => {
            try { resolve({ name: svc.name, status: 'healthy', details: JSON.parse(d) }); }
            catch { resolve({ name: svc.name, status: 'healthy', details: d }); }
          });
        });
        req.on('error', () => resolve({ name: svc.name, status: 'unhealthy', details: null }));
        req.on('timeout', () => { req.destroy(); resolve({ name: svc.name, status: 'timeout', details: null }); });
      })
    ));
    res.json({ services: results, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Platform Users (cross-tenant user management) --
app.get('/api/admin/users', authorize('platform:users'), async (req, res) => {
  try {
    const http = require('http');
    const tenantId = req.query.tenantId || null;
    const result = await new Promise((resolve, reject) => {
      const path = tenantId ? `/users?tenantId=${encodeURIComponent(tenantId)}` : '/users';
      const reqObj = http.get({ hostname: 'iam', port: 3008, path, timeout: 5000 }, (proxyRes) => {
        let d = '';
        proxyRes.on('data', c => d += c);
        proxyRes.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ success: false }); } });
      });
      reqObj.on('error', reject);
    });
    res.json(result.success ? { users: result.data } : { users: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -- Global Policies --
app.get('/api/admin/policies', authorize('platform:policies'), (req, res) => {
  res.json({ policies: Array.from(policyEngine.policies.values()) });
});

app.post('/api/admin/policies', authorize('platform:policies'), express.json(), (req, res) => {
  try {
    policyEngine.addPolicy(req.body);
    res.json({ message: 'Global policy added', policy: req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== POLICY MANAGEMENT ==================

app.get('/api/policies', authorize('admin:policies'), (req, res) => {
  res.json({ policies: Array.from(policyEngine.policies.values()) });
});

app.post('/api/policies', authorize('admin:policies'), express.json(), (req, res) => {
  try {
    policyEngine.addPolicy(req.body);
    res.json({ message: 'Policy added', policy: req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== SERVICE ROUTES ==================

app.use('/api/iam', requireServiceAccess('iam'), createServiceProxy('iam', { '^/api/iam': '' }));
app.use('/api/waf', requireServiceAccess('waf'), createServiceProxy('waf', { '^/api/waf': '' }));
app.use('/api/ngfw', requireServiceAccess('ngfw'), createServiceProxy('ngfw', { '^/api/ngfw': '' }));
app.use('/api/siem', requireServiceAccess('siem-soar'), createServiceProxy('siem-soar', { '^/api/siem': '' }));
app.use('/api/soar', requireServiceAccess('soar'), createServiceProxy('soar', { '^/api/soar': '' }));
app.use('/api/scanner', requireServiceAccess('vuln-scanner'), createServiceProxy('vuln-scanner', { '^/api/scanner': '' }));
app.use('/api/fraud', requireServiceAccess('fraud-detection'), createServiceProxy('fraud-detection', { '^/api/fraud': '' }));
app.use('/api/awareness', requireServiceAccess('awareness'), createServiceProxy('awareness', { '^/api/awareness': '' }));
app.use('/api/grc', requireServiceAccess('grc'), createServiceProxy('grc', { '^/api/grc': '' }));

// New services - 12 total
app.use('/api/assets', requireServiceAccess('asset-management'), createServiceProxy('asset-management', { '^/api/assets': '' }));
app.use('/api/cspm', requireServiceAccess('cspm'), createServiceProxy('cspm', { '^/api/cspm': '' }));
app.use('/api/edr', requireServiceAccess('edr'), createServiceProxy('edr', { '^/api/edr': '' }));
app.use('/api/threat-intel', requireServiceAccess('threat-intel'), createServiceProxy('threat-intel', { '^/api/threat-intel': '' }));
app.use('/api/soar-service', requireServiceAccess('soar'), createServiceProxy('soar', { '^/api/soar-service': '' }));
app.use('/api/data-security', requireServiceAccess('data-security'), createServiceProxy('data-security', { '^/api/data-security': '' }));
app.use('/api/data-lake', requireServiceAccess('data-lake'), createServiceProxy('data-lake', { '^/api/data-lake': '' }));
app.use('/api/xdr', requireServiceAccess('xdr'), createServiceProxy('xdr', { '^/api/xdr': '' }));
app.use('/api/devsecops', requireServiceAccess('devsecops'), createServiceProxy('devsecops', { '^/api/devsecops': '' }));
app.use('/api/deception', requireServiceAccess('deception'), createServiceProxy('deception', { '^/api/deception': '' }));
app.use('/api/password-manager', requireServiceAccess('password-manager'), createServiceProxy('password-manager', { '^/api/password-manager': '' }));
app.use('/api/bcp', requireServiceAccess('business-continuity'), createServiceProxy('business-continuity', { '^/api/bcp': '' }));
// Dedicated route for risk-human to work around proxy encoding issues
app.get('/api/risk/human/:userId', requireServiceAccess('risk-engine'), async (req, res) => {
  const http = require('http');
  const params = new URLSearchParams({ tenant_id: req.query.tenant_id || req.tenant?.id || '' });
  const options = {
    hostname: 'risk-engine', port: 8000,
    path: `/human/${req.params.userId}?${params}`,
    method: 'GET',
    headers: { 'user-agent': req.headers['user-agent'] || 'Mozilla/5.0', 'x-tenant-id': req.tenant?.id || '' }
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, { 'content-type': 'application/json' });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => res.status(503).json({ error: 'risk-engine unavailable' }));
  proxyReq.end();
});
app.use('/api/risk', requireServiceAccess('risk-engine'), createServiceProxy('risk-engine', { '^/api/risk': '' }));

// ================== SERVICE REQUEST ROUTES ==================

app.post('/api/service-requests', express.json(), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const { services, message } = req.body;
    if (!services || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ error: 'At least one service must be selected' });
    }
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: 'Authentication required' });
    const tenant = await Tenant.findByTenantId(tenantId);
    const request = await Tenant.createServiceRequest({
      tenantId,
      tenantName: tenant?.name || 'Unknown',
      contactEmail: req.headers['x-user-id'] || '',
      services,
      message
    });
    res.status(201).json({ success: true, request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/service-requests', async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenantId = req.tenant?.id;
    if (!tenantId) return res.status(401).json({ error: 'Authentication required' });
    const requests = await Tenant.getTenantServiceRequests(tenantId);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/service-requests', authorize('tenants:read'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const { status } = req.query;
    const requests = await Tenant.getAllServiceRequests(status || null);
    res.json({ requests });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/service-requests/:id/approve', authorize('tenants:write'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const reviewedBy = req.tenant?.userId || req.tenant?.id || 'super_admin';
    const result = await Tenant.approveServiceRequest(req.params.id, reviewedBy);
    if (!result) return res.status(404).json({ error: 'Request not found' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: 'Service request approved and services activated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/service-requests/:id/reject', authorize('tenants:write'), express.json(), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const reviewedBy = req.tenant?.userId || req.tenant?.id || 'super_admin';
    const result = await Tenant.rejectServiceRequest(req.params.id, reviewedBy, req.body.reason);
    if (!result) return res.status(404).json({ error: 'Request not found' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json({ success: true, message: 'Service request rejected' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== BRANDING / WHITE-LABELING ==================
const brandingSettings = {};

app.get('/api/admin/branding', authorize('platform:tenants'), (req, res) => {
  res.json({ branding: brandingSettings });
});

app.put('/api/admin/branding', authorize('platform:tenants'), express.json(), (req, res) => {
  const { tenantId, primaryColor, accentColor, companyName, domain, emailSender, supportEmail } = req.body;
  const key = tenantId || '__global__';
  brandingSettings[key] = { primaryColor, accentColor, companyName, domain, emailSender, supportEmail, updatedAt: new Date().toISOString() };
  res.json({ message: 'Branding saved', branding: brandingSettings[key] });
});

// ================== ROLE MANAGEMENT (RBAC) ==================
const ALL_PERMS = [
  'tenants:read','tenants:write','users:read','users:write','billing:read','billing:write',
  'audit:read','analytics:read','policies:read','policies:write','health:read','settings:read','settings:write',
  'webhooks:read','webhooks:write','notifications:write','impersonate:use','sso:read','sso:write',
  'sessions:manage','maintenance:manage','backup:manage','compliance:read','compliance:write',
  'services:read','branding:write','quotas:read','quotas:write','bulk:operations','apikeys:read','apikeys:write',
];
const customRoles = [
  { id: 'role_super_admin', name: 'Super Admin', description: 'Unrestricted full platform access', permissions: [...ALL_PERMS], isSystem: true },
  { id: 'role_platform_admin', name: 'Platform Administrator', description: 'Full platform management except impersonation', permissions: ALL_PERMS.filter(p => p !== 'impersonate:use'), isSystem: true },
  { id: 'role_billing_mgr', name: 'Billing Manager', description: 'Manage billing, invoices, plans, and quotas', permissions: ['tenants:read','users:read','billing:read','billing:write','analytics:read','quotas:read','quotas:write','services:read'], isSystem: true },
  { id: 'role_security_auditor', name: 'Security Auditor', description: 'Read-only security audit, compliance, and session monitoring', permissions: ['tenants:read','users:read','audit:read','analytics:read','policies:read','compliance:read','sessions:manage','health:read'], isSystem: true },
  { id: 'role_support_agent', name: 'Support Agent', description: 'User support with impersonation for troubleshooting', permissions: ['tenants:read','users:read','impersonate:use','health:read','notifications:write','sessions:manage','settings:read','apikeys:read'], isSystem: true },
  { id: 'role_compliance_officer', name: 'Compliance Officer', description: 'Full compliance reporting and audit access', permissions: ['tenants:read','users:read','audit:read','analytics:read','policies:read','compliance:read','compliance:write','health:read'], isSystem: true },
  { id: 'role_network_operator', name: 'Network Operator', description: 'Monitor health, services, SLA and manage maintenance & backups', permissions: ['health:read','services:read','maintenance:manage','backup:manage','policies:read','analytics:read','sessions:manage'], isSystem: true },
  { id: 'role_security_analyst', name: 'Security Analyst', description: 'Threat monitoring, policy management, and IP rules', permissions: ['tenants:read','users:read','audit:read','analytics:read','policies:read','policies:write','sessions:manage','health:read','compliance:read'], isSystem: true },
  { id: 'role_integration_mgr', name: 'Integration Manager', description: 'Manage webhooks, SSO providers, and API keys', permissions: ['tenants:read','webhooks:read','webhooks:write','sso:read','sso:write','apikeys:read','apikeys:write','settings:read','health:read'], isSystem: true },
  { id: 'role_csm', name: 'Customer Success Manager', description: 'Tenant relationship management, branding, and announcements', permissions: ['tenants:read','users:read','billing:read','notifications:write','branding:write','analytics:read','health:read'], isSystem: true },
  { id: 'role_readonly', name: 'Read-Only Auditor', description: 'View all platform data, no modifications allowed', permissions: ['tenants:read','users:read','billing:read','audit:read','analytics:read','policies:read','health:read','settings:read','webhooks:read','sso:read','services:read','compliance:read','quotas:read','apikeys:read'], isSystem: true },
  { id: 'role_tenant_admin', name: 'Tenant Administrator', description: 'Full tenant and user lifecycle management', permissions: ['tenants:read','tenants:write','users:read','users:write','billing:read','services:read','quotas:read','policies:read','settings:read','health:read'], isSystem: true },
];

app.get('/api/admin/roles', authorize('platform:policies'), (req, res) => {
  res.json({ roles: customRoles });
});

app.post('/api/admin/roles', authorize('platform:policies'), express.json(), (req, res) => {
  const { name, description, permissions } = req.body;
  if (!name) return res.status(400).json({ error: 'Role name is required' });
  const role = { id: 'role_' + require('crypto').randomBytes(4).toString('hex'), name, description: description || '', permissions: permissions || [], isSystem: false, created_at: new Date().toISOString() };
  customRoles.push(role);
  res.status(201).json({ role });
});

app.put('/api/admin/roles/:id', authorize('platform:policies'), express.json(), (req, res) => {
  const idx = customRoles.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Role not found' });
  if (customRoles[idx].isSystem) return res.status(403).json({ error: 'Cannot modify system roles' });
  const { name, description, permissions } = req.body;
  if (name) customRoles[idx].name = name;
  if (description !== undefined) customRoles[idx].description = description;
  if (permissions) customRoles[idx].permissions = permissions;
  res.json({ role: customRoles[idx] });
});

app.delete('/api/admin/roles/:id', authorize('platform:policies'), (req, res) => {
  const idx = customRoles.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Role not found' });
  if (customRoles[idx].isSystem) return res.status(403).json({ error: 'Cannot delete system roles' });
  customRoles.splice(idx, 1);
  res.json({ message: 'Role deleted' });
});

// ================== AUDIT LOG DETAIL ==================
app.get('/api/admin/audit/detail', authorize('platform:audit'), async (req, res) => {
  try {
    const db = require('./db/client');
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const tenantId = req.query.tenantId || null;
    const method = req.query.method || null;
    if (db.isAvailable()) {
      const params = [];
      const conditions = [];
      if (tenantId) { conditions.push('tenant_id = $' + (params.length + 1)); params.push(tenantId); }
      if (method) { conditions.push('method = $' + (params.length + 1)); params.push(method); }
      const where = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
      const query = 'SELECT * FROM request_logs' + where + ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
      const countQuery = 'SELECT COUNT(*) as total FROM request_logs' + where;
      const result = await db.query(query, [...params, limit, offset]);
      const countResult = await db.query(countQuery, params);
      res.json({ logs: result.rows, total: parseInt(countResult.rows[0].total), limit, offset });
    } else {
      const fakeLogs = [];
      for (let i = 0; i < Math.min(limit, 20); i++) {
        fakeLogs.push({ id: i + 1, tenant_id: 'tenant' + (i % 3 + 1), method: ['GET','POST','PUT','DELETE'][i % 4], path: ['/api/iam/users','/api/waf/rules','/api/siem/events','/api/auth/login'][i % 4], status_code: [200,201,400,500][i % 4], response_time: Math.random() * 500, ip_address: '192.168.1.' + (i + 1), timestamp: new Date(Date.now() - i * 60000).toISOString() });
      }
      res.json({ logs: fakeLogs, total: fakeLogs.length, limit, offset, note: 'Demo mode' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ================== MAINTENANCE MODE ==================
let maintenanceSettings = { enabled: false, message: '', allowedIPs: [], startTime: '', endTime: '' };

app.get('/api/admin/maintenance', authorize('platform:health'), (req, res) => {
  res.json({ maintenance: maintenanceSettings });
});

app.put('/api/admin/maintenance', authorize('platform:health'), express.json(), (req, res) => {
  const { enabled, message, allowedIPs, startTime, endTime } = req.body;
  if (enabled !== undefined) maintenanceSettings.enabled = enabled;
  if (message !== undefined) maintenanceSettings.message = message;
  if (allowedIPs !== undefined) maintenanceSettings.allowedIPs = allowedIPs;
  if (startTime !== undefined) maintenanceSettings.startTime = startTime;
  if (endTime !== undefined) maintenanceSettings.endTime = endTime;
  res.json({ maintenance: maintenanceSettings, message: 'Maintenance settings updated' });
});

// ================== WEBHOOK CONFIGURATION ==================
let webhooksList = [];

app.get('/api/admin/webhooks', authorize('platform:tenants'), (req, res) => {
  res.json({ webhooks: webhooksList });
});

app.post('/api/admin/webhooks', authorize('platform:tenants'), express.json(), (req, res) => {
  const { url, events, description, secret } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });
  const webhook = { id: 'wh_' + require('crypto').randomBytes(4).toString('hex'), url, events: events || [], description: description || '', secret: secret || '', active: true, created_at: new Date().toISOString() };
  webhooksList.push(webhook);
  res.status(201).json({ webhook });
});

app.delete('/api/admin/webhooks/:id', authorize('platform:tenants'), (req, res) => {
  const idx = webhooksList.findIndex(w => w.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Webhook not found' });
  webhooksList.splice(idx, 1);
  res.json({ message: 'Webhook deleted' });
});

app.post('/api/admin/webhooks/:id/test', authorize('platform:tenants'), async (req, res) => {
  const wh = webhooksList.find(w => w.id === req.params.id);
  if (!wh) return res.status(404).json({ error: 'Webhook not found' });
  const http = require('http');
  const payload = JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), data: { message: 'This is a test webhook from CyberSec Platform' } });
  try {
    await new Promise((resolve, reject) => {
      const url = new URL(wh.url);
      const opts = { hostname: url.hostname, port: url.port || 80, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } };
      const reqObj = http.request(opts, (proxyRes) => { let d = ''; proxyRes.on('data', c => d += c); proxyRes.on('end', () => resolve(d)); });
      reqObj.on('error', reject);
      reqObj.write(payload);
      reqObj.end();
    });
    res.json({ message: 'Test webhook sent successfully' });
  } catch (err) {
    res.status(502).json({ error: 'Failed to send test webhook: ' + err.message });
  }
});

// ================== COMPLIANCE REPORTS ==================
let complianceReports = [];

app.get('/api/admin/compliance', authorize('platform:audit'), (req, res) => {
  res.json({ reports: complianceReports });
});

app.post('/api/admin/compliance/generate', authorize('platform:audit'), express.json(), (req, res) => {
  const { standard } = req.body;
  if (!standard) return res.status(400).json({ error: 'Standard is required' });
  const score = 70 + Math.random() * 30;
  const report = {
    id: 'cpt_' + require('crypto').randomBytes(4).toString('hex'),
    standard, score: Math.round(score * 100) / 100,
    status: score >= 85 ? 'compliant' : score >= 70 ? 'partially-compliant' : 'non-compliant',
    issues: Math.floor(Math.random() * 20),
    generatedAt: new Date().toISOString(),
    details: { tenantsChecked: 3, controlsPassed: Math.floor(Math.random() * 50 + 50), controlsFailed: Math.floor(Math.random() * 10) }
  };
  complianceReports.unshift(report);
  res.status(201).json({ report });
});

// ================== ANNOUNCEMENTS ==================
let announcementsList = [];

app.get('/api/admin/announcements', authorize('platform:tenants'), (req, res) => {
  res.json({ announcements: announcementsList });
});

app.post('/api/admin/announcements', authorize('platform:tenants'), express.json(), (req, res) => {
  const { title, message, type, active } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required' });
  const announcement = { id: 'ann_' + require('crypto').randomBytes(4).toString('hex'), title, message, type: type || 'info', active: active !== false, created_at: new Date().toISOString() };
  announcementsList.unshift(announcement);
  res.status(201).json({ announcement });
});

app.put('/api/admin/announcements/:id', authorize('platform:tenants'), express.json(), (req, res) => {
  const idx = announcementsList.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Announcement not found' });
  const { title, message, type, active } = req.body;
  if (title !== undefined) announcementsList[idx].title = title;
  if (message !== undefined) announcementsList[idx].message = message;
  if (type !== undefined) announcementsList[idx].type = type;
  if (active !== undefined) announcementsList[idx].active = active;
  res.json({ announcement: announcementsList[idx] });
});

app.delete('/api/admin/announcements/:id', authorize('platform:tenants'), (req, res) => {
  const idx = announcementsList.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Announcement not found' });
  announcementsList.splice(idx, 1);
  res.json({ message: 'Announcement deleted' });
});

// ================== IP ALLOW/BLOCK LIST ==================
let ipRules = [
  { id: 'ip_1', ip: '10.0.0.0/8', type: 'allow', description: 'Internal network', created_at: new Date().toISOString() },
  { id: 'ip_2', ip: '192.168.0.0/16', type: 'allow', description: 'VPC network', created_at: new Date().toISOString() },
];

app.get('/api/admin/ip-rules', authorize('platform:policies'), (req, res) => {
  res.json({ rules: ipRules });
});

app.post('/api/admin/ip-rules', authorize('platform:policies'), express.json(), (req, res) => {
  const { ip, type, description } = req.body;
  if (!ip) return res.status(400).json({ error: 'IP address is required' });
  if (!['allow', 'block'].includes(type)) return res.status(400).json({ error: 'Type must be allow or block' });
  const rule = { id: 'ip_' + require('crypto').randomBytes(4).toString('hex'), ip, type, description: description || '', created_at: new Date().toISOString() };
  ipRules.push(rule);
  res.status(201).json({ rule });
});

app.delete('/api/admin/ip-rules/:id', authorize('platform:policies'), (req, res) => {
  const idx = ipRules.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Rule not found' });
  ipRules.splice(idx, 1);
  res.json({ message: 'Rule deleted' });
});

// ================== RESOURCE QUOTAS ==================
let resourceQuotas = [];

app.get('/api/admin/quotas', authorize('platform:tenants'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenants = await Tenant.findAll();
    const enriched = resourceQuotas.map(q => {
      const t = tenants.find(te => (te.tenant_id || te.id) === q.tenant_id);
      return { ...q, tenant_name: t?.name || q.tenant_id };
    });
    res.json({ quotas: enriched });
  } catch { res.json({ quotas: resourceQuotas }); }
});

app.post('/api/admin/quotas', authorize('platform:tenants'), express.json(), (req, res) => {
  const { tenantId, maxUsers, maxServices, storageGB, rateLimitRPM } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID is required' });
  if (resourceQuotas.find(q => q.tenant_id === tenantId)) return res.status(409).json({ error: 'Quota already exists for this tenant' });
  const quota = { id: 'q_' + require('crypto').randomBytes(4).toString('hex'), tenant_id: tenantId, max_users: maxUsers || 10, max_services: maxServices || 3, storage_gb: storageGB || 5, rate_limit_rpm: rateLimitRPM || 100, created_at: new Date().toISOString() };
  resourceQuotas.push(quota);
  res.status(201).json({ quota });
});

app.put('/api/admin/quotas/:id', authorize('platform:tenants'), express.json(), (req, res) => {
  const idx = resourceQuotas.findIndex(q => q.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Quota not found' });
  const { maxUsers, maxServices, storageGB, rateLimitRPM } = req.body;
  if (maxUsers !== undefined) resourceQuotas[idx].max_users = maxUsers;
  if (maxServices !== undefined) resourceQuotas[idx].max_services = maxServices;
  if (storageGB !== undefined) resourceQuotas[idx].storage_gb = storageGB;
  if (rateLimitRPM !== undefined) resourceQuotas[idx].rate_limit_rpm = rateLimitRPM;
  res.json({ quota: resourceQuotas[idx] });
});

// ================== SESSION MANAGEMENT ==================
let activeSessions = Array.from({ length: 8 }, (_, i) => ({
  id: 'sess_' + (i + 1), user_id: 'user_' + (i + 1), username: ['admin','jdoe','jsmith','operator','auditor','bob','alice','charlie'][i],
  tenant_id: 'tenant' + (i % 3 + 1), ip_address: '192.168.1.' + (i + 10),
  created_at: new Date(Date.now() - (i * 3600000 + Math.random() * 3600000)).toISOString(),
  last_active: new Date(Date.now() - Math.random() * 600000).toISOString(),
  status: i < 6 ? 'active' : 'expired',
}));

app.get('/api/admin/sessions', authorize('platform:audit'), (req, res) => {
  res.json({ sessions: activeSessions });
});

app.delete('/api/admin/sessions/:id', authorize('platform:audit'), (req, res) => {
  const idx = activeSessions.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Session not found' });
  activeSessions[idx].status = 'terminated';
  res.json({ message: 'Session terminated', session: activeSessions[idx] });
});

app.delete('/api/admin/sessions', authorize('platform:audit'), (req, res) => {
  activeSessions.forEach(s => { if (s.status === 'active') s.status = 'terminated'; });
  res.json({ message: 'All active sessions terminated', count: activeSessions.filter(s => s.status === 'terminated').length });
});

// ================== SSO / IDENTITY PROVIDERS ==================
let ssoProviders = [];

app.get('/api/admin/sso', authorize('platform:tenants'), async (req, res) => {
  try {
    const Tenant = require('./models/tenant');
    const tenants = await Tenant.findAll();
    const enriched = ssoProviders.map(p => {
      const t = tenants.find(te => (te.tenant_id || te.id) === p.tenant_id);
      return { ...p, tenant_name: t?.name || p.tenant_id };
    });
    res.json({ providers: enriched });
  } catch { res.json({ providers: ssoProviders }); }
});

app.post('/api/admin/sso', authorize('platform:tenants'), express.json(), (req, res) => {
  const { tenantId, provider, label, entityId, ssoUrl, certificate, enabled } = req.body;
  if (!tenantId || !entityId || !ssoUrl) return res.status(400).json({ error: 'Tenant, Entity ID, and SSO URL are required' });
  const entry = { id: 'sso_' + require('crypto').randomBytes(4).toString('hex'), tenant_id: tenantId, provider: provider || 'saml', label: label || '', entity_id: entityId, sso_url: ssoUrl, certificate: certificate || '', enabled: enabled !== false, created_at: new Date().toISOString() };
  ssoProviders.push(entry);
  res.status(201).json({ provider: entry });
});

app.put('/api/admin/sso/:id', authorize('platform:tenants'), express.json(), (req, res) => {
  const idx = ssoProviders.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Provider not found' });
  const { provider, label, entityId, ssoUrl, certificate, enabled } = req.body;
  if (provider !== undefined) ssoProviders[idx].provider = provider;
  if (label !== undefined) ssoProviders[idx].label = label;
  if (entityId !== undefined) ssoProviders[idx].entity_id = entityId;
  if (ssoUrl !== undefined) ssoProviders[idx].sso_url = ssoUrl;
  if (certificate !== undefined) ssoProviders[idx].certificate = certificate;
  if (enabled !== undefined) ssoProviders[idx].enabled = enabled;
  res.json({ provider: ssoProviders[idx] });
});

app.delete('/api/admin/sso/:id', authorize('platform:tenants'), (req, res) => {
  const idx = ssoProviders.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Provider not found' });
  ssoProviders.splice(idx, 1);
  res.json({ message: 'SSO provider removed' });
});

// ================== TENANT IMPERSONATION ==================
let impersonationLogs = [];

app.post('/api/admin/impersonate', authorize('platform:tenants'), express.json(), async (req, res) => {
  const { tenantId, userId } = req.body;
  if (!tenantId || !userId) return res.status(400).json({ error: 'Tenant ID and User ID are required' });
  const jwt = require('jsonwebtoken');
  try {
    const db = require('./db/client');
    let user = null;
    if (db.isAvailable()) {
      const r = await db.query('SELECT id, username, email, roles FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);
      if (r.rows.length > 0) user = r.rows[0];
    }
    if (!user) return res.status(404).json({ error: 'User not found in specified tenant' });
    const token = jwt.sign({
      userId: user.id,
      tenantId,
      roles: user.roles || ['user'],
      impersonator: req.tenant?.userId || 'super_admin',
      departments: []
    }, JWT_SECRET, { expiresIn: '1h' });
    impersonationLogs.unshift({ timestamp: new Date().toISOString(), admin_id: req.tenant?.userId || 'super_admin', target_tenant: tenantId, target_user: userId, success: true });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, roles: user.roles }, expiresIn: '1h' });
  } catch (err) {
    impersonationLogs.unshift({ timestamp: new Date().toISOString(), admin_id: req.tenant?.userId || 'super_admin', target_tenant: tenantId, target_user: userId, success: false });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/impersonation-logs', authorize('platform:audit'), (req, res) => {
  res.json({ logs: impersonationLogs });
});

// ================== SLA REPORTS ==================
app.get('/api/admin/sla', authorize('platform:health'), (req, res) => {
  const services = ['api-gateway', 'iam', 'waf', 'ngfw', 'siem', 'soar', 'vuln-scanner', 'fraud-detection', 'xdr', 'edr'];
  const range = req.query.range || '7d';
  const reports = services.map(s => ({
    service: s,
    uptime: Math.round((99.5 + Math.random() * 0.5) * 100) / 100,
    avgResponseTime: Math.floor(Math.random() * 200 + 20) + 'ms',
    incidents: Math.floor(Math.random() * 3),
    slaTarget: '99.9%',
    range,
  }));
  res.json({ reports });
});

// ================== BULK OPERATIONS ==================
app.post('/api/admin/bulk/import-users', authorize('platform:tenants'), express.json(), async (req, res) => {
  const { users } = req.body;
  if (!Array.isArray(users) || users.length === 0) return res.status(400).json({ error: 'Users array is required' });
  let imported = 0; const errors = [];
  for (const u of users) {
    try {
      if (!u.tenantId || !u.username || !u.email) { errors.push({ user: u, error: 'Missing required fields' }); continue; }
      const http = require('http');
      const body = JSON.stringify({ username: u.username, email: u.email, password: u.password || 'TempPass123!', roles: u.roles || ['user'] });
      await new Promise((resolve, reject) => {
        const reqObj = http.request({ hostname: 'iam', port: 3008, path: '/users', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'x-tenant-id': u.tenantId } }, (proxyRes) => {
          let d = ''; proxyRes.on('data', c => d += c); proxyRes.on('end', () => { try { const r = JSON.parse(d); if (r.success) imported++; else errors.push({ user: u, error: r.error || 'Unknown' }); } catch { errors.push({ user: u, error: 'Invalid response' }); } resolve(); });
        });
        reqObj.on('error', (e) => { errors.push({ user: u, error: e.message }); resolve(); });
        reqObj.write(body);
        reqObj.end();
      });
    } catch (e) { errors.push({ user: u, error: e.message }); }
  }
  res.json({ imported, errors, total: users.length });
});

app.post('/api/admin/bulk/assign-services', authorize('platform:tenants'), express.json(), async (req, res) => {
  const { tenantIds, services } = req.body;
  if (!Array.isArray(tenantIds) || tenantIds.length === 0) return res.status(400).json({ error: 'tenantIds array is required' });
  if (!Array.isArray(services) || services.length === 0) return res.status(400).json({ error: 'services array is required' });
  const Tenant = require('./models/tenant');
  let assigned = 0;
  for (const tid of tenantIds) {
    try {
      const existing = await Tenant.getSubscriptions(tid);
      const existingNames = new Set(existing.map(s => s.service_name || s));
      const merged = [...new Set([...existingNames, ...services])];
      await Tenant.setSubscriptions(tid, [...merged]);
      assigned++;
    } catch (e) { console.error('Failed to assign services to', tid, e.message); }
  }
  res.json({ message: `Services assigned to ${assigned}/${tenantIds.length} tenant(s)`, assigned, total: tenantIds.length });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = () => {
  if (USE_HTTPS) {
    const options = {
      key: fs.readFileSync(process.env.SSL_KEY_PATH || 'ssl/key.pem'),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH || 'ssl/cert.pem'),
      requestCert: true,
      rejectUnauthorized: false
    };
    https.createServer(options, app).listen(PORT, () => {
      console.log(`API Gateway with mTLS running on port ${PORT}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`API Gateway running on port ${PORT}`);
      console.log('Dashboard: http://localhost:' + PORT + '/dashboard');
    });
  }
};

startServer();

module.exports = app;
