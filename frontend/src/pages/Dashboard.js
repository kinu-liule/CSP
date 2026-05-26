import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col, Card, Badge, Alert } from 'react-bootstrap';
import { canAccess, canAdmin, getEffectiveRole, isSubscribed } from '../utils/auth';

const roleBadgeColors = { super_admin: 'danger', admin: 'warning', manager: 'primary', analyst: 'info', user: 'secondary' };
const hierarchy = { super_admin: 100, admin: 80, manager: 60, analyst: 40, user: 20 };

// ==================== DATA ====================

const adminCards = [
  { name: 'User Management', path: '/admin/users', desc: 'Manage users, roles, and permissions', icon: '👥', color: 'primary', minRole: 'admin' },
  { name: 'Role Management', path: '/admin/roles', desc: 'Configure roles and permission matrix', icon: '🔑', color: 'warning', minRole: 'admin' },
  { name: 'Audit Logs', path: '/admin/audit', desc: 'View security and activity audit trail', icon: '📋', color: 'info', minRole: 'manager' },
  { name: 'Departments', path: '/admin/departments', desc: 'Manage department structure', icon: '🏢', color: 'success', minRole: 'manager' },
  { name: 'Tenant Settings', path: '/admin/settings', desc: 'Configure tenant branding and SSO', icon: '⚙️', color: 'secondary', minRole: 'admin' },
];

const ALL_SERVICES = [
  { name: 'IAM', path: '/iam', key: 'iam', desc: 'Identity & Access Management', icon: '🔐', category: 'core' },
  { name: 'WAF', path: '/waf', key: 'waf', desc: 'Web Application Firewall', icon: '🛡️', category: 'network' },
  { name: 'NGFW', path: '/ngfw', key: 'ngfw', desc: 'Next-Gen Firewall', icon: '🔥', category: 'network' },
  { name: 'SIEM/SOAR', path: '/siem-soar', key: 'siem-soar', desc: 'Security Information & Event Management', icon: '🔍', category: 'monitoring' },
  { name: 'Vuln Scanner', path: '/vuln-scanner', key: 'vuln-scanner', desc: 'Vulnerability Management', icon: '🔎', category: 'monitoring' },
  { name: 'Fraud Detection', path: '/fraud', key: 'fraud', desc: 'Fraud Detection Platform', icon: '💳', category: 'monitoring' },
  { name: 'Awareness', path: '/awareness', key: 'awareness', desc: 'Human Risk Awareness', icon: '📚', category: 'compliance' },
  { name: 'GRC', path: '/grc', key: 'grc', desc: 'Governance, Risk & Compliance', icon: '📋', category: 'compliance' },
  { name: 'Asset Mgmt', path: '/asset-mgmt', key: 'asset-mgmt', desc: 'Asset Management', icon: '💎', category: 'core' },
  { name: 'CSPM', path: '/cspm', key: 'cspm', desc: 'Cloud Security Posture Management', icon: '☁️', category: 'cloud' },
  { name: 'EDR', path: '/edr', key: 'edr', desc: 'Endpoint Detection & Response', icon: '🖥️', category: 'monitoring' },
  { name: 'Threat Intel', path: '/threat-intel', key: 'threat-intel', desc: 'Threat Intelligence', icon: '🎯', category: 'monitoring' },
  { name: 'SOAR', path: '/soar', key: 'soar', desc: 'Security Orchestration & Response', icon: '⚙️', category: 'monitoring' },
  { name: 'Data Security', path: '/data-security', key: 'data-security', desc: 'Data Security Platform', icon: '🔒', category: 'compliance' },
  { name: 'Data Lake', path: '/data-lake', key: 'data-lake', desc: 'Security Data Lake', icon: '💾', category: 'monitoring' },
  { name: 'XDR', path: '/xdr', key: 'xdr', desc: 'Extended Detection & Response', icon: '🎯', category: 'monitoring' },
  { name: 'DevSecOps', path: '/devsecops', key: 'devsecops', desc: 'DevSecOps Platform', icon: '⚙️', category: 'devops' },
  { name: 'Deception', path: '/deception', key: 'deception', desc: 'Deception & Honeypot', icon: '🕷️', category: 'defense' },
  { name: 'Password Mgr', path: '/password-mgr', key: 'password-mgr', desc: 'Password Manager', icon: '🔑', category: 'core' },
  { name: 'Business Cont.', path: '/business-cont', key: 'business-cont', desc: 'Business Continuity', icon: '💼', category: 'compliance' },
  { name: 'Risk Engine', path: '/risk-engine', key: 'risk-engine', desc: 'Risk Assessment Engine', icon: '📊', category: 'compliance' },
];

const categoryLabels = {
  core: 'Core Services',
  network: 'Network Defense',
  monitoring: 'Security Monitoring',
  compliance: 'Governance & Compliance',
  cloud: 'Cloud Security',
  devops: 'DevSecOps',
  defense: 'Active Defense',
};

