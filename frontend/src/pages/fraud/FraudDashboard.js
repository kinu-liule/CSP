import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const FraudDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [rules, setRules] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showTxnModal, setShowTxnModal] = useState(false);
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);

  const [txnForm, setTxnForm] = useState({ user_id: '', amount: 100, currency: 'USD', transaction_type: 'purchase', payment_method: 'card', ip_address: '', device_id: '' });
  const [ruleForm, setRuleForm] = useState({ name: '', description: '', rule_type: 'amount', condition_expression: '', action: 'review', enabled: true });
  const [alertForm, setAlertForm] = useState({ status: 'resolved', assigned_to: '' });

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, txnRes, alertsRes, rulesRes, profRes] = await Promise.all([
        axios.get('/fraud/dashboard', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/fraud/transactions?limit=50', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/fraud/alerts', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/fraud/rules', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/fraud/profiles', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setTransactions(txnRes.data.data || []);
      setAlerts(alertsRes.data.data || []);
      setRules(rulesRes.data.data || []);
      setProfiles(profRes.data.data || []);
    } catch (err) {
      setError('Failed to load fraud detection data');
    } finally {
      setLoading(false);
    }
  };

  const handleTxnSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/fraud/transactions', txnForm, { headers: { 'x-tenant-id': tenantId } });
      setShowTxnModal(false);
      setTxnForm({ user_id: '', amount: 100, currency: 'USD', transaction_type: 'purchase', payment_method: 'card', ip_address: '', device_id: '' });
      loadAllData();
    } catch (err) {
      setError('Failed to create transaction');
    }
  };

  const handleAlertUpdate = async (id, status, assigned_to) => {
    try {
      await axios.put(`/fraud/alerts/${id}`, { status, assigned_to }, { headers: { 'x-tenant-id': tenantId } });
      loadAllData();
    } catch (err) {
      setError('Failed to update alert');
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Fraud Detection</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={2}><Card className="text-center border-primary"><Card.Body><h3>${dashboard?.total_amount?.toFixed(2) || '0.00'}</h3><small>Total Amount</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-info"><Card.Body><h3>{dashboard?.total_transactions || 0}</h3><small>Transactions</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-danger"><Card.Body><h3>{dashboard?.fraud_detected || 0}</h3><small>Fraud Detected</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-warning"><Card.Body><h3>{dashboard?.pending_alerts || 0}</h3><small>Pending Alerts</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-success"><Card.Body><h3>{profiles.length}</h3><small>User Profiles</small></Card.Body></Card></Col>
        <Col md={2}><Card className="text-center border-secondary"><Card.Body><h3>{rules.length}</h3><small>Rules</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="transactions">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="transactions">Transactions</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="alerts">Fraud Alerts</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="rules">Fraud Rules</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="profiles">User Profiles</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="transactions">
                <div className="d-flex justify-content-between mb-3"><h4>Transactions</h4>{writeAllowed && (<Button onClick={() => setShowTxnModal(true)}>Add Transaction</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>ID</th><th>User</th><th>Amount</th><th>Type</th><th>Risk Score</th><th>Fraud</th></tr></thead>
                  <tbody>
                    {transactions.map(t => (
                      <tr key={t.id}>
                        <td><small>{t.transaction_id}</small></td><td>{t.user_id}</td>
                        <td>${t.amount}</td><td>{t.transaction_type}</td>
                        <td><Badge bg={t.risk_score > 70 ? 'danger' : t.risk_score > 40 ? 'warning' : 'success'}>{t.risk_score}</Badge></td>
                        <td>{t.is_fraud ? <Badge bg="danger">Fraud</Badge> : <Badge bg="success">Clean</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="alerts">
                <h4>Fraud Alerts</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Time</th><th>Transaction</th><th>Type</th><th>Severity</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {alerts.map(a => (
                      <tr key={a.id}>
                        <td><small>{new Date(a.created_at).toLocaleString()}</small></td><td><small>{a.transaction_id}</small></td>
                        <td>{a.alert_type}</td><td><Badge bg={a.severity === 'high' ? 'danger' : 'warning'}>{a.severity}</Badge></td>
                        <td><Badge bg={a.status === 'new' ? 'danger' : 'success'}>{a.status}</Badge></td>
                        <td>
                          <Button size="sm" onClick={() => handleAlertUpdate(a.id, 'resolved', a.assigned_to)}>Resolve</Button>{' '}
                          <Button size="sm" variant="warning" onClick={() => handleAlertUpdate(a.id, 'investigating', 'analyst')}>Investigate</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="rules">
                <div className="d-flex justify-content-between mb-3"><h4>Fraud Detection Rules</h4>{writeAllowed && (<Button onClick={() => setShowRuleModal(true)}>Add Rule</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Type</th><th>Condition</th><th>Action</th><th>Status</th></tr></thead>
                  <tbody>
                    {rules.map(r => (
                      <tr key={r.id}><td>{r.name}</td><td>{r.rule_type}</td><td><small>{r.condition_expression}</small></td>
                        <td><Badge bg={r.action === 'block' ? 'danger' : 'warning'}>{r.action}</Badge></td>
                        <td><Badge bg={r.enabled ? 'success' : 'secondary'}>{r.enabled ? 'Active' : 'Disabled'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="profiles">
                <h4>User Risk Profiles</h4>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>User ID</th><th>Risk Level</th><th>Transactions</th><th>Avg Amount</th></tr></thead>
                  <tbody>
                    {profiles.map(p => (
                      <tr key={p.id}>
                        <td>{p.user_id}</td>
                        <td><Badge bg={p.risk_level === 'high' ? 'danger' : p.risk_level === 'medium' ? 'warning' : 'success'}>{p.risk_level}</Badge></td>
                        <td>{p.transaction_count}</td><td>${p.avg_transaction_amount || '0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Transaction Modal */}
      <Modal show={showTxnModal} onHide={() => setShowTxnModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Transaction</Modal.Title></Modal.Header>
        <Form onSubmit={handleTxnSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>User ID</Form.Label><Form.Control required value={txnForm.user_id} onChange={e => setTxnForm({...txnForm, user_id: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Amount</Form.Label><Form.Control type="number" required value={txnForm.amount} onChange={e => setTxnForm({...txnForm, amount: parseFloat(e.target.value)})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={txnForm.transaction_type} onChange={e => setTxnForm({...txnForm, transaction_type: e.target.value})}>
              <option value="purchase">Purchase</option><option value="transfer">Transfer</option><option value="withdrawal">Withdrawal</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Payment Method</Form.Label><Form.Select value={txnForm.payment_method} onChange={e => setTxnForm({...txnForm, payment_method: e.target.value})}>
              <option value="card">Card</option><option value="bank_transfer">Bank Transfer</option><option value="crypto">Crypto</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>IP Address</Form.Label><Form.Control value={txnForm.ip_address} onChange={e => setTxnForm({...txnForm, ip_address: e.target.value})} /></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowTxnModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>

      {/* Rule Modal */}
      <Modal show={showRuleModal} onHide={() => setShowRuleModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Fraud Rule</Modal.Title></Modal.Header>
        <Form onSubmit={async (e) => { e.preventDefault(); await axios.post('/fraud/rules', ruleForm, { headers: { 'x-tenant-id': tenantId } }); setShowRuleModal(false); setRuleForm({ name: '', description: '', rule_type: 'amount', condition_expression: '', action: 'review', enabled: true }); loadAllData(); }}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={ruleForm.name} onChange={e => setRuleForm({...ruleForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Type</Form.Label><Form.Select value={ruleForm.rule_type} onChange={e => setRuleForm({...ruleForm, rule_type: e.target.value})}>
              <option value="amount">Amount</option><option value="velocity">Velocity</option><option value="device">Device</option><option value="location">Location</option>
            </Form.Select></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Condition</Form.Label><Form.Control as="textarea" value={ruleForm.condition_expression} onChange={e => setRuleForm({...ruleForm, condition_expression: e.target.value})} placeholder="amount > 10000" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Action</Form.Label><Form.Select value={ruleForm.action} onChange={e => setRuleForm({...ruleForm, action: e.target.value})}>
              <option value="review">Review</option><option value="block">Block</option><option value="flag">Flag</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowRuleModal(false)}>Cancel</Button><Button type="submit">Add</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default FraudDashboard;
