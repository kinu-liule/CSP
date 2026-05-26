import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Form, Badge, Alert, ButtonGroup, Button } from 'react-bootstrap';
import axios from 'axios';

function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadLogs(); }, [page]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`/iam/audit/logs?limit=${pageSize}&offset=${page * pageSize}`, {
        headers: { 'x-tenant-id': tenantId }
      });
      setLogs(res.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(l => {
    const matchesSearch = !filter || l.username?.toLowerCase().includes(filter.toLowerCase()) || l.action?.toLowerCase().includes(filter.toLowerCase());
    const matchesAction = !actionFilter || l.action === actionFilter;
    return matchesSearch && matchesAction;
  });

  const actions = [...new Set(logs.map(l => l.action).filter(Boolean))];

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Audit Logs</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Card className="mb-4">
        <Card.Body>
          <Row>
            <Col md={6}>
              <Form.Group>
                <Form.Label>Search</Form.Label>
                <Form.Control
                  placeholder="Search by username or action..."
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group>
                <Form.Label>Action Type</Form.Label>
                <Form.Select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
                  <option value="">All Actions</option>
                  {actions.map(a => <option key={a} value={a}>{a}</option>)}
                </Form.Select>
              </Form.Group>
            </Col>
            <Col md={2} className="d-flex align-items-end">
              <Button variant="outline-secondary" onClick={() => { setFilter(''); setActionFilter(''); }}>Clear</Button>
            </Col>
          </Row>
        </Card.Body>
      </Card>

      <Table striped bordered hover responsive size="sm">
        <thead>
          <tr><th>Time</th><th>User</th><th>Action</th><th>Details</th><th>IP Address</th></tr>
        </thead>
        <tbody>
          {filteredLogs.length === 0 ? (
            <tr><td colSpan={5} className="text-center text-muted">No audit logs found</td></tr>
          ) : (
            filteredLogs.map(l => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{l.created_at ? new Date(l.created_at).toLocaleString() : '-'}</td>
                <td>{l.username || l.user_id || '-'}</td>
                <td><Badge bg="secondary">{l.action}</Badge></td>
                <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {typeof l.details === 'object' ? JSON.stringify(l.details) : l.details || '-'}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{l.ip_address || '-'}</td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <div className="d-flex justify-content-center">
        <ButtonGroup>
          <Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <Button variant="outline-secondary" disabled>Page {page + 1}</Button>
          <Button onClick={() => setPage(p => p + 1)}>Next</Button>
        </ButtonGroup>
      </div>
    </Container>
  );
}

export default AuditLogs;
