import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Form, Button, Alert, Spinner } from 'react-bootstrap';
import axios from 'axios';

function PlatformSecurity() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchSettings = async () => {
    try {
      const res = await axios.get('/admin/settings/security');
      setSettings(res.data.settings);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await axios.put('/admin/settings/security', settings);
      setSuccess('Security settings updated');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const set = (key, val) => setSettings(prev => ({ ...prev, [key]: val }));

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;
  if (!settings) return <Alert variant="danger">Failed to load settings</Alert>;

  return (
    <>
      <h4 className="mb-3">🔐 Security Settings</h4>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}
      <Form onSubmit={handleSave}>
        <Card className="mb-4">
          <Card.Body>
            <h6 className="mb-3">Password Policy</h6>
            <Row>
              <Col md={4}><Form.Group className="mb-3"><Form.Label>Minimum Length</Form.Label><Form.Control type="number" value={settings.password_min_length} onChange={e => set('password_min_length', parseInt(e.target.value))} min={4} max={64} /></Form.Group></Col>
              <Col md={4}><Form.Group className="mb-3"><Form.Label>Expiry (days)</Form.Label><Form.Control type="number" value={settings.password_expiry_days} onChange={e => set('password_expiry_days', parseInt(e.target.value))} min={0} max={365} /></Form.Group></Col>
            </Row>
            <Form.Check className="mb-2" type="switch" id="require-special" label="Require special character" checked={settings.password_require_special} onChange={e => set('password_require_special', e.target.checked)} />
            <Form.Check type="switch" id="require-upper" label="Require uppercase letter" checked={settings.password_require_upper} onChange={e => set('password_require_upper', e.target.checked)} />
          </Card.Body>
        </Card>
        <Card className="mb-4">
          <Card.Body>
            <h6 className="mb-3">Multi-Factor Authentication</h6>
            <Form.Check className="mb-2" type="switch" id="mfa-required" label="Require MFA for all users" checked={settings.mfa_required} onChange={e => set('mfa_required', e.target.checked)} />
          </Card.Body>
        </Card>
        <Card className="mb-4">
          <Card.Body>
            <h6 className="mb-3">Session & Login</h6>
            <Row>
              <Col md={4}><Form.Group className="mb-3"><Form.Label>Session Timeout (min)</Form.Label><Form.Control type="number" value={settings.session_timeout_minutes} onChange={e => set('session_timeout_minutes', parseInt(e.target.value))} min={5} max={1440} /></Form.Group></Col>
              <Col md={4}><Form.Group className="mb-3"><Form.Label>Max Login Attempts</Form.Label><Form.Control type="number" value={settings.max_login_attempts} onChange={e => set('max_login_attempts', parseInt(e.target.value))} min={1} max={20} /></Form.Group></Col>
              <Col md={4}><Form.Group className="mb-3"><Form.Label>Lockout Duration (min)</Form.Label><Form.Control type="number" value={settings.lockout_duration_minutes} onChange={e => set('lockout_duration_minutes', parseInt(e.target.value))} min={1} max={1440} /></Form.Group></Col>
            </Row>
          </Card.Body>
        </Card>
        <Button variant="primary" type="submit" disabled={saving}>{saving ? <><Spinner size="sm" className="me-1" />Saving...</> : 'Save Settings'}</Button>
      </Form>
    </>
  );
}

export default PlatformSecurity;
