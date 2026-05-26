import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const CSPMDashboard = () => {
  const writeAllowed = canWrite();
  const [accounts, setAccounts] = useState([]);
  const [findings, setFindings] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAccountModal, setShowAccountModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [scanning, setScanning] = useState(false);

  const [accountForm, setAccountForm] = useState({ name: '', provider: 'aws', region: '', status: 'active' });
  const [policyForm, setPolicyForm] = useState({ name: '', description: '', severity: 'medium', enabled: true });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [acctsRes, findRes, polRes, metRes] = await Promise.all([
        axios.get('/cspm/accounts', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/cspm/findings', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/cspm/policies', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/cspm/metrics', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setAccounts(acctsRes.data.data || []);
      setFindings(findRes.data.data || []);
      setPolicies(polRes.data.data || []);
      setMetrics(metRes.data.data);
      setError(null);
    } catch (err) {
      setError('Failed to load CSPM data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/cspm/accounts', accountForm, { headers: { 'x-tenant-id': tenantId } });
      setShowAccountModal(false);
      setAccountForm({ name: '', provider: 'aws', region: '', status: 'active' });
      loadAllData();
    } catch (err) {
      setError('Failed to save account');
    }
  };

  const handlePolicySubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingPolicy) {
        await axios.put(`/cspm/policies/${editingPolicy.id}`, policyForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/cspm/policies', policyForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowPolicyModal(false);
      setEditingPolicy(null);
      setPolicyForm({ name: '', description: '', severity: 'medium', enabled: true });
      loadAllData();
    } catch (err) {
      setError('Failed to save policy');
    }
  };

  const handleScan = async () => {
    try {
      setScanning(true);
      await axios.post('/cspm/scan', {}, { headers: { 'x-tenant-id': tenantId } });
      alert('Scan triggered successfully');
      loadAllData();
    } catch (err) {
      setError('Failed to trigger scan');
    } finally {
      setScanning(false);
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">CSPM - Cloud Security Posture Management</h2>
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{metrics?.total_accounts || accounts.length}</h3><small>Total Accounts</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{metrics?.open_findings_by_severity ? Object.values(metrics.open_findings_by_severity).reduce((a, b) => a + b, 0) : findings.filter(f => f.status !== 'resolved').length}</h3><small>Open Findings</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{metrics?.compliance_score ? `${metrics.compliance_score}%` : 'N/A'}</h3><small>Compliance Score</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{metrics?.policies || policies.length}</h3><small>Policies</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="accounts">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="accounts">Accounts</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="findings">Findings</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="policies">Policies</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="accounts">
                <div className="d-flex justify-content-between mb-3"><h4>Cloud Accounts</h4>{writeAllowed && (<Button onClick={() => setShowAccountModal(true)}>Add Account</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Provider</th><th>Region</th><th>Status</th></tr></thead>
                  <tbody>
                    {accounts.map(a => (
                      <tr key={a.id}>
                        <td>{a.name}</td><td>{a.provider}</td><td>{a.region}</td>
                        <td><Badge bg={a.status === 'active' ? 'success' : 'secondary'}>{a.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="findings">
                <div className="d-flex justify-content-between mb-3">
                  <h4>Findings</h4>
                  <Button variant="warning" onClick={handleScan} disabled={scanning}>{scanning ? 'Scanning...' : 'Trigger Scan'}</Button>
                </div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Resource</th><th>Severity</th><th>Status</th><th>Account</th></tr></thead>
                  <tbody>
                    {findings.map(f => (
                      <tr key={f.id}>
                        <td>{f.resource || f.resource_name}</td>
                        <td><Badge bg={f.severity === 'critical' ? 'danger' : f.severity === 'high' ? 'warning' : f.severity === 'medium' ? 'info' : 'secondary'}>{f.severity}</Badge></td>
                        <td><Badge bg={f.status === 'open' ? 'danger' : 'success'}>{f.status}</Badge></td>
                        <td>{f.account || f.account_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="policies">
                <div className="d-flex justify-content-between mb-3"><h4>Policies</h4>{writeAllowed && (<Button onClick={() => { setEditingPolicy(null); setShowPolicyModal(true); }}>Add Policy</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Severity</th><th>Enabled</th></tr></thead>
                  <tbody>
                    {policies.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td><Badge bg={p.severity === 'critical' ? 'danger' : p.severity === 'high' ? 'warning' : 'info'}>{p.severity}</Badge></td>
                        <td><Badge bg={p.enabled ? 'success' : 'secondary'}>{p.enabled ? 'Yes' : 'No'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      <Modal show={showAccountModal} onHide={() => setShowAccountModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Account</Modal.Title></Modal.Header>
        <Form onSubmit={handleAccountSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={accountForm.name} onChange={e => setAccountForm({...accountForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Provider</Form.Label><Form.Select value={accountForm.provider} onChange={e => setAccountForm({...accountForm, provider: e.target.value})}>
              <option value="aws">AWS</option><option value="azure">Azure</option><option value="gcp">GCP</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Region</Form.Label><Form.Control value={accountForm.region} onChange={e => setAccountForm({...accountForm, region: e.target.value})} placeholder="us-east-1" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Status</Form.Label><Form.Select value={accountForm.status} onChange={e => setAccountForm({...accountForm, status: e.target.value})}>
              <option value="active">Active</option><option value="inactive">Inactive</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowAccountModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showPolicyModal} onHide={() => setShowPolicyModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingPolicy ? 'Edit' : 'Add'} Policy</Modal.Title></Modal.Header>
        <Form onSubmit={handlePolicySubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={policyForm.name} onChange={e => setPolicyForm({...policyForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control as="textarea" value={policyForm.description} onChange={e => setPolicyForm({...policyForm, description: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Severity</Form.Label><Form.Select value={policyForm.severity} onChange={e => setPolicyForm({...policyForm, severity: e.target.value})}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </Form.Select></Form.Group>
            <Form.Check type="switch" label="Enabled" checked={policyForm.enabled} onChange={e => setPolicyForm({...policyForm, enabled: e.target.checked})} />
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowPolicyModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default CSPMDashboard;
