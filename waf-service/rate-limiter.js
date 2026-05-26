const redis = require('redis');

class RedisRateLimiter {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;
    try {
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://redis:6379',
        socket: { connectTimeout: 3000, reconnectStrategy: false },
      });
      this.client.on('error', () => { this.connected = false; });
      await this.client.connect();
      this.connected = true;
    } catch {
      this.connected = false;
    }
  }

  async check(key, maxRequests, windowSeconds, burst) {
    if (!this.connected) await this.connect();
    if (!this.connected) return { allowed: true };

    const now = Date.now();
    const windowKey = `rl:${key}`;
    const burstKey = `rl:burst:${key}`;

    try {
      const multi = this.client.multi();
      multi.zRemRangeByScore(windowKey, 0, now - windowSeconds * 1000);
      multi.zCard(windowKey);
      multi.zAdd(windowKey, { score: now, value: `${now}-${Math.random()}` });
      multi.expire(windowKey, windowSeconds + 5);

      const results = await multi.exec();
      const count = results[1] || 0;

      if (count > maxRequests) {
        return { allowed: false, retryAfter: windowSeconds, reason: `Rate limit exceeded: ${maxRequests} per ${windowSeconds}s` };
      }

      if (burst) {
        const burstMulti = this.client.multi();
        burstMulti.incr(burstKey);
        burstMulti.expire(burstKey, 1);
        const burstResults = await burstMulti.exec();
        const burstCount = parseInt(burstResults[0]) || 0;
        if (burstCount > burst) {
          return { allowed: false, retryAfter: 1, reason: `Burst limit exceeded: ${burst} per second` };
        }
      }

      const ttl = windowSeconds;
      return { allowed: true, remaining: Math.max(0, maxRequests - count), resetIn: ttl };
    } catch {
      return { allowed: true };
    }
  }

  async middleware(tenantId, req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const path = req.path || '/';
    const method = req.method;

    // Check tenant-level rate limit
    const tenantResult = await this.check(`tenant:${tenantId}:${path}`, 1000, 60, 50);
    if (!tenantResult.allowed) {
      res.set('X-RateLimit-Type', 'tenant');
      return res.status(429).json({ error: 'Tenant rate limit exceeded', retry_after: tenantResult.retryAfter });
    }

    // Check IP-level rate limit
    const ipResult = await this.check(`ip:${tenantId}:${ip}:${path}`, 100, 60, 10);
    if (!ipResult.allowed) {
      res.set('X-RateLimit-Type', 'ip');
      return res.status(429).json({ error: 'IP rate limit exceeded', retry_after: ipResult.retryAfter });
    }

    // Check method-level rate limit
    const methodResult = await this.check(`method:${tenantId}:${method}:${path}`, 200, 60, 20);
    if (!methodResult.allowed) {
      res.set('X-RateLimit-Type', 'method');
      return res.status(429).json({ error: 'Method rate limit exceeded', retry_after: methodResult.retryAfter });
    }

    res.set('X-RateLimit-Remaining', String(ipResult.remaining));
    res.set('X-RateLimit-Reset', String(ipResult.resetIn));
    next();
  }

  async getStats(tenantId) {
    if (!this.connected) return { status: 'disconnected' };
    try {
      const keys = await this.client.keys(`rl:*:${tenantId}:*`);
      return { status: 'connected', active_keys: keys.length };
    } catch {
      return { status: 'error' };
    }
  }

  async disconnect() {
    if (this.client && this.connected) {
      try { await this.client.quit(); } catch {}
      this.connected = false;
    }
  }
}

module.exports = new RedisRateLimiter();
