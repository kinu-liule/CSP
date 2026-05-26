import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

function SessionManagement() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/sessions');
      setSessions(res.data.sessions || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  const terminateSession = async (sessionId) => {
    if (!window.confirm('Terminate this session?')) return;
    try {
      await axios.delete(`/admin/sessions/${sessionId}`);
      fetchSessions();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to terminate session');
    }
  };

  const terminateAll = async () => {
    if (!window.confirm('Terminate ALL active sessions?')) return;
    try {
      await axios.delete('/admin/sessions');
      fetchSessions();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to terminate sessions');
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  const activeSessions = sessions.filter(s => s.status === 'active');

  return (
    <>
      <h4 className="mb-3">🔄 Session Management</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{sessions.length}</div><div className="text-muted small">Total Sessions</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{activeSessions.length}</div><div className="text-muted small">Active</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="outline-danger" size="sm" onClick={terminateAll}>🔴 Terminate All</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>User</th><th>Tenant</th><th>IP</th><th>Created</th><th>Last Active</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{sessions.map(s => (
            <tr key={s.id}>
              <td className="small">{s.username || s.user_id || '-'}</td>
              <td className="small">{s.tenant_id || '-'}</td>
              <td className="small"><code>{s.ip_address || s.ip || '-'}</code></td>
              <td className="small">{new Date(s.created_at).toLocaleString()}</td>
              <td className="small">{s.last_active ? new Date(s.last_active).toLocaleString() : '-'}</td>
              <td><Badge bg={s.status === 'active' ? 'success' : 'secondary'}>{s.status}</Badge></td>
              <td>
                <Button variant="outline-danger" size="sm" onClick={() => terminateSession(s.id)} disabled={s.status !== 'active'}>Terminate</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </>
  );
}

export default SessionManagement;
