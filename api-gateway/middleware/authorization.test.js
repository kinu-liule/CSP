const { authorize, getEffectiveRole, hasMinRole, ROLE_HIERARCHY, PERMISSIONS } = require('./authorization');

// Mock Express req/res/next
function mockReqRes(roles) {
  const req = { tenant: { roles } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('ROLE_HIERARCHY', () => {
  test('super_admin has highest level', () => {
    expect(ROLE_HIERARCHY.super_admin).toBe(100);
  });

  test('user has lowest level', () => {
    expect(ROLE_HIERARCHY.user).toBe(20);
  });
});

describe('hasMinRole', () => {
  test('super_admin meets any requirement', () => {
    expect(hasMinRole('super_admin', 'super_admin')).toBe(true);
    expect(hasMinRole('super_admin', 'admin')).toBe(true);
    expect(hasMinRole('super_admin', 'user')).toBe(true);
  });

  test('admin does not meet super_admin requirements', () => {
    expect(hasMinRole('admin', 'super_admin')).toBe(false);
  });

  test('manager meets manager requirements', () => {
    expect(hasMinRole('manager', 'manager')).toBe(true);
  });

  test('analyst does not meet admin requirements', () => {
    expect(hasMinRole('analyst', 'admin')).toBe(false);
  });

  test('user does not meet analyst requirements', () => {
    expect(hasMinRole('user', 'analyst')).toBe(false);
  });
});

describe('getEffectiveRole', () => {
  test('super_admin is highest effective role', () => {
    expect(getEffectiveRole(['user', 'admin', 'super_admin'])).toBe('super_admin');
  });

  test('admin is effective when no super_admin', () => {
    expect(getEffectiveRole(['user', 'admin', 'manager'])).toBe('admin');
  });

  test('manager is effective when no admin', () => {
    expect(getEffectiveRole(['user', 'analyst', 'manager'])).toBe('manager');
  });

  test('returns user for empty or invalid roles', () => {
    expect(getEffectiveRole([])).toBe('user');
    expect(getEffectiveRole(null)).toBe('user');
    expect(getEffectiveRole(undefined)).toBe('user');
  });

  test('returns analyst level correctly', () => {
    expect(getEffectiveRole(['analyst'])).toBe('analyst');
  });

  test('returns user level when only user role', () => {
    expect(getEffectiveRole(['user'])).toBe('user');
  });
});

describe('authorize middleware', () => {
  describe('users:read permission (minRole: manager)', () => {
    test('allows admin access', () => {
      const { req, res, next } = mockReqRes(['admin']);
      authorize('users:read')(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('allows super_admin access', () => {
      const { req, res, next } = mockReqRes(['super_admin']);
      authorize('users:read')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('allows manager access', () => {
      const { req, res, next } = mockReqRes(['manager']);
      authorize('users:read')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('denies analyst access', () => {
      const { req, res, next } = mockReqRes(['analyst']);
      authorize('users:read')(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    test('denies user access', () => {
      const { req, res, next } = mockReqRes(['user']);
      authorize('users:read')(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('users:write permission (minRole: admin)', () => {
    test('allows admin access', () => {
      const { req, res, next } = mockReqRes(['admin']);
      authorize('users:write')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('allows super_admin access', () => {
      const { req, res, next } = mockReqRes(['super_admin']);
      authorize('users:write')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('denies manager access', () => {
      const { req, res, next } = mockReqRes(['manager']);
      authorize('users:write')(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('tenants:write permission (minRole: super_admin)', () => {
    test('allows super_admin access', () => {
      const { req, res, next } = mockReqRes(['super_admin']);
      authorize('tenants:write')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('denies admin access', () => {
      const { req, res, next } = mockReqRes(['admin']);
      authorize('tenants:write')(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });

  describe('service access permissions (minRole: user)', () => {
    test('allows user access for iam:access', () => {
      const { req, res, next } = mockReqRes(['user']);
      authorize('iam:access')(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    test('allows access for all role levels', () => {
      for (const role of ['super_admin', 'admin', 'manager', 'analyst', 'user']) {
        const { req, res, next } = mockReqRes([role]);
        authorize('iam:access')(req, res, next);
        expect(next).toHaveBeenCalled();
      }
    });
  });

  describe('error response format', () => {
    test('returns proper error structure on denial', () => {
      const { req, res, next } = mockReqRes(['user']);
      authorize('users:write')(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Insufficient permissions',
        required: 'admin',
        current: 'user',
        permission: 'users:write',
      }));
    });
  });
});

describe('PERMISSIONS matrix completeness', () => {
  test('all keys have minRole defined', () => {
    for (const [perm, def] of Object.entries(PERMISSIONS)) {
      expect(def.minRole).toBeDefined();
      expect(ROLE_HIERARCHY[def.minRole]).toBeDefined();
    }
  });

  test('all permission keys use valid role names', () => {
    for (const def of Object.values(PERMISSIONS)) {
      expect(['super_admin', 'admin', 'manager', 'analyst', 'user']).toContain(def.minRole);
    }
  });
});
