import React, { useState, useEffect } from 'react';
import { Container, Card, Row, Col, Form, Button, Alert, Badge, Spinner, Table, Modal } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { getSubscriptions, refreshSubscriptions } from '../utils/auth';

const ALL_SERVICES = [
  { key: 'iam', name: 'Identity & Access Management', cat: 'Core Services' },
  { key: 'asset-management', name: 'Asset Management', cat: 'Core Services' },
  { key: 'password-manager', name: 'Password Manager', cat: 'Core Services' },
  { key: 'waf', name: 'Web Application Firewall', cat: 'Network Defense' },
  { key: 'ngfw', name: 'Next-Gen Firewall', cat: 'Network Defense' },
  { key: 'siem-soar', name: 'SIEM & SOAR', cat: 'Security Monitoring' },
  { key: 'vuln-scanner', name: 'Vulnerability Scanner', cat: 'Security Monitoring' },
  { key: 'fraud-detection', name: 'Fraud Detection', cat: 'Security Monitoring' },
  { key: 'edr', name: 'Endpoint Detection & Response', cat: 'Security Monitoring' },
  { key: 'threat-intel', name: 'Threat Intelligence', cat: 'Security Monitoring' },
  { key: 'soar', name: 'Security Orchestration & Response', cat: 'Security Monitoring' },
  { key: 'data-lake', name: 'Security Data Lake', cat: 'Security Monitoring' },
  { key: 'xdr', name: 'Extended Detection & Response', cat: 'Security Monitoring' },
  { key: 'awareness', name: 'Human Risk Awareness', cat: 'Governance & Compliance' },
  { key: 'grc', name: 'Governance, Risk & Compliance', cat: 'Governance & Compliance' },
  { key: 'business-continuity', name: 'Business Continuity', cat: 'Governance & Compliance' },
  { key: 'risk-engine', name: 'Risk Assessment Engine', cat: 'Governance & Compliance' },
  { key: 'data-security', name: 'Data Security', cat: 'Governance & Compliance' },
  { key: 'cspm', name: 'Cloud Security Posture Management', cat: 'Cloud Security' },
  { key: 'devsecops', name: 'DevSecOps', cat: 'DevSecOps' },
  { key: 'deception', name: 'Deception & Honeypot', cat: 'Active Defense' },
];

function ServiceRequests() {
  const [subs, setSubs] = useState([]);
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showRequestModal, setShowRequestModal] = useState(false);

  useEffect(() => {
    refreshSubscriptions().then(() => {
      setSubs(getSubscriptions());
    });
    fetchMyRequests();
  }, []);

  const fetchMyRequests = async () => {
    setFetching(true);
    try {
      const res = await axios.get('/service-requests');
      setRequests(res.data.requests || []);
    } catch { } finally { setFetching(false); }
  };

  const subscribedKeys = subs.map(s => s.service_name);
  const availableServices = ALL_SERVICES.filter(s => !subscribedKeys.includes(s.key) && s.key !== 'iam');
  const grouped = availableServices.reduce((acc, s) => {
    if (!acc[s.cat]) acc[s.cat] = [];
    acc[s.cat].push(s);
    return acc;
  }, {});

  const toggleSelect = (key) => {
    setSelected(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      setError('Please select at least one service');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await axios.post('/service-requests', { services: selected, message });
      setSuccess('Service request submitted successfully! Waiting for admin approval.');
      setSelected([]);
      setMessage('');
      setShowRequestModal(false);
      fetchMyRequests();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
    } finally { setLoading(false); }
  };

  const statusBadge = (status) => {
    const map = { pending: 'warning', approved: 'success', rejected: 'danger' };
    return <Badge bg={map[status] || 'secondary'}>{status}</Badge>;
  };

  return (
    <Container>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">Service Requests</h2>
        <Button variant="primary" onClick={() => setShowRequestModal(true)}>
          Request New Services
        </Button>
      </div>

      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}

      <Card className="mb-4">
        <Card.Body>
          <h5>Your Active Services</h5>
          {subs.length === 0 ? (
            <p className="text-muted mb-0">Loading subscriptions...</p>
          ) : (
            subs.filter(s => s.enabled !== false).map(s => (
              <Badge bg="success" className="me-2 mb-2" style={{ fontSize: '0.9rem' }} key={s.service_name}>
                {ALL_SERVICES.find(a => a.key === s.service_name)?.name || s.service_name}
              </Badge>
            ))
          )}
        </Card.Body>
      </Card>

      <h5 className="mb-3">Your Requests</h5>
      {fetching ? (
        <div className="text-center py-4"><Spinner animation="border" /></div>
      ) : requests.length === 0 ? (
        <Alert variant="info">No service requests yet.</Alert>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Date</th>
              <th>Services</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id}>
                <td className="small">{new Date(req.createdAt || req.created_at).toLocaleDateString()}</td>
                <td>{(req.services || []).map(s => (
                  <Badge bg="info" className="me-1" key={s}>{ALL_SERVICES.find(a => a.key === s)?.name || s}</Badge>
                ))}</td>
                <td>{statusBadge(req.status)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={showRequestModal} onHide={() => setShowRequestModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Request Additional Security Services</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="text-muted">Select the services you want to request. An admin will review and approve your request.</p>
          {Object.entries(grouped).map(([cat, svcs]) => (
            <div key={cat} className="mb-3">
              <h6 className="text-primary mb-2">{cat}</h6>
              <Row xs={1} sm={2} className="g-2">
                {svcs.map(s => (
                  <Col key={s.key}>
                    <div
                      className="p-2 rounded"
                      style={{
                        cursor: 'pointer',
                        border: selected.includes(s.key) ? '2px solid #0d6efd' : '1px solid #dee2e6',
                        background: selected.includes(s.key) ? '#f0f7ff' : '#fff',
                        transition: 'all 0.2s',
                      }}
                      onClick={() => toggleSelect(s.key)}
                    >
                      <Form.Check
                        type="switch"
                        id={`req-${s.key}`}
                        label={s.name}
                        checked={selected.includes(s.key)}
                        readOnly
                      />
                    </div>
                  </Col>
                ))}
              </Row>
            </div>
          ))}
          <Form.Group className="mb-3">
            <Form.Label>Additional Notes (optional)</Form.Label>
            <Form.Control as="textarea" rows={2} value={message} onChange={e => setMessage(e.target.value)} placeholder="Why do you need these services?" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRequestModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={loading || selected.length === 0}>
            {loading ? <><Spinner size="sm" className="me-1" /> Submitting...</> : 'Submit Request'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default ServiceRequests;
