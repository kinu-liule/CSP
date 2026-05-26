import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

const ROLE_OPTIONS = ['super_admin', 'admin', 'manager', 'analyst', 'user'];

const ROLE_BADGE_COLORS = {
  super_admin: 'danger', admin: 'warning', manager: 'primary',
  analyst: 'info', user: 'secondary'
};

import { canWrite } from '../../utils/auth';
function IAMDashboard() {
  const writeAllowed = canWrite();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({ username: '', email: '', password: '', roles: ['user'] });

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: '', permissions: [] });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [usersRes, rolesRes] = await Promise.all([
        axios.get('/iam/users', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/iam/roles', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setUsers(usersRes.data.data || []);
      setRoles(rolesRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load IAM data');
    } finally {
      setLoading(false);
    }
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingUser) {
        await axios.put(`/iam/users/${editingUser.id}`, userForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/iam/users', { ...userForm }, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowUserModal(false);
      setEditingUser(null);
      setUserForm({ username: '', email: '', password: '', roles: ['user'] });
      loadAllData();
    } catch (err) {
      setError('Failed to save user');
    }
  };

  const deleteUser = async (id) => {
    if (window.confirm('Delete this user?')) {
      try {
        await axios.delete(`/iam/users/${id}`, { headers: { 'x-tenant-id': tenantId } });
        loadAllData();
      } catch (err) {
        setError('Failed to delete user');
      }
    }
  };

  const updateUserRoles = async (userId, roleList) => {
    try {
      await axios.put(`/iam/users/${userId}/roles`, { roles: roleList }, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    } catch (err) {
      setError('Failed to update roles');
    }
  };

  const handleRoleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRole) {
        await axios.put(`/iam/roles/${editingRole.id}`, roleForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/iam/roles', roleForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowRoleModal(false);
      setEditingRole(null);
      setRoleForm({ name: '', permissions: [] });
      loadAllData();
    } catch (err) {
      setError('Failed to save role');
    }
  };

  const deleteRole = async (id) => {
    if (window.confirm('Delete this role?')) {
      try {
        await axios.delete(`/iam/roles/${id}`, { headers: { 'x-tenant-id': tenantId } });
        loadAllData();
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to delete role');
      }
    }
  };

  const toggleRolePerm = (perm) => {
    setRoleForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter(p => p !== perm)
        : [...prev.permissions, perm]
    }));
  };

  const summary = {
    total: users.length,
    active: users.filter(u => u.active !== false).length,
    withRoles: users.filter(u => (u.roles || []).length > 0).length,
    rolesCount: roles.length,
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">IAM - Identity & Access Management</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{summary.total}</h3><small>Total Users</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{summary.active}</h3><small>Active</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{summary.withRoles}</h3><small>With Roles</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{summary.rolesCount}</h3><small>Roles Defined</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="users">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="users">Users</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="roles">Roles</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="users">
                <div className="d-flex justify-content-between mb-3">
                  <h4>Users</h4>
                  <Button onClick={() => { setEditingUser(null); setUserForm({ username: '', email: '', password: '', roles: ['user'] }); setShowUserModal(true); }}>Add User</Button>
                </div>
                <Table striped bordered hover responsive>
                  <thead><tr><th>Username</th><th>Email</th><th>Roles</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td>{u.username}</td><td>{u.email}</td>
                        <td>
                          <div className="d-flex align-items-center gap-1 flex-wrap">
                            {(u.roles || ['user']).map(r => (
                              <Badge key={r} bg={ROLE_BADGE_COLORS[r] || 'secondary'}>{r}</Badge>
                            ))}
                            <Button size="sm" variant="link" className="p-0 text-decoration-none"
                              onClick={() => {
                                const currentRoles = u.roles || ['user'];
                                const nextRole = ROLE_OPTIONS[(ROLE_OPTIONS.indexOf(currentRoles[0]) + 1) % ROLE_OPTIONS.length];
                                updateUserRoles(u.id, [nextRole]);
                              }}>&#8635;</Button>
                          </div>
                        </td>
                        <td><Badge bg={u.active !== false ? 'success' : 'secondary'}>{u.active !== false ? 'Active' : 'Inactive'}</Badge></td>
                        <td style={{ fontSize: '0.85em' }}>{u.last_login ? new Date(u.last_login).toLocaleString() : '-'}</td>
                        <td>
                          <Button size="sm" variant="outline-primary" className="me-1"
                            onClick={() => { setEditingUser(u); setUserForm({ username: u.username, email: u.email, password: '', roles: u.roles || ['user'] }); setShowUserModal(true); }}>Edit</Button>
                          <Button size="sm" variant="danger" onClick={() => deleteUser(u.id)}>Delete</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="roles">
                <div className="d-flex justify-content-between mb-3">
                  <h4>Roles</h4>
                  <Button onClick={() => { setEditingRole(null); setRoleForm({ name: '', permissions: [] }); setShowRoleModal(true); }}>Create Role</Button>
                </div>
                <Row>
                  {roles.map(role => (
                    <Col key={role.id} md={6} className="mb-3">
                      <Card>
                        <Card.Body>
                          <div className="d-flex justify-content-between align-items-start">
                            <div>
                              <Card.Title>{role.name}</Card.Title>
                              {role.is_system && <Badge bg="secondary" className="mb-2">System</Badge>}
                            </div>
                            <div>
                              <Button size="sm" variant="outline-primary" className="me-1"
                                onClick={() => { setEditingRole(role); setRoleForm({ name: role.name, permissions: role.permissions || [] }); setShowRoleModal(true); }}>Edit</Button>
                              {!role.is_system && (
                                <Button size="sm" variant="danger" onClick={() => deleteRole(role.id)}>Delete</Button>
                              )}
                            </div>
                          </div>
                          <hr />
                          <div>
                            {(role.permissions || []).map(p => (
                              <Badge key={p} bg="info" className="me-1 mb-1">{p}</Badge>
                            ))}
                            {(role.permissions || []).length === 0 && <small className="text-muted">No permissions</small>}
                          </div>
                          <small className="text-muted mt-2 d-block">
                            Users: {users.filter(u => (u.roles || []).includes(role.name.toLowerCase())).map(u => u.username).join(', ') || '-'}
                          </small>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      <Modal show={showUserModal} onHide={() => setShowUserModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingUser ? 'Edit' : 'Add'} User</Modal.Title></Modal.Header>
        <Form onSubmit={handleUserSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Username</Form.Label><Form.Control required value={userForm.username} onChange={e => setUserForm({...userForm, username: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Email</Form.Label><Form.Control type="email" required value={userForm.email} onChange={e => setUserForm({...userForm, email: e.target.value})} /></Form.Group>
            {!editingUser && <Form.Group className="mb-3"><Form.Label>Password</Form.Label><Form.Control type="password" required value={userForm.password} onChange={e => setUserForm({...userForm, password: e.target.value})} /></Form.Group>}
            <Form.Group className="mb-3"><Form.Label>Roles</Form.Label>
              {ROLE_OPTIONS.map(role => (
                <Form.Check key={role} type="checkbox" inline label={role} checked={userForm.roles.includes(role)}
                  onChange={() => {
                    const updated = userForm.roles.includes(role)
                      ? userForm.roles.filter(r => r !== role)
                      : [...userForm.roles, role];
                    setUserForm({ ...userForm, roles: updated.length ? updated : ['user'] });
                  }} />
              ))}
            </Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowUserModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showRoleModal} onHide={() => setShowRoleModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>{editingRole ? 'Edit' : 'Create'} Role</Modal.Title></Modal.Header>
        <Form onSubmit={handleRoleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Role Name</Form.Label><Form.Control required value={roleForm.name} onChange={e => setRoleForm({...roleForm, name: e.target.value})} /></Form.Group>
            <h6>Permissions</h6>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {['users:read', 'users:write', 'users:delete', 'users:roles',
                'iam:access', 'iam:write', 'waf:access', 'waf:write',
                'ngfw:access', 'ngfw:write', 'grc:access', 'grc:write',
                'siem:access', 'vuln-scanner:access', 'fraud:access', 'awareness:access',
                'asset-mgmt:access', 'cspm:access', 'edr:access', 'threat-intel:access',
                'soar:access', 'data-security:access', 'data-lake:access', 'xdr:access',
                'devsecops:access', 'deception:access', 'password-mgr:access', 'bcp:access',
                'risk-engine:access', 'admin:audit', 'admin:analytics', 'admin:policies'].map(p => (
                <Form.Check key={p} type="switch" inline label={<small>{p}</small>}
                  checked={roleForm.permissions.includes(p)}
                  onChange={() => toggleRolePerm(p)} />
              ))}
            </div>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowRoleModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}

export default IAMDashboard;
