import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const XDRDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [correlations, setCorrelations] = useState([]);
  const [huntResults, setHuntResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showCorrelationModal, setShowCorrelationModal] = useState(false);
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [respondAction, setRespondAction] = useState('quarantine');

  const [correlationForm, setCorrelationForm] = useState({ name: '', rule: '', enabled: true });

  const [huntQuery, setHuntQuery] = useState('');
  const [huntLoading, setHuntLoading] = useState(false);

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, alertRes, incRes, corrRes] = await Promise.all([
        axios.get('/xdr/health', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/xdr/alerts', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/xdr/incidents', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/xdr/correlations', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard({ health: dashRes.data });
      setAlerts(alertRes.data.data || []);
      setIncidents(incRes.data.data || []);
      setCorrelations(corrRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load XDR data');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const res = await axios.get('/xdr/metrics', { headers: { 'x-tenant-id': tenantId } });
      setDashboard(prev => ({ ...prev, metrics: res.data.data }));
    } catch (err) {
    }
  };

  useEffect(() => { if (!loading) loadMetrics(); }, [loading]);

  const handleRespond = async () => {
    if (!selectedAlert) return;
    try {
      await axios.post(`/xdr/alerts/${selectedAlert.id}/respond`, { action: respondAction }, { headers: { 'x-tenant-id': tenantId } });
      setShowRespondModal(false);
      setSelectedAlert(null);
      loadAllData();
    } catch (err) {
      setError('Failed to respond to alert');
    }
  };

  const handleCorrelationSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/xdr/correlations', correlationForm, { headers: { 'x-tenant-id': tenantId } });
      setShowCorrelationModal(false);
      setCorrelationForm({ name: '', rule: '', enabled: true });
      loadAllData();
    } catch (err) {
      setError('Failed to save correlation');
    }
  };

  const handleHunt = async () => {
    if (!huntQuery.trim()) return;
    try {
      setHuntLoading(true);
      const res = await axios.post('/xdr/hunt', { query: huntQuery }, { headers: { 'x-tenant-id': tenantId } });
      const huntId = res.data.data?.hunt_id || res.data.hunt_id;
      if (huntId) {
        const resultRes = await axios.get(`/xdr/hunt/${huntId}`, { headers: { 'x-tenant-id': tenantId } });
        setHuntResults(resultRes.data.data);
      }
    } catch (err) {
      setError('Hunt failed');
    } finally {
      setHuntLoading(false);
    }
  };

  const getSeverityBadge = (sev) => {
    if (sev === 'critical' || sev === 'high') return 'danger';
    if (sev === 'medium') return 'warning';
    return 'info';
  };

  const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">XDR - Extended Detection & Response</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{alerts.filter(a => a.status === 'open' || !a.status).length}</h3><small>Open Alerts</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{incidents.length}</h3><small>Incidents</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{criticalAlerts}</h3><small>Critical</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{dashboard?.metrics?.total_hunts || 0}</h3><small>Hunts</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="alerts">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="alerts">Alerts</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="incidents">Incidents</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="correlations">Correlations</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="hunt">Threat Hunt</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="alerts">
                <h4 className="mb-3">Alerts</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Title</th><th>Source</th><th>Severity</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {alerts.map(a => (
                      <tr key={a.id}>
                        <td>{a.title}</td><td>{a.source}</td>
                        <td><Badge bg={getSeverityBadge(a.severity)}>{a.severity}</Badge></td>
                        <td><Badge bg={a.status === 'open' ? 'danger' : 'success'}>{a.status || 'open'}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setSelectedAlert(a); setShowRespondModal(true); }}>Respond</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="incidents">
                <h4 className="mb-3">Incidents</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Severity</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {incidents.map(inc => (
                      <tr key={inc.id}>
                        <td>{inc.name}</td>
                        <td><Badge bg={getSeverityBadge(inc.severity)}>{inc.severity}</Badge></td>
                        <td><Badge bg={inc.status === 'open' ? 'danger' : inc.status === 'investigating' ? 'warning' : 'success'}>{inc.status}</Badge></td>
                        <td>{inc.created_at ? new Date(inc.created_at).toLocaleDateString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="correlations">
                <div className="d-flex justify-content-between mb-3"><h4>Correlation Rules</h4>{writeAllowed && (<Button onClick={() => setShowCorrelationModal(true)}>Add Rule</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Rule</th><th>Enabled</th></tr></thead>
                  <tbody>
                    {correlations.map(c => (
                      <tr key={c.id}>
                        <td>{c.name}</td><td>{c.rule || c.rule_expression}</td>
                        <td><Badge bg={c.enabled ? 'success' : 'secondary'}>{c.enabled ? 'Yes' : 'No'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="hunt">
                <h4 className="mb-3">Threat Hunting</h4>
                <Form onSubmit={e => { e.preventDefault(); handleHunt(); }}>
                  <Form.Group className="mb-3">
                    <Form.Label>Search Query</Form.Label>
                    <div className="d-flex gap-2">
                      <Form.Control value={huntQuery} onChange={e => setHuntQuery(e.target.value)} placeholder="Enter search query..." />
                      <Button type="submit" disabled={huntLoading}>{huntLoading ? 'Searching...' : 'Search'}</Button>
                    </div>
                  </Form.Group>
                </Form>
                {huntResults && (
                  <Table striped bordered hover size="sm">
                    <thead><tr><th>Field</th><th>Value</th></tr></thead>
                    <tbody>
                      {Object.entries(huntResults).map(([key, val]) => (
                        <tr key={key}>
                          <td>{key}</td>
                          <td>{typeof val === 'object' ? JSON.stringify(val) : String(val)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Respond Modal */}
      <Modal show={showRespondModal} onHide={() => setShowRespondModal(false)}>
        <Modal.Header closeButton><Modal.Title>Respond to Alert</Modal.Title></Modal.Header>
        <Modal.Body>
          <p><strong>Alert:</strong> {selectedAlert?.title}</p>
          <Form.Group className="mb-3"><Form.Label>Action</Form.Label><Form.Select value={respondAction} onChange={e => setRespondAction(e.target.value)}>
            <option value="quarantine">Quarantine</option>
            <option value="block">Block</option>
            <option value="investigate">Investigate</option>
            <option value="dismiss">Dismiss</option>
          </Form.Select></Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowRespondModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleRespond}>Execute</Button>
        </Modal.Footer>
      </Modal>

      {/* Correlation Modal */}
      <Modal show={showCorrelationModal} onHide={() => setShowCorrelationModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Correlation Rule</Modal.Title></Modal.Header>
        <Form onSubmit={handleCorrelationSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={correlationForm.name} onChange={e => setCorrelationForm({...correlationForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Rule Expression</Form.Label><Form.Control as="textarea" required value={correlationForm.rule} onChange={e => setCorrelationForm({...correlationForm, rule: e.target.value})} placeholder="e.g. alert.severity == 'critical'" /></Form.Group>
            <Form.Check type="switch" label="Enabled" checked={correlationForm.enabled} onChange={e => setCorrelationForm({...correlationForm, enabled: e.target.checked})} />
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowCorrelationModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default XDRDashboard;
