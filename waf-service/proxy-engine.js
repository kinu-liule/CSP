const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');
const { Pool } = require('pg');
const httpProxy = require('http-proxy');
const wafEngine = require('./waf-engine');
const geoip = require('./geoip');
const redisLimiter = require('./rate-limiter');

const pool = new Pool({
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'cybersec_platform',
  user: process.env.DB_USER || 'cybersec',
  password: process.env.DB_PASSWORD || 'securepassword',
  max: 5,
});

class ProxyEngine {
  constructor() {
    this.server = null;
    this.profiles = [];
    this.responseHeaders = [];
    this.validationConfigs = [];
    this.running = false;
    this.port = parseInt(process.env.WAF_PROXY_PORT) || 8090;
    this.sslPort = parseInt(process.env.WAF_PROXY_SSL_PORT) || 8443;
    this.sslOptions = null;
    this.proxy = null;
    this.backendHealth = new Map();
  }

  async start() {
    if (this.running) return { status: 'already_running', port: this.port };

    await this._loadProfiles();
    if (this.profiles.length === 0) {
      return { status: 'no_profiles_loaded', message: 'Create a profile with a backend_url first' };
    }

    this.proxy = httpProxy.createProxyServer({
      changeOrigin: true,
      ws: true,
      xfwd: true,
      proxyTimeout: 30000,
      timeout: 30000,
      preserveHeaderKeyCase: true,
      selfHandleResponse: false,
    });

    this._setupProxyErrorHandling();

    this.server = http.createServer((req, res) => this._handleRequest(req, res));
    this.server.on('upgrade', (req, socket, head) => this._handleWebSocket(req, socket, head));

    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        this.running = true;
        const routes = this.profiles.map(p => ({
          host: p.target_domains,
          backend: p.backend_url,
          mode: p.mode,
          profile: p.name,
        }));
        console.log(`Proxy Engine: listening on :${this.port}, ${this.profiles.length} routes active`);
        resolve({ status: 'started', port: this.port, routes });
      });
      this.server.on('error', (err) => {
        console.error('Proxy Engine: failed to start:', err.message);
        resolve({ status: 'error', message: err.message });
      });
    });
  }

  stop() {
    if (!this.running || !this.server) return { status: 'not_running' };
    this.server.close();
    this.proxy = null;
    this.running = false;
    return { status: 'stopped' };
  }

  async refresh() {
    await this._loadProfiles();
    return { status: 'refreshed', profiles_loaded: this.profiles.length };
  }

  async _loadProfiles() {
    try {
      const [profilesResult, headersResult, validationResult] = await Promise.all([
        pool.query(`SELECT * FROM waf_profiles WHERE backend_url IS NOT NULL AND backend_url != ''`),
        pool.query('SELECT * FROM waf_response_headers WHERE enabled = true'),
        pool.query('SELECT * FROM waf_request_validation WHERE enabled = true'),
      ]);
      this.profiles = profilesResult.rows;
      this.responseHeaders = headersResult.rows;
      this.validationConfigs = validationResult.rows;
    } catch (err) {
      console.error('Proxy Engine: failed to load profiles:', err.message);
    }
  }

  _matchProfile(host, path) {
    for (const profile of this.profiles) {
      if (profile.target_domains && Array.isArray(profile.target_domains)) {
        for (const domain of profile.target_domains) {
          if (host === domain || host.endsWith('.' + domain)) {
            return profile;
          }
        }
      }
    }
    return this.profiles.find(p => !p.target_domains || p.target_domains.length === 0) || null;
  }

  _getResponseHeaders(profileId) {
    if (!profileId) return {};
    const config = this.responseHeaders.find(h => h.profile_id === profileId);
    if (!config) return {};
    try {
      return typeof config.headers === 'object' ? config.headers : JSON.parse(config.headers);
    } catch {
      return {};
    }
  }

  _getValidationConfig(profileId) {
    if (!profileId) return null;
    return this.validationConfigs.find(v => v.profile_id === profileId) || null;
  }

  _setupProxyErrorHandling() {
    this.proxy.on('error', (err, req, res) => {
      if (res && !res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Backend unavailable', detail: err.message }));
      }
    });

    this.proxy.on('proxyReq', (proxyReq, req, res, options) => {
      proxyReq.setHeader('X-Forwarded-For', req.wafClientIp || req.socket.remoteAddress);
      proxyReq.setHeader('X-Forwarded-Proto', req.socket.encrypted ? 'https' : 'http');
      proxyReq.setHeader('X-WAF-Proxied', 'cybersec-waf/2.0');
      if (req.wafTenantId) proxyReq.setHeader('X-Tenant-Id', req.wafTenantId);
    });

    this.proxy.on('proxyRes', (proxyRes, req, res) => {
      if (req.wafResponseHeaders) {
        for (const [key, value] of Object.entries(req.wafResponseHeaders)) {
          proxyRes.headers[key] = value;
        }
      }
      if (req.wafRateLimit) {
        proxyRes.headers['X-RateLimit-Limit'] = req.wafRateLimit.limit;
        proxyRes.headers['X-RateLimit-Remaining'] = req.wafRateLimit.remaining;
        proxyRes.headers['X-RateLimit-Reset'] = req.wafRateLimit.resetTime;
      }
      proxyRes.headers['X-WAF-Status'] = req.wafAllowed ? 'allowed' : 'blocked';
      proxyRes.headers['X-WAF-Duration-Ms'] = String(Date.now() - (req.wafStartTime || Date.now()));
    });
  }

  async _handleRequest(req, res) {
    req.wafStartTime = Date.now();
    const host = req.headers['host'] ? req.headers['host'].split(':')[0] : 'unknown';
    const parsedUrl = url.parse(req.url);
    const path = parsedUrl.pathname || '/';
    const query = parsedUrl.query || '';
    const method = req.method;
    const sourceIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
    const ua = req.headers['user-agent'] || '';
    const contentType = req.headers['content-type'] || '';

    // 1. Match profile
    const profile = this._matchProfile(host, path);
    if (!profile) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'No WAF profile matches this request', host }));
    }

    req.wafTenantId = profile.tenant_id;

    // 2. Parse mode — detection mode never blocks
    const mode = profile.mode || 'blocking';

    // 2a. Rate limit check
    const rateResult = await redisLimiter.checkRate(sourceIp, profile.tenant_id, { method, path: req.url, ip: sourceIp });
    if (!rateResult.allowed) {
      if (mode === 'blocking') {
        return this._sendBlockPage(req, res, {
          allowed: false, reason: rateResult.reason, action: 'rate_limited',
          rule_name: 'Rate Limiter', rule_id: 'rate_limit', severity: 'medium',
          status_code: 429
        }, sourceIp, null, profile);
      }
      // In detection mode, just log and continue
      req.wafRateLimited = true;
    }
    req.wafRateLimit = rateResult;

    // 3. Run WAF inspection
    const bodyChunks = [];
    req.on('data', chunk => bodyChunks.push(chunk));
    req.on('end', async () => {
      const body = Buffer.concat(bodyChunks).toString('utf8');

      const result = await wafEngine.inspect(method, req.url, req.headers, body, sourceIp, contentType, profile.tenant_id);
      req.wafAllowed = result.allowed;
      req.wafResult = result;

      if (!result.allowed && mode === 'blocking') {
        const country = geoip.lookupCountryCode(sourceIp);
        return this._sendBlockPage(req, res, result, sourceIp, country, profile);
      }

      // 4. Apply response headers
      req.wafResponseHeaders = this._getResponseHeaders(profile.id);
      req.wafClientIp = sourceIp;

      // 5. Proxy to backend
      const backendUrl = profile.backend_url.replace(/\/+$/, '');
      const target = backendUrl + (path === '/' ? '' : path) + (query ? '?' + query : '');

      try {
        req.wafAllowed = true;
        this.proxy.web(req, res, {
          target: backendUrl,
          prependPath: false,
          ignorePath: true,
          secure: profile.target_protocol !== 'http',
        });
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy error', detail: err.message }));
        }
      }
    });
  }

  async _handleWebSocket(req, socket, head) {
    const host = req.headers['host'] ? req.headers['host'].split(':')[0] : 'unknown';
    const profile = this._matchProfile(host, req.url);
    if (!profile || !profile.backend_url) {
      socket.destroy();
      return;
    }

    const wsInspector = require('./websocket-inspector');
    const connectResult = await wsInspector.inspectConnect(
      req.socket.remoteAddress, req.url, 'websocket', profile.tenant_id
    );

    if (!connectResult.allowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    const wsInspectorId = 'ws_' + Date.now();
    wsInspector.trackConnection(wsInspectorId, req.socket.remoteAddress, profile.tenant_id);

    socket.on('close', () => wsInspector.removeConnection(wsInspectorId));

    this.proxy.ws(req, socket, head, {
      target: profile.backend_url,
      changeOrigin: true,
    });
  }

  _sendBlockPage(req, res, result, sourceIp, country, profile) {
    const statusCode = result.status_code || 403;
    const ref = result.rule_id || 'N/A';
    const requestId = crypto.randomBytes(8).toString('hex');
    const blockPage = process.env.WAF_BLOCK_TEMPLATE || 'json';

    const headers = {
      'X-WAF-Blocked': 'true',
      'X-WAF-Rule': result.rule_name || 'unknown',
      'X-WAF-Severity': result.severity || 'medium',
      'X-WAF-Request-Id': requestId,
      'X-WAF-Duration-Ms': String(Date.now() - (req.wafStartTime || Date.now())),
    };

    if (blockPage === 'html') {
      headers['Content-Type'] = 'text/html; charset=utf-8';
      res.writeHead(statusCode, headers);
      res.end(`<!DOCTYPE html><html><head><title>Request Blocked</title>
<style>body{font-family:sans-serif;background:#1a1a2e;color:#eee;display:flex;justify-content:center;align-items:center;height:100vh;margin:0}.card{background:#16213e;padding:3rem;border-radius:12px;max-width:500px;text-align:center;border:1px solid #e94560}h1{color:#e94560;margin:0 0 1rem}.ref{color:#888;font-size:0.8rem;margin-top:2rem}</style></head>
<body><div class="card"><h1>Request Blocked</h1>
<p>This request was blocked by the WAF security system.</p>
<p style="font-size:0.9rem;color:#aaa">Reason: ${result.reason || 'Security rule triggered'}</p>
<p class="ref">Reference: ${ref} | Request ID: ${requestId}</p></div></body></html>`);
    } else {
      headers['Content-Type'] = 'application/json';
      res.writeHead(statusCode, headers);
      res.end(JSON.stringify({
        error: 'Request blocked by WAF',
        reason: result.reason,
        rule: result.rule_name,
        rule_id: result.rule_id,
        severity: result.severity,
        request_id: requestId,
        reference: ref,
        source_ip: sourceIp,
        source_country: country,
        action: result.action,
        timestamp: new Date().toISOString(),
      }));
    }
  }

  async testBackend(backendUrl) {
    return new Promise((resolve) => {
      const parsed = url.parse(backendUrl);
      const client = parsed.protocol === 'https:' ? https : http;
      const req = client.get(backendUrl + '/health', { timeout: 5000 }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          resolve({ status: res.statusCode < 500 ? 'healthy' : 'unhealthy', status_code: res.statusCode, body: data.substring(0, 200) });
        });
      });
      req.on('error', (err) => resolve({ status: 'unhealthy', error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 'unhealthy', error: 'timeout' }); });
    });
  }

  async checkAllBackends() {
    const results = [];
    for (const profile of this.profiles) {
      if (!profile.backend_url) continue;
      const health = await this.testBackend(profile.backend_url);
      this.backendHealth.set(profile.id, { ...health, checked_at: new Date() });
      results.push({ profile: profile.name, backend: profile.backend_url, ...health });
    }
    return results;
  }

  getStatus() {
    return {
      running: this.running,
      port: this.port,
      profiles_loaded: this.profiles.length,
      active_routes: this.profiles.map(p => ({
        name: p.name,
        hosts: p.target_domains,
        backend: p.backend_url,
        mode: p.mode,
        health: this.backendHealth.get(p.id) || null,
      })),
    };
  }
}

module.exports = new ProxyEngine();
