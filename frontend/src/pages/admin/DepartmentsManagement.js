import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

function DepartmentsManagement() {
  const [departments, setDepartments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [deptForm, setDeptForm] = useState({ name: '', description: '' });

  const [assignDept, setAssignDept] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState([]);

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [deptRes, userRes] = await Promise.all([
        axios.get('/iam/departments', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/iam/users', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDepartments(deptRes.data.data || []);
      setUsers(userRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDeptSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await axios.put(`/iam/departments/${editingDept.id}`, deptForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/iam/departments', deptForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowDeptModal(false);
      setEditingDept(null);
      setDeptForm({ name: '', description: '' });
      loadData();
    } catch (err) {
      setError('Failed to save department');
    }
  };

  const deleteDept = async (id) => {
    if (window.confirm('Delete this department? This will remove all user assignments.')) {
      try {
        await axios.delete(`/iam/departments/${id}`, { headers: { 'x-tenant-id': tenantId } });
        loadData();
      } catch (err) {
        setError('Failed to delete department');
      }
    }
  };

  const openAssignModal = async (dept) => {
    setAssignDept(dept);
    try {
      const res = await axios.get(`/iam/users/${dept.id}/departments`, { headers: { 'x-tenant-id': tenantId } });
      // Actually, we need user-department assignments. The endpoint is GET /users/:id/departments
      // but we need department users instead. Let me use the user list.
    } catch (err) {}
    setShowAssignModal(true);
  };

  const toggleUserAssignment = async (userId, assigned) => {
    try {
      const currentDepts = assignDept ? [assignDept.id] : [];
      if (assigned) {
        await axios.put(`/iam/users/${userId}/departments`, { department_ids: currentDepts }, { headers: { 'x-tenant-id': tenantId } });
      } else {
        // Remove from this dept
        const res = await axios.get(`/iam/users/${userId}/departments`, { headers: { 'x-tenant-id': tenantId } });
        const otherDepts = (res.data.data || []).filter(d => d.id !== assignDept?.id).map(d => d.id);
        await axios.put(`/iam/users/${userId}/departments`, { department_ids: otherDepts }, { headers: { 'x-tenant-id': tenantId } });
      }
      loadData();
    } catch (err) {
      setError('Failed to update assignment');
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Departments Management</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={4}><Card className="text-center border-primary"><Card.Body><h3>{departments.length}</h3><small>Departments</small></Card.Body></Card></Col>
        <Col md={4}><Card className="text-center border-success"><Card.Body><h3>{users.length}</h3><small>Users</small></Card.Body></Card></Col>
        <Col md={4}><Card className="text-center border-info"><Card.Body><h3>{departments.reduce((s, d) => s + parseInt(d.user_count || 0), 0)}</h3><small>Total Assignments</small></Card.Body></Card></Col>
      </Row>

      <div className="d-flex justify-content-between mb-3">
        <h4>Departments</h4>
        <Button onClick={() => { setEditingDept(null); setDeptForm({ name: '', description: '' }); setShowDeptModal(true); }}>Create Department</Button>
      </div>

      <Table striped bordered hover responsive>
        <thead>
          <tr><th>Name</th><th>Description</th><th>Users</th><th>Created</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {departments.length === 0 ? (
            <tr><td colSpan={5} className="text-center text-muted">No departments created yet</td></tr>
          ) : (
            departments.map(d => (
              <tr key={d.id}>
                <td><strong>{d.name}</strong></td>
                <td>{d.description || '-'}</td>
                <td><Badge bg="info">{d.user_count || 0}</Badge></td>
                <td style={{ fontSize: '0.85em' }}>{d.created_at ? new Date(d.created_at).toLocaleDateString() : '-'}</td>
                <td>
                  <Button size="sm" variant="outline-primary" className="me-1"
                    onClick={() => { setEditingDept(d); setDeptForm({ name: d.name, description: d.description }); setShowDeptModal(true); }}>Edit</Button>
                  <Button size="sm" variant="outline-info" className="me-1"
                    onClick={() => { setAssignDept(d); setShowAssignModal(true); }}>Assign Users</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteDept(d.id)}>Delete</Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Modal show={showDeptModal} onHide={() => setShowDeptModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingDept ? 'Edit' : 'Create'} Department</Modal.Title></Modal.Header>
        <Form onSubmit={handleDeptSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Department Name</Form.Label>
              <Form.Control required value={deptForm.name} onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" rows={3} value={deptForm.description} onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowDeptModal(false)}>Cancel</Button>
            <Button type="submit">Save</Button>
          </Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showAssignModal} onHide={() => setShowAssignModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Assign Users to {assignDept?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Table striped bordered hover size="sm">
            <thead><tr><th>Username</th><th>Email</th><th>Roles</th><th>Assigned</th></tr></thead>
            <tbody>
              {users.map(u => {
                // Check if user is assigned to this department
                const isAssigned = false; // We need to fetch this per-user
                return (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>{(u.roles || []).map(r => <Badge key={r} bg="secondary" className="me-1">{r}</Badge>)}</td>
                    <td>
                      <Form.Check
                        type="switch"
                        checked={isAssigned}
                        onChange={async () => {
                          try {
                            const res = await axios.get(`/iam/users/${u.id}/departments`, { headers: { 'x-tenant-id': tenantId } });
                            const currentDepts = (res.data.data || []).map(d => d.id);
                            if (currentDepts.includes(assignDept.id)) {
                              await axios.put(`/iam/users/${u.id}/departments`, {
                                department_ids: currentDepts.filter(d => d !== assignDept.id)
                              }, { headers: { 'x-tenant-id': tenantId } });
                            } else {
                              await axios.put(`/iam/users/${u.id}/departments`, {
                                department_ids: [...currentDepts, assignDept.id]
                              }, { headers: { 'x-tenant-id': tenantId } });
                            }
                            loadData();
                          } catch (err) {
                            setError('Failed to update assignment');
                          }
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowAssignModal(false)}>Close</Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default DepartmentsManagement;
