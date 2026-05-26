import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Spinner, Alert, Row, Col, Table, Badge } from 'react-bootstrap';
import axios from 'axios';

function TenantImpersonation() {
  const [tenants, setTenants] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [impersonating, setImpersonating] = useState(false);
  const [result, setResult] = useState(null);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    axios.get('/admin/tenants').then(r => setTenants(r.data.tenants || [])).catch(() => {}).finally(() => setLoading(false));
    axios.get('/admin/impersonation-logs').then(r => setLogs(r.data.logs || [])).catch(() => {});
  }, []);

  const loadUsers = async (tenantId) => {
    setSelectedTenant(tenantId);
    setSelectedUser('');
    if (!tenantId) { setUsers([]); return; }
    try {
      const res = await axios.get('/admin/users', { params: { tenantId } });
      setUsers(res.data.users || []);
    } catch { setUsers([]); }
  };

  const handleImpersonate = async () => {
    if (!selectedTenant || !selectedUser) return;
    setImpersonating(true);
    setResult(null);
    try {
      const res = await axios.post('/admin/impersonate', { tenantId: selectedTenant, userId: selectedUser });
      setResult({ success: true, token: res.data.token, message: 'Impersonation token generated. Use it to log in as this user.' });
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.error || 'Impersonation failed' });
    } finally {
      setImpersonating(false);
    }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">⭐ Tenant Impersonation</h4>
      {result && (
        <Alert variant={result.success ? 'success' : 'danger'} dismissible onClose={() => setResult(null)}>
          {result.success ? (
            <><strong>Success!</strong><br /><small className="text-muted" style={{ wordBreak: 'break-all' }}>Token: {result.token}</small></>
          ) : result.error}
        </Alert>
      )}
      <Card className="mb-4">
        <Card.Body>
          <Row className="g-3">
            <Col md={4}>
              <Form.Label>Target Tenant</Form.Label>
              <Form.Select value={selectedTenant} onChange={e => loadUsers(e.target.value)}>
                <option value="">Select tenant</option>
                {tenants.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.name || t.tenant_id}</option>)}
              </Form.Select>
            </Col>
            <Col md={4}>
              <Form.Label>Impersonate User</Form.Label>
              <Form.Select value={selectedUser} onChange={e => setSelectedUser(e.target.value)} disabled={!selectedTenant}>
                <option value="">Select user</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username} ({u.email})</option>)}
              </Form.Select>
            </Col>
            <Col md={4} className="d-flex align-items-end">
              <Button variant="warning" onClick={handleImpersonate} disabled={!selectedTenant || !selectedUser || impersonating}>
                {impersonating ? 'Generating...' : '⭐ Impersonate'}
              </Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      {logs.length > 0 && (
        <>
          <h5 className="mb-3">Impersonation Log</h5>
          <Table striped bordered hover responsive size="sm">
            <thead><tr><th>Timestamp</th><th>Admin</th><th>Target Tenant</th><th>Target User</th><th>Status</th></tr></thead>
            <tbody>{logs.map((l, i) => (
              <tr key={i}>
                <td className="small">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="small">{l.admin_id || '-'}</td>
                <td className="small">{l.target_tenant}</td>
                <td className="small">{l.target_user}</td>
                <td><Badge bg={l.success ? 'success' : 'danger'}>{l.success ? 'Success' : 'Failed'}</Badge></td>
              </tr>
            ))}</tbody>
          </Table>
        </>
      )}
    </>
  );
}

export default TenantImpersonation;
