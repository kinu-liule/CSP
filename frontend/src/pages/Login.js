import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Form, Button, Alert, Container, Card, Row, Col } from 'react-bootstrap';
import axios from 'axios';
import { refreshSubscriptions, isSuperPortal } from '../utils/auth';

function Login({ setUser }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState(isSuperPortal() ? 'platform' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const superPortal = isSuperPortal();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await axios.post('/iam/auth/login', { username, password }, {
        headers: { 'x-tenant-id': tenantId }
      });
      localStorage.setItem('token', res.data.data.token);
      localStorage.setItem('tenantId', tenantId);
      axios.defaults.headers.common['Authorization'] = `Bearer ${res.data.data.token}`;
      await refreshSubscriptions();
      setUser(res.data.data.user);
      navigate(superPortal ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container className="mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <Card>
            <Card.Body>
              <h3 className="text-center mb-4">CyberSec Platform Login</h3>
              {error && <Alert variant="danger">{error}</Alert>}
              <Form onSubmit={handleSubmit}>
                {superPortal ? (
                  <Form.Group className="mb-3">
                    <Form.Label>Tenant ID</Form.Label>
                    <Form.Control type="text" value="platform" disabled />
                  </Form.Group>
                ) : (
                  <Form.Group className="mb-3">
                    <Form.Label>Tenant ID</Form.Label>
                    <Form.Control type="text" value={tenantId} onChange={(e) => setTenantId(e.target.value)} required placeholder="Enter tenant ID" />
                  </Form.Group>
                )}
                <Form.Group className="mb-3">
                  <Form.Label>Username</Form.Label>
                  <Form.Control type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Password</Form.Label>
                  <Form.Control type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </Form.Group>
                <Button variant="primary" type="submit" disabled={loading} className="w-100">
                  {loading ? 'Logging in...' : 'Login'}
                </Button>
              </Form>
              <hr />
              <p className="text-center mb-0">
                New organization? <Link to="/register">Create an account</Link>
              </p>
            </Card.Body>
          </Card>
        </div>
      </div>
    </Container>
  );
}

export default Login;
