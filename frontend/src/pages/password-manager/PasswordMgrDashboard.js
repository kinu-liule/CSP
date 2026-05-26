import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Nav, Tab, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const PasswordMgrDashboard = () => {
  const writeAllowed = canWrite();
  const [metrics, setMetrics] = useState(null);
  const [vault, setVault] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showVaultModal, setShowVaultModal] = useState(false);
  const [vaultForm, setVaultForm] = useState({ name: '', username: '', password: '', url: '', category: 'work' });

  const [genLength, setGenLength] = useState(16);
  const [genInclude, setGenInclude] = useState({ upper: true, lower: true, digits: true, special: true });
  const [generatedPassword, setGeneratedPassword] = useState('');

  const [shareEntryId, setShareEntryId] = useState('');
  const [shareExpiry, setShareExpiry] = useState(24);
  const [shareLink, setShareLink] = useState('');

  const [visiblePasswords, setVisiblePasswords] = useState({});

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [metricsRes, vaultRes] = await Promise.all([
        axios.get('/password-manager/metrics', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/password-manager/vault', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setMetrics(metricsRes.data.data);
      setVault(vaultRes.data.data || []);
      setError(null);
    } catch (err) {
      setError('Failed to load password manager data');
    } finally {
      setLoading(false);
    }
  };

  const handleVaultSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/password-manager/vault', vaultForm, { headers: { 'x-tenant-id': tenantId } });
      setShowVaultModal(false);
      setVaultForm({ name: '', username: '', password: '', url: '', category: 'work' });
      loadAllData();
    } catch (err) {
      setError('Failed to save vault entry');
    }
  };

  const handleGenerate = async () => {
    try {
      const res = await axios.post('/password-manager/generate', {
        length: genLength,
        ...genInclude
      }, { headers: { 'x-tenant-id': tenantId } });
      setGeneratedPassword(res.data.data.password);
    } catch (err) {
      setError('Failed to generate password');
    }
  };

  const handleShare = async () => {
    try {
      const res = await axios.post('/password-manager/share', {
        vault_entry_id: shareEntryId,
        expiry_hours: shareExpiry
      }, { headers: { 'x-tenant-id': tenantId } });
      setShareLink(`${window.location.origin}/share/${res.data.data.share_token}`);
    } catch (err) {
      setError('Failed to create share link');
    }
  };

  const showPassword = async (id) => {
    try {
      const res = await axios.get(`/password-manager/vault/${id}`, { headers: { 'x-tenant-id': tenantId } });
      setVisiblePasswords({ ...visiblePasswords, [id]: res.data.data.password });
    } catch (err) {
      setError('Failed to retrieve password');
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Password Manager</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{metrics?.total_entries || 0}</h3><small>Total Entries</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{metrics?.categories || 0}</h3><small>Categories</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{metrics?.active_shares || 0}</h3><small>Active Shares</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body><h3>{metrics?.generated || 0}</h3><small>Generated</small></Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="vault">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="vault">Vault</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="generate">Generate</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="share">Share</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="vault">
                <div className="d-flex justify-content-between mb-3"><h4>Password Vault</h4>{writeAllowed && (<Button onClick={() => setShowVaultModal(true)}>Add Entry</Button>)}</div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Name</th><th>Username</th><th>URL</th><th>Category</th><th>Actions</th></tr></thead>
                  <tbody>
                    {vault.map(e => (
                      <tr key={e.id}>
                        <td>{e.name}</td><td>{e.username}</td><td>{e.url}</td>
                        <td><Badge bg="secondary">{e.category}</Badge></td>
                        <td>
                          <Button size="sm" variant="outline-info" onClick={() => showPassword(e.id)}>
                            {visiblePasswords[e.id] ? visiblePasswords[e.id] : 'Show Password'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="generate">
                <h4>Generate Password</h4>
                <Card className="p-4">
                  <Form>
                    <Form.Group className="mb-3"><Form.Label>Length</Form.Label><Form.Control type="number" min="4" max="128" value={genLength} onChange={e => setGenLength(parseInt(e.target.value))} /></Form.Group>
                    <Form.Check type="switch" label="Uppercase (A-Z)" checked={genInclude.upper} onChange={e => setGenInclude({...genInclude, upper: e.target.checked})} />
                    <Form.Check type="switch" label="Lowercase (a-z)" checked={genInclude.lower} onChange={e => setGenInclude({...genInclude, lower: e.target.checked})} />
                    <Form.Check type="switch" label="Digits (0-9)" checked={genInclude.digits} onChange={e => setGenInclude({...genInclude, digits: e.target.checked})} />
                    <Form.Check type="switch" label="Special (!@#$%)" checked={genInclude.special} onChange={e => setGenInclude({...genInclude, special: e.target.checked})} />
                    <Button className="mt-3" onClick={handleGenerate}>Generate</Button>
                  </Form>
                  {generatedPassword && (
                    <Card className="mt-3 bg-light">
                      <Card.Body className="text-center">
                        <h5>Generated Password</h5>
                        <code className="fs-5">{generatedPassword}</code>
                      </Card.Body>
                    </Card>
                  )}
                </Card>
              </Tab.Pane>
              <Tab.Pane eventKey="share">
                <h4>Share Password</h4>
                <Card className="p-4">
                  <Form.Group className="mb-3"><Form.Label>Select Entry</Form.Label><Form.Select value={shareEntryId} onChange={e => setShareEntryId(e.target.value)}>
                    <option value="">Choose...</option>
                    {vault.map(e => <option key={e.id} value={e.id}>{e.name} ({e.username})</option>)}
                  </Form.Select></Form.Group>
                  <Form.Group className="mb-3"><Form.Label>Expiry (hours)</Form.Label><Form.Control type="number" min="1" max="720" value={shareExpiry} onChange={e => setShareExpiry(parseInt(e.target.value))} /></Form.Group>
                  {writeAllowed && (<Button onClick={handleShare} disabled={!shareEntryId}>Create Share Link</Button>)}
                  {shareLink && (
                    <Card className="mt-3 bg-light">
                      <Card.Body className="text-center">
                        <h5>Share Link</h5>
                        <a href={shareLink} target="_blank" rel="noopener noreferrer">{shareLink}</a>
                      </Card.Body>
                    </Card>
                  )}
                </Card>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Add Vault Entry Modal */}
      <Modal show={showVaultModal} onHide={() => setShowVaultModal(false)}>
        <Modal.Header closeButton><Modal.Title>Add Vault Entry</Modal.Title></Modal.Header>
        <Form onSubmit={handleVaultSubmit}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Name</Form.Label><Form.Control required value={vaultForm.name} onChange={e => setVaultForm({...vaultForm, name: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Username</Form.Label><Form.Control required value={vaultForm.username} onChange={e => setVaultForm({...vaultForm, username: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Password</Form.Label><Form.Control type="password" required value={vaultForm.password} onChange={e => setVaultForm({...vaultForm, password: e.target.value})} /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>URL</Form.Label><Form.Control value={vaultForm.url} onChange={e => setVaultForm({...vaultForm, url: e.target.value})} placeholder="https://example.com" /></Form.Group>
            <Form.Group className="mb-3"><Form.Label>Category</Form.Label><Form.Select value={vaultForm.category} onChange={e => setVaultForm({...vaultForm, category: e.target.value})}>
              <option value="work">Work</option><option value="personal">Personal</option><option value="finance">Finance</option><option value="other">Other</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowVaultModal(false)}>Cancel</Button><Button type="submit">Save</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default PasswordMgrDashboard;
