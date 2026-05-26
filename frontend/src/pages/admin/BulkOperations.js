import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Spinner, Alert, Row, Col, Table, Badge } from 'react-bootstrap';
import axios from 'axios';

function BulkOperations() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importData, setImportData] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [targetTenants, setTargetTenants] = useState([]);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState(null);
  const [exporting, setExporting] = useState(false);

  const availableServices = [
    'iam', 'waf', 'ngfw', 'siem', 'soar', 'vuln-scanner', 'fraud-detection',
    'awareness', 'grc', 'asset-management', 'cspm', 'edr', 'threat-intel',
    'data-security', 'data-lake', 'xdr', 'devsecops', 'deception', 'password-manager',
    'business-continuity', 'risk-engine',
  ];

  useEffect(() => {
    axios.get('/admin/tenants').then(r => setTenants(r.data.tenants || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleTenant = (tid) => {
    setTargetTenants(prev =>
      prev.includes(tid) ? prev.filter(t => t !== tid) : [...prev, tid]
    );
  };

  const toggleService = (svc) => {
    setSelectedServices(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    );
  };

  const handleSelectAllTenants = () => {
    if (targetTenants.length === tenants.length) {
      setTargetTenants([]);
    } else {
      setTargetTenants(tenants.map(t => t.tenant_id));
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await axios.get('/admin/users');
      const usersByTenant = res.data.usersByTenant || [];
      const csvRows = ['tenant_id,tenant_name,user_id,username,email,roles,active'];
      usersByTenant.forEach(t => {
        t.users.forEach(u => {
          csvRows.push(`${t.tenant_id},${t.tenant_name},${u.id},${u.username},${u.email},"${(u.roles || []).join(';')}",${u.active}`);
        });
      });
      const csv = csvRows.join('\n');
      const b = new Blob([csv], { type: 'text/csv' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'platform_users_export.csv'; a.click();
    } catch (err) {
      setError(err.response?.data?.error || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async () => {
    if (!importData.trim()) return;
    setImporting(true); setResult(null);
    try {
      const lines = importData.trim().split('\n');
      const users = lines.map(line => {
        const [tenantId, username, email, password, rolesStr] = line.split(',').map(s => s.trim());
        return { tenantId, username, email, password: password || 'TempPass123!', roles: rolesStr ? rolesStr.split(';') : ['user'] };
      });
      const res = await axios.post('/admin/bulk/import-users', { users });
      setResult({ success: true, imported: res.data.imported, errors: res.data.errors });
      if (res.data.imported > 0) setImportData('');
    } catch (err) {
      setResult({ success: false, error: err.response?.data?.error || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleBulkAssignServices = async () => {
    if (targetTenants.length === 0 || selectedServices.length === 0) return;
    setAssigning(true); setAssignResult(null);
    try {
      const res = await axios.post('/admin/bulk/assign-services', { tenantIds: targetTenants, services: selectedServices });
      setAssignResult({ success: true, message: `Services assigned to ${targetTenants.length} tenant(s)` });
    } catch (err) {
      setAssignResult({ success: false, error: err.response?.data?.error || 'Assignment failed' });
    } finally {
      setAssigning(false);
    }
  };

  if (error) return <Alert variant="danger" dismissible onClose={() => setError('')}>{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">🚀 Bulk Operations</h4>

      <Row className="g-4">
        {/* Export Users */}
        <Col md={6}>
          <Card>
            <Card.Header><strong>⬇ Export Users (CSV)</strong></Card.Header>
            <Card.Body>
              <p className="text-muted small">Export all users across all tenants to a CSV file.</p>
              <Button variant="success" onClick={handleExport} disabled={exporting}>{exporting ? 'Exporting...' : 'Export CSV'}</Button>
            </Card.Body>
          </Card>
        </Col>

        {/* Import Users */}
        <Col md={6}>
          <Card>
            <Card.Header><strong>⬆ Import Users (CSV)</strong></Card.Header>
            <Card.Body>
              <p className="text-muted small">Format per line: <code>tenantId,username,email,password,role1;role2</code></p>
              <Form.Control as="textarea" rows={4} value={importData} onChange={e => setImportData(e.target.value)} placeholder="tenant1,jdoe,john@acme.com,Pass123!,admin&#10;tenant1,jane,jane@acme.com,,user" />
              <Button variant="primary" className="mt-2" onClick={handleImport} disabled={importing || !importData.trim()}>{importing ? 'Importing...' : 'Import Users'}</Button>
              {result && result.success && <Alert variant="success" className="mt-2 mb-0 small">{result.imported} user(s) imported{result.errors?.length ? `, ${result.errors.length} error(s)` : ''}</Alert>}
              {result && !result.success && <Alert variant="danger" className="mt-2 mb-0 small">{result.error}</Alert>}
            </Card.Body>
          </Card>
        </Col>

        {/* Bulk Service Assignment */}
        <Col md={12}>
          <Card>
            <Card.Header><strong>📋 Bulk Assign Services</strong></Card.Header>
            <Card.Body>
              {assignResult && <Alert variant={assignResult.success ? 'success' : 'danger'} dismissible onClose={() => setAssignResult(null)}>{assignResult.success ? assignResult.message : assignResult.error}</Alert>}
              <Row className="g-4">
                <Col md={6}>
                  <h6>Select Tenants</h6>
                  <Form.Check type="checkbox" label={`All (${tenants.length})`} checked={targetTenants.length === tenants.length && tenants.length > 0} onChange={handleSelectAllTenants} />
                  <div style={{ maxHeight: 200, overflowY: 'auto' }} className="border rounded p-2 mt-2">
                    {tenants.map(t => (
                      <Form.Check key={t.tenant_id} type="checkbox" label={t.name || t.tenant_id} checked={targetTenants.includes(t.tenant_id)} onChange={() => toggleTenant(t.tenant_id)} />
                    ))}
                  </div>
                  <p className="text-muted small mt-1">{targetTenants.length} tenant(s) selected</p>
                </Col>
                <Col md={6}>
                  <h6>Select Services</h6>
                  <div style={{ maxHeight: 200, overflowY: 'auto' }} className="border rounded p-2 mt-2">
                    {availableServices.map(s => (
                      <Form.Check key={s} type="checkbox" label={s} checked={selectedServices.includes(s)} onChange={() => toggleService(s)} />
                    ))}
                  </div>
                  <p className="text-muted small mt-1">{selectedServices.length} service(s) selected</p>
                </Col>
              </Row>
              <Button variant="primary" className="mt-3" onClick={handleBulkAssignServices} disabled={targetTenants.length === 0 || selectedServices.length === 0 || assigning}>
                {assigning ? 'Assigning...' : `Assign ${selectedServices.length} Service(s) to ${targetTenants.length} Tenant(s)`}
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default BulkOperations;
