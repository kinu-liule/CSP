import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const AssetMgmtDashboard = () => {
  const writeAllowed = canWrite();
  const [assets, setAssets] = useState([]);
  const [vulns, setVulns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAssetModal, setShowAssetModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [assetForm, setAssetForm] = useState({ name: '', ip_address: '', asset_type: 'server', os: '', department: '', location: '', status: 'online' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [assetsRes] = await Promise.all([
        axios.get('/assets/assets', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setAssets(assetsRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load asset data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadVulns = async () => {
    try {
      setVulns([]);
      const results = await Promise.all(
        assets.map(a =>
          axios.get(`/assets/assets/${a.id}/vulns`, { headers: { 'x-tenant-id': tenantId } })
            .then(r => (r.data.data || []).map(v => ({ ...v, asset_name: a.name, asset_ip: a.ip_address })))
            .catch(() => [])
        )
      );
      setVulns(results.flat());
    } catch (err) {
      setError('Failed to load vulnerabilities');
    }
  };

  const handleAssetSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAsset) {
        await axios.put(`/assets/assets/${editingAsset.id}`, assetForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/assets/assets', assetForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowAssetModal(false);
      setEditingAsset(null);
      setAssetForm({ name: '', ip_address: '', asset_type: 'server', os: '', department: '', location: '', status: 'online' });
      loadAllData();
    } catch (err) {
      setError('Failed to save asset');
    }
  };

  const deleteAsset = async (id) => {
    if (window.confirm('Delete this asset?')) {
      await axios.delete(`/assets/assets/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  const totalOnline = assets.filter(a => a.status === 'online').length;
  const totalOffline = assets.filter(a => a.status === 'offline').length;

  return (
    <Container fluid>
      <h2 className="mb-4">Asset Management</h2>
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{assets.length}</h3><small>Total Assets</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{totalOnline}</h3><small>Online</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-secondary"><Card.Body><h3>{totalOffline}</h3><small>Offline</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{vulns.length || 0}</h3><small>Vulnerable</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="assets">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="assets">Assets</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="vulnerabilities" onSelect={loadVulns}>Vulnerabilities</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="assets">
                <div className="d-flex justify-content-between mb-3"><h4>Assets</h4>{writeAllowed && (<Button onClick={() => { setEditingAsset(null); setShowAssetModal(true); }}>Add Asset</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>IP Address</th><th>Type</th><th>OS</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {assets.map(a => (
                      <tr key={a.id}>
                        <td>{a.name}</td><td>{a.ip_address}</td><td>{a.asset_type}</td><td>{a.os}</td>
                        <td><Badge bg={a.status === 'online' ? 'success' : 'secondary'}>{a.status}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingAsset(a); setAssetForm(a); setShowAssetModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteAsset(a.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="vulnerabilities">
                <h4>Asset Vulnerabilities</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Asset</th><th>IP</th><th>Vulnerability</th><th>Severity</th><th>Status</th></tr></thead>
                  <tbody>
                    {vulns.length === 0 && (
                      <tr><td colSpan={5} className="text-center">No vulnerabilities found. Click the tab to refresh.</td></tr>
                    )}
                    {vulns.map((v, i) => (
                      <tr key={v.id || i}>
                        <td>{v.asset_name}</td><td>{v.asset_ip}</td><td>{v.name || v.vulnerability || v.title}</td>
                        <td><Badge bg={v.severity === 'critical' ? 'danger' : v.severity === 'high' ? 'warning' : v.severity === 'medium' ? 'info' : 'secondary'}>{v.severity}</Badge></td>
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

      <Modal show={showAssetModal} onHide={() => setShowAssetModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingAsset ? 'Edit' : 'Add'} Asset</Modal.Title></Modal.Header>
        <Form onSubmit={handleAssetSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={assetForm.name} onChange={e => setAssetForm({...assetForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control required value={assetForm.ip_address} onChange={e => setAssetForm({...assetForm, ip_address: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={assetForm.asset_type} onChange={e => setAssetForm({...assetForm, asset_type: e.target.value})}>
              <option value="server">Server</option><option value="workstation">Workstation</option><option value="network">Network</option><option value="cloud">Cloud</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>OS</Form.Label><Form.Control value={assetForm.os} onChange={e => setAssetForm({...assetForm, os: e.target.value})} placeholder="Linux, Windows, etc." /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Department</Form.Label><Form.Control value={assetForm.department} onChange={e => setAssetForm({...assetForm, department: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Location</Form.Label><Form.Control value={assetForm.location} onChange={e => setAssetForm({...assetForm, location: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Status</Form.Label><Form.Select value={assetForm.status} onChange={e => setAssetForm({...assetForm, status: e.target.value})}>
              <option value="online">Online</option><option value="offline">Offline</option><option value="maintenance">Maintenance</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowAssetModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default AssetMgmtDashboard;
