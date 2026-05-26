import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Table, Spinner, Alert } from 'react-bootstrap';
import axios from 'axios';

function PlatformAnalytics() {
  const [overview, setOverview] = useState(null);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetch = async () => {
      try {
        const [ovRes, svcRes] = await Promise.all([
          axios.get('/admin/analytics/overview'),
          axios.get('/admin/analytics/services')
        ]);
        setOverview(ovRes.data);
        setServices(svcRes.data.services || []);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

  return (
    <>
      <h4 className="mb-3">Platform Analytics</h4>
      <Row className="mb-4">
        <Col md={3} className="mb-3">
          <Card className="text-center border-primary">
            <Card.Body><h3>{overview?.totalTenants}</h3><small className="text-muted">Total Tenants</small></Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card className="text-center border-success">
            <Card.Body><h3>{overview?.activeTenants}</h3><small className="text-muted">Active Tenants</small></Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card className="text-center border-warning">
            <Card.Body><h3>{overview?.suspendedTenants}</h3><small className="text-muted">Suspended</small></Card.Body>
          </Card>
        </Col>
        <Col md={3} className="mb-3">
          <Card className="text-center border-info">
            <Card.Body><h3>{overview?.totalRequests?.toLocaleString()}</h3><small className="text-muted">Total Requests</small></Card.Body>
          </Card>
        </Col>
      </Row>

      <h5 className="mb-3">Service Adoption</h5>
      <Table striped bordered hover>
        <thead>
          <tr><th>Service</th><th>Tenants Using</th><th>Adoption %</th></tr>
        </thead>
        <tbody>
          {services.map(s => (
            <tr key={s.service}>
              <td>{s.service}</td>
              <td>{s.tenantCount}</td>
              <td>
                {overview?.totalTenants > 0
                  ? Math.round((s.tenantCount / overview.totalTenants) * 100) + '%'
                  : '0%'
                }
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

export default PlatformAnalytics;
