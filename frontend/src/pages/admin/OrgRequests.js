import React, { useState, useEffect } from 'react';
import { Container, Table, Badge, Button, Modal, Spinner, Alert, Row, Col, Form } from 'react-bootstrap';
import axios from 'axios';

function OrgRequests() {
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
      const res = await axios.get('/admin/requests', params);
      setRequests(res.data.requests);
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
      const res = await axios.put(`/admin/requests/${id}/approve`);
      setSelected(null);
      await fetchRequests(filter);
      alert(`Organization approved!\n\nTenant ID: ${res.data.tenantId}\nAdmin Username: ${res.data.adminUsername}\nTemporary Password: ${res.data.tempPassword}\n\nShare these credentials with the organization contact.`);
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
      await axios.put(`/admin/requests/${selected.id}/reject`, { reason: rejectReason });
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

  return (
    <Container>
      <h2 className="mb-4">Organization Requests</h2>

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
        <Alert variant="info">No {filter} requests found.</Alert>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Date</th>
              <th>Company</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Services</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => (
              <tr key={req.id}>
                <td className="small">{new Date(req.createdAt || req.created_at).toLocaleDateString()}</td>
                <td>{req.companyname || req.company_name}</td>
                <td>{req.contactname || req.contact_name}</td>
                <td className="small">{req.contactemail || req.contact_email}</td>
                <td>
                  {(req.services || []).slice(0, 3).map(s => (
                    <Badge bg="info" className="me-1" key={s}>{s}</Badge>
                  ))}
                  {(req.services || []).length > 3 && <Badge bg="secondary">+{req.services.length - 3}</Badge>}
                </td>
                <td>{statusBadge(req.status)}</td>
                <td>
                  <Button variant="info" size="sm" className="me-1" onClick={() => setSelected(req)}>View</Button>
                  {req.status === 'pending' && (
                    <>
                      <Button variant="success" size="sm" className="me-1" onClick={() => { if (window.confirm('Approve this organization? A tenant and admin account will be created.')) handleApprove(req.id); }}>
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

      {/* View Detail Modal */}
      <Modal show={!!selected && !showReject} onHide={() => { if (!actionLoading) setSelected(null); }} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title className="fw-bold">{selected?.companyname || selected?.company_name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selected && (
            <>
              <h6 className="text-muted mb-3">Request #{selected.id}</h6>
              <Row>
                <Col md={6} className="mb-2"><strong>Company:</strong> {selected.companyname || selected.company_name}</Col>
                <Col md={6} className="mb-2"><strong>Domain:</strong> {selected.domain || '-'}</Col>
                <Col md={6} className="mb-2"><strong>Contact:</strong> {selected.contactname || selected.contact_name}</Col>
                <Col md={6} className="mb-2"><strong>Email:</strong> {selected.contactemail || selected.contact_email}</Col>
                <Col md={6} className="mb-2"><strong>Phone:</strong> {selected.phone || '-'}</Col>
                <Col md={6} className="mb-2"><strong>Status:</strong> {statusBadge(selected.status)}</Col>
                <Col md={12} className="mb-2"><strong>Submitted:</strong> {new Date(selected.createdAt || selected.created_at).toLocaleString()}</Col>
              </Row>
              <hr />
              <h6>Requested Services</h6>
              <div className="mb-3">
                {(selected.services || []).map(s => (
                  <Badge bg="primary" className="me-2" key={s} style={{ fontSize: '0.9rem' }}>{s}</Badge>
                ))}
                {(!selected.services || selected.services.length === 0) && <span className="text-muted">No specific services requested</span>}
              </div>
              {(selected.message || selected.message_notes) && (
                <>
                  <h6>Additional Notes</h6>
                  <p className="text-muted">{selected.message || selected.message_notes}</p>
                </>
              )}
              {selected.rejectionreason || selected.rejection_reason ? (
                <>
                  <h6 className="text-danger">Rejection Reason</h6>
                  <p className="text-danger">{selected.rejectionreason || selected.rejection_reason}</p>
                </>
              ) : null}
              {selected.tenantid || selected.tenant_id ? (
                <>
                  <hr />
                  <h6>Provisioned Tenant</h6>
                  <p><strong>Tenant ID:</strong> {selected.tenantid || selected.tenant_id}</p>
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
                {actionLoading ? <Spinner size="sm" /> : 'Approve & Create Organization'}
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
        </Modal.Footer>
      </Modal>

      {/* Reject Modal */}
      <Modal show={showReject} onHide={() => { if (!actionLoading) setShowReject(false); }} centered>
        <Modal.Header closeButton>
          <Modal.Title>Reject Request</Modal.Title>
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

export default OrgRequests;
