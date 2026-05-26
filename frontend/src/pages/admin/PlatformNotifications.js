import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import axios from 'axios';

function PlatformNotifications() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState({ title: '', message: '', target: 'all', targetTenantId: '' });

  const fetchHistory = async () => {
    try {
      const res = await axios.get('/admin/notifications');
      setHistory(res.data.history);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchHistory(); }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setError('');
    setSuccess('');
    try {
      await axios.post('/admin/notifications', form);
      setSuccess('Notification sent!');
      setForm({ title: '', message: '', target: 'all', targetTenantId: '' });
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <h4 className="mb-3">📢 System Notifications</h4>
      <Row className="g-4">
        <Col md={5}>
          <Card>
            <Card.Body>
              <h6 className="mb-3">Send Notification</h6>
              {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
              {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}
              <Form onSubmit={handleSend}>
                <Form.Group className="mb-3">
                  <Form.Label>Title *</Form.Label>
                  <Form.Control value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required placeholder="e.g. Scheduled Maintenance" />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Message *</Form.Label>
                  <Form.Control as="textarea" rows={4} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} required placeholder="Notification details..." />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Target</Form.Label>
                  <Form.Select value={form.target} onChange={e => setForm({ ...form, target: e.target.value })}>
                    <option value="all">All Organizations</option>
                    <option value="tenant">Specific Organization</option>
                  </Form.Select>
                </Form.Group>
                {form.target === 'tenant' && (
                  <Form.Group className="mb-3">
                    <Form.Label>Tenant ID</Form.Label>
                    <Form.Control value={form.targetTenantId} onChange={e => setForm({ ...form, targetTenantId: e.target.value })} placeholder="tenant_..." />
                  </Form.Group>
                )}
                <Button variant="primary" type="submit" disabled={sending} className="w-100">
                  {sending ? <><Spinner size="sm" className="me-1" />Sending...</> : '📢 Send Notification'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        <Col md={7}>
          <h6 className="mb-3">Notification History</h6>
          {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
            <Table striped bordered hover responsive size="sm">
              <thead><tr><th>Date</th><th>Title</th><th>Target</th><th>Message</th></tr></thead>
              <tbody>{history.length === 0 ? <tr><td colSpan={4} className="text-center text-muted py-4">No notifications sent yet</td></tr> : history.map(n => (
                <tr key={n.id}>
                  <td className="small" style={{ whiteSpace: 'nowrap' }}>{new Date(n.created_at).toLocaleString()}</td>
                  <td className="small"><strong>{n.title}</strong></td>
                  <td><Badge bg={n.target === 'all' ? 'primary' : 'secondary'}>{n.target === 'all' ? 'All Orgs' : n.targetTenantId}</Badge></td>
                  <td className="small" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </Col>
      </Row>
    </>
  );
}

export default PlatformNotifications;
