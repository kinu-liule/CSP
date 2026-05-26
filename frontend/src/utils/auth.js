import axios from 'axios';

const ROLE_HIERARCHY = { super_admin: 100, platform_admin: 90, admin: 80, billing_manager: 70, integration_manager: 70, network_operator: 70, customer_success_manager: 70, security_analyst: 65, manager: 60, security_auditor: 55, compliance_officer: 55, analyst: 40, support_agent: 30, readonly_auditor: 25, user: 20 };

const PORT = parseInt(window.location.port, 10) || 80;
export const PORT_MODE = PORT === 9090 ? 'super-admin' : 'org';
export const isOrgPortal = () => PORT_MODE === 'org';
export const isSuperPortal = () => PORT_MODE === 'super-admin';

const SERVICE_ACCESS = {
  iam:              { minRole: { R: 'user', W: 'manager' }, admin: 'manager' },
  waf:              { minRole: { R: 'analyst', W: 'manager' } },
  ngfw:             { minRole: { R: 'analyst', W: 'manager' } },
  'siem-soar':      { minRole: { R: 'analyst', W: 'manager' } },
  'vuln-scanner':   { minRole: { R: 'analyst', W: 'manager' } },
  fraud:            { minRole: { R: 'analyst', W: 'manager' } },
  awareness:        { minRole: { R: 'analyst', W: 'manager' } },
  grc:              { minRole: { R: 'manager', W: 'manager' } },
  'asset-mgmt':     { minRole: { R: 'manager', W: 'manager' } },
  cspm:             { minRole: { R: 'analyst', W: 'manager' } },
  edr:              { minRole: { R: 'analyst', W: 'manager' } },
  'threat-intel':   { minRole: { R: 'analyst', W: 'manager' } },
  soar:             { minRole: { R: 'manager', W: 'manager' } },
  'data-security':  { minRole: { R: 'manager', W: 'manager' } },
  'data-lake':      { minRole: { R: 'analyst', W: 'manager' } },
  xdr:              { minRole: { R: 'analyst', W: 'manager' } },
  devsecops:        { minRole: { R: 'manager', W: 'manager' } },
  deception:        { minRole: { R: 'manager', W: 'manager' } },
  'password-mgr':   { minRole: { R: 'user', W: 'manager' } },
  'business-cont':  { minRole: { R: 'manager', W: 'manager' } },
  'risk-engine':    { minRole: { R: 'manager', W: 'manager' } },
};

function getRoleLevel(role) { return ROLE_HIERARCHY[role] || 0; }

function getHighestRole(roles) {
  if (!roles || !Array.isArray(roles)) return 'user';
  return roles.reduce((best, r) => getRoleLevel(r) > getRoleLevel(best) ? r : best, 'user');
}

export function getRoles() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return [];
    return JSON.parse(atob(token.split('.')[1])).roles || [];
  } catch { return []; }
}

export function getDepartments() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return [];
    return JSON.parse(atob(token.split('.')[1])).departments || [];
  } catch { return []; }
}

export function getEffectiveRole() {
  return getHighestRole(getRoles());
}

export function canWrite() {
  return getRoles().some(r => ['super_admin', 'platform_admin', 'admin', 'manager'].includes(r));
}

export function canAdmin() {
  return getRoles().some(r => ['super_admin', 'platform_admin', 'admin'].includes(r));
}

export function isSuperAdmin() {
  return getRoles().includes('super_admin');
}

export function getSubscriptions() {
  try {
    const raw = localStorage.getItem('subscriptions');
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function setSubscriptions(subs) {
  localStorage.setItem('subscriptions', JSON.stringify(subs));
}

export function isSubscribed(serviceName) {
  const subs = getSubscriptions();
  if (subs.length === 0) return true;
  return subs.some(s => s.service_name === serviceName && s.enabled !== false);
}

export async function refreshSubscriptions() {
  const tenantId = localStorage.getItem('tenantId');
  if (!tenantId) return;
  try {
    const res = await axios.get(`/tenants/${tenantId}/subscriptions`);
    setSubscriptions(res.data.subscriptions);
  } catch {}
}

export function canAccess(serviceName, mode = 'R') {
  const roles = getRoles();
  if (roles.includes('super_admin')) return true;
  const svc = SERVICE_ACCESS[serviceName];
  if (!svc) return false;
  const role = getHighestRole(roles);
  const required = mode === 'W' && svc.minRole.W ? svc.minRole.W : svc.minRole.R;
  if (getRoleLevel(role) < getRoleLevel(required)) return false;
  if (!isSubscribed(serviceName)) return false;
  return true;
}

export function getAccessibleServices() {
  const roles = getRoles();
  const subs = getSubscriptions();
  if (roles.includes('super_admin')) return Object.keys(SERVICE_ACCESS);
  const hasSubs = subs.length > 0;
  return Object.entries(SERVICE_ACCESS)
    .filter(([key, svc]) => {
      const role = getHighestRole(roles);
      const ok = getRoleLevel(role) >= getRoleLevel(svc.minRole.R);
      if (!hasSubs) return ok;
      return ok && subs.some(s => s.service_name === key && s.enabled !== false);
    })
    .map(([key]) => key);
}

export { SERVICE_ACCESS, ROLE_HIERARCHY };