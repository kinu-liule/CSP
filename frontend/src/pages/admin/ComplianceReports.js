import React, { useState, useEffect } from 'react';
import { Table, Badge, Button, Spinner, Alert, Row, Col, Card, Form } from 'react-bootstrap';
import axios from 'axios';

function ComplianceReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState('gdpr');

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/admin/compliance');
      setReports(res.data.reports || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await axios.post('/admin/compliance/generate', { standard: selected });
      setReports(prev => [res.data.report, ...prev]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">📋 Compliance Reports</h4>
      <Row className="mb-4 g-3">
        <Col md={3}><Card className="text-center p-3"><div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#3b82f6' }}>{reports.length}</div><div className="text-muted small">Reports Generated</div></Card></Col>
        <Col md={6}>
          <Card className="p-3">
            <div className="d-flex align-items-center gap-2">
              <Form.Select value={selected} onChange={e => setSelected(e.target.value)} style={{ maxWidth: 200 }}>
                <option value="gdpr">GDPR</option>
                <option value="soc2">SOC 2</option>
                <option value="hipaa">HIPAA</option>
                <option value="pci">PCI DSS</option>
                <option value="iso27001">ISO 27001</option>
              </Form.Select>
              <Button variant="primary" onClick={handleGenerate} disabled={generating}>{generating ? 'Generating...' : 'Generate Report'}</Button>
            </div>
          </Card>
        </Col>
      </Row>
      {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
        <Table striped bordered hover responsive size="sm">
          <thead><tr><th>Standard</th><th>Status</th><th>Score</th><th>Issues</th><th>Generated At</th><th>Actions</th></tr></thead>
          <tbody>{reports.map((r, i) => (
            <tr key={i}>
              <td><Badge bg="secondary">{r.standard?.toUpperCase()}</Badge></td>
              <td><Badge bg={r.status === 'compliant' ? 'success' : r.status === 'non-compliant' ? 'danger' : 'warning'}>{r.status}</Badge></td>
              <td className="small"><strong>{(r.score || 0).toFixed(0)}%</strong></td>
              <td>{r.issues || 0}</td>
              <td className="small">{new Date(r.generatedAt).toLocaleString()}</td>
              <td>
                <Button variant="outline-success" size="sm" onClick={() => { const text = JSON.stringify(r, null, 2); const b = new Blob([text], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `compliance-${r.standard}-${Date.now()}.json`; a.click(); }}>⬇ Download</Button>
              </td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </>
  );
}

export default ComplianceReports;
