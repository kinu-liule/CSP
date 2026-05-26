import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const BusinessContDashboard = () => {
  const writeAllowed = canWrite();
  const [metrics, setMetrics] = useState(null);
  const [processes, setProcesses] = useState([]);
  const [plans, setPlans] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showProcessModal, setShowProcessModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [editingProcess, setEditingProcess] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);
  const [editingTest, setEditingTest] = useState(null);

  const [processForm, setProcessForm] = useState({ name: '', description: '', rto_minutes: 60, rpo_minutes: 30, department: '', status: 'active' });
  const [planForm, setPlanForm] = useState({ name: '', description: '', type: 'disaster_recovery', status: 'draft', version: '1.0' });
  const [testForm, setTestForm] = useState({ plan_id: '', test_type: 'tabletop', status: 'scheduled', result: '', scheduled_date: '' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [metricsRes, procRes, plansRes, testsRes] = await Promise.all([
        axios.get('/bcp/metrics', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/bcp/processes', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/bcp/plans', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/bcp/tests', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setMetrics(metricsRes.data.data);
      setProcesses(procRes.data.data || []);
      setPlans(plansRes.data.data || []);
      setTests(testsRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load BCP data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleProcessSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingProcess) {
        await axios.put(`/bcp/processes/${editingProcess.id}`, processForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/bcp/processes', processForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowProcessModal(false);
      setEditingProcess(null);
      setProcessForm({ name: '', description: '', rto_minutes: 60, rpo_minutes: 30, department: '', status: 'active' });
      loadAllData();
    } catch (err) {
      setError('Failed to save process');
    }
  };

  const handlePlanSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await axios.put(`/bcp/plans/${editingPlan.id}`, planForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/bcp/plans', planForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowPlanModal(false);
      setEditingPlan(null);
      setPlanForm({ name: '', description: '', type: 'disaster_recovery', status: 'draft', version: '1.0' });
      loadAllData();
    } catch (err) {
      setError('Failed to save plan');
    }
  };

  const handleTestSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTest) {
        await axios.put(`/bcp/tests/${editingTest.id}`, testForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/bcp/tests', testForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowTestModal(false);
      setEditingTest(null);
      setTestForm({ plan_id: '', test_type: 'tabletop', status: 'scheduled', result: '', scheduled_date: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save test');
    }
  };

  const activatePlan = async (id) => {
    try {
      await axios.post(`/bcp/plans/${id}/activate`, {}, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    } catch (err) {
      setError('Failed to activate plan');
    }
  };

  const deleteProcess = async (id) => {
    if (window.confirm('Delete this process?')) {
      try {
        await axios.delete(`/bcp/processes/${id}`, { headers: { 'x-tenant-id': tenantId } });
        loadAllData();
      } catch (err) { setError('Failed to delete process'); }
    }
  };

  const deletePlan = async (id) => {
    if (window.confirm('Delete this plan?')) {
      try {
        await axios.delete(`/bcp/plans/${id}`, { headers: { 'x-tenant-id': tenantId } });
        loadAllData();
      } catch (err) { setError('Failed to delete plan'); }
    }
  };

  const deleteTest = async (id) => {
    if (window.confirm('Delete this test?')) {
      try {
        await axios.delete(`/bcp/tests/${id}`, { headers: { 'x-tenant-id': tenantId } });
        loadAllData();
      } catch (err) { setError('Failed to delete test'); }
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Business Continuity & Disaster Recovery</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{metrics?.total_processes ?? processes.length}</h3><small>Processes</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{metrics?.total_plans ?? plans.length}</h3><small>Plans</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{metrics?.active_plans ?? plans.filter(p => p.status === 'active').length}</h3><small>Active Plans</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{metrics?.tests_completed ?? tests.filter(t => t.status === 'completed').length}</h3><small>Tests Completed</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="processes">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="processes">Processes</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="plans">Plans</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="tests">Tests</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="processes">
                <div className="d-flex justify-content-between mb-3"><h4>Business Processes</h4>{writeAllowed && (<Button onClick={() => { setEditingProcess(null); setShowProcessModal(true); }}>Add Process</Button>)}</div>
                <Table striped bordered hover>
                  <thead><tr><th>Name</th><th>RTO (min)</th><th>RPO (min)</th><th>Department</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {processes.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td><td>{p.rto_minutes}</td><td>{p.rpo_minutes}</td><td>{p.department}</td>
                        <td><Badge bg={p.status === 'active' ? 'success' : 'secondary'}>{p.status}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingProcess(p); setProcessForm(p); setShowProcessModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteProcess(p.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="plans">
                <div className="d-flex justify-content-between mb-3"><h4>Recovery Plans</h4>{writeAllowed && (<Button onClick={() => { setEditingPlan(null); setShowPlanModal(true); }}>Add Plan</Button>)}</div>
                <Table striped bordered hover>
                  <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Version</th><th>Actions</th></tr></thead>
                  <tbody>
                    {plans.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td><td>{p.type}</td>
                        <td><Badge bg={p.status === 'active' ? 'success' : p.status === 'draft' ? 'secondary' : 'warning'}>{p.status}</Badge></td>
                        <td>{p.version}</td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingPlan(p); setPlanForm(p); setShowPlanModal(true); }}>Edit</Button>{' '}
                          {p.status !== 'active' && <><Button size="sm" variant="success" onClick={() => activatePlan(p.id)}>Activate</Button>{' '}</>}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deletePlan(p.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="tests">
                <div className="d-flex justify-content-between mb-3"><h4>Tests & Exercises</h4><Button onClick={() => { setEditingTest(null); setShowTestModal(true); }}>Schedule Test</Button></div>
                <Table striped bordered hover>
                  <thead><tr><th>Plan</th><th>Type</th><th>Status</th><th>Result</th><th>Scheduled</th><th>Completed</th><th>Actions</th></tr></thead>
                  <tbody>
                    {tests.map(t => {
                      const plan = plans.find(p => p.id === t.plan_id);
                      return (
                        <tr key={t.id}>
                          <td>{plan?.name || t.plan_id}</td><td>{t.test_type}</td>
                          <td><Badge bg={t.status === 'completed' ? 'success' : t.status === 'in_progress' ? 'warning' : 'secondary'}>{t.status}</Badge></td>
                          <td>{t.result || '-'}</td>
                          <td>{t.scheduled_date ? new Date(t.scheduled_date).toLocaleDateString() : '-'}</td>
                          <td>{t.completed_date ? new Date(t.completed_date).toLocaleDateString() : '-'}</td>
                          <td>
                            <Button size="sm" onClick={() => { setEditingTest(t); setTestForm(t); setShowTestModal(true); }}>Edit</Button>{' '}
                            {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteTest(t.id)}>Delete</Button>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Process Modal */}
      <Modal show={showProcessModal} onHide={() => setShowProcessModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingProcess ? 'Edit' : 'Add'} Process</Modal.Title></Modal.Header>
        <Form onSubmit={handleProcessSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={processForm.name} onChange={e => setProcessForm({...processForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={processForm.description} onChange={e => setProcessForm({...processForm, description: e.target.value})} /></Form.Group>
            <Row>
              <Col><Form.Group><Form.Label>RTO (minutes)</Form.Label><Form.Control type="number" min="1" value={processForm.rto_minutes} onChange={e => setProcessForm({...processForm, rto_minutes: parseInt(e.target.value)})} /></Form.Group></Col>
              <Col><Form.Group><Form.Label>RPO (minutes)</Form.Label><Form.Control type="number" min="1" value={processForm.rpo_minutes} onChange={e => setProcessForm({...processForm, rpo_minutes: parseInt(e.target.value)})} /></Form.Group></Col>
            </Row>
            <Form.Group className="mb-3"><Form.Label>Department</Form.Label><Form.Control value={processForm.department} onChange={e => setProcessForm({...processForm, department: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Status</Form.Label><Form.Select value={processForm.status} onChange={e => setProcessForm({...processForm, status: e.target.value})}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowProcessModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Plan Modal */}
      <Modal show={showPlanModal} onHide={() => setShowPlanModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingPlan ? 'Edit' : 'Add'} Plan</Modal.Title></Modal.Header>
        <Form onSubmit={handlePlanSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={planForm.name} onChange={e => setPlanForm({...planForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={planForm.description} onChange={e => setPlanForm({...planForm, description: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={planForm.type} onChange={e => setPlanForm({...planForm, type: e.target.value})}>
              <option value="disaster_recovery">Disaster Recovery</option><option value="business_continuity">Business Continuity</option><option value="incident_response">Incident Response</option>
            </Form.Select></Form.Group>
            <Row>
              <Col><Form.Group><Form.Label>Status</Form.Label><Form.Select value={planForm.status} onChange={e => setPlanForm({...planForm, status: e.target.value})}>
                <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
              </Form.Select></Form.Group></Col>
              <Col><Form.Group><Form.Label>Version</Form.Label><Form.Control value={planForm.version} onChange={e => setPlanForm({...planForm, version: e.target.value})} /></Form.Group></Col>
            </Row>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowPlanModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Test Modal */}
      <Modal show={showTestModal} onHide={() => setShowTestModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingTest ? 'Edit' : 'Schedule'} Test</Modal.Title></Modal.Header>
        <Form onSubmit={handleTestSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Plan</Form.Label><Form.Select required value={testForm.plan_id} onChange={e => setTestForm({...testForm, plan_id: e.target.value})}>
              <option value="">Select plan...</option>
              {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Test Type</Form.Label><Form.Select value={testForm.test_type} onChange={e => setTestForm({...testForm, test_type: e.target.value})}>
              <option value="tabletop">Tabletop</option><option value="simulation">Simulation</option><option value="full_scale">Full Scale</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Status</Form.Label><Form.Select value={testForm.status} onChange={e => setTestForm({...testForm, status: e.target.value})}>
              <option value="scheduled">Scheduled</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Result</Form.Label><Form.Control as="textarea" value={testForm.result} onChange={e => setTestForm({...testForm, result: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Scheduled Date</Form.Label><Form.Control type="date" value={testForm.scheduled_date} onChange={e => setTestForm({...testForm, scheduled_date: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowTestModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default BusinessContDashboard;
