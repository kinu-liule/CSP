import React, { useState, useEffect } from 'react';
import { Table, Badge, Spinner, Alert, Row, Col, Card, Button } from 'react-bootstrap';
import axios from 'axios';

function PlatformBilling() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/billing');
      setData(res.data.overview);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const totalBilled = data.reduce((s, t) => s + t.total_billed, 0);
  const paidTenants = data.filter(t => t.invoices.some(i => i.status === 'paid')).length;

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">💰 Billing & Usage</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>${totalBilled}</div><div className="text-muted small">Total Billed</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{data.length}</div><div className="text-muted small">Tenants</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#a855f7' }}>{paidTenants}</div><div className="text-muted small">Active Subscriptions</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="outline-primary" size="sm" onClick={fetchData}>↻ Refresh</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Tenant</th><th>Plan</th><th>Status</th><th>Requests</th><th>Invoices</th><th>Total Billed</th></tr></thead>
          <tbody>{data.map(t => (
            <tr key={t.tenant_id}>
              <td className="small">{t.tenant_name}</td>
              <td><Badge bg={t.plan === 'enterprise' ? 'warning' : t.plan === 'professional' ? 'info' : 'secondary'}>{t.plan}</Badge></td>
              <td>{t.status === 'active' ? <Badge bg="success">Active</Badge> : <Badge bg="danger">{t.status}</Badge>}</td>
              <td>{t.request_count.toLocaleString()}</td>
              <td className="small">{t.invoices.map((i, idx) => <div key={idx}>${i.amount} - <Badge bg={i.status === 'paid' ? 'success' : 'warning'}>{i.status}</Badge></div>)}</td>
              <td className="small"><strong>${t.total_billed}</strong></td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </>
  );
}

export default PlatformBilling;
