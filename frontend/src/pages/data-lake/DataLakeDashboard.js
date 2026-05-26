import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Button, Modal, Form, Tab, Nav, Badge, Alert } from 'react-bootstrap';
import axios from 'axios';

import { canWrite } from '../../utils/auth';
const DataLakeDashboard = () => {
  const writeAllowed = canWrite();
  const [dashboard, setDashboard] = useState(null);
  const [events, setEvents] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [aggregations, setAggregations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('json');

  const tenantId = localStorage.getItem('tenantId') || 'tenant1';

  useEffect(() => { loadAllData(); }, []);

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [dashRes, aggRes] = await Promise.all([
        axios.get('/data-lake/metrics', { headers: { 'x-tenant-id': tenantId } }),
        axios.get('/data-lake/aggregations?time_range=24h', { headers: { 'x-tenant-id': tenantId } })
      ]);
      setDashboard(dashRes.data.data);
      setAggregations(aggRes.data.data);
      loadEvents();
    } catch (err) {
      setError('Failed to load data lake data');
    } finally {
      setLoading(false);
    }
  };

  const loadEvents = async () => {
    try {
      const params = { limit: 50 };
      if (eventTypeFilter) params.event_type = eventTypeFilter;
      if (severityFilter) params.severity = severityFilter;
      const res = await axios.get('/data-lake/events', { params, headers: { 'x-tenant-id': tenantId } });
      setEvents(res.data.data || []);
    } catch (err) {
      setError('Failed to load events');
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await axios.get('/data-lake/search', { params: { q: searchQuery }, headers: { 'x-tenant-id': tenantId } });
      setSearchResults(res.data.data || []);
    } catch (err) {
      setError('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (e) => {
    e.preventDefault();
    try {
      await axios.post('/data-lake/export', { format: exportFormat }, { headers: { 'x-tenant-id': tenantId } });
      setShowExportModal(false);
    } catch (err) {
      setError('Export failed');
    }
  };

  if (loading) return <div className="text-center mt-5"><div className="spinner-border" /></div>;

  return (
    <Container fluid>
      <h2 className="mb-4">Security Data Lake</h2>
      {error && <Alert variant="danger" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Row className="mb-4">
        <Col md={3}><Card className="text-center border-primary"><Card.Body><h3>{dashboard?.total_events || 0}</h3><small>Total Events</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-success"><Card.Body><h3>{dashboard?.last_24h || 0}</h3><small>Last 24h</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-info"><Card.Body><h3>{aggregations?.by_source ? Object.keys(aggregations.by_source).length : 0}</h3><small>Sources</small></Card.Body></Card></Col>
        <Col md={3}><Card className="text-center border-warning"><Card.Body>
          <Button variant="link" className="p-0 text-decoration-none" onClick={() => setShowExportModal(true)}><h3 className="mb-0">Export</h3></Button>
          <small>Compliance Export</small>
        </Card.Body></Card></Col>
      </Row>

      <Tab.Container defaultActiveKey="events">
        <Row>
          <Col sm={3}>
            <Nav variant="pills" className="flex-column">
              <Nav.Item><Nav.Link eventKey="events">Events</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="search">Search</Nav.Link></Nav.Item>
              <Nav.Item><Nav.Link eventKey="aggregations">Aggregations</Nav.Link></Nav.Item>
            </Nav>
          </Col>
          <Col sm={9}>
            <Tab.Content>
              <Tab.Pane eventKey="events">
                <div className="d-flex justify-content-between mb-3">
                  <h4>Security Events</h4>
                  <div>
                    <Form.Select size="sm" className="d-inline-block w-auto me-2" value={eventTypeFilter} onChange={e => { setEventTypeFilter(e.target.value); setTimeout(loadEvents, 0); }}>
                      <option value="">All Types</option><option value="firewall">Firewall</option><option value="ids">IDS</option><option value="auth">Auth</option><option value="malware">Malware</option>
                    </Form.Select>
                    <Form.Select size="sm" className="d-inline-block w-auto me-2" value={severityFilter} onChange={e => { setSeverityFilter(e.target.value); setTimeout(loadEvents, 0); }}>
                      <option value="">All Severities</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
                    </Form.Select>
                    <Button size="sm" onClick={loadEvents}>Refresh</Button>
                  </div>
                </div>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Timestamp</th><th>Type</th><th>Source</th><th>Severity</th></tr></thead>
                  <tbody>
                    {events.map(e => (
                      <tr key={e.id}>
                        <td>{new Date(e.timestamp).toLocaleString()}</td><td>{e.event_type}</td><td>{e.source}</td>
                        <td><Badge bg={e.severity === 'critical' ? 'danger' : e.severity === 'high' ? 'warning' : 'info'}>{e.severity}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="search">
                <Form onSubmit={handleSearch} className="mb-3">
                  <div className="d-flex gap-2">
                    <Form.Control value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search events by keyword, IP, source..." />
                    <Button type="submit">Search</Button>
                  </div>
                </Form>
                <Table striped bordered hover size="sm">
                  <thead><tr><th>Timestamp</th><th>Source</th><th>Type</th><th>Data</th></tr></thead>
                  <tbody>
                    {searchResults.map(r => (
                      <tr key={r.id}>
                        <td>{new Date(r.timestamp).toLocaleString()}</td><td>{r.source}</td><td>{r.event_type}</td>
                        <td><code>{JSON.stringify(r.data || {}).substring(0, 80)}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </Tab.Pane>
              <Tab.Pane eventKey="aggregations">
                <h4>Aggregations (24h)</h4>
                <Row>
                  <Col md={6}>
                    <h5>By Source</h5>
                    <Table striped bordered hover size="sm">
                      <thead><tr><th>Source</th><th>Count</th></tr></thead>
                      <tbody>
                        {aggregations?.by_source && Object.entries(aggregations.by_source).map(([src, count]) => (
                          <tr key={src}><td>{src}</td><td>{count}</td></tr>
                        ))}
                      </tbody>
                    </Table>
                  </Col>
                  <Col md={6}>
                    <h5>By Type</h5>
                    <Table striped bordered hover size="sm">
                      <thead><tr><th>Type</th><th>Count</th></tr></thead>
                      <tbody>
                        {aggregations?.by_type && Object.entries(aggregations.by_type).map(([type, count]) => (
                          <tr key={type}><td>{type}</td><td>{count}</td></tr>
                        ))}
                      </tbody>
                    </Table>
                  </Col>
                </Row>
              </Tab.Pane>
            </Tab.Content>
          </Col>
        </Row>
      </Tab.Container>

      {/* Export Modal */}
      <Modal show={showExportModal} onHide={() => setShowExportModal(false)}>
        <Modal.Header closeButton><Modal.Title>Export Security Events</Modal.Title></Modal.Header>
        <Form onSubmit={handleExport}>
          <Modal.Body>
            <Form.Group className="mb-3"><Form.Label>Format</Form.Label><Form.Select value={exportFormat} onChange={e => setExportFormat(e.target.value)}>
              <option value="json">JSON</option><option value="csv">CSV</option><option value="parquet">Parquet</option>
            </Form.Select></Form.Group>
          </Modal.Body>
          <Modal.Footer><Button variant="secondary" onClick={() => setShowExportModal(false)}>Cancel</Button><Button type="submit">Export</Button></Modal.Footer>
        </Form>
      </Modal>
    </Container>
  );
};

export default DataLakeDashboard;
