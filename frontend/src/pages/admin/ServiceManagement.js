import React, { useState, useEffect } from 'react';
import { Table, Badge, Spinner, Alert, Button, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

function ServiceManagement() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchServices = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/analytics/services');
      setServices(res.data.services || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchServices(); }, []);

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">⚙️ Service Management</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{services.length}</div><div className="text-muted small">Total Services</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="outline-primary" size="sm" onClick={fetchServices}>↻ Refresh</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Service Name</th><th>Adoption</th><th>Status</th></tr></thead>
          <tbody>{services.map(s => (
            <tr key={s.service}>
              <td className="small">{s.service}</td>
              <td><Badge bg="info">{s.tenantCount} tenants</Badge></td>
              <td><Badge bg={s.tenantCount > 0 ? 'success' : 'secondary'}>{s.tenantCount > 0 ? 'Active' : 'No Adoption'}</Badge></td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </>
  );
}

export default ServiceManagement;
