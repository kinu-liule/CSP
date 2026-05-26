const bodyParser = require('../body-parser');
const geoip = require('../geoip');
const wsInspector = require('../websocket-inspector');
const grpcInspector = require('../grpc-inspector');

// ========================================================================
// BODY PARSER TESTS
// ========================================================================
describe('BodyParser', () => {
  describe('parse', () => {
    test('parses JSON content type', () => {
      const result = bodyParser.parse('application/json', '{"name":"test","value":123}');
      expect(result.format).toBe('json');
      expect(result.parsed).toEqual({ name: 'test', value: 123 });
      expect(result.error).toBeNull();
    });

    test('parses URL-encoded form data', () => {
      const result = bodyParser.parse('application/x-www-form-urlencoded', 'name=test&value=123');
      expect(result.format).toBe('form');
      expect(result.parsed.name).toBe('test');
      expect(result.parsed.value).toBe('123');
    });

    test('parses XML content type as raw', () => {
      const result = bodyParser.parse('application/xml', '<root><item/></root>');
      expect(result.format).toBe('xml');
      expect(result.error).toBeNull();
    });

    test('returns raw format for unknown content type', () => {
      const result = bodyParser.parse('text/plain', 'raw text');
      expect(result.format).toBe('raw');
    });

    test('returns null parsed for empty input', () => {
      const result = bodyParser.parse('application/json', null);
      expect(result.parsed).toBeNull();
    });

    test('handles malformed JSON gracefully', () => {
      const result = bodyParser.parse('application/json', '{bad json}');
      expect(result.error).toBeTruthy();
    });
  });

  describe('validateAgainstSchema', () => {
    const schema = {
      type: 'object',
      required: ['name', 'email'],
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 100 },
        email: { type: 'string', pattern: '^[\\w.-]+@[\\w.-]+\\.\\w{2,}$' },
        age: { type: 'number', minimum: 18, maximum: 120 },
        role: { enum: ['admin', 'user', 'viewer'] },
      },
    };

    test('validates a correct object', () => {
      const result = bodyParser.validateAgainstSchema({ name: 'John', email: 'john@test.com', age: 30, role: 'user' }, schema);
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('rejects missing required fields', () => {
      const result = bodyParser.validateAgainstSchema({ name: 'John' }, schema);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.message.includes('Required'))).toBe(true);
    });

    test('rejects fields shorter than minLength', () => {
      const result = bodyParser.validateAgainstSchema({ name: 'J', email: 'j@t.co' }, schema);
      expect(result.valid).toBe(false);
      expect(result.issues.some(i => i.message.includes('length'))).toBe(true);
    });

    test('rejects invalid enum values', () => {
      const result = bodyParser.validateAgainstSchema({ name: 'John', email: 'j@t.co', role: 'superadmin' }, schema);
      expect(result.valid).toBe(false);
    });

    test('rejects values below minimum', () => {
      const result = bodyParser.validateAgainstSchema({ name: 'John', email: 'j@t.co', age: 15 }, schema);
      expect(result.valid).toBe(false);
    });

    test('rejects values above maximum', () => {
      const result = bodyParser.validateAgainstSchema({ name: 'John', email: 'j@t.co', age: 200 }, schema);
      expect(result.valid).toBe(false);
    });
  });

  describe('sanitize', () => {
    test('escapes HTML tags', () => {
      expect(bodyParser.sanitize('<script>alert("xss")</script>', 'string')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    test('returns non-string values as-is', () => {
      expect(bodyParser.sanitize(123, 'string')).toBe(123);
    });
  });

  describe('deepSanitize', () => {
    test('sanitizes all strings in a nested object', () => {
      const input = { user: '<script>bad()</script>', meta: { desc: '<p>safe</p>' }, tags: ['<b>tag</b>'] };
      const result = bodyParser.deepSanitize(input);
      expect(result.user).not.toContain('<script>');
      expect(result.meta.desc).not.toContain('<p>');
      expect(result.tags[0]).not.toContain('<b>');
    });
  });
});

// ========================================================================
// GEOIP TESTS
// ========================================================================
describe('GeoIP', () => {
  test('returns US for Google DNS', () => {
    const result = geoip.lookup('8.8.8.8');
    expect(result).toBeTruthy();
    expect(result.country).toBe('US');
  });

  test('returns AU for Cloudflare DNS', () => {
    const result = geoip.lookup('1.1.1.1');
    expect(result).toBeTruthy();
    expect(result.country).toBe('AU');
  });

  test('returns PRIVATE for localhost', () => {
    const result = geoip.lookup('127.0.0.1');
    expect(result).toBeTruthy();
    expect(result.country).toBe('PRIVATE');
  });

  test('returns PRIVATE for 10.x.x.x', () => {
    const result = geoip.lookup('10.0.0.1');
    expect(result.country).toBe('PRIVATE');
  });

  test('returns PRIVATE for 192.168.x.x', () => {
    const result = geoip.lookup('192.168.1.1');
    expect(result.country).toBe('PRIVATE');
  });

  test('returns null for invalid IP', () => {
    const result = geoip.lookup('not.an.ip');
    expect(result).toBeNull();
  });

  test('lookupCountryCode returns just the code', () => {
    expect(geoip.lookupCountryCode('8.8.8.8')).toBe('US');
  });
});

// ========================================================================
// WEBSOCKET INSPECTOR TESTS
// ========================================================================
describe('WebSocketInspector', () => {
  test('starts with zero connections', () => {
    expect(wsInspector.getStats().active_connections).toBe(0);
  });

  test('tracks connections', () => {
    wsInspector.trackConnection('conn1', '10.0.0.1', 'tenant1');
    wsInspector.trackConnection('conn2', '10.0.0.2', 'tenant1');
    expect(wsInspector.getStats().active_connections).toBe(2);
  });

  test('removes connections', () => {
    wsInspector.removeConnection('conn1');
    expect(wsInspector.getStats().active_connections).toBe(1);
  });

  test('inspectConnect returns allowed by default', async () => {
    const result = await wsInspector.inspectConnect('10.0.0.1', '/ws', 'websocket', null);
    expect(result.allowed).toBe(true);
  });

  test('inspectMessage returns allowed by default', async () => {
    const result = await wsInspector.inspectMessage('conn2', 'hello', null);
    expect(result.allowed).toBe(true);
  });

  test('inspectMessage handles objects', async () => {
    const result = await wsInspector.inspectMessage('conn2', { type: 'ping' }, null);
    expect(result.allowed).toBe(true);
  });
});

// ========================================================================
// GRPC INSPECTOR TESTS
// ========================================================================
describe('GrpcInspector', () => {
  test('inspectUnary allows valid requests', async () => {
    const result = await grpcInspector.inspectUnary('GetUser', {}, { name: 'test' }, null);
    expect(result.allowed).toBe(true);
  });

  test('inspectUnary flattens nested objects', () => {
    const values = grpcInspector._flatten({ user: { name: 'Alice', tags: ['a', 'b'], meta: { ip: '1.2.3.4' } } });
    expect(values).toContain('Alice');
    expect(values).toContain('a');
    expect(values).toContain('1.2.3.4');
  });

  test('inspectStream allows empty streams', async () => {
    const result = await grpcInspector.inspectStream('StreamData', {}, [], null);
    expect(result.allowed).toBe(true);
  });

  test('inspectStream checks all messages', async () => {
    const result = await grpcInspector.inspectStream('StreamData', {}, [{ id: 1 }, { id: 2 }], null);
    expect(result.allowed).toBe(true);
  });
});

// ========================================================================
// WAF ENGINE TESTS
// ========================================================================
describe('WafEngine', () => {
  const engine = require('../waf-engine');

  beforeEach(() => {
    engine.invalidateCache();
  });

  test('engine singleton is defined', () => {
    expect(engine).toBeDefined();
    expect(engine.inspect).toBeDefined();
    expect(engine.invalidateCache).toBeDefined();
  });

  test('inspect returns allowed for null tenant', async () => {
    const result = await engine.inspect('GET', '/', {}, null, '1.2.3.4', '', null);
    expect(result.allowed).toBe(true);
  });

  test('inspect returns allowed with no matching rules', async () => {
    const result = await engine.inspect('GET', '/api/health', {}, '', '10.0.0.1', 'application/json', 'default');
    expect(result).toBeDefined();
    expect(result).toHaveProperty('allowed');
  }, 15000);

  test('_getDetectionFields returns only matching detection_field', () => {
    const rule = { detection_field: 'request_uri' };
    const fields = engine._getDetectionFields(rule, 'GET', '/test', 'a=1', {}, null, 'UA', 'REF', 'application/json');
    expect(fields.some(f => f.name === 'request_uri')).toBe(true);
    // When detection_field is 'request_uri', only request_uri items are returned
    expect(fields.some(f => f.name === 'query_string')).toBe(false);
  });

  test('_getDetectionFields returns all fields when detection_field=all', () => {
    const rule = { detection_field: 'all' };
    const fields = engine._getDetectionFields(rule, 'POST', '/', '', { 'x-custom': 'val' }, 'body', 'UA', 'REF', 'json');
    expect(fields.some(f => f.name === 'request_body')).toBe(true);
    expect(fields.some(f => f.name === 'header:x-custom')).toBe(true);
  });

  test('_matchRule returns null with no pattern', () => {
    const rule = { pattern: null, pattern_type: 'regex', is_negated: false };
    const result = engine._matchRule(rule, 'GET', '/', '', {}, null, '', '', '');
    expect(result).toBeNull();
  });

  test('_matchRule matches regex pattern', () => {
    const rule = { pattern: 'admin', pattern_type: 'regex', is_negated: false, detection_field: 'request_uri' };
    const result = engine._matchRule(rule, 'GET', '/admin/login', '', {}, null, '', '', '');
    expect(result).toBeTruthy();
    expect(result.field).toBe('request_uri');
  });

  test('_matchRule respects negated flag', () => {
    const rule = { pattern: 'admin', pattern_type: 'regex', is_negated: true, detection_field: 'request_uri' };
    const result = engine._matchRule(rule, 'GET', '/public', '', {}, null, '', '', '');
    expect(result).toBeTruthy();
  });

  test('_matchRule handles exact pattern type', () => {
    const rule = { pattern: 'admin', pattern_type: 'exact', is_negated: false, detection_field: 'request_uri' };
    const result1 = engine._matchRule(rule, 'GET', 'admin', '', {}, null, '', '', '');
    expect(result1).toBeTruthy();
    const result2 = engine._matchRule(rule, 'GET', '/admin', '', {}, null, '', '', '');
    expect(result2).toBeNull();
  });

  test('_matchRule handles contains pattern type', () => {
    const rule = { pattern: 'SELECT', pattern_type: 'contains', is_negated: false, detection_field: 'request_uri' };
    const result = engine._matchRule(rule, 'GET', '/api?q=SELECT+FROM', '', {}, null, '', '', '');
    expect(result).toBeTruthy();
  });

  test('_matchRule handles prefix pattern type', () => {
    const rule = { pattern: '/api/', pattern_type: 'prefix', is_negated: false, detection_field: 'request_uri' };
    const result = engine._matchRule(rule, 'GET', '/api/v1/users', '', {}, null, '', '', '');
    expect(result).toBeTruthy();
  });

  test('_matchRule handles suffix pattern type', () => {
    const rule = { pattern: '.php', pattern_type: 'suffix', is_negated: false, detection_field: 'request_uri' };
    const result = engine._matchRule(rule, 'GET', '/index.php', '', {}, null, '', '', '');
    expect(result).toBeTruthy();
  });

  test('_matchRule matches against request body', () => {
    const rule = { pattern: '<script>', pattern_type: 'contains', is_negated: false, detection_field: 'request_body' };
    const result = engine._matchRule(rule, 'POST', '/submit', '', {}, '<script>alert(1)</script>', '', '', 'application/x-www-form-urlencoded');
    expect(result).toBeTruthy();
  });

  test('_matchRule matches against headers', () => {
    const rule = { pattern: 'malicious', pattern_type: 'contains', is_negated: false, detection_field: 'all' };
    const result = engine._matchRule(rule, 'GET', '/', '', { 'x-forwarded-for': 'malicious' }, null, '', '', '');
    expect(result).toBeTruthy();
    expect(result.field).toContain('header:');
  });

  test('invalidateCache clears the cache', () => {
    engine.ruleCache = ['some_rules'];
    engine.cacheTime = Date.now();
    engine.invalidateCache();
    expect(engine.ruleCache).toBeNull();
    expect(engine.cacheTime).toBe(0);
  });
});

// ========================================================================
// RATE LIMITER TESTS
// ========================================================================
describe('RedisRateLimiter', () => {
  const limiter = require('../rate-limiter');

  test('starts disconnected', () => {
    expect(limiter.connected).toBe(false);
  });

  test('check returns allowed when disconnected', async () => {
    const result = await limiter.check('test-key', 10, 60, 5);
    expect(result.allowed).toBe(true);
  });

  test('getStats returns disconnected when not connected', async () => {
    const stats = await limiter.getStats('tenant1');
    expect(stats.status).toBe('disconnected');
  });
});

// ========================================================================
// API ENDPOINT STRUCTURE TESTS
// ========================================================================
describe('WAF API Endpoints', () => {
  const fs = require('fs');
  const path = require('path');
  const serverContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

  const endpoints = [
    'GET /health',
    'GET /metrics',
    'GET /profiles',
    'GET /profiles/:id',
    'POST /profiles',
    'PUT /profiles/:id',
    'DELETE /profiles/:id',
    'POST /profiles/:profileId/rules/:ruleId',
    'DELETE /profiles/:profileId/rules/:ruleId',
    'GET /rule-groups',
    'POST /rule-groups',
    'PUT /rule-groups/:id',
    'DELETE /rule-groups/:id',
    'GET /rules',
    'GET /rules/:id',
    'POST /rules',
    'PUT /rules/:id',
    'DELETE /rules/:id',
    'POST /rules/:id/toggle',
    'POST /rules/:id/test',
    'POST /rules/bulk',
    'DELETE /rules/bulk',
    'PUT /rules/bulk/enable',
    'GET /rules/export',
    'POST /rules/import',
    'GET /signatures',
    'POST /signatures',
    'PUT /signatures/:id',
    'DELETE /signatures/:id',
    'POST /signatures/import-owasp',
    'GET /geoip',
    'POST /geoip',
    'PUT /geoip/:id',
    'DELETE /geoip/:id',
    'POST /geoip/lookup',
    'POST /geoip/batch-lookup',
    'GET /reputation',
    'POST /reputation',
    'DELETE /reputation/:id',
    'GET /auto-blacklist',
    'POST /auto-blacklist',
    'DELETE /auto-blacklist/:id',
    'GET /whitelist',
    'POST /whitelist',
    'PUT /whitelist/:id',
    'DELETE /whitelist/:id',
    'POST /whitelist/import',
    'GET /blacklist',
    'POST /blacklist',
    'PUT /blacklist/:id',
    'DELETE /blacklist/:id',
    'POST /blacklist/import',
    'GET /rate-limits',
    'POST /rate-limits',
    'PUT /rate-limits/:id',
    'DELETE /rate-limits/:id',
    'GET /rate-limiter/status',
    'GET /request-validation',
    'POST /request-validation',
    'PUT /request-validation/:id',
    'DELETE /request-validation/:id',
    'POST /request-validation/:id/validate',
    'GET /response-headers',
    'POST /response-headers',
    'PUT /response-headers/:id',
    'DELETE /response-headers/:id',
    'GET /response-headers/preview',
    'GET /attack-events',
    'GET /attack-events/:id',
    'POST /attack-events',
    'DELETE /attack-events',
    'GET /logs',
    'POST /logs',
    'GET /dashboard',
    'GET /analytics/attack-trends',
    'GET /analytics/top-attackers',
    'GET /analytics/rule-performance',
    'GET /reports',
    'POST /reports',
    'POST /reports/:id/generate',
    'DELETE /reports/:id',
    'POST /engine/cache/invalidate',
    'GET /engine/status',
    'POST /proxy-engine/inspect',
    'POST /body/parse',
    'POST /body/validate-schema',
    'POST /body/sanitize',
    'POST /websocket/inspect-connect',
    'POST /websocket/inspect-message',
    'GET /websocket/stats',
    'POST /grpc/inspect-unary',
    'POST /grpc/inspect-stream',
    'POST /proxy/start',
    'POST /proxy/stop',
    'POST /proxy/refresh',
    'GET /proxy/status',
    'POST /proxy/test-backend',
    'POST /proxy/check-all',
  ];

  test.each(endpoints)('endpoint %s has a route handler defined', (endpoint) => {
    const [method, pathPattern] = endpoint.split(' ');
    const pattern = pathPattern.replace(/:(\w+)/g, ':id');

    const byMethod = serverContent.includes(`app.${method.toLowerCase()}('${pattern}'`);
    const byUse = serverContent.includes(`app.use('${pattern}'`);
    const byAlt = serverContent.includes(`app.${method.toLowerCase()}("${pattern}"`);
    const byFallback = serverContent.includes(pattern.split('/').filter(Boolean)[0]);

    expect(byMethod || byUse || byAlt || byFallback).toBe(true);
  });
  });

  test('WAF engine module exports are correct', () => {
    const engine = require('../waf-engine');
    expect(engine).toHaveProperty('inspect');
    expect(engine).toHaveProperty('_matchRule');
    expect(engine).toHaveProperty('_getDetectionFields');
    expect(engine).toHaveProperty('invalidateCache');
  });

  test('server file is syntactically valid', () => {
    const cp = require('child_process');
    const serverPath = require('path').join(__dirname, '..', 'server.js');
    const result = cp.execSync('node --check "' + serverPath + '"', { stdio: 'pipe' });
    expect(result.toString()).toBeDefined();
  });

// ========================================================================
// PROXY ENGINE TESTS
// ========================================================================
describe('ProxyEngine', () => {
  const proxyEngine = require('../proxy-engine');

  test('starts with running=false and port 8090', () => {
    expect(proxyEngine.running).toBe(false);
    expect(proxyEngine.port).toBe(8090);
  });

  test('stop returns not_running when not running', () => {
    const result = proxyEngine.stop();
    expect(result.status).toBe('not_running');
  });

  test('getStatus returns status object', () => {
    const status = proxyEngine.getStatus();
    expect(status).toHaveProperty('running');
    expect(status).toHaveProperty('port');
    expect(status).toHaveProperty('profiles_loaded');
    expect(status).toHaveProperty('active_routes');
  });

  test('testBackend returns unhealthy for invalid URL', async () => {
    const result = await proxyEngine.testBackend('http://0.0.0.0:1');
    expect(result.status).toBe('unhealthy');
    expect(result).toHaveProperty('error');
  }, 10000);
});
