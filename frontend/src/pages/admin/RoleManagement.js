import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Modal, Form, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

const defaultPermissions = [
  'tenants:read', 'tenants:write', 'users:read', 'users:write',
  'billing:read', 'billing:write', 'audit:read', 'analytics:read',
  'policies:read', 'policies:write', 'health:read', 'settings:read', 'settings:write',
];

function RoleManagement() {
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
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRoles(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', permissions: [], isSystem: false });
    setShowModal(true);
  };

  const openEdit = (role) => {
    setEditing(role);
    setForm({ name: role.name, description: role.description || '', permissions: role.permissions || [], isSystem: role.isSystem || false });
    setShowModal(true);
  };

  const togglePermission = (perm) => {
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(perm) ? prev.permissions.filter(p => p !== perm) : [...prev.permissions, perm],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/admin/roles/${editing.id}`, form);
      } else {
        await axios.post('/admin/roles', form);
      }
      setShowModal(false);
      fetchRoles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await axios.delete(`/admin/roles/${role.id}`);
      fetchRoles();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete role');
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">👤 Role Management (RBAC)</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{roles.length}</div><div className="text-muted small">Custom Roles</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="primary" size="sm" onClick={openCreate}>+ Create Role</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Role</th><th>Description</th><th>Permissions</th><th>Type</th><th>Actions</th></tr></thead>
          <tbody>{roles.map(r => (
            <tr key={r.id}>
              <td className="small"><strong>{r.name}</strong></td>
              <td className="small text-muted">{r.description}</td>
              <td>{r.permissions?.map(p => <Badge key={p} bg="info" className="me-1">{p}</Badge>)}</td>
              <td>{r.isSystem ? <Badge bg="secondary">System</Badge> : <Badge bg="primary">Custom</Badge>}</td>
              <td>
                <Button variant="outline-primary" size="sm" className="me-1" onClick={() => openEdit(r)} disabled={r.isSystem}>Edit</Button>
                <Button variant="outline-danger" size="sm" onClick={() => handleDelete(r)} disabled={r.isSystem}>Delete</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>{editing ? 'Edit Role' : 'Create Role'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Role Name</Form.Label>
              <Form.Control value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="e.g. Security Auditor" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control value={form.description} onChange={e => setForm({...form, description: e.target.value})} as="textarea" rows={2} />
            </Form.Group>
            <Form.Label>Permissions</Form.Label>
            <div style={{ maxHeight: 300, overflowY: 'auto' }} className="border rounded p-3">
              {defaultPermissions.map(p => (
                <Form.Check key={p} type="switch" id={`perm-${p}`} label={p} checked={form.permissions.includes(p)} onChange={() => togglePermission(p)} />
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

export default RoleManagement;
