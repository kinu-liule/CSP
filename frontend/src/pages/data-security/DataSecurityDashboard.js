import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const DataSecurityDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [editingPolicy, setEditingPolicy] = useState(null);

  const [assetForm, setAssetForm] = useState({ name: '', asset_type: 'database', classification: 'internal', location: '' });
  const [policyForm, setPolicyForm] = useState({ name: '', severity: 'medium', pattern: '', action: 'alert' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, assetRes, polRes, violRes] = await Promise.all([
        axios.get('/data-security/metrics', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/data-security/assets', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/data-security/policies', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/data-security/violations', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setAssets(assetRes.data.data || []);
      setPolicies(polRes.data.data || []);
      setViolations(violRes.data.data || []);
    } catch (err) {
      setError('Failed to load data security data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssetSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/data-security/assets', assetForm, { headers: { 'x-tenant-id': tenantId } });
      setShowAssetModal(false);
      setAssetForm({ name: '', asset_type: 'database', classification: 'internal', location: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save data asset');
    }
  };

  const handlePolicySubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/data-security/policies', policyForm, { headers: { 'x-tenant-id': tenantId } });
      setShowPolicyModal(false);
      setPolicyForm({ name: '', severity: 'medium', pattern: '', action: 'alert' });
      loadAllData();
    } catch (err) {
      setError('Failed to save DLP policy');
    }
  };

  const runScan = async () => {
    try {
      await axios.post('/data-security/scan', {}, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    } catch (err) {
      setError('Failed to start scan');
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Data Security</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.data_assets || assets.length}</h3><small>Data Assets</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{dashboard?.dlp_policies || policies.length}</h3><small>DLP Policies</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{dashboard?.open_violations || violations.filter(v => v.status === 'open').length}</h3><small>Open Violations</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{dashboard?.critical_violations || violations.filter(v => v.severity === 'critical').length}</h3><small>Critical</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="assets">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="assets">Data Assets</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="policies">DLP Policies</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="violations">Violations</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="assets">
                <div className="d-flex justify-content-between mb-3">
                  <h4>Data Assets</h4>
                  <div><Button variant="info" className="me-2" onClick={runScan}>Run Scan</Button>{writeAllowed && (<Button onClick={() => { setEditingAsset(null); setShowAssetModal(true); }}>Add Asset</Button>)}</div>
                </div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>Classification</th><th>Location</th></tr></thead>
                  <tbody>
                    {assets.map(a => (
                      <tr key={a.id}>
                        <td>{a.name}</td><td>{a.asset_type}</td>
                        <td><Badge bg={a.classification === 'critical' ? 'danger' : a.classification === 'sensitive' ? 'warning' : 'info'}>{a.classification}</Badge></td>
                        <td>{a.location}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="policies">
                <div className="d-flex justify-content-between mb-3"><h4>DLP Policies</h4>{writeAllowed && (<Button onClick={() => { setEditingPolicy(null); setShowPolicyModal(true); }}>Add Policy</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Severity</th><th>Pattern</th><th>Actions</th></tr></thead>
                  <tbody>
                    {policies.map(p => (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td><Badge bg={p.severity === 'high' ? 'danger' : p.severity === 'medium' ? 'warning' : 'info'}>{p.severity}</Badge></td>
                        <td><code>{p.pattern}</code></td>
                        <td><Badge bg={p.action === 'block' ? 'danger' : 'primary'}>{p.action}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="violations">
                <h4>Data Violations</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Asset</th><th>Policy</th><th>Severity</th><th>Status</th></tr></thead>
                  <tbody>
                    {violations.map(v => (
                      <tr key={v.id}>
                        <td>{v.asset_name || v.asset_id}</td><td>{v.policy_name || v.policy_id}</td>
                        <td><Badge bg={v.severity === 'critical' ? 'danger' : v.severity === 'high' ? 'warning' : 'info'}>{v.severity}</Badge></td>
                        <td><Badge bg={v.status === 'open' ? 'danger' : 'success'}>{v.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Asset Modal */}
      <Modal show={showAssetModal} onHide={() => setShowAssetModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Data Asset</Modal.Title></Modal.Header>
        <Form onSubmit={handleAssetSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={assetForm.name} onChange={e => setAssetForm({...assetForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={assetForm.asset_type} onChange={e => setAssetForm({...assetForm, asset_type: e.target.value})}>
              <option value="database">Database</option><option value="file_server">File Server</option><option value="cloud_storage">Cloud Storage</option><option value="endpoint">Endpoint</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Classification</Form.Label><Form.Select value={assetForm.classification} onChange={e => setAssetForm({...assetForm, classification: e.target.value})}>
              <option value="internal">Internal</option><option value="sensitive">Sensitive</option><option value="critical">Critical</option><option value="public">Public</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Location</Form.Label><Form.Control value={assetForm.location} onChange={e => setAssetForm({...assetForm, location: e.target.value})} placeholder="e.g. /data/customer-db" /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowAssetModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Policy Modal */}
      <Modal show={showPolicyModal} onHide={() => setShowPolicyModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add DLP Policy</Modal.Title></Modal.Header>
        <Form onSubmit={handlePolicySubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={policyForm.name} onChange={e => setPolicyForm({...policyForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Severity</Form.Label><Form.Select value={policyForm.severity} onChange={e => setPolicyForm({...policyForm, severity: e.target.value})}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Pattern</Form.Label><Form.Control required value={policyForm.pattern} onChange={e => setPolicyForm({...policyForm, pattern: e.target.value})} placeholder="e.g. SSN-regex, credit-card-regex" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Action</Form.Label><Form.Select value={policyForm.action} onChange={e => setPolicyForm({...policyForm, action: e.target.value})}>
              <option value="alert">Alert</option><option value="block">Block</option><option value="quarantine">Quarantine</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowPolicyModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default DataSecurityDashboard;
