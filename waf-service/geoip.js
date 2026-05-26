const fs = require('fs');
const path = require('path');

class GeoIP {
  constructor() {
    this.countryDb = null;
    this.asnDb = null;
    this.loaded = false;
    this.fallbackDb = this._buildFallback();
  }

  _buildFallback() {
    return {
      '8.8.8.8': 'US', '8.8.4.4': 'US',
      '1.1.1.1': 'AU', '1.0.0.1': 'AU',
      '9.9.9.9': 'US', '149.112.112.112': 'US',
      '208.67.222.222': 'US', '208.67.220.220': 'US',
    };
  }

  async load(maxmindDbPath) {
    const dbPath = maxmindDbPath || process.env.GEOIP_DB_PATH || path.join(__dirname, 'data', 'GeoLite2-Country.mmdb');
    try {
      if (fs.existsSync(dbPath)) {
        const maxmind = require('maxmind');
        this.countryDb = await maxmind.open(dbPath);
        this.loaded = true;
        console.log('GeoIP: MaxMind database loaded');
      } else {
        console.log(`GeoIP: MaxMind database not found at ${dbPath}, using fallback`);
      }
    } catch (err) {
      console.log(`GeoIP: Could not load MaxMind database: ${err.message}, using fallback`);
    }
  }

  lookup(ip) {
    if (!ip) return null;
    try {
      if (this.countryDb) {
        const result = this.countryDb.get(ip);
        if (result && result.country && result.country.iso_code) {
          return { country: result.country.iso_code, source: 'maxmind' };
        }
      }
      if (this.fallbackDb[ip]) {
        return { country: this.fallbackDb[ip], source: 'fallback' };
      }
      const ipNum = this._ipToInt(ip);
      if (ipNum) {
        if (this._isPrivateIP(ipNum)) return { country: 'PRIVATE', source: 'local' };
        if (ipNum >= 0x0A000000 && ipNum < 0x0AFFFFFF) return { country: 'PRIVATE', source: 'local' };
      }
      return null;
    } catch {
      return null;
    }
  }

  lookupCountryCode(ip) {
    const result = this.lookup(ip);
    return result ? result.country : null;
  }

  _ipToInt(ip) {
    try {
      const parts = ip.split('.');
      if (parts.length !== 4) return null;
      return parts.reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    } catch { return null; }
  }

  _isPrivateIP(num) {
    const ranges = [
      [0x0A000000, 0x0AFFFFFF], [0xAC100000, 0xAC1FFFFF],
      [0xC0A80000, 0xC0A8FFFF], [0x7F000000, 0x7FFFFFFF],
    ];
    return ranges.some(([start, end]) => num >= start && num <= end);
  }
}

module.exports = new GeoIP();
