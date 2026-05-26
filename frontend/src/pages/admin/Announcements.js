import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Modal, Form, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: '', message: '', type: 'info', active: true });

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/announcements');
      setAnnouncements(res.data.announcements || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnnouncements(); }, []);

  const handleSave = async () => {
    if (!form.title.trim() || !form.message.trim()) return;
    setSaving(true);
    try {
      await axios.post('/admin/announcements', form);
      setShowModal(false);
      setForm({ title: '', message: '', type: 'info', active: true });
      fetchAnnouncements();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create announcement');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a) => {
    try {
      await axios.put(`/admin/announcements/${a.id}`, { active: !a.active });
      fetchAnnouncements();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await axios.delete(`/admin/announcements/${id}`);
      fetchAnnouncements();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  const typeColors = { info: 'info', warning: 'warning', danger: 'danger', success: 'success' };

  return (
    <>
      <h4 className="mb-3">📢 Announcements</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{announcements.length}</div><div className="text-muted small">Announcements</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="primary" size="sm" onClick={() => setShowModal(true)}>+ New Announcement</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Title</th><th>Type</th><th>Message</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>{announcements.map(a => (
            <tr key={a.id}>
              <td className="small"><strong>{a.title}</strong></td>
              <td><Badge bg={typeColors[a.type] || 'info'}>{a.type}</Badge></td>
              <td className="small text-muted" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.message}</td>
              <td><Badge bg={a.active ? 'success' : 'secondary'}>{a.active ? 'Active' : 'Dismissed'}</Badge></td>
              <td className="small">{new Date(a.created_at).toLocaleDateString()}</td>
              <td>
                <Button variant={a.active ? 'outline-warning' : 'outline-success'} size="sm" className="me-1" onClick={() => toggleActive(a)}>{a.active ? 'Deactivate' : 'Activate'}</Button>
                <Button variant="outline-danger" size="sm" onClick={() => handleDelete(a.id)}>Delete</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)}>
        <Modal.Header closeButton><Modal.Title>New Announcement</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Title</Form.Label>
              <Form.Control value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Scheduled Maintenance" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Type</Form.Label>
              <Form.Select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="danger">Critical</option>
                <option value="success">Success</option>
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Message</Form.Label>
              <Form.Control as="textarea" rows={4} value={form.message} onChange={e => setForm({...form, message: e.target.value})} />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Create'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default Announcements;
