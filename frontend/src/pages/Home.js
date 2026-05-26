import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Badge, Button, Modal, Form, Spinner, Alert, Nav, Navbar } from 'react-bootstrap';
import axios from 'axios';

const SERVICE_ICONS = {
  iam: '🔑', waf: '🛡️', ngfw: '🔥', 'siem-soar': '📊', 'vuln-scanner': '🔎',
  fraud: '🕵️', awareness: '🎓', grc: '📋', 'asset-management': '💼', cspm: '☁️',
  edr: '🖥️', 'threat-intel': '🧠', soar: '🤖', 'data-security': '🔒',
  'data-lake': '🗄️', xdr: '🔄', devsecops: '⚙️', deception: '🎯',
  'password-manager': '🔐', 'business-continuity': '📋', 'risk-engine': '⚠️',
};

const SERVICE_IDS = [
  'iam', 'waf', 'ngfw', 'siem-soar', 'vuln-scanner', 'fraud-detection',
  'awareness', 'grc', 'asset-management', 'cspm', 'edr', 'threat-intel',
  'soar', 'data-security', 'data-lake', 'xdr', 'devsecops', 'deception',
  'password-manager', 'business-continuity', 'risk-engine'
];

const SERVICE_CATEGORIES = [
  { name: 'Identity & Access Control', icon: '🔐', services: ['iam', 'password-manager'] },
  { name: 'Network Defense', icon: '🌐', services: ['waf', 'ngfw', 'deception'] },
  { name: 'Threat Detection & Response', icon: '📡', services: ['siem-soar', 'edr', 'xdr', 'threat-intel', 'soar'] },
  { name: 'Vulnerability & Risk Management', icon: '⚠️', services: ['vuln-scanner', 'grc', 'risk-engine'] },
  { name: 'Data & Cloud Protection', icon: '☁️', services: ['data-security', 'data-lake', 'cspm'] },
  { name: 'Application & Operations', icon: '⚙️', services: ['devsecops', 'fraud-detection', 'asset-management', 'business-continuity'] },
  { name: 'Human Security', icon: '🎓', services: ['awareness'] },
];

const FEATURES_DETAILED = [
  { icon: '🔐', title: 'Zero Trust Architecture', desc: 'Every access request is fully authenticated, authorized, and continuously validated before granting access.' },
  { icon: '📊', title: 'Real-Time Threat Monitoring', desc: 'AI-powered monitoring across your entire infrastructure detects and responds to threats as they happen.' },
  { icon: '🔄', title: 'Automated Response', desc: 'Security orchestration automates incident response, reducing mean time to respond from hours to seconds.' },
  { icon: '📋', title: 'Compliance Automation', desc: 'Automated compliance checks across SOC 2, ISO 27001, GDPR, and HIPAA frameworks.' },
  { icon: '☁️', title: 'Cloud-Native Security', desc: 'Built for modern cloud environments with full support for AWS, Azure, GCP, and hybrid deployments.' },
  { icon: '🔍', title: 'Deep Visibility', desc: 'Complete visibility across users, endpoints, network, and cloud with centralized logging and analytics.' },
];

