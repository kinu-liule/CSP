const jwt = require('jsonwebtoken');
const Tenant = require('../models/tenant');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  MANAGER: 'manager',
  ANALYST: 'analyst',
  USER: 'user',
};

const ROLE_HIERARCHY = {
  super_admin: 100,
  platform_admin: 90,
  admin: 80,
  billing_manager: 70,
  integration_manager: 70,
  network_operator: 70,
  customer_success_manager: 70,
  security_analyst: 65,
  manager: 60,
  security_auditor: 55,
  compliance_officer: 55,
  analyst: 40,
  support_agent: 30,
  readonly_auditor: 25,
  user: 20,
};

const PERMISSIONS = {
  // User management
  'users:read': { minRole: 'manager' },
  'users:write': { minRole: 'admin' },
  'users:delete': { minRole: 'admin' },
  'users:roles': { minRole: 'admin' },

  // Tenant management
  'tenants:read': { minRole: 'admin' },
  'tenants:write': { minRole: 'super_admin' },

  // Service read access (per-service RBAC)
  'iam:access': { minRole: 'user' },
  'waf:access': { minRole: 'analyst' },
  'ngfw:access': { minRole: 'analyst' },
  'siem:access': { minRole: 'analyst' },
  'vuln-scanner:access': { minRole: 'analyst' },
  'fraud:access': { minRole: 'analyst' },
  'awareness:access': { minRole: 'analyst' },
  'grc:access': { minRole: 'manager' },
  'asset-mgmt:access': { minRole: 'manager' },
  'cspm:access': { minRole: 'analyst' },
  'edr:access': { minRole: 'analyst' },
  'threat-intel:access': { minRole: 'analyst' },
  'soar:access': { minRole: 'manager' },
  'data-security:access': { minRole: 'manager' },
  'data-lake:access': { minRole: 'analyst' },
  'xdr:access': { minRole: 'analyst' },
  'devsecops:access': { minRole: 'manager' },
  'deception:access': { minRole: 'manager' },
  'password-mgr:access': { minRole: 'user' },
  'bcp:access': { minRole: 'manager' },
  'risk-engine:access': { minRole: 'manager' },

  // Service write (manager+ for all)
  'iam:write': { minRole: 'manager' },
  'waf:write': { minRole: 'manager' },
  'ngfw:write': { minRole: 'manager' },
  'siem:write': { minRole: 'manager' },
  'vuln-scanner:write': { minRole: 'manager' },
  'fraud:write': { minRole: 'manager' },
  'awareness:write': { minRole: 'manager' },
  'grc:write': { minRole: 'manager' },
  'asset-mgmt:write': { minRole: 'manager' },
  'cspm:write': { minRole: 'manager' },
  'edr:write': { minRole: 'manager' },
  'threat-intel:write': { minRole: 'manager' },
  'soar:write': { minRole: 'manager' },
  'data-security:write': { minRole: 'manager' },
  'data-lake:write': { minRole: 'manager' },
  'xdr:write': { minRole: 'manager' },
  'devsecops:write': { minRole: 'manager' },
  'deception:write': { minRole: 'manager' },
  'password-mgr:write': { minRole: 'manager' },
  'bcp:write': { minRole: 'manager' },
  'risk-engine:write': { minRole: 'manager' },

  // Admin operations
  'admin:audit': { minRole: 'manager' },
  'admin:analytics': { minRole: 'admin' },
  'admin:plugins': { minRole: 'super_admin' },
  'admin:policies': { minRole: 'admin' },
  'admin:departments': { minRole: 'manager' },

  // Super admin / platform-owner operations
  'platform:tenants': { minRole: 'super_admin' },
  'platform:audit': { minRole: 'super_admin' },
  'platform:analytics': { minRole: 'super_admin' },
  'platform:health': { minRole: 'super_admin' },
  'platform:billing': { minRole: 'super_admin' },
  'platform:policies': { minRole: 'super_admin' },
  'platform:users': { minRole: 'super_admin' },
};

function getRoleLevel(role) {
  return ROLE_HIERARCHY[role] || 0;
}

function hasMinRole(userRole, requiredRole) {
  return getRoleLevel(userRole) >= getRoleLevel(requiredRole);
}

function authorize(permission) {
  return (req, res, next) => {
    const permDef = PERMISSIONS[permission];
    if (!permDef) return next();

    const userRoles = req.tenant?.roles || ['user'];
    const userRole = getEffectiveRole(userRoles);

    if (!hasMinRole(userRole, permDef.minRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permDef.minRole,
        current: userRole,
        permission,
      });
    }

    next();
  };
}

function getEffectiveRole(roles) {
  if (!roles || !Array.isArray(roles)) return 'user';
  return roles.reduce((best, r) => {
    const level = getRoleLevel(r);
    const bestLevel = getRoleLevel(best);
    return level > bestLevel ? r : best;
  }, 'user');
}

const SERVICE_PERMISSION_MAP = {
  iam: { access: 'iam:access', write: 'iam:write' },
  waf: { access: 'waf:access', write: 'waf:write' },
  ngfw: { access: 'ngfw:access', write: 'ngfw:write' },
  'siem-soar': { access: 'siem:access', write: 'siem:write' },
  'vuln-scanner': { access: 'vuln-scanner:access', write: 'vuln-scanner:write' },
  'fraud-detection': { access: 'fraud:access', write: 'fraud:write' },
  awareness: { access: 'awareness:access', write: 'awareness:write' },
  grc: { access: 'grc:access', write: 'grc:write' },
  'asset-management': { access: 'asset-mgmt:access', write: 'asset-mgmt:write' },
  cspm: { access: 'cspm:access', write: 'cspm:write' },
  edr: { access: 'edr:access', write: 'edr:write' },
  'threat-intel': { access: 'threat-intel:access', write: 'threat-intel:write' },
  soar: { access: 'soar:access', write: 'soar:write' },
  'data-security': { access: 'data-security:access', write: 'data-security:write' },
  'data-lake': { access: 'data-lake:access', write: 'data-lake:write' },
  xdr: { access: 'xdr:access', write: 'xdr:write' },
  devsecops: { access: 'devsecops:access', write: 'devsecops:write' },
  deception: { access: 'deception:access', write: 'deception:write' },
  'password-manager': { access: 'password-mgr:access', write: 'password-mgr:write' },
  'business-continuity': { access: 'bcp:access', write: 'bcp:write' },
  'risk-engine': { access: 'risk-engine:access', write: 'risk-engine:write' },
};

function requireServiceAccess(serviceName) {
  const perms = SERVICE_PERMISSION_MAP[serviceName];
  if (!perms) return (req, res, next) => next();

  return async (req, res, next) => {
    // Check tenant subscription first
    const isSubscribed = await Tenant.isSubscribed(req.tenant?.id, serviceName);
    if (!isSubscribed) {
      return res.status(403).json({
        error: 'Service not subscribed',
        service: serviceName,
        message: 'Your tenant has not subscribed to this service. Please contact your admin to enable it.'
      });
    }

    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const permission = isWrite ? perms.write : perms.access;

    const permDef = PERMISSIONS[permission];
    if (!permDef) return next();

    const userRoles = req.tenant?.roles || ['user'];
    const userRole = getEffectiveRole(userRoles);

    if (!hasMinRole(userRole, permDef.minRole)) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: permDef.minRole,
        current: userRole,
        permission,
        service: serviceName,
        method: req.method,
      });
    }

    next();
  };
}

module.exports = { authorize, getEffectiveRole, ROLES, ROLE_HIERARCHY, PERMISSIONS, hasMinRole, requireServiceAccess };
