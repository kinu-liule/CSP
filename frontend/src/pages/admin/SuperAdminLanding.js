import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Row, Col, Button, Navbar, Nav, Spinner } from 'react-bootstrap';
import axios from 'axios';

const CAPABILITIES = [
  { icon: '🏢', title: 'Tenant Management', desc: 'Create, configure, and oversee all organization tenants with granular control over resources and access policies.' },
  { icon: '⚙️', title: 'Service Oversight', desc: 'Monitor health, usage, and availability of all 21+ security services across the entire platform.' },
  { icon: '🛡️', title: 'Security Monitoring', desc: 'Real-time threat detection, incident response, and centralized security event management.' },
  { icon: '📋', title: 'Audit & Compliance', desc: 'Comprehensive audit trails, compliance reporting (GDPR, SOC2, HIPAA), and automated policy enforcement.' },
  { icon: '💳', title: 'Billing & Quotas', desc: 'Manage subscription plans, resource quotas, API keys, and billing across all tenant organizations.' },
  { icon: '🔧', title: 'System Administration', desc: 'Configure global settings, branding, maintenance mode, announcements, and platform-wide policies.' }
];

function SuperAdminLanding() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('/public/info').then(res => {
      if (res.data?.services) {
        const services = res.data.services;
        const categories = res.data.categories || {};
        setStats({
          totalServices: services.length,
          categories: Object.keys(categories).length,
          tenants: res.data.tenants || '--',
          uptime: '99.9%'
        });
      }
      setLoading(false);
    }).catch(() => {
      setStats({ totalServices: 21, categories: 8, tenants: '--', uptime: '99.9%' });
      setLoading(false);
    });
  }, []);

  return (
    <div className="sa-landing">
      <Navbar expand="lg" className="sa-landing-navbar">
        <Container>
          <Navbar.Brand as={Link} to="/" className="sa-brand">
            🛡️ CyberSec Platform
          </Navbar.Brand>
          <Nav className="ms-auto d-flex align-items-center gap-2">
            <Nav.Link as={Link} to="/services" className="sa-nav-link">Services</Nav.Link>
            <Button variant="outline-light" size="sm" className="sa-login-btn" onClick={() => navigate('/login')}>
              Sign In
            </Button>
          </Nav>
        </Container>
      </Navbar>

      <section className="sa-hero">
        <div className="sa-hero-grid" />
        <Container>
          <Row className="align-items-center min-vh-80">
            <Col lg={7}>
              <div className="sa-hero-badge">
                <span className="sa-badge-dot" />
                Platform Administration Console
              </div>
              <h1 className="sa-hero-title">
                Manage Your Entire<br />
                <span className="sa-hero-highlight">Cybersecurity Ecosystem</span>
              </h1>
              <p className="sa-hero-subtitle">
                Centralized administration, monitoring, and orchestration for all your security services.
                Deploy, configure, and manage enterprise-grade protection across your organization from a single pane of glass.
              </p>
              <div className="sa-hero-actions">
                <Button className="btn-glow" size="lg" onClick={() => navigate('/login')}>
                  Sign In to Admin Console
                </Button>
                <Button className="btn-outline-glow" size="lg" onClick={() => navigate('/services')}>
                  Explore Services
                </Button>
              </div>
              <div className="sa-hero-metrics">
                <div><div className="sa-metric-value">{loading ? <Spinner animation="border" size="sm" /> : stats?.totalServices || '--'}</div><div className="sa-metric-label">Security Services</div></div>
                <div><div className="sa-metric-value">{loading ? <Spinner animation="border" size="sm" /> : stats?.tenants || '--'}</div><div className="sa-metric-label">Active Tenants</div></div>
                <div><div className="sa-metric-value">{stats?.uptime || '99.9%'}</div><div className="sa-metric-label">Platform Uptime</div></div>
                <div><div className="sa-metric-value">{stats?.categories || '--'}</div><div className="sa-metric-label">Service Categories</div></div>
              </div>
            </Col>
            <Col lg={5} className="d-none d-lg-block">
              <div className="sa-hero-visual">
                <div className="sa-visual-shield">🛡️</div>
                <div className="sa-visual-ring" style={{ width: 160, height: 160 }} />
                <div className="sa-visual-ring" style={{ width: 260, height: 260 }} />
                <div className="sa-visual-ring" style={{ width: 360, height: 360, borderStyle: 'dashed' }} />
                <div className="sa-visual-orb" style={{ '--tx': '80px', '--duration': '4s', '--color': '#60a5fa', '--size': '10px' }} />
                <div className="sa-visual-orb" style={{ '--tx': '130px', '--duration': '6s', '--color': '#a78bfa', '--size': '8px' }} />
                <div className="sa-visual-orb" style={{ '--tx': '100px', '--duration': '5s', '--color': '#34d399', '--size': '7px' }} />
                <div className="sa-visual-orb" style={{ '--tx': '180px', '--duration': '7s', '--color': '#f59e0b', '--size': '6px' }} />
              </div>
            </Col>
          </Row>
        </Container>
      </section>

      <section className="sa-capabilities">
        <Container>
          <div className="text-center mb-5">
            <h2 className="sa-section-title">Platform Capabilities</h2>
            <p className="sa-section-subtitle">Everything you need to manage your security infrastructure</p>
          </div>
          <Row>
            {CAPABILITIES.map((cap, i) => (
              <Col md={6} lg={4} className="mb-4" key={i}>
                <div className="sa-cap-card">
                  <div className="sa-cap-icon">{cap.icon}</div>
                  <h5 className="sa-cap-title">{cap.title}</h5>
                  <p className="sa-cap-desc">{cap.desc}</p>
                </div>
              </Col>
            ))}
          </Row>
        </Container>
      </section>

      <section className="sa-cta">
        <Container className="text-center">
          <h2 className="sa-cta-title">Ready to Take Control?</h2>
          <p className="sa-cta-subtitle">Sign in to access the full administration console and manage your security platform.</p>
          <Button className="btn-glow" size="lg" onClick={() => navigate('/login')}>
            Sign In Now
          </Button>
        </Container>
      </section>

      <footer className="sa-footer">
        <Container>
          <Row>
            <Col md={6} className="mb-3">
              <div className="sa-footer-brand">🛡️ CyberSec Platform</div>
              <p className="sa-footer-text">Enterprise-grade security administration platform. Version 3.0.0</p>
            </Col>
            <Col md={3} className="mb-3">
              <h6>Platform</h6>
              <a href="/services">Services</a>
              <a href="/login">Sign In</a>
            </Col>
            <Col md={3} className="mb-3">
              <h6>Support</h6>
              <a href="mailto:admin@cybersec.local">Contact</a>
              <a href="#">Documentation</a>
            </Col>
          </Row>
          <hr className="sa-footer-hr" />
          <p className="sa-footer-copy">&copy; 2026 CyberSec Platform. All rights reserved.</p>
        </Container>
      </footer>
    </div>
  );
}

export default SuperAdminLanding;
