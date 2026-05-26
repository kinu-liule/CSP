import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Spinner, Alert, Form, Row, Col } from 'react-bootstrap';
import axios from 'axios';

function GlobalPolicies() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newPolicy, setNewPolicy] = useState({ name: '', action: 'deny', priority: 500, conditions: '', parameters: '{}' });

  const fetchPolicies = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/policies');
      setPolicies(res.data.policies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPolicies(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const conditions = newPolicy.conditions ? newPolicy.conditions.split('\n').filter(Boolean) : [];
      const params = newPolicy.parameters ? JSON.parse(newPolicy.parameters) : {};
      await axios.post('/admin/policies', {
        name: newPolicy.name,
        action: newPolicy.action,
        priority: parseInt(newPolicy.priority),
        conditions,
        parameters: params,
        enabled: true
      });
      setShowForm(false);
      setNewPolicy({ name: '', action: 'deny', priority: 500, conditions: '', parameters: '{}' });
      await fetchPolicies();
    } catch (err) {
      alert('Failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4 className="mb-0">Global Security Policies</h4>
        <Button variant="primary" size="sm" onClick={() => setShowForm(true)}>+ Add Policy</Button>
      </div>
      {loading ? (
        <div className="text-center py-5"><Spinner animation="border" /></div>
      ) : policies.length === 0 ? (
        <Alert variant="info">No global policies configured.</Alert>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr><th>Name</th><th>Action</th><th>Priority</th><th>Conditions</th><th>Enabled</th></tr>
          </thead>
          <tbody>
            {policies.map((p, i) => (
              <tr key={p.name || i}>
                <td>{p.name}</td>
                <td><Badge bg={p.action === 'deny' ? 'danger' : 'success'}>{p.action}</Badge></td>
                <td>{p.priority}</td>
                <td className="small">{(p.conditions || []).join(', ') || '-'}</td>
                <td>{p.enabled !== false ? <Badge bg="success">Yes</Badge> : <Badge bg="secondary">No</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {showForm && (
        <div className="border rounded p-3 mb-3 bg-light">
          <h5>New Policy</h5>
          <Form onSubmit={handleAdd}>
            <Row>
              <Col md={6} className="mb-2"><Form.Label>Name</Form.Label><Form.Control required value={newPolicy.name} onChange={e => setNewPolicy({ ...newPolicy, name: e.target.value })} placeholder="block-suspicious-ips" /></Col>
              <Col md={3} className="mb-2"><Form.Label>Action</Form.Label><Form.Select value={newPolicy.action} onChange={e => setNewPolicy({ ...newPolicy, action: e.target.value })}><option value="deny">Deny</option><option value="allow">Allow</option><option value="log">Log</option></Form.Select></Col>
              <Col md={3} className="mb-2"><Form.Label>Priority</Form.Label><Form.Control type="number" value={newPolicy.priority} onChange={e => setNewPolicy({ ...newPolicy, priority: e.target.value })} /></Col>
              <Col md={12} className="mb-2"><Form.Label>Conditions (one per line)</Form.Label><Form.Control as="textarea" rows={3} value={newPolicy.conditions} onChange={e => setNewPolicy({ ...newPolicy, conditions: e.target.value })} placeholder='path.startsWith("/api/admin")&#10;method === "DELETE"' /></Col>
              <Col md={12} className="mb-2"><Form.Label>Parameters (JSON)</Form.Label><Form.Control as="textarea" rows={2} value={newPolicy.parameters} onChange={e => setNewPolicy({ ...newPolicy, parameters: e.target.value })} placeholder='{"message": "Blocked by policy"}' /></Col>
            </Row>
            <Button variant="primary" type="submit" disabled={loading}>{loading ? <Spinner size="sm" /> : 'Add Policy'}</Button>
            <Button variant="secondary" className="ms-2" onClick={() => setShowForm(false)}>Cancel</Button>
          </Form>
        </div>
      )}
    </>
  );
}

export default GlobalPolicies;
