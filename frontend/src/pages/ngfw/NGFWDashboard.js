import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const NGFWDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const [ruleForm, setRuleForm] = useState({ name: '', source_zone: '', dest_zone: '', dest_port: '80', protocol: 'TCP', action: 'allow', enabled: true });
  const [zoneForm, setZoneForm] = useState({ name: '', description: '', interface_name: '', subnet: '', security_level: 50 });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, rulesRes, logsRes, zonesRes] = await Promise.all([
        axios.get('/ngfw/dashboard', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/ngfw/rules', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/ngfw/logs?limit=50', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/ngfw/zones', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setRules(rulesRes.data.data || []);
      setLogs(logsRes.data.data || []);
      setZones(zonesRes.data.data || []);
    } catch (err) {
      setError('Failed to load NGFW data');
    } finally {
      setLoading(false);
    }
  };

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRule) {
        await axios.put(`/ngfw/rules/${editingRule.id}`, ruleForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/ngfw/rules', ruleForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowRuleModal(false);
      setEditingRule(null);
      setRuleForm({ name: '', source_zone: '', dest_zone: '', dest_port: '80', protocol: 'TCP', action: 'allow', enabled: true });
      loadAllData();
    } catch (err) {
      setError('Failed to save rule');
    }
  };

  const deleteRule = async (id) => {
    if (window.confirm('Delete this rule?')) {
      await axios.delete(`/ngfw/rules/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">NGFW - Next-Generation Firewall</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.total_rules || 0}</h3><small>Total Rules</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{dashboard?.active_rules || 0}</h3><small>Active Rules</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{dashboard?.total_zones || 0}</h3><small>Zones</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{dashboard?.blocked_today || 0}</h3><small>Blocked Today</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="rules">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="rules">Firewall Rules</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="zones">Zones</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="logs">Logs</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="rules">
                <div className="d-flex justify-content-between mb-3"><h4>Firewall Rules</h4>{writeAllowed && (<Button onClick={() => { setEditingRule(null); setShowRuleModal(true); }}>Add Rule</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Source Zone</th><th>Dest Zone</th><th>Port</th><th>Protocol</th><th>Action</th><th>Actions</th></tr></thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.id}>
                        <td>{r.name}</td><td>{r.source_zone}</td><td>{r.dest_zone}</td><td>{r.dest_port}</td><td>{r.protocol}</td>
                        <td><Badge bg={r.action === 'allow' ? 'success' : 'danger'}>{r.action}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingRule(r); setRuleForm(r); setShowRuleModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteRule(r.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="zones">
                <div className="d-flex justify-content-between mb-3"><h4>Network Zones</h4>{writeAllowed && (<Button onClick={() => setShowZoneModal(true)}>Add Zone</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Interface</th><th>Subnet</th><th>Security Level</th></tr></thead>
                  <tbody>
                    {zones.map(z => (
                      <tr key={z.id}><td>{z.name}</td><td>{z.interface_name}</td><td>{z.subnet}</td><td>
                        <Badge bg={z.security_level > 70 ? 'success' : z.security_level > 40 ? 'warning' : 'danger'}>{z.security_level}</Badge>
                      </td></tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="logs">
                <h4>Recent Logs</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Time</th><th>Source IP</th><th>Dest IP</th><th>Port</th><th>Action</th></tr></thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td>{new Date(l.timestamp).toLocaleTimeString()}</td><td>{l.source_ip}</td><td>{l.dest_ip}</td>
                        <td>{l.dest_port}</td><td><Badge bg={l.action === 'deny' ? 'danger' : 'success'}>{l.action}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Rule Modal */}
      <Modal show={showRuleModal} onHide={() => setShowRuleModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingRule ? 'Edit' : 'Add'} Rule</Modal.Title></Modal.Header>
        <Form onSubmit={handleRuleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={ruleForm.name} onChange={e => setRuleForm({...ruleForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Source Zone</Form.Label><Form.Select value={ruleForm.source_zone} onChange={e => setRuleForm({...ruleForm, source_zone: e.target.value})}>
              <option value="">Any</option>{zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Dest Zone</Form.Label><Form.Select value={ruleForm.dest_zone} onChange={e => setRuleForm({...ruleForm, dest_zone: e.target.value})}>
              <option value="">Any</option>{zones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Dest Port</Form.Label><Form.Control value={ruleForm.dest_port} onChange={e => setRuleForm({...ruleForm, dest_port: e.target.value})} placeholder="80,443 or 1-1024" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Protocol</Form.Label><Form.Select value={ruleForm.protocol} onChange={e => setRuleForm({...ruleForm, protocol: e.target.value})}>
              <option value="TCP">TCP</option><option value="UDP">UDP</option><option value="ICMP">ICMP</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Action</Form.Label><Form.Select value={ruleForm.action} onChange={e => setRuleForm({...ruleForm, action: e.target.value})}>
              <option value="allow">Allow</option><option value="deny">Deny</option><option value="reject">Reject</option>
            </Form.Select></Form.Group>
            <Form.Check type="switch" label="Enabled" checked={ruleForm.enabled} onChange={e => setRuleForm({...ruleForm, enabled: e.target.checked})} />
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowRuleModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Zone Modal */}
      <Modal show={showZoneModal} onHide={() => setShowZoneModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Zone</Modal.Title></Modal.Header>
        <Form onSubmit={async (e) => { e.preventDefault(); await axios.post('/ngfw/zones', zoneForm, { headers: { 'x-tenant-id': tenantId } }); setShowZoneModal(false); setZoneForm({ name: '', description: '', interface_name: '', subnet: '', security_level: 50 }); loadAllData(); }}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={zoneForm.name} onChange={e => setZoneForm({...zoneForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Interface</Form.Label><Form.Control value={zoneForm.interface_name} onChange={e => setZoneForm({...zoneForm, interface_name: e.target.value})} placeholder="eth0" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Subnet</Form.Label><Form.Control value={zoneForm.subnet} onChange={e => setZoneForm({...zoneForm, subnet: e.target.value})} placeholder="10.0.0.0/24" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Security Level (0-100)</Form.Label><Form.Control type="number" min="0" max="100" value={zoneForm.security_level} onChange={e => setZoneForm({...zoneForm, security_level: parseInt(e.target.value)})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowZoneModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default NGFWDashboard;
