import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Modal, Form, Spinner, Alert, Row, Col, Card } from 'react-bootstrap';
import axios from 'axios';

function SsoConfig() {
  const [providers, setProviders] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ tenantId: '', provider: 'saml', label: '', entityId: '', ssoUrl: '', certificate: '', enabled: true });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [pRes, tRes] = await Promise.all([
        axios.get('/admin/sso'),
        axios.get('/admin/tenants'),
      ]);
      setProviders(pRes.data.providers || []);
      setTenants(tRes.data.tenants || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load SSO configs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openEdit = (p) => {
    setEditing(p);
    setForm({ tenantId: p.tenant_id, provider: p.provider, label: p.label, entityId: p.entity_id, ssoUrl: p.sso_url, certificate: p.certificate, enabled: p.enabled });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.tenantId || !form.entityId || !form.ssoUrl) return;
    setSaving(true);
    try {
      if (editing) {
        await axios.put(`/admin/sso/${editing.id}`, form);
      } else {
        await axios.post('/admin/sso', form);
      }
      setShowModal(false);
      setEditing(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this SSO provider?')) return;
    try {
      await axios.delete(`/admin/sso/${id}`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const toggleEnabled = async (p) => {
    try {
      await axios.put(`/admin/sso/${p.id}`, { enabled: !p.enabled });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update');
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">🔐 SSO / Identity Providers</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{providers.length}</div><div className="text-muted small">Providers</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="primary" size="sm" onClick={() => { setEditing(null); setForm({ tenantId: '', provider: 'saml', label: '', entityId: '', ssoUrl: '', certificate: '', enabled: true }); setShowModal(true); }}>+ Add Provider</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Tenant</th><th>Provider</th><th>Label</th><th>Entity ID</th><th>SSO URL</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{providers.map(p => (
            <tr key={p.id}>
              <td className="small">{p.tenant_name || p.tenant_id}</td>
              <td><Badge bg="primary">{p.provider?.toUpperCase()}</Badge></td>
              <td className="small">{p.label}</td>
              <td className="small" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.entity_id}</td>
              <td className="small" style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.sso_url}</td>
              <td><Badge bg={p.enabled ? 'success' : 'secondary'}>{p.enabled ? 'Enabled' : 'Disabled'}</Badge></td>
              <td>
                <Button variant="outline-primary" size="sm" className="me-1" onClick={() => openEdit(p)}>Edit</Button>
                <Button variant={p.enabled ? 'outline-warning' : 'outline-success'} size="sm" className="me-1" onClick={() => toggleEnabled(p)}>{p.enabled ? 'Disable' : 'Enable'}</Button>
                <Button variant="outline-danger" size="sm" onClick={() => handleDelete(p.id)}>Delete</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton><Modal.Title>{editing ? 'Edit Provider' : 'Add SSO Provider'}</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Tenant</Form.Label>
                  <Form.Select value={form.tenantId} onChange={e => setForm({...form, tenantId: e.target.value})} disabled={!!editing}>
                    <option value="">Select tenant</option>
                    {tenants.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.name || t.tenant_id}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Provider Type</Form.Label>
                  <Form.Select value={form.provider} onChange={e => setForm({...form, provider: e.target.value})}>
                    <option value="saml">SAML 2.0</option>
                    <option value="oidc">OpenID Connect</option>
                    <option value="oauth2">OAuth 2.0</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Label</Form.Label>
              <Form.Control value={form.label} onChange={e => setForm({...form, label: e.target.value})} placeholder="e.g. Corporate AD" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Entity ID / Client ID</Form.Label>
              <Form.Control value={form.entityId} onChange={e => setForm({...form, entityId: e.target.value})} placeholder="https://idp.example.com/entity" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>SSO URL / Authorization Endpoint</Form.Label>
              <Form.Control value={form.ssoUrl} onChange={e => setForm({...form, ssoUrl: e.target.value})} placeholder="https://idp.example.com/sso" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Certificate / Secret (optional)</Form.Label>
              <Form.Control as="textarea" rows={3} value={form.certificate} onChange={e => setForm({...form, certificate: e.target.value})} placeholder="Paste certificate or client secret" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Provider'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default SsoConfig;
