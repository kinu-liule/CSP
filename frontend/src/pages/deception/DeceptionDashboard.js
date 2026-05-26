import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Nav, Tab, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const DeceptionDashboard = () => {
  const writeAllowed = canWrite();
  const [metrics, setMetrics] = useState(null);
  const [honeypots, setHoneypots] = useState([]);
  const [attacks, setAttacks] = useState([]);
  const [honeytokens, setHoneytokens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showHoneypotModal, setShowHoneypotModal] = useState(false);
  const [showHoneytokenModal, setShowHoneytokenModal] = useState(false);

  const [honeypotForm, setHoneypotForm] = useState({ name: '', type: 'ssh', ip: '', port: 22, status: 'active' });
  const [honeytokenForm, setHoneytokenForm] = useState({ token: '', type: 'credential', status: 'active' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [metricsRes, hpRes, attRes, htRes] = await Promise.all([
        axios.get('/deception/metrics', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/deception/honeypots', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/deception/attacks', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/deception/honeytokens', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setMetrics(metricsRes.data.data);
      setHoneypots(hpRes.data.data || []);
      setAttacks(attRes.data.data || []);
      setHoneytokens(htRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load deception data');
    } finally {
      setLoading(false);
    }
  };

  const handleHoneypotSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/deception/honeypots', honeypotForm, { headers: { 'x-tenant-id': tenantId } });
      setShowHoneypotModal(false);
      setHoneypotForm({ name: '', type: 'ssh', ip: '', port: 22, status: 'active' });
      loadAllData();
    } catch (err) {
      setError('Failed to deploy honeypot');
    }
  };

  const handleHoneytokenSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/deception/honeytokens', honeytokenForm, { headers: { 'x-tenant-id': tenantId } });
      setShowHoneytokenModal(false);
      setHoneytokenForm({ token: '', type: 'credential', status: 'active' });
      loadAllData();
    } catch (err) {
      setError('Failed to generate honeytoken');
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'active' || status === 'triggered') return 'danger';
    if (status === 'deployed') return 'success';
    return 'secondary';
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Deception Technology</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{metrics?.honeypots || 0}</h3><small>Honeypots</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{metrics?.attacks_7d || 0}</h3><small>Attacks (7d)</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{metrics?.honeytokens || 0}</h3><small>Honeytokens</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{metrics?.total_interactions || 0}</h3><small>Total Interactions</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="honeypots">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="honeypots">Honeypots</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="attacks">Attacks</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="honeytokens">Honeytokens</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="honeypots">
                <div className="d-flex justify-content-between mb-3"><h4>Honeypots</h4><Button onClick={() => setShowHoneypotModal(true)}>Deploy Honeypot</Button></div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>IP</th><th>Port</th><th>Status</th></tr></thead>
                  <tbody>
                    {honeypots.map(h => (
                      <tr key={h.id}>
                        <td>{h.name}</td><td>{h.type}</td><td>{h.ip}</td><td>{h.port}</td>
                        <td><Badge bg={getStatusBadge(h.status)}>{h.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="attacks">
                <h4>Attack Attempts</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Timestamp</th><th>Honeypot</th><th>Source IP</th><th>Attack Type</th></tr></thead>
                  <tbody>
                    {attacks.map(a => (
                      <tr key={a.id}>
                        <td>{new Date(a.timestamp).toLocaleString()}</td><td>{a.honeypot_name}</td>
                        <td>{a.source_ip}</td><td><Badge bg="danger">{a.attack_type}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="honeytokens">
                <div className="d-flex justify-content-between mb-3"><h4>Honeytokens</h4><Button onClick={() => setShowHoneytokenModal(true)}>Generate Token</Button></div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Token</th><th>Type</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {honeytokens.map(t => (
                      <tr key={t.id}>
                        <td><code>{t.token}</code></td><td>{t.type}</td>
                        <td><Badge bg={getStatusBadge(t.status)}>{t.status}</Badge></td>
                        <td>{new Date(t.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Deploy Honeypot Modal */}
      <Modal show={showHoneypotModal} onHide={() => setShowHoneypotModal(false)}>
        <Modal.Header closeButton><Modal.Title>Deploy Honeypot</Modal.Title></Modal.Header>
        <Form onSubmit={handleHoneypotSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={honeypotForm.name} onChange={e => setHoneypotForm({...honeypotForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={honeypotForm.type} onChange={e => setHoneypotForm({...honeypotForm, type: e.target.value})}>
              <option value="ssh">SSH</option><option value="http">HTTP</option><option value="mysql">MySQL</option><option value="rdp">RDP</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control required value={honeypotForm.ip} onChange={e => setHoneypotForm({...honeypotForm, ip: e.target.value})} placeholder="10.0.0.1" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Port</Form.Label><Form.Control type="number" required value={honeypotForm.port} onChange={e => setHoneypotForm({...honeypotForm, port: parseInt(e.target.value)})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowHoneypotModal(false)}>Cancel</Button><Button type="submit">Deploy</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Generate Honeytoken Modal */}
      <Modal show={showHoneytokenModal} onHide={() => setShowHoneytokenModal(false)}>
        <Modal.Header closeButton><Modal.Title>Generate Honeytoken</Modal.Title></Modal.Header>
        <Form onSubmit={handleHoneytokenSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Token Value</Form.Label><Form.Control required value={honeytokenForm.token} onChange={e => setHoneytokenForm({...honeytokenForm, token: e.target.value})} placeholder="sk-xxxxxxxxxxxx" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={honeytokenForm.type} onChange={e => setHoneytokenForm({...honeytokenForm, type: e.target.value})}>
              <option value="credential">Credential</option><option value="api_key">API Key</option><option value="database">Database</option><option value="file">File</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowHoneytokenModal(false)}>Cancel</Button><Button type="submit">Generate</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default DeceptionDashboard;
