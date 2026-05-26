import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Modal, Form, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

function WebhookConfig() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(null);
  const [form, setForm] = useState({ url: '', events: [], description: '', secret: '' });

  const events = ['tenant.created', 'tenant.suspended', 'user.created', 'user.deleted', 'service.requested', 'service.approved', 'payment.received', 'alert.triggered'];

  const fetchWebhooks = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/webhooks');
      setWebhooks(res.data.webhooks || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load webhooks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchWebhooks(); }, []);

  const toggleEvent = (ev) => {
    setForm(prev => ({
      ...prev,
      events: prev.events.includes(ev) ? prev.events.filter(e => e !== ev) : [...prev.events, ev],
    }));
  };

  const handleSave = async () => {
    if (!form.url.trim()) return;
    setSaving(true);
    try {
      await axios.post('/admin/webhooks', form);
      setShowModal(false);
      setForm({ url: '', events: [], description: '', secret: '' });
      fetchWebhooks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save webhook');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this webhook?')) return;
    try {
      await axios.delete(`/admin/webhooks/${id}`);
      fetchWebhooks();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleTest = async (wh) => {
    setTesting(wh.id);
    try {
      await axios.post(`/admin/webhooks/${wh.id}/test`);
      alert('Test webhook sent!');
    } catch (err) {
      alert('Test failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setTesting(null);
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">🔌 Webhook Configuration</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{webhooks.length}</div><div className="text-muted small">Webhooks</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="primary" size="sm" onClick={() => { setForm({ url: '', events: [], description: '', secret: '' }); setShowModal(true); }}>+ Add Webhook</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>URL</th><th>Events</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{webhooks.map(w => (
            <tr key={w.id}>
              <td className="small" style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.url}</td>
              <td>{w.events?.map(e => <Badge key={e} bg="info" className="me-1">{e}</Badge>)}</td>
              <td><Badge bg={w.active !== false ? 'success' : 'secondary'}>{w.active !== false ? 'Active' : 'Disabled'}</Badge></td>
              <td>
                <Button variant="outline-success" size="sm" className="me-1" onClick={() => handleTest(w)} disabled={testing === w.id}>{testing === w.id ? 'Testing...' : 'Test'}</Button>
                <Button variant="outline-danger" size="sm" onClick={() => handleDelete(w.id)}>Delete</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Webhook</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Webhook URL</Form.Label>
              <Form.Control value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="https://hooks.example.com/events" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Secret (for HMAC verification)</Form.Label>
              <Form.Control value={form.secret} onChange={e => setForm({...form, secret: e.target.value})} placeholder="Optional shared secret" />
            </Form.Group>
            <Form.Label>Subscribe to Events</Form.Label>
            <div className="border rounded p-3">
              {events.map(e => <Form.Check key={e} type="switch" id={`ev-${e}`} label={e} checked={form.events.includes(e)} onChange={() => toggleEvent(e)} />)}
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Add Webhook'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default WebhookConfig;
