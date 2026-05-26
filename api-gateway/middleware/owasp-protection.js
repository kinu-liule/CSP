const express = require('express');
const helmet = require('helmet');

// OWASP API Top 10 Protection Middleware
const owaspProtection = (req, res, next) => {
  // API1: Broken Object Level Authorization
  const checkObjectLevelAuth = (req) => {
    const resourceId = req.params.id || req.body.id;
    const tenantId = req.tenant?.id;
    
    if (resourceId && tenantId) {
      if (req.headers['x-resource-owner'] && 
          req.headers['x-resource-owner'] !== tenantId) {
        return { blocked: true, reason: 'Broken Object Level Authorization' };
      }
    }
    return { blocked: false };
  };

  // API2: Broken Authentication - handled by authenticateTenant
  
  // API3: Broken Object Property Level Authorization
  const sanitizeResponse = (data) => {
    const sensitiveFields = ['password', 'ssn', 'creditCard', 'token'];
    if (typeof data === 'object' && data !== null) {
      const sanitized = { ...data };
      sensitiveFields.forEach(field => delete sanitized[field]);
      return sanitized;
    }
    return data;
  };

  // API4: Unrestricted Resource Consumption
  const checkResourceConsumption = (req) => {
    const contentLength = parseInt(req.headers['content-length'] || '0');
    if (contentLength > 10 * 1024 * 1024) {
      return { blocked: true, reason: 'Payload too large' };
    }
    return { blocked: false };
  };

  // API5: Broken Function Level Authorization
  const checkFunctionLevelAuth = (req) => {
    const adminOnlyEndpoints = ['/api/admin', '/api/config', '/api/users'];
    const isAdminEndpoint = adminOnlyEndpoints.some(ep => req.path.startsWith(ep));
    
    if (isAdminEndpoint && !req.tenant?.roles?.some(r => ['admin', 'super_admin'].includes(r))) {
      return { blocked: true, reason: 'Insufficient privileges' };
    }
    return { blocked: false };
  };

  // API6: Unrestricted Access to Sensitive Business Flows
  const checkSensitiveBusinessFlows = (req) => {
    const sensitivePatterns = ['/api/payment', '/api/transfer', '/api/withdraw'];
    const isSensitive = sensitivePatterns.some(p => req.path.includes(p));
    
    if (isSensitive && !req.headers['x-2fa-verified']) {
      return { blocked: true, reason: '2FA required for sensitive operations' };
    }
    return { blocked: false };
  };

  // API7: Server Side Request Forgery (SSRF)
  const checkSSRF = (req) => {
    const urlParams = req.query.url || req.body.url || '';
    const blockedHosts = ['127.0.0.1', 'localhost', '169.254.169.254'];
    
    if (urlParams) {
      try {
        const url = new URL(urlParams);
        if (blockedHosts.includes(url.hostname)) {
          return { blocked: true, reason: 'SSRF attempt detected' };
        }
      } catch (e) {}
    }
    return { blocked: false };
  };

  // API8: Security Misconfiguration - handled by helmet
  
  // API9: Improper Inventory Management
  const checkDeprecatedAPI = (req) => {
    if (req.path.startsWith('/api/v1/') && req.headers['x-api-version'] === 'deprecated') {
      return { blocked: true, reason: 'Deprecated API version' };
    }
    return { blocked: false };
  };

  // API10: Unsafe Consumption of APIs
  const validateExternalData = (req) => {
    const schema = req.body;
    if (schema && typeof schema === 'object') {
      const hasPrototype = Object.keys(schema).some(key => 
        key === '__proto__' || key === 'constructor'
      );
      if (hasPrototype) {
        return { blocked: true, reason: 'Prototype pollution attempt' };
      }
    }
    return { blocked: false };
  };

  // Run all checks
  const checks = [
    checkObjectLevelAuth(req),
    checkResourceConsumption(req),
    checkFunctionLevelAuth(req),
    checkSensitiveBusinessFlows(req),
    checkSSRF(req),
    checkDeprecatedAPI(req),
    validateExternalData(req)
  ];

  const blocked = checks.find(c => c.blocked);
  if (blocked) {
    return res.status(403).json({
      error: 'Security violation',
      reason: blocked.reason,
      requestId: req.headers['x-request-id'] || 'unknown'
    });
  }

  // Attach sanitizer to response
  res.sanitize = sanitizeResponse;
  next();
};

module.exports = owaspProtection;
