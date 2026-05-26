import React, { useState, useEffect } from 'react';
import { Container, Table, Badge, Button, Modal, Spinner, Alert, Row, Col, Form } from 'react-bootstrap';
import axios from 'axios';

function ServiceReqManagement() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [filter, setFilter] = useState('pending');

  const fetchRequests = async (status) => {
    setLoading(true);
    setError('');
    try {
      const params = status ? { params: { status } } : {};
      const res = await axios.get('/admin/service-requests', params);
      const filtered = (res.data.requests || []).filter(r =>
        r.tenantId && r.tenantId !== undefined
      );
      setRequests(filtered);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRequests(filter); }, [filter]);

  const handleApprove = async (id) => {
    setActionLoading(true);
    try {
      await axios.put(`/admin/service-requests/${id}/approve`);
      setSelected(null);
      await fetchRequests(filter);
      alert('Service request approved! Services have been activated for the tenant.');
    } catch (err) {
      alert('Failed to approve: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await axios.put(`/admin/service-requests/${selected.id}/reject`, { reason: rejectReason });
      setShowReject(false);
      setSelected(null);
      setRejectReason('');
      await fetchRequests(filter);
    } catch (err) {
      alert('Failed to reject: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const openReject = (req) => {
    setSelected(req);
    setRejectReason('');
    setShowReject(true);
  };

  const statusBadge = (status) => {
    const map = { pending: 'warning', approved: 'success', rejected: 'danger' };
    return <Badge bg={map[status] || 'secondary'}>{status}</Badge>;
  };

  const ALL_SERVICE_NAMES = {
    'iam': 'Identity & Access Management', 'waf': 'Web Application Firewall', 'ngfw': 'Next-Gen Firewall',
    'siem-soar': 'SIEM & SOAR', 'vuln-scanner': 'Vulnerability Scanner', 'fraud-detection': 'Fraud Detection',
    'awareness': 'Human Risk Awareness', 'grc': 'Governance, Risk & Compliance',
    'asset-management': 'Asset Management', 'cspm': 'Cloud Security Posture Management',
    'edr': 'Endpoint Detection & Response', 'threat-intel': 'Threat Intelligence',
    'soar': 'Security Orchestration & Response', 'data-security': 'Data Security',
    'data-lake': 'Security Data Lake', 'xdr': 'Extended Detection & Response',
    'devsecops': 'DevSecOps', 'deception': 'Deception & Honeypot',
    'password-manager': 'Password Manager', 'business-continuity': 'Business Continuity',
    'risk-engine': 'Risk Assessment Engine'
  };

  return (
    <Container>
      <h2 className="mb-4">Service Requests</h2>
      <p className="text-muted mb-3">Tenants request additional security services that need your approval.</p>

      <div className="d-flex gap-2 mb-3">
        {['pending', 'approved', 'rejected', null].map(s => (
          <Button
            key={s || 'all'}
            variant={filter === s ? 'primary' : 'outline-secondary'}
            size="sm"
            onClick={() => setFilter(s)}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
          </Button>
        ))}
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : requests.length === 0 ? (
        <Alert variant="info">No {filter} service requests found.</Alert>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Date</th>
              <th>Tenant</th>
              <th>Tenant ID</th>
              <th>Services Requested</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id}>
                <td className="small">{new Date(req.createdAt || req.created_at).toLocaleDateString()}</td>
                <td>{req.tenantName || req.company_name}</td>
                <td className="small text-muted">{req.tenantId}</td>
                <td>
                  {(req.services || []).map(s => (
                    <Badge bg="info" className="me-1" key={s}>{ALL_SERVICE_NAMES[s] || s}</Badge>
                  ))}
                </td>
                <td>{statusBadge(req.status)}</td>
                <td>
                  <Button variant="info" size="sm" className="me-1" onClick={() => setSelected(req)}>View</Button>
                  {req.status === 'pending' && (
                    <>
                      <Button variant="success" size="sm" className="me-1" onClick={() => { if (window.confirm('Approve this service request?')) handleApprove(req.id); }}>
                        Approve
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => openReject(req)}>Reject</Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal show={!!selected && !showReject} onHide={() => { if (!actionLoading) setSelected(null); }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold">Service Request Details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selected && (
            <>
              <Row>
                <Col md={6} className="mb-2"><strong>Request ID:</strong> {selected.id}</Col>
                <Col md={6} className="mb-2"><strong>Status:</strong> {statusBadge(selected.status)}</Col>
                <Col md={6} className="mb-2"><strong>Tenant:</strong> {selected.tenantName || selected.company_name}</Col>
                <Col md={6} className="mb-2"><strong>Tenant ID:</strong> {selected.tenantId}</Col>
                <Col md={12} className="mb-2"><strong>Submitted:</strong> {new Date(selected.createdAt || selected.created_at).toLocaleString()}</Col>
              </Row>
              <hr />
              <h6>Requested Services</h6>
              <div className="mb-3">
                {(selected.services || []).map(s => (
                  <Badge bg="primary" className="me-2" key={s} style={{ fontSize: '0.9rem' }}>{ALL_SERVICE_NAMES[s] || s}</Badge>
                ))}
                {(!selected.services || selected.services.length === 0) && <span className="text-muted">No services specified</span>}
              </div>
              {selected.message && (
                <>
                  <h6>Notes</h6>
                  <p className="text-muted">{selected.message}</p>
                </>
              )}
              {selected.rejectionReason ? (
                <>
                  <h6 className="text-danger">Rejection Reason</h6>
                  <p className="text-danger">{selected.rejectionReason}</p>
                </>
              ) : null}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          {selected?.status === 'pending' && (
            <>
              <Button variant="danger" onClick={() => openReject(selected)} disabled={actionLoading}>Reject</Button>
              <Button variant="success" onClick={() => handleApprove(selected.id)} disabled={actionLoading}>
                {actionLoading ? <Spinner size="sm" /> : 'Approve & Activate Services'}
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showReject} onHide={() => { if (!actionLoading) setShowReject(false); }} centered>
        <Modal.Header closeButton>
          <Modal.Title>Reject Service Request</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Reason for rejection</Form.Label>
            <Form.Control as="textarea" rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Optional reason..." />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowReject(false)} disabled={actionLoading}>Cancel</Button>
          <Button variant="danger" onClick={handleReject} disabled={actionLoading}>
            {actionLoading ? <Spinner size="sm" /> : 'Confirm Reject'}
          </Button>
        </Modal.Footer>
      </Modal>
    </Container>
  );
}

export default ServiceReqManagement;
