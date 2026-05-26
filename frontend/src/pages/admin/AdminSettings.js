import React, { useState } from 'react';
import { Tab, Nav, Row, Col, Card, Table, Badge, Button, Modal, Form, Spinner, Alert, InputGroup } from 'react-bootstrap';
import axios from 'axios';

// --- Shared ---
const ROLE_OPTIONS = ['super_admin', 'platform_admin', 'billing_manager', 'security_auditor', 'support_agent', 'compliance_officer', 'network_operator', 'security_analyst', 'integration_manager', 'customer_success_manager', 'readonly_auditor', 'tenant_admin', 'admin', 'manager', 'analyst', 'user'];

const permissionGroups = [
  {
    group: 'Tenants', perms: ['tenants:read','tenants:write'],
  },
  {
    group: 'Users', perms: ['users:read','users:write'],
  },
  {
    group: 'Billing & Quotas', perms: ['billing:read','billing:write','quotas:read','quotas:write'],
  },
  {
    group: 'Audit & Analytics', perms: ['audit:read','analytics:read','compliance:read','compliance:write'],
  },
  {
    group: 'Security & Policies', perms: ['policies:read','policies:write','sessions:manage'],
  },
  {
    group: 'System & Health', perms: ['health:read','services:read','maintenance:manage','backup:manage'],
  },
  {
    group: 'Settings & Branding', perms: ['settings:read','settings:write','branding:write'],
  },
  {
    group: 'Integrations', perms: ['webhooks:read','webhooks:write','sso:read','sso:write','apikeys:read','apikeys:write'],
  },
  {
    group: 'Communications', perms: ['notifications:write'],
  },
  {
    group: 'Advanced', perms: ['impersonate:use','bulk:operations'],
  },
];

