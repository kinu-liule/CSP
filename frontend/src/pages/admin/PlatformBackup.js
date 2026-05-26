import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Button, Alert, Spinner, Table, Badge } from 'react-bootstrap';
import axios from 'axios';

function PlatformBackup() {
  const [backup, setBackup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [backingUp, setBackingUp] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await axios.get('/admin/backup');
      setBackup(res.data.backup);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load backup status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleBackup = async () => {
    setBackingUp(true);
    setError('');
    try {
      await axios.post('/admin/backup');
      setTimeout(async () => {
        await fetchStatus();
        setBackingUp(false);
      }, 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Backup failed');
      setBackingUp(false);
    }
  };

  const isRunning = backup?.status === 'running';

  if (error) return <Alert variant="danger">{error}</Alert>;

  return (
    <>
      <h4 className="mb-3">📦 Database Backup</h4>
      <Row className="g-4">
        <Col md={4}>
          <Card className="text-center p-4">
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>{isRunning ? '⏳' : '💾'}</div>
            <h5>{isRunning ? 'Backup in Progress...' : backup?.last_backup ? 'Last Backup' : 'No backups yet'}</h5>
            {backup?.last_backup && <p className="small text-muted mb-1">{new Date(backup.last_backup).toLocaleString()}</p>}
            {backup?.last_backup_size && <p className="small text-muted">Size: {backup.last_backup_size}</p>}
            <Button variant="primary" size="lg" onClick={handleBackup} disabled={isRunning || backingUp} className="mt-3 w-100">
              {isRunning || backingUp ? <><Spinner size="sm" className="me-2" />Running...</> : '🗄️ Start Backup'}
            </Button>
          </Card>
        </Col>
        <Col md={8}>
          <h6 className="mb-3">Backup History</h6>
          {loading ? <div className="text-center py-5"><Spinner animation="border" /></div> : (
            <Table striped bordered hover responsive size="sm">
              <thead><tr><th>Date</th><th>Size</th><th>Duration</th><th>Status</th></tr></thead>
              <tbody>{(backup?.history || []).length === 0 ? <tr><td colSpan={4} className="text-center text-muted py-4">No backup history</td></tr> : backup.history.slice().reverse().map((h, i) => (
                <tr key={i}>
                  <td className="small">{new Date(h.at).toLocaleString()}</td>
                  <td className="small">{h.size}</td>
                  <td className="small">{h.duration_ms}ms</td>
                  <td><Badge bg="success">Completed</Badge></td>
                </tr>
              ))}</tbody>
            </Table>
          )}
        </Col>
      </Row>
    </>
  );
}

export default PlatformBackup;
