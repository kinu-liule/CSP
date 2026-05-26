import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const SOARDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [playbooks, setPlaybooks] = useState([]);
  const [cases, setCases] = useState([]);
  const [connectors, setConnectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showPlaybookModal, setShowPlaybookModal] = useState(false);
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [showConnectorModal, setShowConnectorModal] = useState(false);
  const [editingPlaybook, setEditingPlaybook] = useState(null);
  const [editingCase, setEditingCase] = useState(null);
  const [editingConnector, setEditingConnector] = useState(null);

  const [playbookForm, setPlaybookForm] = useState({ name: '', trigger: 'manual', description: '' });
  const [caseForm, setCaseForm] = useState({ title: '', severity: 'medium', description: '' });
  const [connectorForm, setConnectorForm] = useState({ name: '', connector_type: 'email', config: '' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, pbRes, caseRes, connRes] = await Promise.all([
        axios.get('/soar/metrics', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/soar/playbooks', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/soar/cases', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/soar/connectors', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setPlaybooks(pbRes.data.data || []);
      setCases(caseRes.data.data || []);
      setConnectors(connRes.data.data || []);
    } catch (err) {
      setError('Failed to load SOAR data');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaybookSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/soar/playbooks', playbookForm, { headers: { 'x-tenant-id': tenantId } });
      setShowPlaybookModal(false);
      setPlaybookForm({ name: '', trigger: 'manual', description: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save playbook');
    }
  };

  const handleCaseSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/soar/cases', caseForm, { headers: { 'x-tenant-id': tenantId } });
      setShowCaseModal(false);
      setCaseForm({ title: '', severity: 'medium', description: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save case');
    }
  };

  const handleConnectorSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/soar/connectors', connectorForm, { headers: { 'x-tenant-id': tenantId } });
      setShowConnectorModal(false);
      setConnectorForm({ name: '', connector_type: 'email', config: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save connector');
    }
  };

  const executePlaybook = async (id) => {
    if (window.confirm('Execute this playbook?')) {
      try {
        await axios.post(`/soar/playbooks/${id}/execute`, {}, { headers: { 'x-tenant-id': tenantId } });
        loadAllData();
      } catch (err) {
        setError('Failed to execute playbook');
      }
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">SOAR - Orchestration</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.playbooks || playbooks.length}</h3><small>Playbooks</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{dashboard?.cases || cases.length}</h3><small>Cases</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{dashboard?.connectors || connectors.length}</h3><small>Connectors</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{dashboard?.executions || 0}</h3><small>Executions</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="playbooks">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="playbooks">Playbooks</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="cases">Cases</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="connectors">Connectors</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="playbooks">
                <div className="d-flex justify-content-between mb-3"><h4>Playbooks</h4>{writeAllowed && (<Button onClick={() => { setEditingPlaybook(null); setShowPlaybookModal(true); }}>Add Playbook</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Trigger</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {playbooks.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td><td>{p.trigger}</td>
                        <td><Badge bg={p.status === 'active' ? 'success' : 'secondary'}>{p.status}</Badge></td>
                        <td>
                          <Button size="sm" variant="success" onClick={() => executePlaybook(p.id)}>Execute</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="cases">
                <div className="d-flex justify-content-between mb-3"><h4>Cases</h4>{writeAllowed && (<Button onClick={() => { setEditingCase(null); setShowCaseModal(true); }}>Add Case</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Title</th><th>Severity</th><th>Status</th><th>Created</th></tr></thead>
                  <tbody>
                    {cases.map(c => (
                      <tr key={c.id}>
                        <td>{c.title}</td>
                        <td><Badge bg={c.severity === 'critical' ? 'danger' : c.severity === 'high' ? 'warning' : 'info'}>{c.severity}</Badge></td>
                        <td><Badge bg={c.status === 'open' ? 'danger' : c.status === 'in_progress' ? 'warning' : 'success'}>{c.status}</Badge></td>
                        <td>{new Date(c.created_at || c.created).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="connectors">
                <div className="d-flex justify-content-between mb-3"><h4>Connectors</h4>{writeAllowed && (<Button onClick={() => { setEditingConnector(null); setShowConnectorModal(true); }}>Add Connector</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>Status</th></tr></thead>
                  <tbody>
                    {connectors.map(c => (
                      <tr key={c.id}>
                        <td>{c.name}</td><td>{c.connector_type}</td>
                        <td><Badge bg={c.status === 'connected' ? 'success' : 'danger'}>{c.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Playbook Modal */}
      <Modal show={showPlaybookModal} onHide={() => setShowPlaybookModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Playbook</Modal.Title></Modal.Header>
        <Form onSubmit={handlePlaybookSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={playbookForm.name} onChange={e => setPlaybookForm({...playbookForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Trigger</Form.Label><Form.Select value={playbookForm.trigger} onChange={e => setPlaybookForm({...playbookForm, trigger: e.target.value})}>
              <option value="manual">Manual</option><option value="incident">On Incident</option><option value="scheduled">Scheduled</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={playbookForm.description} onChange={e => setPlaybookForm({...playbookForm, description: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowPlaybookModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Case Modal */}
      <Modal show={showCaseModal} onHide={() => setShowCaseModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Case</Modal.Title></Modal.Header>
        <Form onSubmit={handleCaseSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Title</Form.Label><Form.Control required value={caseForm.title} onChange={e => setCaseForm({...caseForm, title: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Severity</Form.Label><Form.Select value={caseForm.severity} onChange={e => setCaseForm({...caseForm, severity: e.target.value})}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={caseForm.description} onChange={e => setCaseForm({...caseForm, description: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowCaseModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Connector Modal */}
      <Modal show={showConnectorModal} onHide={() => setShowConnectorModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Connector</Modal.Title></Modal.Header>
        <Form onSubmit={handleConnectorSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={connectorForm.name} onChange={e => setConnectorForm({...connectorForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={connectorForm.connector_type} onChange={e => setConnectorForm({...connectorForm, connector_type: e.target.value})}>
              <option value="email">Email</option><option value="slack">Slack</option><option value="pagerduty">PagerDuty</option><option value="webhook">Webhook</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Config (JSON)</Form.Label><Form.Control as="textarea" value={connectorForm.config} onChange={e => setConnectorForm({...connectorForm, config: e.target.value})} placeholder='{"url":"..."}' /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowConnectorModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default SOARDashboard;