const categoryColors = {
  core: 'primary',
  network: 'danger',
  monitoring: 'info',
  compliance: 'warning',
  cloud: 'secondary',
  devops: 'dark',
  defense: 'danger',
};

// ==================== COMPONENTS ====================

function ServiceCard({ s, navigate }) {
  return (
    <Col md={3} className="mb-3">
      <Card onClick={() => navigate(s.path)} style={{ cursor: 'pointer' }} className="h-100 shadow-sm">
        <Card.Body className="text-center">
          <div style={{ fontSize: '2rem' }}>{s.icon}</div>
          <Card.Title className="mt-2 mb-1">{s.name}</Card.Title>
          <Card.Text className="small text-muted">{s.desc}</Card.Text>
        </Card.Body>
      </Card>
    </Col>
  );
}

function ServiceCategory({ label, services, color, navigate }) {
  if (!services.length) return null;
  return (
    <div className="mb-4">
      <h5 className={`text-${color} mb-3 border-bottom pb-2`}>{label}</h5>
      <Row>
        {services.map(s => <ServiceCard key={s.key} s={s} navigate={navigate} />)}
      </Row>
    </div>
  );
}

// ==================== ROLE VIEWS ====================

function SuperAdminView({ user, navigate }) {
  return (
    <>
      <Alert variant="danger" className="d-flex align-items-center">
        <span style={{ fontSize: '1.5rem', marginRight: '12px' }}>⚡</span>
        <div>
          <strong>Full Platform Control</strong> — You have unrestricted access to all systems and administrative functions.
        </div>
      </Alert>
      <h4 className="mb-3">Administration</h4>
      <Row className="mb-4">
        {adminCards.map(c => (
          <Col key={c.path} md={3} className="mb-3">
            <Card bg={c.color} text="white" onClick={() => navigate(c.path)} style={{ cursor: 'pointer' }} className="h-100 shadow">
              <Card.Body className="text-center">
                <div style={{ fontSize: '2rem' }}>{c.icon}</div>
                <Card.Title className="mt-2 mb-1">{c.name}</Card.Title>
                <Card.Text className="small">{c.desc}</Card.Text>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
      <hr />
      <h4 className="mb-3">All Platform Services</h4>
      {Object.entries(categoryLabels).map(([cat, label]) => (
        <ServiceCategory
          key={cat}
          label={label}
          services={ALL_SERVICES.filter(s => s.category === cat)}
          color={categoryColors[cat]}
          navigate={navigate}
        />
      ))}
    </>
  );
}

function AdminView({ user, navigate }) {
  return (
    <>
      <Alert variant="warning" className="d-flex align-items-center">
        <span style={{ fontSize: '1.5rem', marginRight: '12px' }}>🛠️</span>
        <div>
          <strong>Platform Management</strong> — You can manage users, roles, settings, and access all security services.
        </div>
      </Alert>
      <h4 className="mb-3">Administration</h4>
      <Row className="mb-4">
        {adminCards.filter(c => hierarchy[getEffectiveRole()] >= hierarchy[c.minRole]).map(c => (
          <Col key={c.path} md={3} className="mb-3">
            <Card bg={c.color} text="white" onClick={() => navigate(c.path)} style={{ cursor: 'pointer' }} className="h-100 shadow">
              <Card.Body className="text-center">
                <div style={{ fontSize: '2rem' }}>{c.icon}</div>
                <Card.Title className="mt-2 mb-1">{c.name}</Card.Title>
                <Card.Text className="small">{c.desc}</Card.Text>
              </Card.Body>
            </Card>
          </Col>
        ))}
        <Col md={3} className="mb-3">
          <Card bg="info" text="white" onClick={() => navigate('/service-requests')} style={{ cursor: 'pointer' }} className="h-100 shadow">
            <Card.Body className="text-center">
              <div style={{ fontSize: '2rem' }}>📨</div>
              <Card.Title className="mt-2 mb-1">Service Requests</Card.Title>
              <Card.Text className="small">Request additional security services</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <hr />
      <h4 className="mb-3">All Platform Services</h4>
      {Object.entries(categoryLabels).map(([cat, label]) => {
        const services = ALL_SERVICES.filter(s => s.category === cat && canAccess(s.key, 'R'));
        return <ServiceCategory key={cat} label={label} services={services} color={categoryColors[cat]} navigate={navigate} />;
      })}
    </>
  );
}

function ManagerView({ user, navigate }) {
  return (
    <>
      <Alert variant="primary" className="d-flex align-items-center">
        <span style={{ fontSize: '1.5rem', marginRight: '12px' }}>📋</span>
        <div>
          <strong>Department Operations</strong> — You can manage department users, view audit logs, and administer your team's security tools.
        </div>
      </Alert>
      <Row className="mb-4">
        <Col md={3} className="mb-3">
          <Card bg="info" text="white" onClick={() => navigate('/admin/audit')} style={{ cursor: 'pointer' }} className="h-100 shadow">
            <Card.Body className="text-center">
              <div style={{ fontSize: '2rem' }}>📋</div>
              <Card.Title className="mt-2 mb-1">Audit Logs</Card.Title>
              <Card.Text className="small">View security and activity audit trail</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card bg="success" text="white" onClick={() => navigate('/admin/departments')} style={{ cursor: 'pointer' }} className="h-100 shadow">
            <Card.Body className="text-center">
              <div style={{ fontSize: '2rem' }}>🏢</div>
              <Card.Title className="mt-2 mb-1">Departments</Card.Title>
              <Card.Text className="small">Manage department structure</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card bg="primary" text="white" onClick={() => navigate('/admin/users')} style={{ cursor: 'pointer' }} className="h-100 shadow">
            <Card.Body className="text-center">
              <div style={{ fontSize: '2rem' }}>👥</div>
              <Card.Title className="mt-2 mb-1">Users</Card.Title>
              <Card.Text className="small">View department users</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <hr />
      <h4 className="mb-3">Managed Services <small className="text-muted">(Read-Write)</small></h4>
      {['core', 'network'].map(cat => {
        const services = ALL_SERVICES.filter(s => s.category === cat && canAccess(s.key, 'W'));
        return <ServiceCategory key={cat} label={categoryLabels[cat]} services={services} color={categoryColors[cat]} navigate={navigate} />;
      })}
      <h4 className="mb-3">Monitor <small className="text-muted">(Read-Only)</small></h4>
      {['monitoring', 'compliance', 'cloud', 'devops', 'defense'].map(cat => {
        const services = ALL_SERVICES.filter(s => s.category === cat && canAccess(s.key, 'R') && !canAccess(s.key, 'W'));
        return <ServiceCategory key={cat} label={categoryLabels[cat]} services={services} color="secondary" navigate={navigate} />;
      })}
    </>
  );
}

function AnalystView({ user, navigate }) {
  return (
    <>
      <Alert variant="info" className="d-flex align-items-center">
        <span style={{ fontSize: '1.5rem', marginRight: '12px' }}>🔍</span>
        <div>
          <strong>Security Monitoring</strong> — You have read-only access to monitoring tools. Analyze threats, review logs, and track security events.
        </div>
      </Alert>
      <h4 className="mb-3">Monitoring Tools</h4>
      {['network', 'monitoring'].map(cat => {
        const services = ALL_SERVICES.filter(s => s.category === cat && canAccess(s.key, 'R'));
        return <ServiceCategory key={cat} label={categoryLabels[cat]} services={services} color="info" navigate={navigate} />;
      })}
      <h4 className="mb-3">Additional Tools</h4>
      {['cloud', 'compliance'].map(cat => {
        const services = ALL_SERVICES.filter(s => s.category === cat && canAccess(s.key, 'R'));
        return <ServiceCategory key={cat} label={categoryLabels[cat]} services={services} color="secondary" navigate={navigate} />;
      })}
    </>
  );
}

function UserView({ user, navigate }) {
  return (
    <>
      <Alert variant="secondary" className="d-flex align-items-center">
        <span style={{ fontSize: '1.5rem', marginRight: '12px' }}>👤</span>
        <div>
          <strong>My Workspace</strong> — Access your personal tools and self-service options.
        </div>
      </Alert>
      <Row>
        <Col md={4} className="mb-3">
          <Card onClick={() => navigate('/iam')} style={{ cursor: 'pointer' }} className="h-100 shadow-sm border-primary">
            <Card.Body className="text-center">
              <div style={{ fontSize: '3rem' }}>🔐</div>
              <Card.Title className="mt-3">My Profile</Card.Title>
              <Card.Text className="text-muted">Manage your account, password, and security settings</Card.Text>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4} className="mb-3">
          <Card onClick={() => navigate('/password-mgr')} style={{ cursor: 'pointer' }} className="h-100 shadow-sm border-success">
            <Card.Body className="text-center">
              <div style={{ fontSize: '3rem' }}>🔑</div>
              <Card.Title className="mt-3">Password Vault</Card.Title>
              <Card.Text className="text-muted">Store and manage your personal passwords securely</Card.Text>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}

// ==================== MAIN ====================

function Dashboard({ user }) {
  const navigate = useNavigate();
  const effectiveRole = getEffectiveRole();

  const views = {
    super_admin: SuperAdminView,
    admin: AdminView,
    manager: ManagerView,
    analyst: AnalystView,
    user: UserView,
  };

  const ViewComponent = views[effectiveRole] || UserView;

  return (
    <Container>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h2 className="mb-0">Welcome, {user?.username}</h2>
          <small className="text-muted">{user?.email}</small>
        </div>
        <Badge bg={roleBadgeColors[effectiveRole]} style={{ fontSize: '0.9rem', padding: '8px 16px' }}>
          {effectiveRole.replace('_', ' ').toUpperCase()}
        </Badge>
      </div>
      <ViewComponent user={user} navigate={navigate} />
    </Container>
  );
}

export default Dashboard;
