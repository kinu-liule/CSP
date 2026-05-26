import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Badge, Table } from 'react-bootstrap';
import axios from 'axios';
import { setSubscriptions as cacheSubs } from '../../utils/auth';

const SERVICE_CATEGORIES = {
  core: { label: 'Core Services', color: 'primary', services: ['iam', 'asset-management', 'password-manager'] },
  network: { label: 'Network Defense', color: 'danger', services: ['waf', 'ngfw'] },
  monitoring: { label: 'Security Monitoring', color: 'info', services: ['siem-soar', 'vuln-scanner', 'fraud-detection', 'edr', 'threat-intel', 'soar', 'data-lake', 'xdr'] },
  compliance: { label: 'Governance & Compliance', color: 'warning', services: ['awareness', 'grc', 'business-continuity', 'risk-engine', 'data-security'] },
  cloud: { label: 'Cloud Security', color: 'secondary', services: ['cspm'] },
  devops: { label: 'DevSecOps', color: 'dark', services: ['devsecops'] },
  defense: { label: 'Active Defense', color: 'danger', services: ['deception'] },
};

const SERVICE_NAMES = {
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

function TenantSettings() {
  const [tenants, setTenants] = useState([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [subSaving, setSubSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ name: '', domain: '', tier: 'basic', settings: '' });
  const [subscriptions, setSubscriptions] = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [tab, setTab] = useState('settings');

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => {
    loadTenants();
    setSelectedTenant(tenantId);
  }, []);

  useEffect(() => {
    if (selectedTenant) { loadTenantDetail(); loadSubscriptions(); }
  }, [selectedTenant]);

  const loadTenants = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/tenants');
      setTenants(res.data.tenants || []);
    } catch (err) {
      setError('Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  const loadTenantDetail = async () => {
    try {
      setLoading(true);
      const res = await axios.get('/tenants');
      const tenant = (res.data.tenants || []).find(t => t.tenant_id === selectedTenant);
      if (tenant) {
        setForm({
          name: tenant.name || '',
          domain: tenant.domain || '',
          tier: tenant.tier || 'basic',
          settings: tenant.settings ? JSON.stringify(tenant.settings, null, 2) : '{}'
        });
      }
    } catch (err) {
      setError('Failed to load tenant details');
    } finally {
      setLoading(false);
    }
  };

  const loadSubscriptions = async () => {
    try {
      const res = await axios.get(`/tenants/${selectedTenant}/subscriptions`);
      setSubscriptions(res.data.subscriptions);
      setAvailableServices(res.data.available);
    } catch {}
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let settingsObj = {};
      try { settingsObj = JSON.parse(form.settings); } catch { settingsObj = {}; }
      await axios.put(`/tenants/${selectedTenant}`, {
        name: form.name, domain: form.domain, tier: form.tier, settings: settingsObj
      });
      setSuccess('Tenant settings updated successfully');
      loadTenants();
    } catch (err) {
      setError('Failed to update tenant settings');
    } finally {
      setSaving(false);
    }
  };

  const toggleSubscription = async (serviceName) => {
    setSubSaving(true);
    setError(null);
    try {
      const current = subscriptions.map(s => s.service_name);
      const updated = current.includes(serviceName)
        ? current.filter(s => s !== serviceName)
        : [...current, serviceName];
      const res = await axios.put(`/tenants/${selectedTenant}/subscriptions`, { services: updated });
      setSubscriptions(res.data.subscriptions);
      cacheSubs(res.data.subscriptions);
      setSuccess('Subscription updated');
    } catch (err) {
      setError('Failed to update subscription');
    } finally {
      setSubSaving(false);
    }
  };

  const getSetting = (key, def = '') => {
    try { const s = JSON.parse(form.settings); return s[key] || def; } catch { return def; }
  };

  const setSetting = (key, value) => {
    try {
      const s = JSON.parse(form.settings) || {};
      s[key] = value;
      setForm({ ...form, settings: JSON.stringify(s, null, 2) });
    } catch {
      setForm({ ...form, settings: JSON.stringify({ [key]: value }, null, 2) });
    }
  };

  if (loading && tenants.length === 0) {
    return <div className="text-center mt-5"><Spinner animation="border" /></div>;
  }

  return (
    <Container fluid>
      <h2 className="mb-4">Tenant Settings</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess(null)}>{success}</Alert>}

      <div className="mb-3">
        <Button variant={tab === 'settings' ? 'primary' : 'outline-primary'} size="sm" className="me-2" onClick={() => setTab('settings')}>General</Button>
        <Button variant={tab === 'subscriptions' ? 'primary' : 'outline-primary'} size="sm" onClick={() => setTab('subscriptions')}>Subscriptions</Button>
      </div>

      {tab === 'settings' && (
        <Row>
          <Col md={8}>
            <Card className="mb-4">
              <Card.Body>
                <Form onSubmit={handleSave}>
                  <Form.Group className="mb-3">
                    <Form.Label>Tenant</Form.Label>
                    <Form.Select value={selectedTenant} onChange={e => setSelectedTenant(e.target.value)}>
                      {tenants.map(t => (
                        <option key={t.tenant_id} value={t.tenant_id}>{t.name} ({t.tenant_id})</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Tenant Name</Form.Label>
                    <Form.Control required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Domain</Form.Label>
                    <Form.Control value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="example.com" />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label>Tier</Form.Label>
                    <Form.Select value={form.tier} onChange={e => setForm({ ...form, tier: e.target.value })}>
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="professional">Professional</option>
                      <option value="enterprise">Enterprise</option>
                    </Form.Select>
                  </Form.Group>
                  <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
                </Form>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="mb-4">
              <Card.Body>
                <h5>Branding</h5>
                <Form.Group className="mb-2">
                  <Form.Label>Company Name</Form.Label>
                  <Form.Control placeholder="Acme Corp" value={getSetting('company_name')} onChange={e => setSetting('company_name', e.target.value)} />
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label>Logo URL</Form.Label>
                  <Form.Control placeholder="https://..." value={getSetting('logo_url')} onChange={e => setSetting('logo_url', e.target.value)} />
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label>Primary Color</Form.Label>
                  <Form.Control type="color" value={getSetting('primary_color', '#0d6efd')} onChange={e => setSetting('primary_color', e.target.value)} />
                </Form.Group>
              </Card.Body>
            </Card>
            <Card className="mb-4">
              <Card.Body>
                <h5>SSO Configuration</h5>
                <Form.Group className="mb-2">
                  <Form.Label>SSO Provider</Form.Label>
                  <Form.Select value={getSetting('sso_provider')} onChange={e => setSetting('sso_provider', e.target.value)}>
                    <option value="">None</option>
                    <option value="saml">SAML</option>
                    <option value="oidc">OIDC</option>
                    <option value="ldap">LDAP</option>
                  </Form.Select>
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label>Issuer URL</Form.Label>
                  <Form.Control placeholder="https://idp.example.com" value={getSetting('sso_issuer')} onChange={e => setSetting('sso_issuer', e.target.value)} />
                </Form.Group>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {tab === 'subscriptions' && (
        <Row>
          <Col md={8}>
            <Card className="mb-4">
              <Card.Body>
                <h5 className="mb-3">Service Subscriptions</h5>
                <p className="text-muted small mb-3">Enable or disable security services for your tenant. IAM is required and cannot be disabled.</p>
                {Object.entries(SERVICE_CATEGORIES).map(([catKey, cat]) => (
                  <div key={catKey} className="mb-4">
                    <h6 className={`text-${cat.color} mb-2`}>{cat.label}</h6>
                    <Table size="sm" hover>
                      <tbody>
                        {cat.services.map(svc => {
                          const sub = subscriptions.find(s => s.service_name === svc);
                          const enabled = sub && sub.enabled !== false;
                          return (
                            <tr key={svc}>
                              <td style={{ width: '40%' }}>{SERVICE_NAMES[svc] || svc}</td>
                              <td style={{ width: '20%' }}>
                                <code style={{ fontSize: '0.75rem' }}>{svc}</code>
                              </td>
                              <td style={{ width: '20%' }}>
                                {sub
                                  ? <Badge bg="success">Subscribed</Badge>
                                  : <Badge bg="secondary">Not Subscribed</Badge>}
                              </td>
                              <td style={{ width: '20%' }}>
                                <Form.Check
                                  type="switch"
                                  id={`sub-${svc}`}
                                  checked={enabled}
                                  onChange={() => toggleSubscription(svc)}
                                  disabled={subSaving || svc === 'iam'}
                                  label={svc === 'iam' ? 'Required' : enabled ? 'Enabled' : 'Disabled'}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>
                  </div>
                ))}
              </Card.Body>
            </Card>
          </Col>
          <Col md={4}>
            <Card className="mb-4">
              <Card.Body>
                <h5>Summary</h5>
                <p className="mb-1">Subscribed: <strong>{subscriptions.filter(s => s.enabled !== false).length}</strong> / {availableServices.length}</p>
                <p className="text-muted small mb-0">
                  Unsubscribed services will be hidden from the dashboard and sidebar for all users in this tenant.
                </p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}

      {form.settings && tab === 'settings' && (
        <Card>
          <Card.Body>
            <h5>Raw Settings (JSON)</h5>
            <Form.Control
              as="textarea" rows={8}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
              value={form.settings}
              onChange={e => setForm({ ...form, settings: e.target.value })}
            />
          </Card.Body>
        </Card>
      )}
    </Container>
  );
}

export default TenantSettings;