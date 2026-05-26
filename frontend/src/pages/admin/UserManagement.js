import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ username: '', email: '', password: '', roles: ['user'] });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
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
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editing) {
        await axios.put(`/iam/users/${editing.id}`, form, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/iam/users', form, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowModal(false);
      setEditing(null);
      setForm({ username: '', email: '', password: '', roles: ['user'] });
      loadData();
    } catch (err) {
      setError('Failed to save user');
    }
  };

  const toggleActive = async (user) => {
    try {
      await axios.put(`/iam/users/${user.id}`, { active: !user.active }, { headers: { 'x-tenant-id': tenantId } });
      loadData();
    } catch (err) {
      setError('Failed to update user');
    }
  };

  const deleteUser = async (id) => {
    if (window.confirm('Delete this user?')) {
      try {
        await axios.delete(`/iam/users/${id}`, { headers: { 'x-tenant-id': tenantId } });
        loadData();
      } catch (err) {
        setError('Failed to delete user');
      }
    }
  };

  const updateRoles = async (userId, newRoles) => {
    try {
      await axios.put(`/iam/users/${userId}/roles`, { roles: newRoles }, { headers: { 'x-tenant-id': tenantId } });
      loadData();
    } catch (err) {
      setError('Failed to update roles');
    }
  };

  const summary = {
    total: users.length,
    active: users.filter(u => u.active !== false).length,
    locked: users.filter(u => u.active === false).length,
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">User Management</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={4}><Card className="text-center border-primary"><Card.Body><h3>{summary.total}</h3><small>Total Users</small></Card.Body></Card></Col>
        <Col md={4}><Card className="text-center border-success"><Card.Body><h3>{summary.active}</h3><small>Active</small></Card.Body></Card></Col>
        <Col md={4}><Card className="text-center border-danger"><Card.Body><h3>{summary.locked}</h3><small>Inactive</small></Card.Body></Card></Col>
      </Row>

      <div className="d-flex justify-content-between mb-3">
        <h4>All Users</h4>
        <Button onClick={() => { setEditing(null); setForm({ username: '', email: '', password: '', roles: ['user'] }); setShowModal(true); }}>Add User</Button>
      </div>

      <Table striped bordered hover responsive>
        <thead>
          <tr><th>Username</th><th>Email</th><th>Roles</th><th>Status</th><th>Last Login</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>
                {(u.roles || ['user']).map(r => (
                  <Badge key={r} bg="info" className="me-1">{r}</Badge>
                ))}
              </td>
              <td>
                <Badge bg={u.active !== false ? 'success' : 'secondary'}>
                  {u.active !== false ? 'Active' : 'Inactive'}
                </Badge>
              </td>
              <td>{u.last_login ? new Date(u.last_login).toLocaleString() : '-'}</td>
              <td>
                <Button size="sm" variant="outline-primary" className="me-1"
                  onClick={() => {
                    setEditing(u);
                    setForm({ username: u.username, email: u.email, password: '', roles: u.roles || ['user'] });
                    setShowModal(true);
                  }}>Edit</Button>
                <Button size="sm" variant={u.active !== false ? 'warning' : 'success'} className="me-1"
                  onClick={() => toggleActive(u)}>
                  {u.active !== false ? 'Deactivate' : 'Activate'}
                </Button>
                <Button size="sm" variant="danger" onClick={() => deleteUser(u.id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>{editing ? 'Edit User' : 'Add User'}</Modal.Title></Modal.Header>
        <Form onSubmit={handleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Username</Form.Label>
              <Form.Control required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Email</Form.Label>
              <Form.Control type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </Form.Group>
            {!editing && (
              <Form.Group className="mb-3">
                <Form.Label>Password</Form.Label>
                <Form.Control type="password" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </Form.Group>
            )}
            <Form.Group className="mb-3">
              <Form.Label>Roles</Form.Label>
              <div>
                {['super_admin', 'platform_admin', 'billing_manager', 'security_auditor', 'support_agent', 'compliance_officer', 'network_operator', 'security_analyst', 'integration_manager', 'customer_success_manager', 'readonly_auditor', 'tenant_admin', 'admin', 'manager', 'analyst', 'user'].map(role => (
                  <Form.Check
                    key={role}
                    type="checkbox"
                    inline
                    label={role}
                    checked={form.roles.includes(role)}
                    onChange={() => {
                      const updated = form.roles.includes(role)
                        ? form.roles.filter(r => r !== role)
                        : [...form.roles, role];
                      setForm({ ...form, roles: updated.length ? updated : ['user'] });
                    }}
                  />
                ))}
              </div>
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
}

export default UserManagement;
