import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const EDRDashboard = () => {
  const writeAllowed = canWrite();
  const [agents, setAgents] = useState([]);
  const [detections, setDetections] = useState([]);
  const [telemetry, setTelemetry] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAgentModal, setShowAgentModal] = useState(false);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [agentForm, setAgentForm] = useState({ hostname: '', ip_address: '', os: '', version: '', status: 'online' });
  const [responseForm, setResponseForm] = useState({ action_type: 'isolate', notes: '' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [agentsRes, detRes, teleRes, metRes] = await Promise.all([
        axios.get('/edr/agents', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/edr/detections', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/edr/telemetry?limit=100', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/edr/metrics', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setAgents(agentsRes.data.data || []);
      setDetections(detRes.data.data || []);
      setTelemetry(teleRes.data.data || []);
      setMetrics(metRes.data.data);
      setError(null);
    } catch (err) {
      setError('Failed to load EDR data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAgentSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/edr/agents', agentForm, { headers: { 'x-tenant-id': tenantId } });
      setShowAgentModal(false);
      setAgentForm({ hostname: '', ip_address: '', os: '', version: '', status: 'online' });
      loadAllData();
    } catch (err) {
      setError('Failed to register agent');
    }
  };

  const handleResponseSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/edr/response', { detection_id: selectedDetection?.id, ...responseForm }, { headers: { 'x-tenant-id': tenantId } });
      setShowResponseModal(false);
      setSelectedDetection(null);
      setResponseForm({ action_type: 'isolate', notes: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to send response action');
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  const totalOnline = agents.filter(a => a.status === 'online').length;
  const criticalCount = detections.filter(d => d.severity === 'critical').length;

  return (
    <Container fluid>
      <h2 className="mb-4">EDR - Endpoint Detection & Response</h2>
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{metrics?.total_agents || agents.length}</h3><small>Total Agents</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{metrics?.online_agents || totalOnline}</h3><small>Online</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{metrics?.detections || detections.length}</h3><small>Detections</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{metrics?.critical_detections || criticalCount}</h3><small>Critical</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="agents">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="agents">Agents</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="detections">Detections</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="telemetry">Telemetry</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="agents">
                <div className="d-flex justify-content-between mb-3"><h4>Endpoint Agents</h4><Button onClick={() => setShowAgentModal(true)}>Register Agent</Button></div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Hostname</th><th>IP</th><th>OS</th><th>Version</th><th>Status</th></tr></thead>
                  <tbody>
                    {agents.map(a => (
                      <tr key={a.id}>
                        <td>{a.hostname}</td><td>{a.ip_address}</td><td>{a.os}</td><td>{a.version}</td>
                        <td><Badge bg={a.status === 'online' ? 'success' : 'secondary'}>{a.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="detections">
                <h4>Detections</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Hostname</th><th>Severity</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {detections.map(d => (
                      <tr key={d.id}>
                        <td>{d.hostname || d.agent_hostname}</td>
                        <td><Badge bg={d.severity === 'critical' ? 'danger' : d.severity === 'high' ? 'warning' : d.severity === 'medium' ? 'info' : 'secondary'}>{d.severity}</Badge></td>
                        <td>{d.type || d.detection_type}</td>
                        <td><Badge bg={d.status === 'open' ? 'danger' : 'success'}>{d.status}</Badge></td>
                        <td>
                          <Button size="sm" variant="warning" onClick={() => { setSelectedDetection(d); setShowResponseModal(true); }}>Response</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="telemetry">
                <h4>Telemetry Events</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Agent</th><th>Event Type</th><th>Timestamp</th></tr></thead>
                  <tbody>
                    {telemetry.map(t => (
                      <tr key={t.id}>
                        <td>{t.agent_hostname || t.agent_id}</td>
                        <td><Badge bg="info">{t.event_type}</Badge></td>
                        <td>{new Date(t.timestamp || t.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      <Modal show={showAgentModal} onHide={() => setShowAgentModal(false)}>
        <Modal.Header closeButton><Modal.Title>Register Agent</Modal.Title></Modal.Header>
        <Form onSubmit={handleAgentSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Hostname</Form.Label><Form.Control required value={agentForm.hostname} onChange={e => setAgentForm({...agentForm, hostname: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control required value={agentForm.ip_address} onChange={e => setAgentForm({...agentForm, ip_address: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>OS</Form.Label><Form.Control value={agentForm.os} onChange={e => setAgentForm({...agentForm, os: e.target.value})} placeholder="Windows, Linux, macOS" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Version</Form.Label><Form.Control value={agentForm.version} onChange={e => setAgentForm({...agentForm, version: e.target.value})} placeholder="1.0.0" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Status</Form.Label><Form.Select value={agentForm.status} onChange={e => setAgentForm({...agentForm, status: e.target.value})}>
              <option value="online">Online</option><option value="offline">Offline</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowAgentModal(false)}>Cancel</Button><Button type="submit">Register</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showResponseModal} onHide={() => setShowResponseModal(false)}>
        <Modal.Header closeButton><Modal.Title>Response Action</Modal.Title></Modal.Header>
        <Form onSubmit={handleResponseSubmit}>
          <Modal.Body>
            <p>Detection: <strong>{selectedDetection?.hostname || selectedDetection?.agent_hostname}</strong> - {selectedDetection?.type || selectedDetection?.detection_type}</p>
            <Form.Group className="mb-3"><Form.Label>Action Type</Form.Label><Form.Select value={responseForm.action_type} onChange={e => setResponseForm({...responseForm, action_type: e.target.value})}>
              <option value="isolate">Isolate Endpoint</option><option value="kill_process">Kill Process</option><option value="quarantine">Quarantine File</option><option value="scan">Run Scan</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Notes</Form.Label><Form.Control as="textarea" value={responseForm.notes} onChange={e => setResponseForm({...responseForm, notes: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowResponseModal(false)}>Cancel</Button><Button type="submit">Execute</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default EDRDashboard;
