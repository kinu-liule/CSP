import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const WAFDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [rules, setRules] = useState([]);
  const [logs, setLogs] = useState([]);
  const [whitelist, setWhitelist] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showWLModal, setShowWLModal] = useState(false);
  const [showBLModal, setShowBLModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);

  const [ruleForm, setRuleForm] = useState({ name: '', description: '', rule_type: 'injection', pattern: '', action: 'block', priority: 100, enabled: true });
  const [wlForm, setWlForm] = useState({ ip_address: '', cidr_block: '', description: '' });
  const [blForm, setBlForm] = useState({ ip_address: '', cidr_block: '', reason: '', expires_at: '' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, rulesRes, logsRes, wlRes, blRes] = await Promise.all([
        axios.get('/waf/dashboard', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/waf/rules', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/waf/logs?limit=50', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/waf/whitelist', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/waf/blacklist', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setRules(rulesRes.data.data || []);
      setLogs(logsRes.data.data || []);
      setWhitelist(wlRes.data.data || []);
      setBlacklist(blRes.data.data || []);
    } catch (err) {
      setError('Failed to load WAF data');
    } finally {
      setLoading(false);
    }
  };

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingRule) {
        await axios.put(`/waf/rules/${editingRule.id}`, ruleForm, { headers: { 'x-tenant-id': tenantId } });
      } else {
        await axios.post('/waf/rules', ruleForm, { headers: { 'x-tenant-id': tenantId } });
      }
      setShowRuleModal(false);
      setEditingRule(null);
      setRuleForm({ name: '', description: '', rule_type: 'injection', pattern: '', action: 'block', priority: 100, enabled: true });
      loadAllData();
    } catch (err) {
      setError('Failed to save rule');
    }
  };

  const deleteRule = async (id) => {
    if (window.confirm('Delete this rule?')) {
      await axios.delete(`/waf/rules/${id}`, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">WAF - Web Application Firewall</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.total_rules || 0}</h3><small>Total Rules</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{dashboard?.active_rules || 0}</h3><small>Active Rules</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-danger"><Card.Body><h3>{dashboard?.blocked_today || 0}</h3><small>Blocked Today</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{logs.filter(l => l.blocked).length}</h3><small>Recent Blocks</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="rules">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="rules">Rules</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="logs">Logs</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="whitelist">Whitelist</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="blacklist">Blacklist</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="rules">
                <div className="d-flex justify-content-between mb-3"><h4>WAF Rules</h4>{writeAllowed && (<Button onClick={() => { setEditingRule(null); setShowRuleModal(true); }}>Add Rule</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>Action</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.id}>
                        <td>{r.name}</td><td>{r.rule_type}</td><td><Badge bg={r.action === 'block' ? 'danger' : 'warning'}>{r.action}</Badge></td>
                        <td>{r.priority}</td>
                        <td><Badge bg={r.enabled ? 'success' : 'secondary'}>{r.enabled ? 'Active' : 'Disabled'}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => { setEditingRule(r); setRuleForm(r); setShowRuleModal(true); }}>Edit</Button>{' '}
                          {writeAllowed && (<Button size="sm" variant="danger" onClick={() => deleteRule(r.id)}>Delete</Button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="logs">
                <h4>Recent Logs</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Time</th><th>IP</th><th>Path</th><th>Method</th><th>Action</th></tr></thead>
                  <tbody>
                    {logs.map(l => (
                      <tr key={l.id}>
                        <td>{new Date(l.timestamp).toLocaleTimeString()}</td><td>{l.source_ip}</td><td>{l.request_path}</td>
                        <td><Badge bg="info">{l.request_method}</Badge></td>
                        <td>{l.blocked ? <Badge bg="danger">Blocked</Badge> : <Badge bg="success">Allowed</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="whitelist">
                <div className="d-flex justify-content-between mb-3"><h4>Whitelist</h4>{writeAllowed && (<Button onClick={() => setShowWLModal(true)}>Add IP</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>IP Address</th><th>CIDR</th><th>Description</th><th>Actions</th></tr></thead>
                  <tbody>
                    {whitelist.map(w => (
                      <tr key={w.id}><td>{w.ip_address}</td><td>{w.cidr_block}</td><td>{w.description}</td>
                        <td>{writeAllowed && (<Button size="sm" variant="danger" onClick={async () => { await axios.delete(`/waf/whitelist/${w.id}`, { headers: { 'x-tenant-id': tenantId } }); loadAllData(); }}>Remove</Button>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="blacklist">
                <div className="d-flex justify-content-between mb-3"><h4>Blacklist</h4><Button onClick={() => setShowBLModal(true)}>Block IP</Button></div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>IP Address</th><th>Reason</th><th>Expires</th><th>Actions</th></tr></thead>
                  <tbody>
                    {blacklist.map(b => (
                      <tr key={b.id}><td>{b.ip_address}</td><td>{b.reason}</td><td>{b.expires_at ? new Date(b.expires_at).toLocaleDateString() : 'Never'}</td>
                        <td>{writeAllowed && (<Button size="sm" variant="danger" onClick={async () => { await axios.delete(`/waf/blacklist/${b.id}`, { headers: { 'x-tenant-id': tenantId } }); loadAllData(); }}>Remove</Button>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      <Modal show={showRuleModal} onHide={() => setShowRuleModal(false)}>
        <Modal.Header closeButton><Modal.Title>{editingRule ? 'Edit' : 'Add'} Rule</Modal.Title></Modal.Header>
        <Form onSubmit={handleRuleSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={ruleForm.name} onChange={e => setRuleForm({...ruleForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={ruleForm.rule_type} onChange={e => setRuleForm({...ruleForm, rule_type: e.target.value})}>
              <option value="injection">SQL Injection</option><option value="xss">XSS</option><option value="path_traversal">Path Traversal</option><option value="command_injection">Command Injection</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Pattern (Regex)</Form.Label><Form.Control value={ruleForm.pattern} onChange={e => setRuleForm({...ruleForm, pattern: e.target.value})} placeholder="e.g., SELECT|INSERT|DELETE" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Action</Form.Label><Form.Select value={ruleForm.action} onChange={e => setRuleForm({...ruleForm, action: e.target.value})}>
              <option value="block">Block</option><option value="log">Log Only</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Priority</Form.Label><Form.Control type="number" value={ruleForm.priority} onChange={e => setRuleForm({...ruleForm, priority: parseInt(e.target.value)})} /></Form.Group>
            <Form.Check type="switch" label="Enabled" checked={ruleForm.enabled} onChange={e => setRuleForm({...ruleForm, enabled: e.target.checked})} />
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowRuleModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showWLModal} onHide={() => setShowWLModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Whitelist Entry</Modal.Title></Modal.Header>
        <Form onSubmit={async (e) => { e.preventDefault(); await axios.post('/waf/whitelist', wlForm, { headers: { 'x-tenant-id': tenantId } }); setShowWLModal(false); setWlForm({ ip_address: '', cidr_block: '', description: '' }); loadAllData(); }}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control required value={wlForm.ip_address} onChange={e => setWlForm({...wlForm, ip_address: e.target.value})} placeholder="192.168.1.1" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>CIDR Block</Form.Label><Form.Control value={wlForm.cidr_block} onChange={e => setWlForm({...wlForm, cidr_block: e.target.value})} placeholder="192.168.1.0/24" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Description</Form.Label><Form.Control value={wlForm.description} onChange={e => setWlForm({...wlForm, description: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowWLModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>

      <Modal show={showBLModal} onHide={() => setShowBLModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Blacklist Entry</Modal.Title></Modal.Header>
        <Form onSubmit={async (e) => { e.preventDefault(); await axios.post('/waf/blacklist', blForm, { headers: { 'x-tenant-id': tenantId } }); setShowBLModal(false); setBlForm({ ip_address: '', cidr_block: '', reason: '', expires_at: '' }); loadAllData(); }}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control required value={blForm.ip_address} onChange={e => setBlForm({...blForm, ip_address: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Reason</Form.Label><Form.Control value={blForm.reason} onChange={e => setBlForm({...blForm, reason: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowBLModal(false)}>Cancel</Button><Button type="submit">Block</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default WAFDashboard;