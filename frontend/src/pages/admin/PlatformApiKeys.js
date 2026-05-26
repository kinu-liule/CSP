import React, { useState, useEffect } from 'react';
import { Table, Badge, Spinner, Alert, Row, Col, Card, Button, Modal, Form } from 'react-bootstrap';
import axios from 'axios';

function PlatformApiKeys() {
  const [keys, setKeys] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [genLoading, setGenLoading] = useState(false);
  const [form, setForm] = useState({ tenantId: '', name: '', scopes: ['admin'], expiresInDays: 365 });
  const [genError, setGenError] = useState('');

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/api-keys');
      setKeys(res.data.apiKeys);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const res = await axios.get('/admin/tenants');
      setTenants(res.data.tenants);
    } catch {}
  };

  useEffect(() => { fetchKeys(); fetchTenants(); }, []);

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setActionLoading(true);
    try {
      await axios.delete(`/admin/api-keys/${revokeTarget.id}`);
      setRevokeTarget(null);
      fetchKeys();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setActionLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!form.tenantId) { setGenError('Select a tenant'); return; }
    if (!form.name) { setGenError('Enter a key name'); return; }
    setGenLoading(true);
    setGenError('');
    try {
      const res = await axios.post(`/api/tenants/${form.tenantId}/keys`, {
        name: form.name,
        scopes: form.scopes,
        expiresInDays: form.expiresInDays,
      });
      setGeneratedKey(res.data);
      setShowGenerate(false);
      setShowResult(true);
      fetchKeys();
    } catch (err) {
      setGenError(err.response?.data?.error || 'Failed to generate key');
    } finally {
      setGenLoading(false);
    }
  };

  const scopeOptions = [
    'admin', 'read', 'write', 'tenants:read', 'tenants:write',
    'users:read', 'users:write', 'audit:read', 'analytics:read',
    'policies:read', 'policies:write', 'health:read',
  ];

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">API Keys</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{keys.length}</div><div className="text-muted small">Total Keys</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#22c55e' }}>{keys.filter(k => k.active !== false).length}</div><div className="text-muted small">Active</div></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="success" size="sm" onClick={() => setShowGenerate(true)}>+ Generate Key</Button></Card></Col>
        <Col md={3}><Card className="text-center p-3"><Button variant="outline-primary" size="sm" onClick={fetchKeys}>Refresh</Button></Card></Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Name</th><th>Organization</th><th>Key Prefix</th><th>Scopes</th><th>Status</th><th>Created</th><th>Last Used</th><th>Actions</th></tr></thead>
          <tbody>{keys.length === 0 ? <tr><td colSpan={8} className="text-center text-muted py-4">No API keys found</td></tr> : keys.map(k => (
            <tr key={k.id}>
              <td className="small">{k.name || '-'}</td>
              <td className="small"><Badge bg="secondary">{k.tenant_name}</Badge></td>
              <td><code className="small">{k.key_prefix || '-'}...</code></td>
              <td className="small">{(k.scopes || []).join(', ') || '-'}</td>
              <td>{k.active !== false ? <Badge bg="success">Active</Badge> : <Badge bg="danger">Revoked</Badge>}</td>
              <td className="small">{k.created_at ? new Date(k.created_at).toLocaleDateString() : '-'}</td>
              <td className="small">{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
              <td>{k.active !== false && <Button size="sm" variant="danger" onClick={() => setRevokeTarget(k)} disabled={actionLoading}>Revoke</Button>}</td>
            </tr>
          ))}</tbody>
        </Table>
      )}

      <Modal show={showGenerate} onHide={() => { setShowGenerate(false); setGenError(''); }} centered size="lg">
        <Modal.Header closeButton><Modal.Title>Generate API Key</Modal.Title></Modal.Header>
        <Modal.Body>
          {genError && <Alert variant="danger" className="py-2">{genError}</Alert>}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Tenant <span className="text-danger">*</span></Form.Label>
              <Form.Select value={form.tenantId} onChange={e => setForm({ ...form, tenantId: e.target.value })}>
                <option value="">-- Select Tenant --</option>
                {tenants.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.name} ({t.tenant_id})</option>)}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Key Name <span className="text-danger">*</span></Form.Label>
              <Form.Control type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. production-ci-cd" />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Scopes</Form.Label>
              <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid #dee2e6', borderRadius: 6, padding: 8 }}>
                {scopeOptions.map(s => (
                  <Form.Check key={s} type="checkbox" inline label={s} checked={form.scopes.includes(s)}
                    onChange={e => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, s] : form.scopes.filter(x => x !== s) })} />
                ))}
              </div>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Expires In</Form.Label>
              <Form.Select value={form.expiresInDays} onChange={e => setForm({ ...form, expiresInDays: parseInt(e.target.value) })}>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={180}>180 days</option>
                <option value={365}>1 year</option>
                <option value={0}>Never</option>
              </Form.Select>
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowGenerate(false); setGenError(''); }}>Cancel</Button>
          <Button variant="success" onClick={handleGenerate} disabled={genLoading}>{genLoading ? <Spinner size="sm" /> : 'Generate'}</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showResult} onHide={() => setShowResult(false)} centered>
        <Modal.Header closeButton><Modal.Title className="text-success">API Key Generated</Modal.Title></Modal.Header>
        <Modal.Body>
          <Alert variant="warning" className="py-2">
            Copy this key now. It will not be shown again.
          </Alert>
          <Form.Group>
            <Form.Control as="textarea" rows={3} readOnly value={generatedKey?.key || ''} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
          </Form.Group>
          <div className="mt-2 small text-muted">
            <strong>Name:</strong> {generatedKey?.name}<br />
            <strong>Scopes:</strong> {(generatedKey?.scopes || []).join(', ') || 'none'}<br />
            <strong>ID:</strong> <code>{generatedKey?.id}</code>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={() => { setShowResult(false); setGeneratedKey(null); }}>Done</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={!!revokeTarget} onHide={() => setRevokeTarget(null)} centered>
        <Modal.Header closeButton><Modal.Title className="text-danger">Revoke API Key</Modal.Title></Modal.Header>
        <Modal.Body>Revoke <strong>{revokeTarget?.name || revokeTarget?.key_prefix}</strong> for <strong>{revokeTarget?.tenant_name}</strong>? This cannot be undone.</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setRevokeTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleRevoke} disabled={actionLoading}>{actionLoading ? <Spinner size="sm" /> : 'Revoke'}</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default PlatformApiKeys;
