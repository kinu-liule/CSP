import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const DevSecOpsDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [pipelines, setPipelines] = useState([]);
  const [scans, setScans] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);

  const [pipelineForm, setPipelineForm] = useState({ name: '', repo: '', branch: 'main', build_command: '', artifact_path: '' });
  const [policyForm, setPolicyForm] = useState({ name: '', severity: 'high', action: 'block', description: '' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, pipeRes, scanRes, polRes] = await Promise.all([
        axios.get('/devsecops/health', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/devsecops/pipelines', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/devsecops/scans', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/devsecops/policies', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard({ health: dashRes.data });
      setPipelines(pipeRes.data.data || []);
      setScans(scanRes.data.data || []);
      setPolicies(polRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load DevSecOps data');
    } finally {
      setLoading(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const res = await axios.get('/devsecops/metrics', { headers: { 'x-tenant-id': tenantId } });
      setDashboard(prev => ({ ...prev, metrics: res.data.data }));
    } catch (err) {
    }
  };

  useEffect(() => { if (!loading) loadMetrics(); }, [loading]);

  const handlePipelineSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/devsecops/pipelines', pipelineForm, { headers: { 'x-tenant-id': tenantId } });
      setShowPipelineModal(false);
      setPipelineForm({ name: '', repo: '', branch: 'main', build_command: '', artifact_path: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to register pipeline');
    }
  };

  const handlePolicySubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPolicy) {
        await axios.put(`/devsecops/policies/${editingPolicy.id}`, policyForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/devsecops/policies', policyForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowPolicyModal(false);
      setEditingPolicy(null);
      setPolicyForm({ name: '', severity: 'high', action: 'block', description: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save policy');
    }
  };

  const handleTriggerScan = async () => {
    try {
      await axios.post('/devsecops/scans', {}, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    } catch (err) {
      setError('Failed to trigger scan');
    }
  };

  const deletePipeline = async (id) => {
    if (window.confirm('Delete this pipeline?')) {
      await axios.delete(`/devsecops/pipelines/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  const deletePolicy = async (id) => {
    if (window.confirm('Delete this policy?')) {
      await axios.delete(`/devsecops/policies/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  const getSeverityBadge = (sev) => {
    if (sev === 'critical' || sev === 'high') return 'danger';
    if (sev === 'medium') return 'warning';
    return 'info';
  };

  const failedGates = dashboard?.metrics?.failed_gates || 0;

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">DevSecOps</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{pipelines.length}</h3><small>Pipelines</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{scans.length}</h3><small>Scans</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{policies.length}</h3><small>Policies</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{failedGates}</h3><small>Failed Gates</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="pipelines">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="pipelines">Pipelines</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="scans">Scans</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="policies">Policies</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="pipelines">
                <div className="d-flex justify-content-between mb-3"><h4>CI/CD Pipelines</h4><Button onClick={() => setShowPipelineModal(true)}>Register Pipeline</Button></div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Repo</th><th>Branch</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {pipelines.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td><td>{p.repo}</td><td>{p.branch}</td>
                        <td><Badge bg={p.status === 'success' ? 'success' : p.status === 'failed' ? 'danger' : 'secondary'}>{p.status || 'registered'}</Badge></td>
                        <td>
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deletePipeline(p.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="scans">
                <div className="d-flex justify-content-between mb-3">
                  <h4>Security Scans</h4>
                  <Button onClick={handleTriggerScan}>Trigger Scan</Button>
                </div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Pipeline</th><th>Type</th><th>Status</th><th>Findings</th></tr></thead>
                  <tbody>
                    {scans.map(s => (
                      <tr key={s.id}>
                        <td>{s.pipeline_name || s.pipeline_id}</td><td>{s.scan_type || s.type}</td>
                        <td><Badge bg={s.status === 'completed' ? 'success' : s.status === 'failed' ? 'danger' : 'warning'}>{s.status || 'pending'}</Badge></td>
                        <td>{s.findings_count ?? s.findings ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="policies">
                <div className="d-flex justify-content-between mb-3"><h4>Deployment Policies</h4>{writeAllowed && (<Button onClick={() => { setEditingPolicy(null); setShowPolicyModal(true); }}>Add Policy</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Severity</th><th>Action</th><th>Actions</th></tr></thead>
                  <tbody>
                    {policies.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td><Badge bg={getSeverityBadge(p.severity)}>{p.severity}</Badge></td>
                        <td><Badge bg={p.action === 'block' ? 'danger' : 'warning'}>{p.action}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingPolicy(p); setPolicyForm(p); setShowPolicyModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deletePolicy(p.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Pipeline Modal */}
      <Modal show={showPipelineModal} onHide={() => setShowPipelineModal(false)}>
        <Modal.Header closeButton><Modal.Title>Register Pipeline</Modal.Title></Modal.Header>
        <Form onSubmit={handlePipelineSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={pipelineForm.name} onChange={e => setPipelineForm({...pipelineForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Repository URL</Form.Label><Form.Control required value={pipelineForm.repo} onChange={e => setPipelineForm({...pipelineForm, repo: e.target.value})} placeholder="https://github.com/org/repo" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Branch</Form.Label><Form.Control value={pipelineForm.branch} onChange={e => setPipelineForm({...pipelineForm, branch: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Build Command</Form.Label><Form.Control value={pipelineForm.build_command} onChange={e => setPipelineForm({...pipelineForm, build_command: e.target.value})} placeholder="npm run build" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Artifact Path</Form.Label><Form.Control value={pipelineForm.artifact_path} onChange={e => setPipelineForm({...pipelineForm, artifact_path: e.target.value})} placeholder="dist/" /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowPipelineModal(false)}>Cancel</Button><Button type="submit">Register</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Policy Modal */}
      <Modal show={showPolicyModal} onHide={() => setShowPolicyModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingPolicy ? 'Edit' : 'Add'} Policy</Modal.Title></Modal.Header>
        <Form onSubmit={handlePolicySubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={policyForm.name} onChange={e => setPolicyForm({...policyForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={policyForm.description} onChange={e => setPolicyForm({...policyForm, description: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Severity</Form.Label><Form.Select value={policyForm.severity} onChange={e => setPolicyForm({...policyForm, severity: e.target.value})}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Action</Form.Label><Form.Select value={policyForm.action} onChange={e => setPolicyForm({...policyForm, action: e.target.value})}>
              <option value="block">Block</option><option value="warn">Warn</option><option value="log">Log</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowPolicyModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default DevSecOpsDashboard;
