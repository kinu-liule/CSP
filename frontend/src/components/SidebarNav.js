import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Nav } from 'react-bootstrap';
import { canAccess, canAdmin, isSuperAdmin, isSubscribed, getEffectiveRole, ROLE_HIERARCHY } from '../utils/auth';

const PRODUCT_DEFS = [
  {
    label: 'GRC Framework',
    icon: '📋',
    children: [
      { label: 'GRC Automation Framework', path: '/grc', key: 'grc' },
      { label: '3rd Party Risk Management', path: '/risk-engine', key: 'risk-engine' },
      { label: 'Business Continuity Plan', path: '/business-cont', key: 'business-cont' },
      { label: 'IAM', path: '/iam', key: 'iam' },
      { label: 'Asset Management', path: '/asset-mgmt', key: 'asset-mgmt' },
    ],
  },
  {
    label: 'Network Defences',
    icon: '🛡️',
    children: [
      { label: 'NGFW', path: '/ngfw', key: 'ngfw' },
      { label: 'WAF', path: '/waf', key: 'waf' },
    ],
  },
  {
    label: 'Threat Detection and Response',
    icon: '🔍',
    children: [
      { label: 'SIEM/SOAR', path: '/siem-soar', key: 'siem-soar' },
      { label: 'XDR', path: '/xdr', key: 'xdr' },
      { label: 'SOAR', path: '/soar', key: 'soar' },
      { label: 'Fraud Detection', path: '/fraud', key: 'fraud' },
      { label: 'Threat Intelligence', path: '/threat-intel', key: 'threat-intel' },
    ],
  },
  {
    label: 'Security Assessment',
    icon: '🔎',
    children: [
      { label: 'Vulnerability Scanner', path: '/vuln-scanner', key: 'vuln-scanner' },
      { label: 'CS Awareness Platform', path: '/awareness', key: 'awareness' },
    ],
  },
  {
    label: 'Cloud & Data Security',
    icon: '☁️',
    children: [
      { label: 'CSPM', path: '/cspm', key: 'cspm' },
      { label: 'Data Security', path: '/data-security', key: 'data-security' },
      { label: 'Security Data Lake', path: '/data-lake', key: 'data-lake' },
    ],
  },
  {
    label: 'Endpoint & DevSecOps',
    icon: '🖥️',
    children: [
      { label: 'EDR', path: '/edr', key: 'edr' },
      { label: 'DevSecOps', path: '/devsecops', key: 'devsecops' },
      { label: 'Deception', path: '/deception', key: 'deception' },
    ],
  },
  {
    label: 'Access & Utilities',
    icon: '🔐',
    children: [
      { label: 'Password Manager', path: '/password-mgr', key: 'password-mgr' },
    ],
  },
];

function SidebarNav({ onNavigate, userRoles }) {
  const location = useLocation();
  const [expanded, setExpanded] = useState(() => {
    const saved = {};
    PRODUCT_DEFS.forEach((_, i) => { saved[i] = true; });
    return saved;
  });

  const showAdmin = canAdmin();
  const showSuperAdmin = isSuperAdmin();

  const adminItems = [
    { label: 'User Management', path: '/admin/users', icon: '👥', minRole: 'admin' },
    { label: 'Role Management', path: '/admin/roles', icon: '🔑', minRole: 'admin' },
    { label: 'Departments', path: '/admin/departments', icon: '🏢', minRole: 'manager' },
    { label: 'Audit Logs', path: '/admin/audit', icon: '📋', minRole: 'manager' },
    { label: 'Tenant Settings', path: '/admin/settings', icon: '⚙️', minRole: 'admin' },
  ];

  const superAdminItems = [
    { label: 'Organization Requests', path: '/admin/requests', icon: '📩', minRole: 'super_admin' },
  ];

  const toggle = (idx) => {
    setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const isActive = (paths) => paths.some((p) => location.pathname.startsWith(p));

  const canAccessAdminItem = (item) => {
    if (!item.minRole) return true;
    const role = getEffectiveRole();
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[item.minRole];
  };

  const filteredProducts = PRODUCT_DEFS.map(group => ({
    ...group,
    children: group.children.filter(child => canAccess(child.key, 'R') && (child.key === 'iam' || isSubscribed(child.key))),
  })).filter(group => group.children.length > 0);

  return (
    <div className="sidebar-nav">
      {showAdmin && (
        <>
          <div className="sidebar-header">
            <h5 className="mb-0">Administration</h5>
          </div>
          <Nav className="flex-column mb-3">
            {adminItems.filter(canAccessAdminItem).map((item) => (
              <Nav.Link
                key={item.label}
                as={NavLink}
                to={item.path}
                onClick={onNavigate}
                className={`sidebar-link ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
              >
                <span className="sidebar-child-icon">{item.icon}</span>
                {item.label}
              </Nav.Link>
            ))}
          </Nav>
          <hr className="sidebar-divider" />
        </>
      )}
      {showSuperAdmin && (
        <>
          <div className="sidebar-header">
            <h5 className="mb-0">Super Admin</h5>
          </div>
          <Nav className="flex-column mb-3">
            {superAdminItems.map((item) => (
              <Nav.Link
                key={item.label}
                as={NavLink}
                to={item.path}
                onClick={onNavigate}
                className={`sidebar-link ${location.pathname.startsWith(item.path) ? 'active' : ''}`}
              >
                <span className="sidebar-child-icon">{item.icon}</span>
                {item.label}
              </Nav.Link>
            ))}
          </Nav>
          <hr className="sidebar-divider" />
        </>
      )}
      <div className="sidebar-header">
        <h5 className="mb-0">Products</h5>
      </div>
      <Nav className="flex-column">
        {filteredProducts.map((group, i) => {
          const childPaths = group.children.map((c) => c.path);
          const groupActive = isActive(childPaths);
          return (
            <div key={group.label} className="sidebar-group">
              <div
                className={`sidebar-group-header ${groupActive ? 'active' : ''}`}
                onClick={() => toggle(i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && toggle(i)}
              >
                <span className="sidebar-group-icon">{group.icon}</span>
                <span className="sidebar-group-label">{group.label}</span>
                <span className={`sidebar-chevron ${expanded[i] ? 'open' : ''}`}>
                  &#9662;
                </span>
              </div>
              {expanded[i] && (
                <div className="sidebar-children">
                  {group.children.map((child) => (
                    <Nav.Link
                      key={child.label}
                      as={NavLink}
                      to={child.path}
                      onClick={onNavigate}
                      className={`sidebar-link ${location.pathname.startsWith(child.path) ? 'active' : ''}`}
                    >
                      <span className="sidebar-child-icon">{child.icon}</span>
                      {child.label}
                    </Nav.Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </Nav>
    </div>
  );
}

export default SidebarNav;
