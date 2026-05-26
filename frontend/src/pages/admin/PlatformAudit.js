import React, { useState, useEffect } from 'react';
import { Table, Badge, Spinner, Alert, Form, Row, Col } from 'react-bootstrap';
import axios from 'axios';

function PlatformAudit() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [total, setTotal] = useState(0);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter) params.tenantId = filter;
      const res = await axios.get('/admin/audit', { params });
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [filter]);

  const statusColor = (code) => {
    if (code >= 500) return 'danger';
    if (code >= 400) return 'warning';
    if (code >= 300) return 'info';
    return 'success';
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">Platform Audit Logs</h4>
      <Row className="mb-3">
        <Col md={4}>
          <Form.Control
            placeholder="Filter by Tenant ID..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
        </Col>
        <Col md={4}>
          <span className="text-muted">{total} total entries</span>
        </Col>
      </Row>
      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : logs.length === 0 ? (
        <Alert variant="info">No audit logs found{filter ? ' for this tenant' : ''}.</Alert>
      ) : (
        <Table striped bordered hover responsive size="sm">
          <thead>
            <tr>
              <th>Time</th>
              <th>Tenant</th>
              <th>Method</th>
              <th>Path</th>
              <th>Status</th>
              <th>Response Time</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={log.id || i}>
                <td className="small">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="small">{log.tenant_id || '-'}</td>
                <td><Badge bg="secondary">{log.method}</Badge></td>
                <td className="small">{log.path}</td>
                <td><Badge bg={statusColor(log.status_code)}>{log.status_code}</Badge></td>
                <td className="small">{log.response_time ? `${log.response_time}ms` : '-'}</td>
                <td className="small">{log.ip_address || '-'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}

export default PlatformAudit;
