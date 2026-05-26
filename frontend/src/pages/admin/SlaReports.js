import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Spinner, Alert, Row, Col, Card, Form } from 'react-bootstrap';
import axios from 'axios';

function SlaReports() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [range, setRange] = useState('7d');

  const fetchSLA = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/sla', { params: { range } });
      setData(res.data.reports || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load SLA reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSLA(); }, [range]);

  if (error) return <Alert variant="danger">{error}</Alert>;

  const avgUptime = data.length ? (data.reduce((s, r) => s + r.uptime, 0) / data.length).toFixed(1) : 0;

  return (
    <>
      <h4 className="mb-3">📊 SLA Reports</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{avgUptime}%</div><div className="text-muted small">Avg Uptime</div></Card></Col>
        <Col md={6}>
          <Card className="p-3">
            <div className="d-flex align-items-center gap-2">
              <Form.Select value={range} onChange={e => setRange(e.target.value)} style={{ maxWidth: 200 }}>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </Form.Select>
              <Button variant="outline-primary" size="sm" onClick={fetchSLA}>↻ Refresh</Button>
            </div>
          </Card>
        </Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Service</th><th>Uptime %</th><th>Response Time</th><th>Incidents</th><th>SLA Status</th></tr></thead>
          <tbody>{data.map((r, i) => (
            <tr key={i}>
              <td className="small"><strong>{r.service}</strong></td>
              <td><span style={{ color: r.uptime >= 99.9 ? '#22c55e' : r.uptime >= 99 ? '#eab308' : '#ef4444', fontWeight: 700 }}>{r.uptime}%</span></td>
              <td className="small">{r.avg_response_time || r.avgResponseTime || '-'}</td>
              <td>{r.incidents || 0}</td>
              <td><Badge bg={r.uptime >= 99.9 ? 'success' : r.uptime >= 99 ? 'warning' : 'danger'}>{r.uptime >= 99.9 ? 'Met' : r.uptime >= 99 ? 'At Risk' : 'Breached'}</Badge></td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </>
  );
}

export default SlaReports;
