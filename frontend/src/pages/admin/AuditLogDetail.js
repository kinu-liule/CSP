import React, { useState, useEffect } from 'react';
import { Table, Badge, Spinner, Alert, Form, Row, Col, Button, Pagination } from 'react-bootstrap';
import axios from 'axios';

function AuditLogDetail() {
  const [data, setData] = useState({ logs: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [searchTenant, setSearchTenant] = useState('');
  const [searchMethod, setSearchMethod] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = { limit, offset: (page - 1) * limit };
      if (searchTenant) params.tenantId = searchTenant;
      if (searchMethod) params.method = searchMethod;
      const res = await axios.get('/admin/audit/detail', { params });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, [page]);

  const totalPages = Math.ceil(data.total / limit);

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">📄 Audit Log Detail</h4>
      <Row className="mb-3 g-2">
        <Col md={3}><Form.Control placeholder="Filter by Tenant ID" value={searchTenant} onChange={e => setSearchTenant(e.target.value)} /></Col>
        <Col md={2}><Form.Select value={searchMethod} onChange={e => setSearchMethod(e.target.value)}><option value="">All Methods</option><option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option><option value="DELETE">DELETE</option></Form.Select></Col>
        <Col md={2}><Button variant="primary" size="sm" onClick={() => { setPage(1); fetchLogs(); }}>🔍 Search</Button></Col>
        <Col md={2}><Button variant="outline-success" size="sm" onClick={() => { const csv = 'Timestamp,Tenant,Method,Path,Status,Duration\n' + data.logs.map(l => `${l.timestamp},${l.tenant_id},${l.method},${l.path},${l.status_code},${l.response_time}`).join('\n'); const b = new Blob([csv], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'audit_logs.csv'; a.click(); }}>⬇ Export CSV</Button></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <>
          <p className="text-muted small">{data.total} total records</p>
          <Table striped bordered hover responsive size="sm">
            <thead><tr><th>Timestamp</th><th>Tenant</th><th>Method</th><th>Path</th><th>Status</th><th>Duration</th><th>IP</th></tr></thead>
            <tbody>{data.logs.map((l, i) => (
              <tr key={i}>
                <td className="small">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="small">{l.tenant_id || '-'}</td>
                <td><Badge bg={l.method === 'GET' ? 'success' : l.method === 'POST' ? 'primary' : l.method === 'PUT' ? 'warning' : 'danger'}>{l.method}</Badge></td>
                <td className="small">{l.path}</td>
                <td><Badge bg={l.status_code < 300 ? 'success' : l.status_code < 500 ? 'warning' : 'danger'}>{l.status_code}</Badge></td>
                <td className="small">{(l.response_time || 0).toFixed(0)}ms</td>
                <td className="small">{l.ip_address || l.ip || '-'}</td>
              </tr>
            ))}</tbody>
          </Table>
          {totalPages > 1 && (
            <Pagination className="justify-content-center">
              <Pagination.Prev disabled={page <= 1} onClick={() => setPage(p => p - 1)} />
              {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => (
                <Pagination.Item key={i + 1} active={i + 1 === page} onClick={() => setPage(i + 1)}>{i + 1}</Pagination.Item>
              ))}
              <Pagination.Next disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} />
            </Pagination>
          )}
        </>
      )}
    </>
  );
}

export default AuditLogDetail;
