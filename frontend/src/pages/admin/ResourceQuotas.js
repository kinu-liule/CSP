import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Modal, Form, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

function ResourceQuotas() {
  const [quotas, setQuotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState({ tenantId: '', maxUsers: 10, maxServices: 3, storageGB: 5, rateLimitRPM: 100 });

  const fetchQuotas = async () => {
    setLoading(true);
    try {
      const [qRes, tRes] = await Promise.all([
        axios.get('/admin/quotas'),
        axios.get('/admin/tenants'),
      ]);
      setQuotas(qRes.data.quotas || []);
      setTenants(tRes.data.tenants || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load quotas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchQuotas(); }, []);

  const openEdit = (q) => {
    setEditing(q);
    setForm({ tenantId: q.tenant_id, maxUsers: q.max_users, maxServices: q.max_services, storageGB: q.storage_gb, rateLimitRPM: q.rate_limit_rpm });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.tenantId) return;
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/admin/quotas/${editing.id}`, form);
      } else {
        await axios.post('/admin/quotas', form);
      }
      setShowModal(false);
      setEditing(null);
      fetchQuotas();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save quota');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">📦 Resource Quotas</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><Button variant="primary" size="sm" onClick={() => { setEditing(null); setForm({ tenantId: '', maxUsers: 10, maxServices: 3, storageGB: 5, rateLimitRPM: 100 }); setShowModal(true); }}>+ Set Quota</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Tenant</th><th>Max Users</th><th>Max Services</th><th>Storage (GB)</th><th>Rate Limit (RPM)</th><th>Actions</th></tr></thead>
          <tbody>{quotas.map(q => (
            <tr key={q.id}>
              <td className="small">{q.tenant_name || q.tenant_id}</td>
              <td><Badge bg={q.max_users > 0 ? 'info' : 'secondary'}>{q.max_users}</Badge></td>
              <td>{q.max_services}</td>
              <td>{q.storage_gb}</td>
              <td>{q.rate_limit_rpm}</td>
              <td><Button variant="outline-primary" size="sm" onClick={() => openEdit(q)}>Edit</Button></td>
            </tr>
          ))}</tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editing ? 'Edit Quota' : 'Set Quota'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Tenant</Form.Label>
              <Form.Select value={form.tenantId} onChange={e => setForm({...form, tenantId: e.target.value})} disabled={!!editing}>
                <option value="">Select tenant</option>
                {tenants.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.name || t.tenant_id}</option>)}
              </Form.Select>
            </Form.Group>
            <Row className="g-3">
              <Col md={6}><Form.Group><Form.Label>Max Users</Form.Label><Form.Control type="number" value={form.maxUsers} onChange={e => setForm({...form, maxUsers: parseInt(e.target.value) || 0})} /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Max Services</Form.Label><Form.Control type="number" value={form.maxServices} onChange={e => setForm({...form, maxServices: parseInt(e.target.value) || 0})} /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Storage (GB)</Form.Label><Form.Control type="number" value={form.storageGB} onChange={e => setForm({...form, storageGB: parseInt(e.target.value) || 0})} /></Form.Group></Col>
              <Col md={6}><Form.Group><Form.Label>Rate Limit (RPM)</Form.Label><Form.Control type="number" value={form.rateLimitRPM} onChange={e => setForm({...form, rateLimitRPM: parseInt(e.target.value) || 0})} /></Form.Group></Col>
            </Row>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Quota'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default ResourceQuotas;
