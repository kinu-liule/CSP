import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const SIEMSOARDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [events, setEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [sources, setSources] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);

  const [sourceForm, setSourceForm] = useState({ name: '', source_type: 'firewall', ip_address: '', port: 514, protocol: 'UDP', format: 'syslog' });
  const [alertForm, setAlertForm] = useState({ alert_name: '', severity: 'high', description: '', status: 'new', assigned_to: '' });
  const [ruleForm, setRuleForm] = useState({ name: '', description: '', query: '', condition_expression: '', severity: 'medium', enabled: true });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, eventsRes, alertsRes, sourcesRes, rulesRes] = await Promise.all([
        axios.get('/siem/dashboard', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/siem/events?limit=50', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/siem/alerts', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/siem/sources', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/siem/rules', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setEvents(eventsRes.data.data || []);
      setAlerts(alertsRes.data.data || []);
      setSources(sourcesRes.data.data || []);
      setRules(rulesRes.data.data || []);
    } catch (err) {
      setError('Failed to load SIEM data');
    } finally {
      setLoading(false);
    }
  };

  const handleSourceSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/siem/sources', sourceForm, { headers: { 'x-tenant-id': tenantId } });
      setShowSourceModal(false);
      setSourceForm({ name: '', source_type: 'firewall', ip_address: '', port: 514, protocol: 'UDP', format: 'syslog' });
      loadAllData();
    } catch (err) {
      setError('Failed to save source');
    }
  };

  const handleAlertUpdate = async (id, status, assigned_to) => {
    try {
      await axios.put(`/siem/alerts/${id}`, { status, assigned_to }, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    } catch (err) {
      setError('Failed to update alert');
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">SIEM - Security Information & Event Management</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={2}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.total_events || 0}</h3><small>Events</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-danger"><Card.Body><h3>{dashboard?.total_alerts || 0}</h3><small>Alerts</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-warning"><Card.Body><h3>{dashboard?.new_alerts || 0}</h3><small>New Alerts</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-info"><Card.Body><h3>{dashboard?.critical_events || 0}</h3><small>Critical</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-success"><Card.Body><h3>{sources.length}</h3><small>Sources</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-secondary"><Card.Body><h3>{rules.length}</h3><small>Rules</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="alerts">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="alerts">Alerts</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="events">Events</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="sources">Log Sources</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="rules">Alert Rules</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="alerts">
                <div className="d-flex justify-content-between mb-3"><h4>Security Alerts</h4></div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Time</th><th>Name</th><th>Severity</th><th>Status</th><th>Assigned To</th><th>Actions</th></tr></thead>
                  <tbody>
                    {alerts.map(a => (
                      <tr key={a.id}>
                        <td>{new Date(a.triggered_at).toLocaleString()}</td><td>{a.alert_name}</td>
                        <td><Badge bg={a.severity === 'critical' ? 'danger' : a.severity === 'high' ? 'warning' : 'info'}>{a.severity}</Badge></td>
                        <td><Badge bg={a.status === 'new' ? 'danger' : a.status === 'investigating' ? 'warning' : 'success'}>{a.status}</Badge></td>
                        <td>{a.assigned_to || 'Unassigned'}</td>
                        <td>
                          <Button size="sm" onClick={() => handleAlertUpdate(a.id, 'resolved', a.assigned_to)}>Resolve</Button>{' '}
                          <Button size="sm" variant="warning" onClick={() => handleAlertUpdate(a.id, 'investigating', 'analyst')}>Investigate</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="events">
                <h4>Security Events ({events.length})</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Time</th><th>Source</th><th>Type</th><th>Severity</th><th>Message</th></tr></thead>
                  <tbody>
                    {events.map(e => (
                      <tr key={e.id}>
                        <td><small>{new Date(e.event_time).toLocaleString()}</small></td><td>{e.source_name}</td><td>{e.event_type}</td>
                        <td><Badge bg={e.severity === 'critical' ? 'danger' : e.severity === 'high' ? 'warning' : 'info'}>{e.severity}</Badge></td>
                        <td><small>{e.message}</small></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="sources">
                <div className="d-flex justify-content-between mb-3"><h4>Log Sources</h4>{writeAllowed && (<Button onClick={() => setShowSourceModal(true)}>Add Source</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>IP Address</th><th>Port</th><th>Status</th></tr></thead>
                  <tbody>
                    {sources.map(s => (
                      <tr key={s.id}><td>{s.name}</td><td>{s.source_type}</td><td>{s.ip_address}</td><td>{s.port}</td>
                        <td><Badge bg={s.enabled ? 'success' : 'secondary'}>{s.enabled ? 'Active' : 'Disabled'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="rules">
                <div className="d-flex justify-content-between mb-3"><h4>Alert Rules</h4>{writeAllowed && (<Button onClick={() => setShowRuleModal(true)}>Add Rule</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Condition</th><th>Severity</th><th>Status</th></tr></thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.id}><td>{r.name}</td><td><small>{r.condition_expression}</small></td>
                        <td><Badge bg={r.severity === 'critical' ? 'danger' : r.severity === 'high' ? 'warning' : 'info'}>{r.severity}</Badge></td>
                        <td><Badge bg={r.enabled ? 'success' : 'secondary'}>{r.enabled ? 'Active' : 'Disabled'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Source Modal */}
      <Modal show={showSourceModal} onHide={() => setShowSourceModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Log Source</Modal.Title></Modal.Header>
        <Form onSubmit={handleSourceSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={sourceForm.name} onChange={e => setSourceForm({...sourceForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={sourceForm.source_type} onChange={e => setSourceForm({...sourceForm, source_type: e.target.value})}>
              <option value="firewall">Firewall</option><option value="web_server">Web Server</option><option value="authentication">Authentication</option><option value="database">Database</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control value={sourceForm.ip_address} onChange={e => setSourceForm({...sourceForm, ip_address: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Port</Form.Label><Form.Control type="number" value={sourceForm.port} onChange={e => setSourceForm({...sourceForm, port: parseInt(e.target.value)})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowSourceModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Rule Modal */}
      <Modal show={showRuleModal} onHide={() => setShowRuleModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Alert Rule</Modal.Title></Modal.Header>
        <Form onSubmit={async (e) => { e.preventDefault(); await axios.post('/siem/rules', ruleForm, { headers: { 'x-tenant-id': tenantId } }); setShowRuleModal(false); setRuleForm({ name: '', description: '', query: '', condition_expression: '', severity: 'medium', enabled: true }); loadAllData(); }}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={ruleForm.name} onChange={e => setRuleForm({...ruleForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Condition</Form.Label><Form.Control as="textarea" value={ruleForm.condition_expression} onChange={e => setRuleForm({...ruleForm, condition_expression: e.target.value})} placeholder="event_type=&quot;login_failed&quot; AND count > 5" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Severity</Form.Label><Form.Select value={ruleForm.severity} onChange={e => setRuleForm({...ruleForm, severity: e.target.value})}>
              <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowRuleModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default SIEMSOARDashboard;
