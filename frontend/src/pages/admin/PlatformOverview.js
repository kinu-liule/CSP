import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Spinner, Alert } from 'react-bootstrap';
import axios from 'axios';

function PlatformOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [mRes, aRes, hRes, tRes] = await Promise.all([
          axios.get('/admin/analytics/overview'),
          axios.get('/admin/audit?limit=10'),
          axios.get('/admin/health'),
          axios.get('/admin/tenants'),
        ]);
        setData({
          overview: mRes.data,
          recentLogs: aRes.data.logs || [],
          health: hRes.data.services || [],
          tenants: tRes.data.tenants || [],
        });
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;
  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!data) return null;

  const healthyCount = data.health.filter(s => s.status === 'healthy').length;
  const unhealthyCount = data.health.length - healthyCount;

  return (
    <>
      <h4 className="mb-3">📊 Platform Overview</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3 border-primary"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{data.overview.totalTenants}</div><div className="text-muted small">Total Tenants</div></Card></Col>
        <Col md={3}><Card className="text-center p-3 border-success"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{data.overview.activeTenants}</div><div className="text-muted small">Active Tenants</div></Card></Col>
        <Col md={3}><Card className="text-center p-3 border-warning"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#eab308' }}>{data.overview.totalRequests?.toLocaleString() || 0}</div><div className="text-muted small">Total Requests</div></Card></Col>
        <Col md={3}><Card className="text-center p-3 border-info"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#06b6d4' }}>{data.overview.availableServices}</div><div className="text-muted small">Available Services</div></Card></Col>
      </Row>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3 border-secondary"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#6b7280' }}>{data.overview.suspendedTenants}</div><div className="text-muted small">Suspended Tenants</div></Card></Col>
        <Col md={3}><Card className="text-center p-3 border-success"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{healthyCount}</div><div className="text-muted small">Healthy Services</div></Card></Col>
        <Col md={3}><Card className="text-center p-3 border-danger"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ef4444' }}>{unhealthyCount}</div><div className="text-muted small">Unhealthy Services</div></Card></Col>
        <Col md={3}><Card className="text-center p-3 border-primary"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{data.tenants.length}</div><div className="text-muted small">Registered Tenants</div></Card></Col>
      </Row>
    </>
  );
}

export default PlatformOverview;
