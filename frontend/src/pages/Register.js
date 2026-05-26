import React, { useState } from 'react';
import { Container, Card, Form, Button, Alert, Row, Col, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

function Register({ setUser }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', company: '', domain: '' });
  const [selectedServices, setSelectedServices] = useState(['iam']);

  const toggleService = (svc) => {
    if (svc === 'iam') return;
    setSelectedServices(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    );
  };

  const handleInputChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        company: form.company,
        domain: form.domain,
        services: selectedServices
      });
      const { token, user, tenant } = res.data.data;
      setForm(prev => ({ ...prev, _tenantId: tenant.tenant_id, _username: user.username }));
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const serviceCardStyle = (svc, selected) => ({
    cursor: svc === 'iam' ? 'not-allowed' : 'pointer',
    border: selected ? '2px solid #0d6efd' : '1px solid #dee2e6',
    background: selected ? '#f0f7ff' : '#fff',
    opacity: svc === 'iam' ? 0.8 : 1,
    transition: 'all 0.2s',
  });

  return (
    <Container className="mt-4 mb-5">
      <Row className="justify-content-center">
        <Col md={8} lg={6}>
          <Card>
            <Card.Body className="p-4">
              <h3 className="text-center mb-2">Create Your Security Platform</h3>
              <p className="text-muted text-center mb-4">Register your organization and choose your services</p>

              {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}

              {step === 1 && (
                <>
                  <h5 className="mb-3">Organization Details</h5>
                  <Form onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
                    <Form.Group className="mb-3">
                      <Form.Label>Company Name *</Form.Label>
                      <Form.Control name="company" value={form.company} onChange={handleInputChange} required placeholder="Your organization name" />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Admin Username *</Form.Label>
                      <Form.Control name="name" value={form.name} onChange={handleInputChange} required placeholder="e.g. john_admin" />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Admin Email *</Form.Label>
                      <Form.Control type="email" name="email" value={form.email} onChange={handleInputChange} required placeholder="admin@company.com" />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Password *</Form.Label>
                      <Form.Control type="password" name="password" value={form.password} onChange={handleInputChange} required minLength={6} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Confirm Password *</Form.Label>
                      <Form.Control type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleInputChange} required minLength={6} />
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Domain</Form.Label>
                      <Form.Control name="domain" value={form.domain} onChange={handleInputChange} placeholder="company.com" />
                    </Form.Group>
                    <Button variant="primary" type="submit" className="w-100">Next: Choose Services</Button>
                  </Form>
                </>
              )}

              {step === 3 && (
                <>
                  <div className="text-center py-3">
                    <div style={{ fontSize: '3rem' }}>✅</div>
                    <h4 className="mt-2">Account Created Successfully!</h4>
                    <p className="text-muted small mb-3">Save these credentials — you'll need them to log in.</p>
                    <div className="bg-light rounded p-3 mb-3 text-start">
                      <div className="mb-2"><strong>Tenant ID:</strong><br /><code className="user-select-all">{form._tenantId}</code></div>
                      <div className="mb-2"><strong>Username:</strong><br /><code className="user-select-all">{form._username}</code></div>
                      <div className="mb-0"><strong>Email:</strong><br /><code className="user-select-all">{form.email}</code></div>
                    </div>
                    <div className="d-grid gap-2">
                      <Button variant="primary" onClick={() => {
                        localStorage.setItem('token', '');
                        navigate('/login');
                      }}>Go to Login</Button>
                    </div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <h5 className="mb-1">Choose Your Services</h5>
                  <p className="text-muted small mb-3">IAM is included by default. Select additional security services. Selected services will be activated once approved by a super admin.</p>
                  {SERVICE_CATEGORIES.map(cat => (
                    <div key={cat.key} className="mb-3">
                      <h6 className={`text-${cat.color} mb-2`}>{cat.label}</h6>
                      <Row xs={1} sm={2} className="g-2">
                        {cat.services.map(svc => {
                          const selected = selectedServices.includes(svc);
                          return (
                            <Col key={svc}>
                              <div className="p-2 rounded" style={serviceCardStyle(svc, selected)}>
                                <Form.Check
                                  type="switch"
                                  id={`svc-${svc}`}
                                  label={<span style={{ fontSize: '0.85rem' }}>{SERVICE_NAMES[svc] || svc}</span>}
                                  checked={selected}
                                  onChange={() => toggleService(svc)}
                                  disabled={svc === 'iam'}
                                />
                              </div>
                            </Col>
                          );
                        })}
                      </Row>
                    </div>
                  ))}
                  <div className="d-flex gap-2 mt-3">
                    <Button variant="outline-secondary" onClick={() => setStep(1)}>Back</Button>
                    <Button variant="primary" onClick={handleRegister} disabled={loading} className="flex-grow-1">
                      {loading ? <><Spinner size="sm" className="me-1" /> Creating Account...</> : 'Create Account'}
                    </Button>
                  </div>
                </>
              )}

              <hr />
              <p className="text-center mb-0">
                Already have an account? <Link to="/login">Sign in</Link>
              </p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}

const SERVICE_CATEGORIES = [
  { label: 'Core Services', key: 'core', color: 'primary', services: ['iam', 'asset-management', 'password-manager'] },
  { label: 'Network Defense', key: 'network', color: 'danger', services: ['waf', 'ngfw'] },
  { label: 'Security Monitoring', key: 'monitoring', color: 'info', services: ['siem-soar', 'vuln-scanner', 'fraud-detection', 'edr', 'threat-intel', 'soar', 'data-lake', 'xdr'] },
  { label: 'Governance & Compliance', key: 'compliance', color: 'warning', services: ['awareness', 'grc', 'business-continuity', 'risk-engine', 'data-security'] },
  { label: 'Cloud Security', key: 'cloud', color: 'secondary', services: ['cspm'] },
  { label: 'DevSecOps', key: 'devops', color: 'dark', services: ['devsecops'] },
  { label: 'Active Defense', key: 'defense', color: 'danger', services: ['deception'] },
];

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

export default Register;
