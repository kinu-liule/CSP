// Plugin-based Security Filters System
const fs = require('fs');
const path = require('path');

class SecurityPluginManager {
  constructor() {
    this.plugins = new Map();
    this.pluginsPath = path.join(__dirname, 'plugins');
  }

  // Load all plugins from plugins directory
  loadPlugins() {
    if (!fs.existsSync(this.pluginsPath)) {
      fs.mkdirSync(this.pluginsPath, { recursive: true });
      this.createDefaultPlugins();
    }

    const pluginFiles = fs.readdirSync(this.pluginsPath)
      .filter(f => f.endsWith('.js'));

    pluginFiles.forEach(file => {
      try {
        const pluginPath = path.join(this.pluginsPath, file);
        const plugin = require(pluginPath);
        if (plugin.name && plugin.handler) {
          this.plugins.set(plugin.name, plugin);
          console.log(`Loaded plugin: ${plugin.name}`);
        }
      } catch (err) {
        console.error(`Failed to load plugin ${file}:`, err.message);
      }
    });
  }

  createDefaultPlugins() {
    // Bot Detection Plugin
    const botDetectionPlugin = `
module.exports = {
  name: 'bot-detection',
  priority: 10,
  handler: (req, res, next) => {
    const userAgent = req.headers['user-agent'] || '';
    const botPatterns = [
      /bot/i, /crawl/i, /spider/i, /scrape/i,
      /curl/i, /wget/i, /python/i, /java/i
    ];
    
    const isBot = botPatterns.some(p => p.test(userAgent));
    if (isBot && !req.headers['x-allowed-bot']) {
      return res.status(403).json({
        error: 'Bot detected',
        requestId: req.headers['x-request-id']
      });
    }
    next();
  }
};
`;

    // API Key Validation Plugin
    const apiKeyPlugin = `
module.exports = {
  name: 'api-key-validation',
  priority: 5,
  handler: (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const validKeys = (process.env.VALID_API_KEYS?.split(',') || []).filter(Boolean);
    
    if (validKeys.length > 0) {
      if (req.path.startsWith('/api/') && !apiKey) {
        return res.status(401).json({ error: 'API key required' });
      }
      
      if (apiKey && !validKeys.includes(apiKey)) {
        return res.status(401).json({ error: 'Invalid API key' });
      }
    }
    next();
  }
};
`;

    // Request Logging Plugin
    const requestLoggingPlugin = `
module.exports = {
  name: 'request-logging',
  priority: 1,
  handler: (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        tenantId: req.tenant?.id,
        ip: req.ip
      }));
    });
    next();
  }
};
`;

    // IP Whitelist/Blacklist Plugin
    const ipFilterPlugin = `
module.exports = {
  name: 'ip-filter',
  priority: 2,
  handler: (req, res, next) => {
    const clientIP = req.ip || req.connection.remoteAddress;
    const blacklist = (process.env.IP_BLACKLIST?.split(',') || []).filter(Boolean);
    const whitelist = (process.env.IP_WHITELIST?.split(',') || []).filter(Boolean);
    
    if (blacklist.includes(clientIP)) {
      return res.status(403).json({ error: 'IP blocked' });
    }
    
    if (whitelist.length > 0 && !whitelist.includes(clientIP)) {
      return res.status(403).json({ error: 'IP not allowed' });
    }
    next();
  }
};
`;

    fs.writeFileSync(path.join(this.pluginsPath, 'bot-detection.js'), botDetectionPlugin);
    fs.writeFileSync(path.join(this.pluginsPath, 'api-key-validation.js'), apiKeyPlugin);
    fs.writeFileSync(path.join(this.pluginsPath, 'request-logging.js'), requestLoggingPlugin);
    fs.writeFileSync(path.join(this.pluginsPath, 'ip-filter.js'), ipFilterPlugin);
  }

  // Run all plugins in priority order
  runPlugins(req, res, next) {
    const sortedPlugins = Array.from(this.plugins.values())
      .sort((a, b) => (a.priority || 100) - (b.priority || 100));

    let index = 0;
    const runNext = (err) => {
      if (err || index >= sortedPlugins.length) {
        return next(err);
      }
      const plugin = sortedPlugins[index++];
      try {
        plugin.handler(req, res, runNext);
      } catch (err) {
        console.error(`Plugin ${plugin.name} error:`, err);
        runNext(err);
      }
    };
    runNext();
  }

  getPlugin(name) {
    return this.plugins.get(name);
  }

  registerPlugin(plugin) {
    if (plugin.name && plugin.handler) {
      this.plugins.set(plugin.name, plugin);
    }
  }
}

module.exports = new SecurityPluginManager();
