import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Modal, Form, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

function IpAllowBlock() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ip: '', type: 'allow', description: '' });

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/ip-rules');
      setRules(res.data.rules || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load IP rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleSave = async () => {
    if (!form.ip.trim()) return;
    setSaving(true);
    try {
      await axios.post('/admin/ip-rules', form);
      setShowModal(false);
      setForm({ ip: '', type: 'allow', description: '' });
      fetchRules();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add rule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this IP rule?')) return;
    try {
      await axios.delete(`/admin/ip-rules/${id}`);
      fetchRules();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">🛡️ IP Allow/Block List</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{rules.filter(r => r.type === 'allow').length}</div><div className="text-muted small">Allowed</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ef4444' }}>{rules.filter(r => r.type === 'block').length}</div><div className="text-muted small">Blocked</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="primary" size="sm" onClick={() => { setForm({ ip: '', type: 'allow', description: '' }); setShowModal(true); }}>+ Add Rule</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>IP/CIDR</th><th>Type</th><th>Description</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>{rules.map(r => (
            <tr key={r.id}>
              <td className="small"><code>{r.ip}</code></td>
              <td><Badge bg={r.type === 'allow' ? 'success' : 'danger'}>{r.type === 'allow' ? 'Allow' : 'Block'}</Badge></td>
              <td className="small text-muted">{r.description}</td>
              <td className="small">{new Date(r.created_at).toLocaleDateString()}</td>
              <td><Button variant="outline-danger" size="sm" onClick={() => handleDelete(r.id)}>Remove</Button></td>
            </tr>
          ))}</tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add IP Rule</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>IP Address / CIDR</Form.Label>
              <Form.Control value={form.ip} onChange={e => setForm({...form, ip: e.target.value})} placeholder="192.168.1.0/24 or 10.0.0.1" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Type</Form.Label>
              <Form.Select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="allow">Allow</option>
                <option value="block">Block</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="Corporate office range" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Add Rule'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default IpAllowBlock;
