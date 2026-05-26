import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Badge, Spinner, Alert } from 'react-bootstrap';
import axios from 'axios';

const STATUS_COLORS = { healthy: 'success', unhealthy: 'danger', timeout: 'warning' };

function PlatformHealth() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [timestamp, setTimestamp] = useState('');

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/health');
      setServices(res.data.services || []);
      setTimestamp(res.data.timestamp);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load health status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchHealth(); }, []);

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">System Health</h4>
        <div>
          {timestamp && <small className="text-muted me-2">Last checked: {new Date(timestamp).toLocaleTimeString()}</small>}
          <button className="btn btn-outline-primary btn-sm" onClick={fetchHealth} disabled={loading}>
            {loading ? <Spinner size="sm" /> : 'Refresh'}
          </button>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : (
        <Row>
          {services.map(svc => (
            <Col md={4} key={svc.name} className="mb-3">
              <Card className={`h-100 border-${STATUS_COLORS[svc.status] || 'secondary'}`}>
                <Card.Body>
                  <div className="d-flex justify-content-between align-items-center">
                    <Card.Title className="mb-0">{svc.name}</Card.Title>
                    <Badge bg={STATUS_COLORS[svc.status] || 'secondary'}>{svc.status}</Badge>
                  </div>
                  {svc.details && (
                    <small className="text-muted d-block mt-2">
                      {svc.details.service && <span>Service: {svc.details.service}<br /></span>}
                      {svc.details.status && <span>Status: {svc.details.status}</span>}
                    </small>
                  )}
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </>
  );
}

export default PlatformHealth;