// ====================== USERS SECTION ======================
function UsersSection() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detailUser, setDetailUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', email: '', roles: [] });
  const [deleteUser, setDeleteUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/users');
      setData(res.data.usersByTenant);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => { fetchUsers(); }, []);

  const toggleStatus = async (user) => {
    setActionLoading(true);
    try {
      await axios.put(`/admin/users/${user.id}/status`, { active: !user.active });
      fetchUsers();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally { setActionLoading(false); }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setActionLoading(true);
    try {
      await axios.put(`/admin/users/${editUser.id}`, editForm);
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally { setActionLoading(false); }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setActionLoading(true);
    try {
      await axios.delete(`/admin/users/${deleteUser.id}`);
      setDeleteUser(null);
      fetchUsers();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally { setActionLoading(false); }
  };

  const toggleRole = (role) => {
    setEditForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter(r => r !== role) : [...prev.roles, role]
    }));
  };

  const allUsers = data.flatMap(t => (t.users || []).map(u => ({ ...u, tenant_id: t.tenant_id, tenant_name: t.tenant_name })));
  const totalUsers = allUsers.length;
  const activeUsers = allUsers.filter(u => u.active !== false).length;

  const filtered = allUsers.filter(u => {
    if (search) {
      const q = search.toLowerCase();
      if (!u.username?.toLowerCase().includes(q) && !u.email?.toLowerCase().includes(q) && !u.tenant_name?.toLowerCase().includes(q)) return false;
    }
    if (tenantFilter !== 'all' && u.tenant_id !== tenantFilter) return false;
    if (statusFilter === 'active' && u.active === false) return false;
    if (statusFilter === 'inactive' && u.active !== false) return false;
    return true;
  });

  return (
    <>
      <Row className="mb-3 g-2">
        <Col md={3}><Card className="text-center p-2"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{totalUsers}</div><div className="text-muted small">Total Users</div></Card></Col>
        <Col md={3}><Card className="text-center p-2"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#22c55e' }}>{activeUsers}</div><div className="text-muted small">Active</div></Card></Col>
        <Col md={3}><Card className="text-center p-2"><div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#a855f7' }}>{data.length}</div><div className="text-muted small">Orgs</div></Card></Col>
        <Col md={3}><Card className="text-center p-2"><Button size="sm" variant="outline-primary" onClick={fetchUsers} className="w-100">↻ Refresh</Button></Card></Col>
      </Row>
      <Row className="mb-3 g-2">
        <Col md={5}><InputGroup size="sm"><InputGroup.Text>🔍</InputGroup.Text><Form.Control placeholder="Search username, email, or org..." value={search} onChange={e => setSearch(e.target.value)} /></InputGroup></Col>
        <Col md={2}><Form.Select size="sm" value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}><option value="all">All Orgs</option>{data.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>)}</Form.Select></Col>
        <Col md={2}><Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All Status</option><option value="active">Active</option><option value="inactive">Inactive</option></Form.Select></Col>
      </Row>
      {loading ? <div className="text-center py-4"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Username</th><th>Email</th><th>Org</th><th>Roles</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
          <tbody>{filtered.length === 0 ? <tr><td colSpan={7} className="text-center text-muted py-3">No users found</td></tr> : filtered.map(u => (
            <tr key={u.id}>
              <td className="small">{u.username}</td>
              <td className="small">{u.email}</td>
              <td className="small"><Badge bg="secondary">{u.tenant_name}</Badge></td>
              <td>{(u.roles || []).map(r => <Badge key={r} bg={r === 'super_admin' ? 'danger' : 'info'} className="me-1">{r}</Badge>)}</td>
              <td><Badge bg={u.active !== false ? 'success' : 'danger'}>{u.active !== false ? 'Active' : 'Inactive'}</Badge></td>
              <td className="small">{u.last_login ? new Date(u.last_login).toLocaleString() : '-'}</td>
              <td>
                <div className="d-flex gap-1">
                  <Button size="sm" variant="info" onClick={() => setDetailUser(u)} title="View">👁</Button>
                  <Button size="sm" variant="primary" onClick={() => { setEditUser(u); setEditForm({ username: u.username, email: u.email, roles: u.roles || [] }); }} title="Edit">✏️</Button>
                  <Button size="sm" variant={u.active !== false ? 'warning' : 'success'} onClick={() => toggleStatus(u)} disabled={actionLoading}>{u.active !== false ? '🔴' : '🟢'}</Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteUser(u)} title="Delete">🗑</Button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}
      <Modal show={!!detailUser} onHide={() => setDetailUser(null)} centered>
        <Modal.Header closeButton><Modal.Title>User Details</Modal.Title></Modal.Header>
        <Modal.Body>{detailUser && <>
          <div className="mb-2"><strong>ID:</strong> <code>{detailUser.id}</code></div>
          <div className="mb-2"><strong>Username:</strong> {detailUser.username}</div>
          <div className="mb-2"><strong>Email:</strong> {detailUser.email}</div>
          <div className="mb-2"><strong>Org:</strong> <Badge bg="secondary">{detailUser.tenant_name}</Badge></div>
          <div className="mb-2"><strong>Roles:</strong> {(detailUser.roles || []).map(r => <Badge key={r} bg={r === 'super_admin' ? 'danger' : 'info'} className="me-1">{r}</Badge>)}</div>
          <div className="mb-2"><strong>Status:</strong> <Badge bg={detailUser.active !== false ? 'success' : 'danger'}>{detailUser.active !== false ? 'Active' : 'Inactive'}</Badge></div>
          <div className="mb-2"><strong>Last Login:</strong> {detailUser.last_login ? new Date(detailUser.last_login).toLocaleString() : 'Never'}</div>
        </>}</Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setDetailUser(null)}>Close</Button></Modal.Footer>
      </Modal>
      <Modal show={!!editUser} onHide={() => setEditUser(null)} centered>
        <Modal.Header closeButton><Modal.Title>Edit User</Modal.Title></Modal.Header>
        <Modal.Body><Form>
          <Form.Group className="mb-3"><Form.Label>Username</Form.Label><Form.Control value={editForm.username} onChange={e => setEditForm({...editForm, username: e.target.value})} /></Form.Group>
          <Form.Group className="mb-3"><Form.Label>Email</Form.Label><Form.Control type="email" value={editForm.email} onChange={e => setEditForm({...editForm, email: e.target.value})} /></Form.Group>
          <Form.Label>Roles</Form.Label>
          <div className="d-flex gap-2 flex-wrap">{ROLE_OPTIONS.map(r => (
            <Form.Check key={r} type="switch" id={`erole-${r}`} label={r} checked={editForm.roles.includes(r)} onChange={() => toggleRole(r)} disabled={r === 'super_admin' && editUser?.tenant_id !== 'platform'} />
          ))}</div>
        </Form></Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
          <Button variant="primary" onClick={handleEdit} disabled={actionLoading}>{actionLoading ? <Spinner size="sm" /> : 'Save Changes'}</Button>
        </Modal.Footer>
      </Modal>
      <Modal show={!!deleteUser} onHide={() => setDeleteUser(null)} centered>
        <Modal.Header closeButton><Modal.Title className="text-danger">Delete User</Modal.Title></Modal.Header>
        <Modal.Body>{deleteUser && <p>Delete <strong>{deleteUser.username}</strong> ({deleteUser.email})?<br /><span className="text-danger small">This cannot be undone.</span></p>}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDeleteUser(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>{actionLoading ? <Spinner size="sm" /> : 'Delete'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

// ====================== SECURITY SECTION ======================
function SecuritySection() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  React.useEffect(() => {
    axios.get('/admin/settings/security').then(r => setSettings(r.data.settings)).catch(e => setError(e.response?.data?.error || 'Failed to load')).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await axios.put('/admin/settings/security', settings);
      setSuccess('Security settings updated');
    } catch (err) { setError(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));
  if (loading) return <div className="text-center py-4"><Spinner animation="border" /></div>;
  if (!settings) return <Alert variant="danger">Failed to load settings</Alert>;

  return (
    <Form onSubmit={handleSave}>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}
      <Card className="mb-3">
        <Card.Body>
          <h6 className="mb-3">Password Policy</h6>
          <Row><Col md={4}><Form.Group className="mb-2"><Form.Label>Min Length</Form.Label><Form.Control type="number" value={settings.password_min_length} onChange={e => set('password_min_length', parseInt(e.target.value))} min={4} max={64} /></Form.Group></Col>
          <Col md={4}><Form.Group className="mb-2"><Form.Label>Expiry (days)</Form.Label><Form.Control type="number" value={settings.password_expiry_days} onChange={e => set('password_expiry_days', parseInt(e.target.value))} min={0} max={365} /></Form.Group></Col></Row>
          <Form.Check className="mb-1" type="switch" id="require-special" label="Require special character" checked={settings.password_require_special} onChange={e => set('password_require_special', e.target.checked)} />
          <Form.Check type="switch" id="require-upper" label="Require uppercase" checked={settings.password_require_upper} onChange={e => set('password_require_upper', e.target.checked)} />
        </Card.Body>
      </Card>
      <Card className="mb-3">
        <Card.Body>
          <h6 className="mb-3">Multi-Factor Auth</h6>
          <Form.Check type="switch" id="mfa-required" label="Require MFA for all users" checked={settings.mfa_required} onChange={e => set('mfa_required', e.target.checked)} />
        </Card.Body>
      </Card>
      <Card className="mb-3">
        <Card.Body>
          <h6 className="mb-3">Session & Login</h6>
          <Row><Col md={4}><Form.Group className="mb-2"><Form.Label>Session Timeout (min)</Form.Label><Form.Control type="number" value={settings.session_timeout_minutes} onChange={e => set('session_timeout_minutes', parseInt(e.target.value))} min={5} max={1440} /></Form.Group></Col>
          <Col md={4}><Form.Group className="mb-2"><Form.Label>Max Login Attempts</Form.Label><Form.Control type="number" value={settings.max_login_attempts} onChange={e => set('max_login_attempts', parseInt(e.target.value))} min={1} max={20} /></Form.Group></Col>
          <Col md={4}><Form.Group className="mb-2"><Form.Label>Lockout Duration (min)</Form.Label><Form.Control type="number" value={settings.lockout_duration_minutes} onChange={e => set('lockout_duration_minutes', parseInt(e.target.value))} min={1} max={1440} /></Form.Group></Col></Row>
        </Card.Body>
      </Card>
      <Button variant="primary" type="submit" disabled={saving}>{saving ? <><Spinner size="sm" className="me-1" />Saving...</> : 'Save Settings'}</Button>
    </Form>
  );
}

// ====================== ROLES SECTION ======================
function RolesSection() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', permissions: [], isSystem: false });

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/roles');
      setRoles(res.data.roles || []);
    } catch (err) { setError(err.response?.data?.error || 'Failed to load roles'); }
    finally { setLoading(false); }
  };

  React.useEffect(() => { fetchRoles(); }, []);

  const togglePermission = (perm) => {
    setForm(prev => ({ ...prev, permissions: prev.permissions.includes(perm) ? prev.permissions.filter(p => p !== perm) : [...prev.permissions, perm] }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) { await axios.put(`/admin/roles/${editing.id}`, form); }
      else { await axios.post('/admin/roles', form); }
      setShowModal(false); fetchRoles();
    } catch (err) { setError(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try { await axios.delete(`/admin/roles/${role.id}`); fetchRoles(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to delete'); }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <span><strong>{roles.length}</strong> roles</span>
        <Button size="sm" variant="primary" onClick={() => { setEditing(null); setForm({ name: '', description: '', permissions: [], isSystem: false }); setShowModal(true); }}>+ Create Role</Button>
      </div>
      {loading ? <div className="text-center py-4"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Role</th><th>Description</th><th>Permissions</th><th>Type</th><th>Actions</th></tr></thead>
          <tbody>{roles.map(r => (
            <tr key={r.id}>
              <td className="small"><strong>{r.name}</strong></td>
              <td className="small text-muted">{r.description}</td>
              <td>{r.permissions?.map(p => <Badge key={p} bg="info" className="me-1">{p}</Badge>)}</td>
              <td><Badge bg={r.isSystem ? 'secondary' : 'primary'}>{r.isSystem ? 'System' : 'Custom'}</Badge></td>
              <td>
                <Button size="sm" variant="outline-primary" className="me-1" onClick={() => { setEditing(r); setForm({ name: r.name, description: r.description || '', permissions: r.permissions || [], isSystem: r.isSystem }); setShowModal(true); }} disabled={r.isSystem}>Edit</Button>
                <Button size="sm" variant="outline-danger" onClick={() => handleDelete(r)} disabled={r.isSystem}>Delete</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}
      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>{editing ? 'Edit Role' : 'Create Role'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3"><Form.Label>Role Name</Form.Label><Form.Control value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Security Auditor" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control value={form.description} onChange={e => setForm({...form, description: e.target.value})} as="textarea" rows={2} /></Form.Group>
            <Form.Label>Permissions</Form.Label>
            <div style={{ maxHeight: 400, overflowY: 'auto' }} className="border rounded p-3">
              {permissionGroups.map((g, gi) => (
                <div key={gi} className="mb-2">
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{g.group}</div>
                  {g.perms.map(p => (<Form.Check key={p} type="switch" id={`perm-${p}`} label={p} checked={form.permissions.includes(p)} onChange={() => togglePermission(p)} style={{ fontSize: 13 }} />))}
                  {gi < permissionGroups.length - 1 && <hr className="my-2" />}
                </div>
              ))}
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Role'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

// ====================== MAIN COMBINED COMPONENT ======================
function AdminSettings() {
  const [section, setSection] = useState('users');

  return (
    <>
      <h4 className="mb-3">🔐 Admin Settings</h4>
      <Tab.Container activeKey={section} onSelect={k => setSection(k)}>
        <Row>
          <Col sm={3} lg={2}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="users">👥 Users</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="security">🔐 Security</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="roles">👤 RBAC Roles</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9} lg={10}>
            <Tab.Content>
              <Tab.Pane eventKey="users"><UsersSection /></Tab.Pane>
              <Tab.Pane eventKey="security"><SecuritySection /></Tab.Pane>
              <Tab.Pane eventKey="roles"><RolesSection /></Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>
    </>
  );
}

export default AdminSettings;
