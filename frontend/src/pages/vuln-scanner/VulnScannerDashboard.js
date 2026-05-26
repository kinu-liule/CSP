import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert, ProgressBar } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const VulnScannerDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showVulnModal, setShowVulnModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);

  const [assetForm, setAssetForm] = useState({ name: '', asset_type: 'server', ip_address: '', hostname: '', os: '', owner: '' });
  const [vulnForm, setVulnForm] = useState({ cve_id: '', title: '', description: '', severity: 'high', cvss_score: 7.5, affected_asset: '', status: 'open' });
  const [scanForm, setScanForm] = useState({ scan_type: 'full', target: '', scan_config: '' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, assetsRes, vulnsRes, scansRes] = await Promise.all([
        axios.get('/scanner/dashboard', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/scanner/assets', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/scanner/vulnerabilities', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/scanner/scans', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setAssets(assetsRes.data.data || []);
      setVulnerabilities(vulnsRes.data.data || []);
      setScans(scansRes.data.data || []);
    } catch (err) {
      setError('Failed to load scanner data');
    } finally {
      setLoading(false);
    }
  };

  const handleAssetSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/scanner/assets', assetForm, { headers: { 'x-tenant-id': tenantId } });
      setShowAssetModal(false);
      setAssetForm({ name: '', asset_type: 'server', ip_address: '', hostname: '', os: '', owner: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to save asset');
    }
  };

  const handleVulnSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/scanner/vulnerabilities', vulnForm, { headers: { 'x-tenant-id': tenantId } });
      setShowVulnModal(false);
      setVulnForm({ cve_id: '', title: '', description: '', severity: 'high', cvss_score: 7.5, affected_asset: '', status: 'open' });
      loadAllData();
    } catch (err) {
      setError('Failed to save vulnerability');
    }
  };

  const handleScanSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/scanner/scans', scanForm, { headers: { 'x-tenant-id': tenantId } });
      setShowScanModal(false);
      setScanForm({ scan_type: 'full', target: '', scan_config: '' });
      loadAllData();
      setTimeout(loadAllData, 6000);
    } catch (err) {
      setError('Failed to start scan');
    }
  };

  const getSeverityBadge = (severity) => {
    const colors = { critical: 'danger', high: 'warning', medium: 'info', low: 'success' };
    return <Badge bg={colors[severity] || 'secondary'}>{severity}</Badge>;
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Vulnerability Scanner</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={2}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.total_assets || 0}</h3><small>Assets</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-danger"><Card.Body><h3>{dashboard?.critical || 0}</h3><small>Critical</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-warning"><Card.Body><h3>{dashboard?.high || 0}</h3><small>High</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-info"><Card.Body><h3>{dashboard?.medium || 0}</h3><small>Medium</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-success"><Card.Body><h3>{dashboard?.low || 0}</h3><small>Low</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-secondary"><Card.Body><h3>{dashboard?.open || 0}</h3><small>Open</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="vulnerabilities">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="vulnerabilities">Vulnerabilities</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="assets">Assets</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="scans">Scans</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="vulnerabilities">
                <div className="d-flex justify-content-between mb-3"><h4>Vulnerabilities</h4>{writeAllowed && (<Button onClick={() => setShowVulnModal(true)}>Add Vulnerability</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>CVE</th><th>Title</th><th>Severity</th><th>CVSS</th><th>Asset</th><th>Status</th></tr></thead>
                  <tbody>
                    {vulnerabilities.map(v => (
                      <tr key={v.id}>
                        <td><small>{v.cve_id || 'N/A'}</small></td><td>{v.title}</td>
                        <td>{getSeverityBadge(v.severity)}</td>
                        <td>{v.cvss_score}</td><td>{v.affected_asset}</td>
                        <td><Badge bg={v.status === 'open' ? 'danger' : 'success'}>{v.status}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="assets">
                <div className="d-flex justify-content-between mb-3"><h4>Assets</h4>{writeAllowed && (<Button onClick={() => setShowAssetModal(true)}>Add Asset</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>IP Address</th><th>OS</th><th>Owner</th></tr></thead>
                  <tbody>
                    {assets.map(a => (
                      <tr key={a.id}><td>{a.name}</td><td>{a.asset_type}</td><td>{a.ip_address}</td><td>{a.os}</td><td>{a.owner}</td></tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="scans">
                <div className="d-flex justify-content-between mb-3"><h4>Scan History</h4><Button onClick={() => setShowScanModal(true)}>Start Scan</Button></div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Type</th><th>Target</th><th>Status</th><th>Found</th><th>Critical</th><th>High</th></tr></thead>
                  <tbody>
                    {scans.map(s => (
                      <tr key={s.id}>
                        <td>{s.scan_type}</td><td>{s.target}</td>
                        <td><Badge bg={s.status === 'completed' ? 'success' : 'warning'}>{s.status}</Badge></td>
                        <td>{s.vulnerabilities_found}</td><td>{s.critical_count}</td><td>{s.high_count}</td>
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
        <Modal.Header closeButton><Modal.Title>Add Asset</Modal.Title></Modal.Header>
        <Form onSubmit={handleAssetSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={assetForm.name} onChange={e => setAssetForm({...assetForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={assetForm.asset_type} onChange={e => setAssetForm({...assetForm, asset_type: e.target.value})}>
              <option value="server">Server</option><option value="workstation">Workstation</option><option value="network">Network Device</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control value={assetForm.ip_address} onChange={e => setAssetForm({...assetForm, ip_address: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>OS</Form.Label><Form.Control value={assetForm.os} onChange={e => setAssetForm({...assetForm, os: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowAssetModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Vulnerability Modal */}
      <Modal show={showVulnModal} onHide={() => setShowVulnModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Vulnerability</Modal.Title></Modal.Header>
        <Form onSubmit={handleVulnSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>CVE ID</Form.Label><Form.Control value={vulnForm.cve_id} onChange={e => setVulnForm({...vulnForm, cve_id: e.target.value})} placeholder="CVE-2024-1234" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Title</Form.Label><Form.Control required value={vulnForm.title} onChange={e => setVulnForm({...vulnForm, title: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Severity</Form.Label><Form.Select value={vulnForm.severity} onChange={e => setVulnForm({...vulnForm, severity: e.target.value})}>
              <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>CVSS Score</Form.Label><Form.Control type="number" step="0.1" value={vulnForm.cvss_score} onChange={e => setVulnForm({...vulnForm, cvss_score: parseFloat(e.target.value)})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowVulnModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Scan Modal */}
      <Modal show={showScanModal} onHide={() => setShowScanModal(false)}>
        <Modal.Header closeButton><Modal.Title>Start New Scan</Modal.Title></Modal.Header>
        <Form onSubmit={handleScanSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Scan Type</Form.Label><Form.Select value={scanForm.scan_type} onChange={e => setScanForm({...scanForm, scan_type: e.target.value})}>
              <option value="full">Full Scan</option><option value="quick">Quick Scan</option><option value="targeted">Targeted Scan</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Target (IP/Range)</Form.Label><Form.Control required value={scanForm.target} onChange={e => setScanForm({...scanForm, target: e.target.value})} placeholder="192.168.1.0/24" /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowScanModal(false)}>Cancel</Button><Button type="submit">Start Scan</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default VulnScannerDashboard;
