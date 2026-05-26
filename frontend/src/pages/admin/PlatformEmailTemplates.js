import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Form, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import axios from 'axios';

function PlatformEmailTemplates() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', body: '' });

  const fetchTemplates = async () => {
    try {
      const res = await axios.get('/admin/settings/email-templates');
      setTemplates(res.data.templates);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTemplates(); }, []);

  const openEdit = (t) => {
    setEditing(t);
    setEditForm({ subject: t.subject, body: t.body });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await axios.put(`/admin/settings/email-templates/${editing.id}`, editForm);
      setSuccess(`Template "${editing.name}" updated`);
      setEditing(null);
      fetchTemplates();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-5"><Spinner animation="border" /></div>;

  return (
    <>
      <h4 className="mb-3">📧 Email Templates</h4>
      {error && <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert variant="success" dismissible onClose={() => setSuccess('')}>{success}</Alert>}
      <Row className="g-4">
        <Col md={5}>
          <Table striped bordered hover responsive size="sm">
            <thead><tr><th>Template</th><th>Subject</th><th>Actions</th></tr></thead>
            <tbody>{templates.map(t => (
              <tr key={t.id}>
                <td className="small"><strong>{t.name}</strong></td>
                <td className="small">{t.subject}</td>
                <td><Button size="sm" variant={editing?.id === t.id ? 'primary' : 'outline-primary'} onClick={() => openEdit(t)}>{editing?.id === t.id ? 'Editing' : 'Edit'}</Button></td>
              </tr>
            ))}</tbody>
          </Table>
        </Col>
        <Col md={7}>
          {editing ? (
            <Card>
              <Card.Body>
                <h6 className="mb-3">Editing: {editing.name}</h6>
                <Form.Group className="mb-3">
                  <Form.Label>Subject</Form.Label>
                  <Form.Control value={editForm.subject} onChange={e => setEditForm({ ...editForm, subject: e.target.value })} />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label>Body</Form.Label>
                  <Form.Control as="textarea" rows={10} value={editForm.body} onChange={e => setEditForm({ ...editForm, body: e.target.value })} style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
                </Form.Group>
                <div className="small text-muted mb-3">Available variables: {'{{name}}'}, {'{{tenantId}}'}, {'{{loginUrl}}'}, {'{{resetUrl}}'}, {'{{serviceName}}'}</div>
                <div className="d-flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                  <Button variant="primary" onClick={handleSave} disabled={saving}>{saving ? <Spinner size="sm" /> : 'Save Template'}</Button>
                </div>
              </Card.Body>
            </Card>
          ) : (
            <Card><Card.Body><p className="text-muted text-center my-5">Select a template to edit</p></Card.Body></Card>
          )}
        </Col>
      </Row>
    </>
  );
}

export default PlatformEmailTemplates;
