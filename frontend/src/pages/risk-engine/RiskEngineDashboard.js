import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Form, Nav, Tab, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const RiskEngineDashboard = () => {
  const writeAllowed = canWrite();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [assessmentForm, setAssessmentForm] = useState({ user_id: '', failed_logins: 0, vpn: false, ip_reputation: 50 });
  const [assessmentResult, setAssessmentResult] = useState(null);
  const [assessing, setAssessing] = useState(false);

  const [humanUserId, setHumanUserId] = useState('');
  const [humanResult, setHumanResult] = useState(null);
  const [fetchingHuman, setFetchingHuman] = useState(false);

  const [batchInput, setBatchInput] = useState('');
  const [batchResults, setBatchResults] = useState([]);
  const [batching, setBatching] = useState(false);

  useEffect(() => {
    axios.get('/risk/health')
      .then(res => { setHealth(res.data); setError(null); })
      .catch(err => setError('Risk engine service unavailable'))
      .finally(() => setLoading(false));
  }, []);

  const handleAssess = async (e) => {
    e.preventDefault();
    try {
      setAssessing(true);
      const res = await axios.post('/risk/score', assessmentForm);
      setAssessmentResult(res.data);
    } catch (err) {
      setError('Assessment failed');
    } finally {
      setAssessing(false);
    }
  };

  const handleHumanFetch = async () => {
    if (!humanUserId) return;
    try {
      setFetchingHuman(true);
      const res = await axios.get(`/risk/human/${humanUserId}`);
      setHumanResult(res.data);
    } catch (err) {
      setError('Failed to fetch human risk data');
    } finally {
      setFetchingHuman(false);
    }
  };

  const handleBatch = async () => {
    try {
      setBatching(true);
      const entities = JSON.parse(batchInput);
      const res = await axios.post('/risk/batch', { entities });
      setBatchResults(res.data.results || []);
    } catch (err) {
      setError(err.message === 'JSON.parse' ? 'Invalid JSON input' : 'Batch assessment failed');
    } finally {
      setBatching(false);
    }
  };

  const getRiskLevelVariant = (level) => {
    if (level === 'high') return 'danger';
    if (level === 'medium') return 'warning';
    return 'success';
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Risk Engine</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body>
          <h3>{assessmentResult?.risk_score ?? '-'}</h3><small>Risk Score</small>
        </Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body>
          <h3>{assessmentResult ? <Badge bg={getRiskLevelVariant(assessmentResult.risk_level)}>{assessmentResult.risk_level}</Badge> : '-'}</h3><small>Level</small>
        </Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body>
          <h3>{assessmentResult?.factors?.length || 0}</h3><small>Factors Analyzed</small>
        </Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body>
          <h3>{batchResults.length}</h3><small>Batch Results</small>
        </Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="single">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="single">Single Assessment</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="human">Human Risk</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="batch">Batch</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="single">
                <h4>Single Risk Assessment</h4>
                <Card className="p-4">
                  <Form onSubmit={handleAssess}>
                    <Form.Group className="mb-3"><Form.Label>User ID</Form.Label><Form.Control required value={assessmentForm.user_id} onChange={e => setAssessmentForm({...assessmentForm, user_id: e.target.value})} /></Form.Group>
                    <Form.Group className="mb-3"><Form.Label>Failed Logins</Form.Label><Form.Control type="number" min="0" value={assessmentForm.failed_logins} onChange={e => setAssessmentForm({...assessmentForm, failed_logins: parseInt(e.target.value)})} /></Form.Group>
                    <Form.Check type="switch" label="VPN Connection" checked={assessmentForm.vpn} onChange={e => setAssessmentForm({...assessmentForm, vpn: e.target.checked})} />
                    <Form.Group className="mb-3"><Form.Label>IP Reputation (0-100)</Form.Label><Form.Control type="number" min="0" max="100" value={assessmentForm.ip_reputation} onChange={e => setAssessmentForm({...assessmentForm, ip_reputation: parseInt(e.target.value)})} /></Form.Group>
                    <Button type="submit" disabled={assessing}>{assessing ? 'Assessing...' : 'Assess'}</Button>
                  </Form>
                </Card>
                {assessmentResult && (
                  <Card className="mt-3">
                    <Card.Body>
                      <h5>Assessment Result</h5>
                      <Row>
                        <Col><strong>Risk Score:</strong> <Badge bg={getRiskLevelVariant(assessmentResult.risk_level)}>{assessmentResult.risk_score}</Badge></Col>
                        <Col><strong>Risk Level:</strong> <Badge bg={getRiskLevelVariant(assessmentResult.risk_level)}>{assessmentResult.risk_level}</Badge></Col>
                      </Row>
                      {assessmentResult.factors?.length > 0 && (
                        <div className="mt-3">
                          <strong>Contributing Factors:</strong>
                          <ul>{assessmentResult.factors.map((f, i) => <li key={i}>{f.name}: {f.value} ({f.impact})</li>)}</ul>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                )}
              </Tab.Pane>
              <Tab.Pane eventKey="human">
                <h4>Human Risk Profile</h4>
                <Card className="p-4">
                  <Form.Group className="mb-3"><Form.Label>User ID</Form.Label><Form.Control value={humanUserId} onChange={e => setHumanUserId(e.target.value)} placeholder="Enter user ID" /></Form.Group>
                  <Button onClick={handleHumanFetch} disabled={fetchingHuman || !humanUserId}>{fetchingHuman ? 'Fetching...' : 'Fetch'}</Button>
                </Card>
                {humanResult && (
                  <Card className="mt-3">
                    <Card.Body>
                      <h5>Human Risk: {humanUserId}</h5>
                      <Row>
                        <Col><strong>Score:</strong> <Badge bg={getRiskLevelVariant(humanResult.risk_level)}>{humanResult.risk_score}</Badge></Col>
                        <Col><strong>Level:</strong> <Badge bg={getRiskLevelVariant(humanResult.risk_level)}>{humanResult.risk_level}</Badge></Col>
                      </Row>
                      {humanResult.factors?.length > 0 && (
                        <div className="mt-3">
                          <strong>Contributing Factors:</strong>
                          <ul>{humanResult.factors.map((f, i) => <li key={i}>{f.name}: {f.value} ({f.impact})</li>)}</ul>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                )}
              </Tab.Pane>
              <Tab.Pane eventKey="batch">
                <h4>Batch Risk Assessment</h4>
                <Card className="p-4">
                  <Form.Group className="mb-3"><Form.Label>JSON Input (array of entities)</Form.Label>
                    <Form.Control as="textarea" rows={6} value={batchInput} onChange={e => setBatchInput(e.target.value)} placeholder='[{"user_id": "user1", "failed_logins": 3, "vpn": false, "ip_reputation": 30}]' />
                  </Form.Group>
                  <Button onClick={handleBatch} disabled={batching || !batchInput}>{batching ? 'Assessing...' : 'Batch Assess'}</Button>
                </Card>
                {batchResults.length > 0 && (
                  <Table striped bordered hover size="sm" className="mt-3">
                    <thead><tr><th>Entity</th><th>Score</th><th>Level</th><th>Factors</th></tr></thead>
                    <tbody>
                      {batchResults.map((r, i) => (
                        <tr key={i}>
                          <td>{r.user_id || r.entity_id || `#${i + 1}`}</td>
                          <td><Badge bg={getRiskLevelVariant(r.risk_level)}>{r.risk_score}</Badge></td>
                          <td><Badge bg={getRiskLevelVariant(r.risk_level)}>{r.risk_level}</Badge></td>
                          <td>{r.factors?.length || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>
    </Container>
  );
};

export default RiskEngineDashboard;
