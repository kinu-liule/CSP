// API Key Model with in-memory fallback
const crypto = require('crypto');
const db = require('../db/client');

const apiKeysMemory = new Map();

class ApiKey {
  static generateKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  static hashKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  static async create({ tenantId, name, scopes = [], rateLimit = 1000, expiresInDays = null }) {
    const key = this.generateKey();
    const keyHash = this.hashKey(key);
    const keyPrefix = key.substring(0, 8) + '...';
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const keyData = {
      id: Date.now(),
      tenant_id: tenantId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name,
      scopes,
      rate_limit: rateLimit,
      expires_at: expiresAt,
      last_used: null,
      status: 'active',
      created_at: new Date()
    };

    if (db.isAvailable()) {
      try {
        const result = await db.query(
          `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, name, scopes, rate_limit, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, key_prefix, name, scopes, rate_limit, expires_at, created_at`,
          [tenantId, keyHash, keyPrefix, name, scopes, rateLimit, expiresAt]
        );
        return { ...result.rows[0], fullKey: key };
      } catch (e) {}
    }

    apiKeysMemory.set(keyHash, keyData);
    return { ...keyData, fullKey: key };
  }

  static async findByKeyHash(keyHash) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(
          `SELECT ak.*, t.tier as tenant_tier FROM api_keys ak LEFT JOIN tenants t ON ak.tenant_id = t.tenant_id WHERE ak.key_hash = $1 AND ak.status = 'active'`,
          [keyHash]
        );
        return result.rows[0];
      } catch (e) {}
    }
    return apiKeysMemory.get(keyHash);
  }

  static async findByTenantId(tenantId) {
    if (db.isAvailable()) {
      try {
        const result = await db.query(
          `SELECT id, key_prefix, name, scopes, rate_limit, expires_at, last_used, status, created_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
          [tenantId]
        );
        return result.rows;
      } catch (e) {}
    }
    return Array.from(apiKeysMemory.values()).filter(k => k.tenant_id === tenantId);
  }

  static async validateKey(providedKey) {
    const keyHash = this.hashKey(providedKey);
    const keyRecord = await this.findByKeyHash(keyHash);
    if (!keyRecord) return null;
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) return null;
    return keyRecord;
  }

  static async delete(keyId) {
    if (db.isAvailable()) {
      try {
        const result = await db.query('DELETE FROM api_keys WHERE id = $1 RETURNING *', [keyId]);
        return result.rows[0];
      } catch (e) {}
    }
    return apiKeysMemory.delete(keyId);
  }
}

module.exports = ApiKey;
