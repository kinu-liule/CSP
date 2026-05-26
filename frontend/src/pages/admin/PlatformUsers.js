import React, { useState, useEffect } from 'react';
import { Table, Badge, Spinner, Alert, Form, InputGroup, Row, Col, Card, Button, Modal } from 'react-bootstrap';
import axios from 'axios';

const ROLE_OPTIONS = ['super_admin', 'platform_admin', 'billing_manager', 'security_auditor', 'support_agent', 'compliance_officer', 'network_operator', 'security_analyst', 'integration_manager', 'customer_success_manager', 'readonly_auditor', 'tenant_admin', 'admin', 'manager', 'analyst', 'user'];

function PlatformUsers() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [tenantFilter, setTenantFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [detailUser, setDetailUser] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ username: '', email: '', roles: [], password: '' });
  const [deleteUser, setDeleteUser] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', email: '', password: '', tenantId: '', roles: ['user'] });
  const [tenants, setTenants] = useState([]);

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

  useEffect(() => { fetchUsers(); }, []);

  const fetchTenants = async () => {
    try {
      const res = await axios.get('/admin/tenants');
      setTenants(res.data.tenants || []);
    } catch {}
  };

  const openCreate = () => {
    fetchTenants();
    setCreateForm({ username: '', email: '', password: '', tenantId: '', roles: ['user'] });
    setShowCreateModal(true);
  };

  const handleCreate = async () => {
    if (!createForm.username || !createForm.email || !createForm.password || !createForm.tenantId) {
      alert('All fields except roles are required');
      return;
    }
    setActionLoading(true);
    try {
      await axios.post('/admin/users', createForm);
      setShowCreateModal(false);
      fetchUsers();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const toggleStatus = async (user) => {
    setActionLoading(true);
    try {
      await axios.put(`/admin/users/${user.id}/status`, { active: !user.active });
      fetchUsers();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!editUser) return;
    setActionLoading(true);
    try {
      const payload = { username: editForm.username, email: editForm.email, roles: editForm.roles };
      if (editForm.password) payload.password = editForm.password;
      await axios.put(`/admin/users/${editUser.id}`, payload);
      setEditUser(null);
      fetchUsers();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
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
    } finally {
      setActionLoading(false);
    }
  };

  const openEdit = (user) => {
    setEditUser(user);
    setEditForm({ username: user.username || '', email: user.email || '', roles: user.roles || [], password: '' });
  };

  const openDetail = (user) => {
    setDetailUser(user);
  };

  const toggleRole = (formObj, setFormFn, role) => {
    setFormFn(prev => ({
      ...prev,
      roles: prev.roles.includes(role) ? prev.roles.filter(r => r !== role) : [...prev.roles, role]
    }));
  };

  const allUsers = data.flatMap(t => {
    return (t.users || []).map(u => ({ ...u, tenant_id: t.tenant_id, tenant_name: t.tenant_name }));
  });

  const totalUsers = allUsers.length;
  const activeUsers = allUsers.filter(u => u.active !== false).length;
  const tenantUserCounts = data.map(t => ({ name: t.tenant_name, count: (t.users || []).length }));

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

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">Platform Users</h4>

      <Row className="mb-4 g-3">
        <Col md={3}>
          <Card className="text-center p-3 h-100">
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{totalUsers}</div>
            <div className="text-muted small">Total Users</div>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center p-3 h-100">
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{activeUsers}</div>
            <div className="text-muted small">Active Users</div>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center p-3 h-100">
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#a855f7' }}>{data.length}</div>
            <div className="text-muted small">Organizations</div>
          </Card>
        </Col>
        <Col md={3}>
          <Card className="text-center p-3 h-100">
            <div className="small text-muted mb-1">Users per Org</div>
            {tenantUserCounts.slice(0, 5).map((t, i) => (
              <div key={i} className="small" style={{ fontSize: '0.78rem' }}>{t.name}: <strong>{t.count}</strong></div>
            ))}
          </Card>
        </Col>
      </Row>

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <>
          <Row className="mb-3 g-2">
            <Col md={4}>
              <InputGroup size="sm">
                <InputGroup.Text>🔍</InputGroup.Text>
                <Form.Control placeholder="Search username, email, or org..." value={search} onChange={e => setSearch(e.target.value)} />
              </InputGroup>
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}>
                <option value="all">All Organizations</option>
                {data.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.tenant_name}</option>)}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Button size="sm" variant="outline-primary" onClick={fetchUsers} className="w-100">↻</Button>
            </Col>
            <Col md={2}>
              <Button size="sm" variant="success" onClick={openCreate} className="w-100">+ Add User</Button>
            </Col>
          </Row>

          <Table striped bordered hover responsive size="sm">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Organization</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-muted py-4">No users found</td></tr>
              ) : filtered.map(u => (
                <tr key={u.id}>
                  <td className="small">{u.username}</td>
                  <td className="small">{u.email}</td>
                  <td className="small"><Badge bg="secondary" className="me-1">{u.tenant_name}</Badge></td>
                  <td>{(u.roles || []).map(r => <Badge key={r} bg={r === 'super_admin' ? 'danger' : 'info'} className="me-1">{r}</Badge>)}</td>
                  <td>{u.active !== false ? <Badge bg="success">Active</Badge> : <Badge bg="danger">Inactive</Badge>}</td>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{u.last_login ? new Date(u.last_login).toLocaleString() : '-'}</td>
                  <td>
                    <div className="d-flex gap-1 flex-wrap">
                      <Button size="sm" variant="info" onClick={() => openDetail(u)} title="View Details">👁</Button>
                      <Button size="sm" variant="primary" onClick={() => openEdit(u)} title="Edit User">✏️</Button>
                      <Button size="sm" variant={u.active !== false ? 'warning' : 'success'} onClick={() => toggleStatus(u)} disabled={actionLoading} title={u.active !== false ? 'Deactivate' : 'Activate'}>
                        {u.active !== false ? '🔴' : '🟢'}
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleteUser(u)} title="Delete User">🗑</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {/* DETAIL MODAL */}
      <Modal show={!!detailUser} onHide={() => setDetailUser(null)} centered>
        <Modal.Header closeButton><Modal.Title>User Details</Modal.Title></Modal.Header>
        <Modal.Body>
          {detailUser && (
            <>
              <div className="mb-2"><strong>ID:</strong> <code className="small">{detailUser.id}</code></div>
              <div className="mb-2"><strong>Username:</strong> {detailUser.username}</div>
              <div className="mb-2"><strong>Email:</strong> {detailUser.email}</div>
              <div className="mb-2"><strong>Organization:</strong> <Badge bg="secondary">{detailUser.tenant_name}</Badge></div>
              <div className="mb-2"><strong>Roles:</strong> {(detailUser.roles || []).map(r => <Badge key={r} bg={r === 'super_admin' ? 'danger' : 'info'} className="me-1">{r}</Badge>)}</div>
              <div className="mb-2"><strong>Status:</strong> {detailUser.active !== false ? <Badge bg="success">Active</Badge> : <Badge bg="danger">Inactive</Badge>}</div>
              <div className="mb-2"><strong>Last Login:</strong> {detailUser.last_login ? new Date(detailUser.last_login).toLocaleString() : 'Never'}</div>
            </>
          )}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setDetailUser(null)}>Close</Button></Modal.Footer>
      </Modal>

      {/* EDIT MODAL */}
      <Modal show={!!editUser} onHide={() => setEditUser(null)} centered>
        <Modal.Header closeButton><Modal.Title>Edit User</Modal.Title></Modal.Header>
        <Modal.Body>
          {editUser && (
            <Form>
              <Form.Group className="mb-3">
                <Form.Label>Username</Form.Label>
                <Form.Control value={editForm.username} onChange={e => setEditForm({ ...editForm, username: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Email</Form.Label>
                <Form.Control type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>New Password (leave blank to keep current)</Form.Label>
                <Form.Control type="password" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} placeholder="Enter new password" />
              </Form.Group>
              <Form.Group className="mb-2">
                <Form.Label>Roles</Form.Label>
                <div className="d-flex gap-2 flex-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {ROLE_OPTIONS.map(r => (
                    <Form.Check
                      key={r}
                      type="switch"
                      id={`erole-${r}`}
                      label={r}
                      checked={editForm.roles.includes(r)}
                      onChange={() => toggleRole(editForm, setEditForm, r)}
                      disabled={r === 'super_admin' && editUser.tenant_id !== 'platform'}
                    />
                  ))}
                </div>
              </Form.Group>
            </Form>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditUser(null)}>Cancel</Button>
          <Button variant="primary" onClick={handleEdit} disabled={actionLoading}>
            {actionLoading ? <Spinner size="sm" /> : 'Save Changes'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* CREATE MODAL */}
      <Modal show={showCreateModal} onHide={() => setShowCreateModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Create Platform User</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Organization</Form.Label>
              <Form.Select value={createForm.tenantId} onChange={e => setCreateForm({ ...createForm, tenantId: e.target.value })} required>
                <option value="">-- Select Organization --</option>
                {tenants.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.name} ({t.tenant_id})</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control value={createForm.username} onChange={e => setCreateForm({ ...createForm, username: e.target.value })} required placeholder="e.g. john_doe" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" value={createForm.email} onChange={e => setCreateForm({ ...createForm, email: e.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Password</Form.Label>
              <Form.Control type="password" value={createForm.password} onChange={e => setCreateForm({ ...createForm, password: e.target.value })} required />
            </Form.Group>
            <Form.Group className="mb-2">
              <Form.Label>Roles</Form.Label>
              <div className="d-flex gap-2 flex-wrap" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {ROLE_OPTIONS.map(r => (
                  <Form.Check
                    key={r}
                    type="switch"
                    id={`crole-${r}`}
                    label={r}
                    checked={createForm.roles.includes(r)}
                    onChange={() => toggleRole(createForm, setCreateForm, r)}
                  />
                ))}
              </div>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleCreate} disabled={actionLoading}>
            {actionLoading ? <Spinner size="sm" /> : 'Create User'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* DELETE CONFIRM MODAL */}
      <Modal show={!!deleteUser} onHide={() => setDeleteUser(null)} centered>
        <Modal.Header closeButton><Modal.Title className="text-danger">Delete User</Modal.Title></Modal.Header>
        <Modal.Body>
          {deleteUser && (
            <p>Are you sure you want to delete <strong>{deleteUser.username}</strong> ({deleteUser.email})?<br />
            <span className="text-danger small">This action cannot be undone.</span></p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setDeleteUser(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete} disabled={actionLoading}>
            {actionLoading ? <Spinner size="sm" /> : 'Delete'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default PlatformUsers;
