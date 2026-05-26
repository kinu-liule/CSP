import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Modal, Spinner, Alert, Form } from 'react-bootstrap';
import axios from 'axios';

const ALL_SERVICES = ['iam','waf','ngfw','siem-soar','vuln-scanner','fraud-detection','awareness','grc','asset-management','cspm','edr','threat-intel','soar','data-security','data-lake','xdr','devsecops','deception','password-manager','business-continuity','risk-engine'];

function PlatformTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const [newPlan, setNewPlan] = useState('');
  const [subModal, setSubModal] = useState(false);
  const [subServices, setSubServices] = useState([]);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/tenants');
      setTenants(res.data.tenants);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTenants(); }, []);

  const openSubModal = async (t) => {
    setSelected(t);
    try {
      const res = await axios.get(`/tenants/${t.tenant_id}/subscriptions`);
      setSubServices((res.data.subscriptions || []).map(s => s.service_name || s));
    } catch {
      setSubServices([]);
    }
    setSubModal(true);
  };

  const toggleSubService = (svc) => {
    setSubServices(prev => prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]);
  };

  const saveSubscriptions = async () => {
    if (!selected) return;
    setActionLoading(true);
    try {
      await axios.put(`/tenants/${selected.tenant_id}/subscriptions`, { services: subServices });
      setSubModal(false);
      setSelected(null);
      fetchTenants();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspend = async (id) => {
    if (!window.confirm('Suspend this tenant? Users will lose access.')) return;
    setActionLoading(true);
    try {
      await axios.put(`/admin/tenants/${id}/suspend`);
      await fetchTenants();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleActivate = async (id) => {
    setActionLoading(true);
    try {
      await axios.put(`/admin/tenants/${id}/activate`);
      await fetchTenants();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePlanChange = async () => {
    if (!selected || !newPlan) return;
    setActionLoading(true);
    try {
      await axios.put(`/admin/tenants/${selected.tenant_id}/plan`, { plan: newPlan });
      setPlanModal(false);
      setSelected(null);
      await fetchTenants();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const statusBadge = (status) => {
    const map = { active: 'success', suspended: 'danger', inactive: 'secondary' };
    return <Badge bg={map[status] || 'secondary'}>{status}</Badge>;
  };

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

  return (
    <>
      <h4 className="mb-3">All Tenants</h4>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>Tenant ID</th>
            <th>Name</th>
            <th>Plan</th>
            <th>Status</th>
            <th>Subscriptions</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tenants.map(t => (
            <tr key={t.tenant_id}>
              <td className="small">{t.tenant_id}</td>
              <td>{t.name}</td>
              <td><Badge bg="info">{t.tier || t.plan || 'free'}</Badge></td>
              <td>{statusBadge(t.status)}</td>
              <td>{t.subscription_count}</td>
              <td className="small">{new Date(t.created_at).toLocaleDateString()}</td>
              <td>
                <Button variant="info" size="sm" className="me-1" onClick={() => setSelected(t)}>View</Button>
                <Button variant="success" size="sm" className="me-1" onClick={() => openSubModal(t)}>Services</Button>
                <Button variant="warning" size="sm" className="me-1" onClick={() => { setSelected(t); setNewPlan(t.tier || 'free'); setPlanModal(true); }}>Plan</Button>
                {t.status === 'active'
                  ? <Button variant="danger" size="sm" onClick={() => handleSuspend(t.tenant_id)} disabled={actionLoading}>Suspend</Button>
                  : <Button variant="success" size="sm" onClick={() => handleActivate(t.tenant_id)} disabled={actionLoading}>Activate</Button>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal show={!!selected && !planModal} onHide={() => setSelected(null)} centered>
        <Modal.Header closeButton><Modal.Title>Tenant Details</Modal.Title></Modal.Header>
        <Modal.Body>
          {selected && (
            <>
              <p><strong>ID:</strong> {selected.tenant_id}</p>
              <p><strong>Name:</strong> {selected.name}</p>
              <p><strong>Plan:</strong> {selected.tier || selected.plan || 'free'}</p>
              <p><strong>Status:</strong> {statusBadge(selected.status)}</p>
              <p><strong>Created:</strong> {new Date(selected.created_at).toLocaleString()}</p>
              <p><strong>Subscriptions:</strong> {selected.subscription_count}</p>
            </>
          )}
        </Modal.Body>
        <Modal.Footer><Button variant="secondary" onClick={() => setSelected(null)}>Close</Button></Modal.Footer>
      </Modal>

      <Modal show={planModal} onHide={() => setPlanModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Change Plan</Modal.Title></Modal.Header>
        <Modal.Body>
          <p>Tenant: <strong>{selected?.name}</strong></p>
          <Form.Select value={newPlan} onChange={e => setNewPlan(e.target.value)}>
            <option value="free">Free</option>
            <option value="professional">Professional ($499/mo)</option>
            <option value="enterprise">Enterprise (Custom)</option>
          </Form.Select>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setPlanModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handlePlanChange} disabled={actionLoading}>
            {actionLoading ? <Spinner size="sm" /> : 'Update Plan'}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={subModal} onHide={() => setSubModal(false)} size="lg" centered>
        <Modal.Header closeButton><Modal.Title>Manage Services - {selected?.name}</Modal.Title></Modal.Header>
        <Modal.Body>
          <p className="text-muted small mb-3">Select the services this organization is subscribed to:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {ALL_SERVICES.map(svc => (
              <Form.Check
                key={svc}
                type="switch"
                id={`svc-${svc}`}
                label={svc}
                checked={subServices.includes(svc)}
                onChange={() => toggleSubService(svc)}
              />
            ))}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setSubModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={saveSubscriptions} disabled={actionLoading}>
            {actionLoading ? <Spinner size="sm" /> : 'Save Services'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default PlatformTenants;
