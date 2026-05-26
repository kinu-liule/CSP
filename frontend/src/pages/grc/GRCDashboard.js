import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Nav, Tab, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const GRCDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [controls, setControls] = useState([]);
  const [risks, setRisks] = useState([]);
  const [frameworks, setFrameworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal states
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [showControlModal, setShowControlModal] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [editingControl, setEditingControl] = useState(null);
  const [editingRisk, setEditingRisk] = useState(null);

  // Form states
  const [policyForm, setPolicyForm] = useState({ name: '', description: '', policy_type: 'security', framework: 'ISO27001', status: 'active' });
  const [controlForm, setControlForm] = useState({ name: '', description: '', control_type: 'technical', framework: 'ISO27001', policy_id: '', implementation_status: 'not_started' });
  const [riskForm, setRiskForm] = useState({ title: '', description: '', category: 'operational', likelihood: 3, impact: 3, treatment: 'mitigate' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, polRes, ctrlRes, riskRes, frmRes] = await Promise.all([
        axios.get('/grc/dashboard', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/grc/policies', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/grc/controls', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/grc/risks', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/grc/frameworks', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setPolicies(polRes.data.data || []);
      setControls(ctrlRes.data.data || []);
      setRisks(riskRes.data.data || []);
      setFrameworks(frmRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load GRC data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePolicySubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPolicy) {
        await axios.put(`/grc/policies/${editingPolicy.id}`, policyForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/grc/policies', policyForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowPolicyModal(false);
      setEditingPolicy(null);
      setPolicyForm({ name: '', description: '', policy_type: 'security', framework: 'ISO27001', status: 'active' });
      loadAllData();
    } catch (err) {
      setError('Failed to save policy');
    }
  };

  const handleControlSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingControl) {
        await axios.put(`/grc/controls/${editingControl.id}`, controlForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/grc/controls', controlForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowControlModal(false);
      setEditingControl(null);
      setControlForm({ name: '', description: '', control_type: 'technical', framework: 'ISO27001', policy_id: '', implementation_status: 'not_started' });
      loadAllData();
    } catch (err) {
      setError('Failed to save control');
    }
  };

  const handleRiskSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRisk) {
        await axios.put(`/grc/risks/${editingRisk.id}`, riskForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/grc/risks', riskForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowRiskModal(false);
      setEditingRisk(null);
      setRiskForm({ title: '', description: '', category: 'operational', likelihood: 3, impact: 3, treatment: 'mitigate' });
      loadAllData();
    } catch (err) {
      setError('Failed to save risk');
    }
  };

  const deletePolicy = async (id) => {
    if (window.confirm('Delete this policy?')) {
      await axios.delete(`/grc/policies/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  const deleteControl = async (id) => {
    if (window.confirm('Delete this control?')) {
      await axios.delete(`/grc/controls/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  const deleteRisk = async (id) => {
    if (window.confirm('Delete this risk?')) {
      await axios.delete(`/grc/risks/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  const getRiskBadge = (score) => {
    if (score >= 15) return 'danger';
    if (score >= 10) return 'warning';
    return 'info';
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">GRC Platform</h2>
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

      {/* Dashboard Cards */}
      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.policies || 0}</h3><small>Policies</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{dashboard?.controls || 0}</h3><small>Controls</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{dashboard?.risks || 0}</h3><small>Risks</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{dashboard?.critical_risks || 0}</h3><small>Critical Risks</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="policies">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="policies">Policies</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="controls">Controls</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="risks">Risks</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="frameworks">Frameworks</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="policies">
                <div className="d-flex justify-content-between mb-3"><h4>Policies</h4>{writeAllowed && (<Button onClick={() => { setEditingPolicy(null); setShowPolicyModal(true); }}>Add Policy</Button>)}</div>
                <Table striped bordered hover>
                  <thead><tr><th>Name</th><th>Type</th><th>Framework</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {policies.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td><td>{p.policy_type}</td><td>{p.framework}</td>
                        <td><Badge bg={p.status === 'active' ? 'success' : 'secondary'}>{p.status}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingPolicy(p); setPolicyForm(p); setShowPolicyModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deletePolicy(p.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="controls">
                <div className="d-flex justify-content-between mb-3"><h4>Controls</h4>{writeAllowed && (<Button onClick={() => { setEditingControl(null); setShowControlModal(true); }}>Add Control</Button>)}</div>
                <Table striped bordered hover>
                  <thead><tr><th>Name</th><th>Type</th><th>Framework</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {controls.map(c => (
                      <tr key={c.id}>
                        <td>{c.name}</td><td>{c.control_type}</td><td>{c.framework}</td>
                        <td><Badge bg={c.implementation_status === 'implemented' ? 'success' : 'warning'}>{c.implementation_status}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingControl(c); setControlForm(c); setShowControlModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteControl(c.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="risks">
                <div className="d-flex justify-content-between mb-3"><h4>Risks</h4>{writeAllowed && (<Button onClick={() => { setEditingRisk(null); setShowRiskModal(true); }}>Add Risk</Button>)}</div>
                <Table striped bordered hover>
                  <thead><tr><th>Title</th><th>Category</th><th>Score</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {risks.map(r => (
                      <tr key={r.id}>
                        <td>{r.title}</td><td>{r.category}</td>
                        <td><Badge bg={getRiskBadge(r.risk_score)}>{r.risk_score}</Badge></td>
                        <td><Badge bg={r.status === 'open' ? 'danger' : 'success'}>{r.status}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingRisk(r); setRiskForm(r); setShowRiskModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteRisk(r.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="frameworks">
                <h4>Compliance Frameworks</h4>
                <Table striped bordered hover>
                  <thead><tr><th>Name</th><th>Version</th><th>Requirements</th></tr></thead>
                  <tbody>
                    {frameworks.map(f => (
                      <tr key={f.id}><td>{f.name}</td><td>{f.version}</td><td>{f.requirements_count}</td></tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Policy Modal */}
      <Modal show={showPolicyModal} onHide={() => setShowPolicyModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingPolicy ? 'Edit' : 'Add'} Policy</Modal.Title></Modal.Header>
        <Form onSubmit={handlePolicySubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={policyForm.name} onChange={e => setPolicyForm({...policyForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={policyForm.description} onChange={e => setPolicyForm({...policyForm, description: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={policyForm.policy_type} onChange={e => setPolicyForm({...policyForm, policy_type: e.target.value})}>
              <option value="security">Security</option><option value="privacy">Privacy</option><option value="compliance">Compliance</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Framework</Form.Label><Form.Select value={policyForm.framework} onChange={e => setPolicyForm({...policyForm, framework: e.target.value})}>
              <option value="ISO27001">ISO 27001</option><option value="GDPR">GDPR</option><option value="HIPAA">HIPAA</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowPolicyModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Control Modal */}
      <Modal show={showControlModal} onHide={() => setShowControlModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingControl ? 'Edit' : 'Add'} Control</Modal.Title></Modal.Header>
        <Form onSubmit={handleControlSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={controlForm.name} onChange={e => setControlForm({...controlForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={controlForm.control_type} onChange={e => setControlForm({...controlForm, control_type: e.target.value})}>
              <option value="technical">Technical</option><option value="administrative">Administrative</option><option value="physical">Physical</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Implementation Status</Form.Label><Form.Select value={controlForm.implementation_status} onChange={e => setControlForm({...controlForm, implementation_status: e.target.value})}>
              <option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="implemented">Implemented</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowControlModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Risk Modal */}
      <Modal show={showRiskModal} onHide={() => setShowRiskModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingRisk ? 'Edit' : 'Add'} Risk</Modal.Title></Modal.Header>
        <Form onSubmit={handleRiskSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Title</Form.Label><Form.Control required value={riskForm.title} onChange={e => setRiskForm({...riskForm, title: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Category</Form.Label><Form.Select value={riskForm.category} onChange={e => setRiskForm({...riskForm, category: e.target.value})}>
              <option value="operational">Operational</option><option value="financial">Financial</option><option value="strategic">Strategic</option><option value="compliance">Compliance</option>
            </Form.Select></Form.Group>
            <Row>
              <Col><Form.Group><Form.Label>Likelihood (1-5)</Form.Label><Form.Control type="number" min="1" max="5" value={riskForm.likelihood} onChange={e => setRiskForm({...riskForm, likelihood: parseInt(e.target.value)})} /></Form.Group></Col>
              <Col><Form.Group><Form.Label>Impact (1-5)</Form.Label><Form.Control type="number" min="1" max="5" value={riskForm.impact} onChange={e => setRiskForm({...riskForm, impact: parseInt(e.target.value)})} /></Form.Group></Col>
            </Row>
            <Form.Group className="mb-3"><Form.Label>Treatment</Form.Label><Form.Select value={riskForm.treatment} onChange={e => setRiskForm({...riskForm, treatment: e.target.value})}>
              <option value="mitigate">Mitigate</option><option value="transfer">Transfer</option><option value="accept">Accept</option><option value="avoid">Avoid</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowRiskModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default GRCDashboard;
