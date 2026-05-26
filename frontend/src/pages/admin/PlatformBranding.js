import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Spinner, Alert, Row, Col } from 'react-bootstrap';
import axios from 'axios';

function PlatformBranding() {
  const [settings, setSettings] = useState({
    tenantId: '', logo: null, logoPreview: '', primaryColor: '#0d6efd', accentColor: '#6610f2',
    companyName: '', domain: '', emailSender: '', supportEmail: '',
  });
  const [tenants, setTenants] = useState([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/admin/tenants').then(r => setTenants(r.data.tenants || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      await axios.put('/admin/branding', {
        tenantId: settings.tenantId || undefined,
        primaryColor: settings.primaryColor,
        accentColor: settings.accentColor,
        companyName: settings.companyName,
        domain: settings.domain,
        emailSender: settings.emailSender,
        supportEmail: settings.supportEmail,
      });
      setMessage('Branding settings saved');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

  return (
    <>
      <h4 className="mb-3">🎨 Branding & White-labeling</h4>
      {message && <Alert variant="success" dismissible onClose={() => setMessage('')}>{message}</Alert>}
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <Card.Body>
          <Form>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Target Tenant</Form.Label>
                  <Form.Select value={settings.tenantId} onChange={e => setSettings({...settings, tenantId: e.target.value})}>
                    <option value="">-- Apply to all tenants --</option>
                    {tenants.map(t => <option key={t.tenant_id} value={t.tenant_id}>{t.name || t.tenant_id}</option>)}
                  </Form.Select>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Company Name</Form.Label>
                  <Form.Control value={settings.companyName} onChange={e => setSettings({...settings, companyName: e.target.value})} placeholder="e.g. Acme Corp" />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Domain</Form.Label>
                  <Form.Control value={settings.domain} onChange={e => setSettings({...settings, domain: e.target.value})} placeholder="e.g. acme.com" />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Email Sender Name</Form.Label>
                  <Form.Control value={settings.emailSender} onChange={e => setSettings({...settings, emailSender: e.target.value})} placeholder="e.g. Acme Security" />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Support Email</Form.Label>
                  <Form.Control value={settings.supportEmail} onChange={e => setSettings({...settings, supportEmail: e.target.value})} placeholder="support@acme.com" />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Primary Color</Form.Label>
                  <div className="d-flex align-items-center gap-2">
                    <input type="color" value={settings.primaryColor} onChange={e => setSettings({...settings, primaryColor: e.target.value})} style={{ width: 50, height: 38 }} />
                    <Form.Control value={settings.primaryColor} onChange={e => setSettings({...settings, primaryColor: e.target.value})} />
                  </div>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Accent Color</Form.Label>
                  <div className="d-flex align-items-center gap-2">
                    <input type="color" value={settings.accentColor} onChange={e => setSettings({...settings, accentColor: e.target.value})} style={{ width: 50, height: 38 }} />
                    <Form.Control value={settings.accentColor} onChange={e => setSettings({...settings, accentColor: e.target.value})} />
                  </div>
                </Form.Group>
                <div className="mt-4 p-3 rounded" style={{ border: `2px solid ${settings.primaryColor}`, background: settings.accentColor + '15' }}>
                  <p className="mb-1"><strong style={{ color: settings.primaryColor }}>Preview</strong></p>
                  <p className="small mb-0 text-muted">This is how branded pages will appear with your colors.</p>
                </div>
              </Col>
            </Row>
            <div className="mt-3">
              <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Branding'}</Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </>
  );
}

export default PlatformBranding;
