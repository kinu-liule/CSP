import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const ThreatIntelDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [iocs, setIocs] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [ttps, setTtps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showIocModal, setShowIocModal] = useState(false);
  const [showFeedModal, setShowFeedModal] = useState(false);
  const [editingIoc, setEditingIoc] = useState(null);

  const [iocForm, setIocForm] = useState({ ioc_type: 'domain', ioc_value: '', severity: 'medium', threat_actor: '', tags: '' });
  const [feedForm, setFeedForm] = useState({ name: '', feed_type: 'stix', url: '', refresh_interval: 60 });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, iocRes, feedRes, ttpRes] = await Promise.all([
        axios.get('/threat-intel/health', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/threat-intel/iocs', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/threat-intel/feeds', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/threat-intel/ttps', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard({ health: dashRes.data });
      setIocs(iocRes.data.data || []);
      setFeeds(feedRes.data.data || []);
      setTtps(ttpRes.data.data || {});
      setError(null);
    } catch (err) {
      setError('Failed to load threat intel data');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const res = await axios.get('/threat-intel/metrics', { headers: { 'x-tenant-id': tenantId } });
      setDashboard(prev => ({ ...prev, metrics: res.data.data }));
    } catch (err) {
    }
  };

  useEffect(() => { if (!loading) loadMetrics(); }, [loading]);

  const handleIocSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/threat-intel/iocs', iocForm, { headers: { 'x-tenant-id': tenantId } });
      setShowIocModal(false);
      setIocForm({ ioc_type: 'domain', ioc_value: '', severity: 'medium', threat_actor: '', tags: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save IOC');
    }
  };

  const handleFeedSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/threat-intel/feeds', feedForm, { headers: { 'x-tenant-id': tenantId } });
      setShowFeedModal(false);
      setFeedForm({ name: '', feed_type: 'stix', url: '', refresh_interval: 60 });
      loadAllData();
    } catch (err) {
      setError('Failed to add feed');
    }
  };

  const handleScan = async () => {
    try {
      await axios.post('/threat-intel/scan', {}, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    } catch (err) {
      setError('Failed to trigger scan');
    }
  };

  const deleteIoc = async (id) => {
    if (window.confirm('Delete this IOC?')) {
      await axios.delete(`/threat-intel/iocs/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  const getSeverityBadge = (sev) => {
    if (sev === 'critical' || sev === 'high') return 'danger';
    if (sev === 'medium') return 'warning';
    return 'info';
  };

  const criticalIocs = iocs.filter(i => i.severity === 'critical').length;

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Threat Intelligence</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{iocs.length}</h3><small>Total IOCs</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{criticalIocs}</h3><small>Critical</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{feeds.length}</h3><small>Feeds</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{Object.keys(ttps).length}</h3><small>TTPs</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="iocs">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="iocs">IOCs</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="feeds">Threat Feeds</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="mitre">MITRE ATT&CK</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="iocs">
                <div className="d-flex justify-content-between mb-3">
                  <h4>Indicators of Compromise</h4>
                  <div>
                    <Button variant="outline-secondary" className="me-2" onClick={handleScan}>Scan</Button>
                    <Button onClick={() => { setEditingIoc(null); setShowIocModal(true); }}>Submit IOC</Button>
                  </div>
                </div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Type</th><th>Value</th><th>Severity</th><th>Actor</th><th>Last Seen</th><th>Actions</th></tr></thead>
                  <tbody>
                    {iocs.map(i => (
                      <tr key={i.id}>
                        <td>{i.ioc_type}</td><td>{i.ioc_value}</td>
                        <td><Badge bg={getSeverityBadge(i.severity)}>{i.severity}</Badge></td>
                        <td>{i.threat_actor || '-'}</td>
                        <td>{i.last_seen ? new Date(i.last_seen).toLocaleDateString() : '-'}</td>
                        <td>
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteIoc(i.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="feeds">
                <div className="d-flex justify-content-between mb-3"><h4>Threat Feeds</h4>{writeAllowed && (<Button onClick={() => setShowFeedModal(true)}>Add Feed</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Last Updated</th></tr></thead>
                  <tbody>
                    {feeds.map(f => (
                      <tr key={f.id}>
                        <td>{f.name}</td><td>{f.feed_type}</td>
                        <td><Badge bg={f.status === 'active' ? 'success' : 'secondary'}>{f.status || 'active'}</Badge></td>
                        <td>{f.last_updated ? new Date(f.last_updated).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="mitre">
                <h4>MITRE ATT&CK TTPs</h4>
                {Object.keys(ttps).length === 0 ? (
                  <p className="text-muted">No TTP data available.</p>
                ) : (
                  Object.entries(ttps).map(([tactic, techniques]) => (
                    <div key={tactic} className="mb-4">
                      <h5><Badge bg="dark">{tactic}</Badge></h5>
                      <Table striped bordered hover size="sm">
                        <thead><tr><th>ID</th><th>Name</th><th>Description</th></tr></thead>
                        <tbody>
                          {(techniques || []).map((t, idx) => (
                            <tr key={t.id || idx}>
                              <td>{t.id || t.technique_id}</td>
                              <td>{t.name}</td>
                              <td>{t.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  ))
                )}
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* IOC Modal */}
      <Modal show={showIocModal} onHide={() => setShowIocModal(false)}>
        <Modal.Header closeButton><Modal.Title>Submit IOC</Modal.Title></Modal.Header>
        <Form onSubmit={handleIocSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={iocForm.ioc_type} onChange={e => setIocForm({...iocForm, ioc_type: e.target.value})}>
              <option value="domain">Domain</option><option value="ip">IP Address</option><option value="url">URL</option><option value="hash">File Hash</option><option value="email">Email</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Value</Form.Label><Form.Control required value={iocForm.ioc_value} onChange={e => setIocForm({...iocForm, ioc_value: e.target.value})} placeholder="e.g. malicious.com" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Severity</Form.Label><Form.Select value={iocForm.severity} onChange={e => setIocForm({...iocForm, severity: e.target.value})}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Threat Actor</Form.Label><Form.Control value={iocForm.threat_actor} onChange={e => setIocForm({...iocForm, threat_actor: e.target.value})} placeholder="Optional" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Tags (comma separated)</Form.Label><Form.Control value={iocForm.tags} onChange={e => setIocForm({...iocForm, tags: e.target.value})} placeholder="Optional" /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowIocModal(false)}>Cancel</Button><Button type="submit">Submit</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Feed Modal */}
      <Modal show={showFeedModal} onHide={() => setShowFeedModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Threat Feed</Modal.Title></Modal.Header>
        <Form onSubmit={handleFeedSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={feedForm.name} onChange={e => setFeedForm({...feedForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Feed Type</Form.Label><Form.Select value={feedForm.feed_type} onChange={e => setFeedForm({...feedForm, feed_type: e.target.value})}>
              <option value="stix">STIX</option><option value="taxii">TAXII</option><option value="csv">CSV</option><option value="json">JSON</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>URL</Form.Label><Form.Control required value={feedForm.url} onChange={e => setFeedForm({...feedForm, url: e.target.value})} placeholder="https://" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Refresh Interval (minutes)</Form.Label><Form.Control type="number" min="5" value={feedForm.refresh_interval} onChange={e => setFeedForm({...feedForm, refresh_interval: parseInt(e.target.value)})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowFeedModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default ThreatIntelDashboard;
