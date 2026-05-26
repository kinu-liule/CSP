import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Badge, Form, Spinner, Button, InputGroup } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const SERVICE_ICONS = {
  iam: '🔐', waf: '🛡️', ngfw: '🔥', 'siem-soar': '📊', 'vuln-scanner': '🔍',
  fraud: '🚨', awareness: '📚', grc: '📋', 'asset-management': '💼', cspm: '☁️',
  edr: '💻', 'threat-intel': '🧠', soar: '⚡', 'data-security': '🔒',
  'data-lake': '🗄️', xdr: '🔄', devsecops: '🔧', deception: '🎯',
  'password-manager': '🔑', 'business-continuity': '🔄', 'risk-engine': '📈'
};

const CATEGORIES = [
  'All',
  'Identity & Access Control',
  'Network Defense',
  'Threat Detection & Response',
  'Security Management',
  'Data Protection',
  'Cloud Security',
  'Compliance & Risk',
  'Operational Security'
];

function SuperAdminServices() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [serviceHealth, setServiceHealth] = useState({});

  useEffect(() => {
    axios.get('/public/info').then(res => {
      if (res.data?.services) {
        setServices(res.data.services);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    axios.get('/admin/health').then(res => {
      if (res.data?.services) {
        const healthMap = {};
        res.data.services.forEach(s => { healthMap[s.name] = s.status; });
        setServiceHealth(healthMap);
      }
    }).catch(() => {});
  }, []);

  const getStatus = (serviceKey) => {
    const status = serviceHealth[serviceKey];
    if (!status) return 'unknown';
    return status;
  };

  const statusBadge = (status) => {
    const map = {
      healthy: { variant: 'success', label: 'Healthy' },
      warning: { variant: 'warning', label: 'Warning' },
      error: { variant: 'danger', label: 'Error' },
      down: { variant: 'danger', label: 'Down' },
      unknown: { variant: 'secondary', label: 'Unknown' }
    };
    const m = map[status] || map.unknown;
    return <Badge bg={m.variant} className="sa-status-badge">{m.label}</Badge>;
  };

  const filtered = services.filter(s => {
    const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.description?.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === 'All' || (s.category === activeCategory);
    return matchSearch && matchCat;
  });

  const stats = {
    total: services.length,
    healthy: services.filter(s => getStatus(s.key || s.name) === 'healthy').length,
    warning: services.filter(s => getStatus(s.key || s.name) === 'warning').length,
    down: services.filter(s => ['down', 'error'].includes(getStatus(s.key || s.name))).length
  };

  return (
    <div className="sa-services-page">
      <div className="sa-services-header">
        <Container>
          <Row className="align-items-center">
            <Col>
              <h1 className="sa-services-title">Platform Services</h1>
              <p className="sa-services-desc">Browse all available security services and their operational status.</p>
            </Col>
            <Col xs="auto">
              <Button variant="outline-light" size="sm" onClick={() => navigate('/login')}>Sign In</Button>
            </Col>
          </Row>
        </Container>
      </div>

      <Container className="sa-services-body">
        <Row className="mb-4 g-3">
          <Col md={3} xs={6}><div className="sa-stat-card"><div className="sa-stat-num">{stats.total}</div><div className="sa-stat-label">Total Services</div></div></Col>
          <Col md={3} xs={6}><div className="sa-stat-card sa-stat-healthy"><div className="sa-stat-num">{stats.healthy}</div><div className="sa-stat-label">Healthy</div></div></Col>
          <Col md={3} xs={6}><div className="sa-stat-card sa-stat-warning"><div className="sa-stat-num">{stats.warning}</div><div className="sa-stat-label">Warning</div></div></Col>
          <Col md={3} xs={6}><div className="sa-stat-card sa-stat-down"><div className="sa-stat-num">{stats.down}</div><div className="sa-stat-label">Unhealthy</div></div></Col>
        </Row>

        <Row className="mb-4">
          <Col md={6}>
            <InputGroup>
              <InputGroup.Text className="sa-search-icon">🔍</InputGroup.Text>
              <Form.Control type="text" placeholder="Search services..." value={search} onChange={e => setSearch(e.target.value)} className="sa-search-input" />
            </InputGroup>
          </Col>
        </Row>

        <div className="sa-category-tabs mb-4">
          {CATEGORIES.map(cat => (
            <button key={cat} className={`sa-cat-tab ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
              {cat}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-5"><Spinner animation="border" variant="light" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-5 text-light"><p>No services found matching your criteria.</p></div>
        ) : (
          <Row className="g-4">
            {filtered.map((svc, i) => {
              const key = svc.key || svc.name?.toLowerCase().replace(/\s+/g, '-');
              const status = getStatus(key);
              return (
                <Col md={6} lg={4} key={i}>
                  <Card className="sa-svc-card">
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start mb-3">
                        <div className="sa-svc-icon">{SERVICE_ICONS[key] || SERVICE_ICONS[svc.name?.toLowerCase()] || '🔧'}</div>
                        {statusBadge(status)}
                      </div>
                      <h5 className="sa-svc-name">{svc.name}</h5>
                      <p className="sa-svc-desc">{svc.description}</p>
                      {svc.category && <small className="sa-svc-category">{svc.category}</small>}
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Container>

      <footer className="sa-footer">
        <Container>
          <p className="sa-footer-copy">&copy; 2026 CyberSec Platform. All rights reserved. v3.0.0</p>
        </Container>
      </footer>
    </div>
  );
}

export default SuperAdminServices;