function Home() {
  const [platformInfo, setPlatformInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    companyName: '', contactName: '', contactEmail: '',
    domain: '', phone: '', services: [], message: ''
  });

  useEffect(() => {
    axios.get('/public/info')
      .then(res => setPlatformInfo(res.data))
      .catch(() => setPlatformInfo(null))
      .finally(() => setLoading(false));
  }, []);

  const toggleService = (svc) => {
    setForm(prev => ({
      ...prev,
      services: prev.services.includes(svc)
        ? prev.services.filter(s => s !== svc)
        : [...prev.services, svc]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await axios.post('/public/register-request', form);
      setSubmitted(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit request');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center mt-5"><Spinner animation="border" /></div>;

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      {/* NAVBAR */}
      <Navbar expand="lg" fixed="top" className="landing-navbar">
        <Container>
          <Navbar.Brand href="/">CyberSec Platform</Navbar.Brand>
          <Navbar.Toggle aria-controls="landing-nav" />
          <Navbar.Collapse id="landing-nav">
            <Nav className="mx-auto">
              <Nav.Link onClick={() => scrollTo('services')}>Services</Nav.Link>
              <Nav.Link onClick={() => scrollTo('features')}>Features</Nav.Link>
              <Nav.Link onClick={() => scrollTo('pricing')}>Pricing</Nav.Link>
              <Nav.Link onClick={() => scrollTo('contact')}>Contact</Nav.Link>
            </Nav>
            <div className="d-flex gap-2">
              <Button variant="outline-light" size="sm" onClick={() => window.location.href = '/login'}>
                Sign In
              </Button>
              <Button variant="primary" size="sm" className="btn-glow" onClick={() => setShowForm(true)}>
                Get Started
              </Button>
            </div>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {/* HERO */}
      <div className="hero-section">
        <div className="hero-grid" />
        <Container style={{ position: 'relative', zIndex: 1 }}>
          <Row className="align-items-center">
            <Col lg={7}>
              <div className="hero-badge">
                <span>🛡️</span> Enterprise-Grade Security Platform
              </div>
              <h1 className="hero-title">
                Enterprise-Grade Security Platform.<br />
                Protect Your Digital <span className="highlight">Infrastructure</span> with Zero Compromise.
              </h1>
              <p className="hero-subtitle">
                {platformInfo?.description || 'A unified cybersecurity platform that protects your organization from evolving threats with AI-powered detection, automated response, and comprehensive compliance management.'}
              </p>
              <div className="hero-actions">
                <Button className="btn-glow" onClick={() => setShowForm(true)}>
                  Request Access
                </Button>
                <Button className="btn-outline-glow" onClick={() => scrollTo('services')}>
                  Explore Services
                </Button>
              </div>
              <div className="hero-metrics">
                <div>
                  <div className="hero-metric-value">21+</div>
                  <div className="hero-metric-label">Security Services</div>
                </div>
                <div>
                  <div className="hero-metric-value">99.9%</div>
                  <div className="hero-metric-label">Uptime SLA</div>
                </div>
                <div>
                  <div className="hero-metric-value">&lt;15s</div>
                  <div className="hero-metric-label">Threat Response</div>
                </div>
              </div>
            </Col>
            <Col lg={5} className="text-center mt-4 mt-lg-0">
              <div className="hero-visual">
                <div className="hero-visual-ring" />
                <div className="hero-visual-ring" />
                <div className="hero-visual-ring" />
                <div className="hero-visual-orb" />
                <div className="hero-visual-orb" />
                <div className="hero-visual-orb" />
                <div className="hero-visual-orb" />
                <div className="hero-visual-center" />
              </div>
            </Col>
          </Row>
        </Container>
      </div>

      {/* SERVICES */}
      <div className="bg-white py-5" id="services">
        <Container className="py-4">
          <h2 className="section-title text-center">Security Services</h2>
          <p className="section-subtitle text-center">
            A comprehensive suite of security tools designed to protect every layer of your organization.
          </p>
          {SERVICE_CATEGORIES.map((cat, ci) => {
            const catServices = platformInfo?.services?.filter(s => cat.services.includes(s.id)) || [];
            if (catServices.length === 0) return null;
            return (
              <div key={ci} className="mb-5">
                <div className="d-flex align-items-center gap-2 mb-3" style={{ borderBottom: '2px solid #eef2f6', paddingBottom: 10 }}>
                  <span style={{ fontSize: '1.5rem' }}>{cat.icon}</span>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#1a2332' }}>{cat.name}</h3>
                </div>
                <Row>
                  {catServices.map((svc) => (
                    <Col md={4} lg={3} key={svc.id} className="mb-3">
                      <Card className="service-card h-100">
                        <Card.Body>
                          <div className="service-card-icon">{SERVICE_ICONS[svc.id] || '🔧'}</div>
                          <Card.Title style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 6 }}>{svc.name}</Card.Title>
                          <Card.Text className="small text-muted" style={{ fontSize: '0.82rem' }}>{svc.description}</Card.Text>
                        </Card.Body>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </div>
            );
          })}
        </Container>
      </div>

      {/* FEATURES */}
      <div className="bg-light py-5" id="features">
        <Container className="py-4">
          <h2 className="section-title text-center">Why CyberSec Platform?</h2>
          <p className="section-subtitle text-center">
            Built for security teams that need enterprise-grade protection without the complexity.
          </p>
          <Row>
            {FEATURES_DETAILED.map((f, i) => (
              <Col md={4} key={i} className="mb-4">
                <Card className="feature-card h-100">
                  <div className="feature-card-icon" style={{
                    background: `linear-gradient(135deg, ${i % 2 === 0 ? 'rgba(59,130,246,0.1)' : 'rgba(124,58,237,0.1)'}, ${i % 2 === 0 ? 'rgba(59,130,246,0.05)' : 'rgba(124,58,237,0.05)'})`
                  }}>
                    {f.icon}
                  </div>
                  <Card.Title style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 8 }}>{f.title}</Card.Title>
                  <Card.Text className="text-muted small" style={{ fontSize: '0.88rem', lineHeight: 1.6 }}>{f.desc}</Card.Text>
                </Card>
              </Col>
            ))}
          </Row>
        </Container>
      </div>

      {/* PRICING */}
      <div className="bg-white py-5" id="pricing">
        <Container className="py-4">
          <h2 className="section-title text-center">Simple, Transparent Pricing</h2>
          <p className="section-subtitle text-center">
            Choose the plan that fits your organization. Scale as you grow.
          </p>
          <Row className="justify-content-center">
            {platformInfo?.tiers?.map((tier, i) => (
              <Col md={4} key={i} className="mb-4">
                <Card className={`pricing-card h-100 ${i === 1 ? 'featured' : ''}`}>
                  {i === 1 && <Badge bg="primary" className="position-absolute top-0 end-0 mt-3 me-3" style={{ borderRadius: 100, padding: '4px 14px', fontSize: '0.75rem' }}>POPULAR</Badge>}
                  <Card.Body className="d-flex flex-column" style={{ padding: 32 }}>
                    <Card.Title style={{ fontSize: '1.2rem', fontWeight: 700 }}>{tier.name}</Card.Title>
                    <div className="price my-3">
                      {tier.price}
                      {tier.price !== 'Custom' && <span className="price-period">/mo</span>}
                    </div>
                    <Card.Text className="text-muted" style={{ fontSize: '0.9rem', lineHeight: 1.6, flex: 1 }}>{tier.description}</Card.Text>
                    <Button
                      variant={i === 1 ? 'primary' : 'outline-primary'}
                      className={i === 1 ? 'btn-glow' : ''}
                      style={{ borderRadius: 10, padding: '10px 0', fontWeight: 600, marginTop: 16 }}
                      onClick={() => setShowForm(true)}
                    >
                      {i === 0 ? 'Start Free' : i === 1 ? 'Start Trial' : 'Contact Sales'}
                    </Button>
                  </Card.Body>
                </Card>
              </Col>
            ))}
          </Row>
        </Container>
      </div>

      {/* CTA */}
      <div className="cta-section" id="contact">
        <Container>
          <h2 style={{ fontSize: '2.4rem', fontWeight: 800, color: '#fff', marginBottom: 16, letterSpacing: '-0.5px' }}>
            Ready to Secure Your Organization?
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.7 }}>
            Join thousands of organizations that trust CyberSec Platform to protect their critical infrastructure and data.
          </p>
          <div className="d-flex gap-3 justify-content-center flex-wrap">
            <Button size="lg" className="btn-glow" onClick={() => setShowForm(true)}>
              Request Access
            </Button>
            <Button size="lg" className="btn-outline-glow" onClick={() => window.location.href = '/register'}>
              Create Account
            </Button>
          </div>
        </Container>
      </div>

      {/* FOOTER */}
      <div className="landing-footer">
        <Container>
          <Row>
            <Col md={4} className="mb-4">
              <div className="brand mb-2">CyberSec Platform</div>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.88rem', lineHeight: 1.7 }}>
                Enterprise-grade cybersecurity platform with modular security services for organizations of all sizes.
              </p>
            </Col>
            <Col md={2} className="mb-4">
              <h6>Platform</h6>
              <a onClick={() => scrollTo('services')} style={{ cursor: 'pointer' }}>Services</a>
              <a onClick={() => scrollTo('features')} style={{ cursor: 'pointer' }}>Features</a>
              <a onClick={() => scrollTo('pricing')} style={{ cursor: 'pointer' }}>Pricing</a>
            </Col>
            <Col md={2} className="mb-4">
              <h6>Access</h6>
              <a href="/login">Org Login</a>
              <a href="http://localhost:9090">Admin Login</a>
              <a onClick={() => setShowForm(true)} style={{ cursor: 'pointer' }}>Request Access</a>
            </Col>
            <Col md={2} className="mb-4">
              <h6>Resources</h6>
              <a href="/register">Register</a>
              <a href="http://localhost:3000/health">System Status</a>
            </Col>
            <Col md={2} className="mb-4">
              <h6>Legal</h6>
              <a style={{ cursor: 'pointer' }}>Privacy</a>
              <a style={{ cursor: 'pointer' }}>Terms</a>
              <a style={{ cursor: 'pointer' }}>Security</a>
            </Col>
          </Row>
          <hr style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '24px 0' }} />
          <p className="text-center mb-0" style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.82rem' }}>
            &copy; {new Date().getFullYear()} CyberSec Platform. All rights reserved.
          </p>
        </Container>
      </div>

      {/* REQUEST FORM MODAL */}
      <Modal show={showForm} onHide={() => { if (!submitting) setShowForm(false); }} size="lg" centered>
        <Modal.Header closeButton style={{ border: 'none', paddingBottom: 0 }}>
          <Modal.Title className="fw-bold">Request Organization Access</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ padding: '24px 32px 32px' }}>
          {submitted ? (
            <div className="text-center py-4">
              <div style={{ fontSize: '4rem' }}>✅</div>
              <h4 className="mt-3">Request Submitted!</h4>
              <p className="text-muted">
                Your request has been received. A super admin will review it and create your organization account.
                You will receive credentials at <strong>{form.contactEmail}</strong>.
              </p>
              <Button variant="primary" onClick={() => { setShowForm(false); setSubmitted(false); setForm({ companyName: '', contactName: '', contactEmail: '', domain: '', phone: '', services: [], message: '' }); }}>
                Done
              </Button>
            </div>
          ) : (
            <Form onSubmit={handleSubmit}>
              {error && <Alert variant="danger">{error}</Alert>}
              <h6 className="text-muted mb-3">Organization Details</h6>
              <Row>
                <Col md={6} className="mb-3">
                  <Form.Label>Company Name *</Form.Label>
                  <Form.Control required value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="Acme Corp" />
                </Col>
                <Col md={6} className="mb-3">
                  <Form.Label>Domain</Form.Label>
                  <Form.Control value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })} placeholder="acme.com" />
                </Col>
              </Row>
              <h6 className="text-muted mb-3 mt-2">Contact Information</h6>
              <Row>
                <Col md={6} className="mb-3">
                  <Form.Label>Contact Name *</Form.Label>
                  <Form.Control required value={form.contactName} onChange={e => setForm({ ...form, contactName: e.target.value })} placeholder="John Doe" />
                </Col>
                <Col md={6} className="mb-3">
                  <Form.Label>Contact Email *</Form.Label>
                  <Form.Control required type="email" value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} placeholder="john@acme.com" />
                </Col>
              </Row>
              <Row>
                <Col md={6} className="mb-3">
                  <Form.Label>Phone</Form.Label>
                  <Form.Control value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+1-555-1234" />
                </Col>
              </Row>
              <h6 className="text-muted mb-3 mt-2">Desired Services</h6>
              {SERVICE_CATEGORIES.map((cat, ci) => {
                const catServices = platformInfo?.services?.filter(s => cat.services.includes(s.id)) || [];
                if (catServices.length === 0) return null;
                return (
                  <div key={ci} className="mb-3">
                    <small className="text-muted fw-semibold d-block mb-2" style={{ fontSize: '0.75rem', letterSpacing: '0.3px' }}>
                      {cat.icon} {cat.name}
                    </small>
                    <Row>
                      {catServices.map(svc => (
                        <Col md={4} key={svc.id} className="mb-2">
                          <Card
                            className={`border ${form.services.includes(svc.id) ? 'border-primary bg-primary bg-opacity-10' : ''}`}
                            onClick={() => toggleService(svc.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <Card.Body className="py-2 px-3 d-flex align-items-center">
                              <span className="me-2">{SERVICE_ICONS[svc.id] || '🔧'}</span>
                              <small>{svc.name}</small>
                              {form.services.includes(svc.id) && <span className="ms-auto text-primary">✓</span>}
                            </Card.Body>
                          </Card>
                        </Col>
                      ))}
                    </Row>
                  </div>
                );
              })}
              <Form.Group className="mb-3">
                <Form.Label>Additional Notes (optional)</Form.Label>
                <Form.Control as="textarea" rows={3} value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Any specific requirements or questions..." />
              </Form.Group>
              <div className="d-grid">
                <Button variant="primary" type="submit" disabled={submitting} className="btn-glow" style={{ padding: '12px 0', borderRadius: 10, fontWeight: 600 }}>
                  {submitting ? <><Spinner size="sm" className="me-2" />Submitting...</> : 'Submit Request'}
                </Button>
              </div>
            </Form>
          )}
        </Modal.Body>
      </Modal>
    </>
  );
}

export default Home;
