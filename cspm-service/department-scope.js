const ROLE_HIERARCHY = {
  super_admin: 100,
  admin: 80,
  manager: 60,
  analyst: 40,
  user: 20,
};

const ADMIN_THRESHOLD = 60; // manager+ bypasses department filter

function getEffectiveRoleLevel(roles) {
  if (!roles || !Array.isArray(roles)) return 0;
  let max = 0;
  for (const r of roles) {
    const level = ROLE_HIERARCHY[r] || 0;
    if (level > max) max = level;
  }
  return max;
}

class DepartmentScope {
  constructor(req) {
    this.req = req;
    this.tenantId = req.headers['x-tenant-id'] || req.tenant?.id;
    this.userRoles = req.tenant?.roles || req.headers['x-user-roles']?.split(',').filter(Boolean) || [];
    this.roleLevel = getEffectiveRoleLevel(this.userRoles);

    const deptHeader = req.headers['x-user-departments'] || '';
    this.departmentIds = deptHeader ? deptHeader.split(',').map(d => d.trim()).filter(Boolean) : [];
  }

  isBypassed() {
    return this.roleLevel >= ADMIN_THRESHOLD;
  }

  departmentFilter(alias) {
    if (this.isBypassed()) return '';
    if (!this.departmentIds.length) return `${alias ? alias + '.' : ''}department_id IS NULL`;
    const ids = this.departmentIds.map(d => `'${d.replace(/'/g, "''")}'`).join(',');
    return `${alias ? alias + '.' : ''}department_id IN (${ids})`;
  }

  departmentFilterWithFallback(alias, fallbackColumn) {
    if (this.isBypassed()) return '';
    const deptFilter = this.departmentFilter(alias);
    return `(${deptFilter} OR ${alias ? alias + '.' : ''}${fallbackColumn} IS NULL)`;
  }

  applyToListQuery(query, alias) {
    if (this.isBypassed()) return query;
    const filter = this.departmentFilter(alias);
    if (!filter) return query;

    if (query.toLowerCase().includes('where')) {
      return query + ` AND ${filter}`;
    }
    const orderIdx = query.toLowerCase().indexOf('order by');
    if (orderIdx !== -1) {
      return query.slice(0, orderIdx) + ` WHERE ${filter} ` + query.slice(orderIdx);
    }
    return query + ` WHERE ${filter}`;
  }

  static middleware() {
    return (req, res, next) => {
      req.departmentScope = new DepartmentScope(req);
      next();
    };
  }

  static requireAccess(tableAlias) {
    return (req, res, next) => {
      const scope = new DepartmentScope(req);
      if (!scope.isBypassed() && !scope.departmentIds.length) {
        return res.status(200).json({ success: true, data: [], message: 'No department assigned' });
      }
      req.departmentScope = scope;
      req.deptFilter = scope.departmentFilter(tableAlias);
      req.deptId = scope.isBypassed()
        ? (req.body?.department_id || scope.departmentIds[0] || null)
        : (scope.departmentIds[0] || null);
      next();
    };
  }
}

module.exports = { DepartmentScope, getEffectiveRoleLevel };
