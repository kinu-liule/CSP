import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Spinner, Alert, Badge, Row, Col } from 'react-bootstrap';
import axios from 'axios';

function MaintenanceMode() {
  const [settings, setSettings] = useState({
    enabled: false, message: 'Platform is under scheduled maintenance. Please check back shortly.',
    allowedIPs: '', startTime: '', endTime: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get('/admin/maintenance').then(r => {
      const m = r.data.maintenance || {};
      setSettings({
        enabled: m.enabled || false, message: m.message || '', allowedIPs: (m.allowedIPs || []).join(', '), startTime: m.startTime || '', endTime: m.endTime || '',
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setMessage(''); setError('');
    try {
      await axios.put('/admin/maintenance', {
        ...settings,
        allowedIPs: settings.allowedIPs.split(',').map(s => s.trim()).filter(Boolean),
      });
      setMessage('Maintenance settings updated');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

  return (
    <>
      <h4 className="mb-3">🚦 Maintenance Mode</h4>
      {message && <Alert variant="success" dismissible onClose={() => setMessage('')}>{message}</Alert>}
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      <Card>
        <Card.Body>
          <Form>
            <Form.Group className="mb-4">
              <Form.Check type="switch" id="maint-toggle" label={<span>Maintenance Mode <Badge bg={settings.enabled ? 'danger' : 'secondary'}>{settings.enabled ? 'ACTIVE' : 'INACTIVE'}</Badge></span>} checked={settings.enabled} onChange={e => setSettings({...settings, enabled: e.target.checked})} />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Maintenance Message</Form.Label>
              <Form.Control as="textarea" rows={3} value={settings.message} onChange={e => setSettings({...settings, message: e.target.value})} />
            </Form.Group>
            <Row className="g-3 mb-3">
              <Col md={6}>
                <Form.Label>Scheduled Start</Form.Label>
                <Form.Control type="datetime-local" value={settings.startTime} onChange={e => setSettings({...settings, startTime: e.target.value})} />
              </Col>
              <Col md={6}>
                <Form.Label>Scheduled End</Form.Label>
                <Form.Control type="datetime-local" value={settings.endTime} onChange={e => setSettings({...settings, endTime: e.target.value})} />
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Allowed IPs (comma-separated, bypass maintenance)</Form.Label>
              <Form.Control value={settings.allowedIPs} onChange={e => setSettings({...settings, allowedIPs: e.target.value})} placeholder="10.0.0.1, 192.168.1.100" />
            </Form.Group>
            <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</Button>
          </Form>
        </Card.Body>
      </Card>
    </>
  );
}

export default MaintenanceMode;
