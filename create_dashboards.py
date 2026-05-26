import os

base = r'C:\Users\Arbaj Khan LLC\Documents\all-in-on CS Solution\cybersec-platform\frontend\src\pages'

services = [
    ('iam', 'IAM', '/iam', 'Identity & Access Management', '🔐', 3008),
    ('waf', 'WAF', '/waf', 'Web Application Firewall', '🛡️', 3001),
    ('ngfw', 'NGFW', '/ngfw', 'Next-Gen Firewall', '🔥', 3002),
    ('siem-soar', 'SIEM/SOAR', '/siem-soar', 'Security Information & Event Management', '🔍', 3003),
    ('vuln-scanner', 'Vuln Scanner', '/vuln-scanner', 'Vulnerability Management', '🔎', 3004),
    ('fraud', 'Fraud Detection', '/fraud', 'Fraud Detection Platform', '💳️', 3005),
    ('awareness', 'Awareness', '/awareness', 'Human Risk Awareness', '📚', 3006),
    ('grc', 'GRC', '/grc', 'Governance, Risk & Compliance', '📋', 3007),
    ('asset-management', 'Asset Mgmt', '/asset-management', 'Asset Management', '💎', 3009),
    ('cspm', 'CSPM', '/cspm', 'Cloud Security Posture Management', '☁️', 3011),
    ('edr', 'EDR', '/edr', 'Endpoint Detection & Response', '🖥️', 3015),
    ('threat-intel', 'Threat Intel', '/threat-intel', 'Threat Intelligence', '🎯', 3019),
    ('soar', 'SOAR', '/soar', 'Security Orchestration & Response', '⚙️', 3018),
    ('data-security', 'Data Security', '/data-security', 'Data Security Platform', '🔒', 3012),
    ('data-lake', 'Data Lake', '/data-lake', 'Security Data Lake', '💾', 3017),
    ('xdr', 'XDR', '/xdr', 'Extended Detection & Response', '🎯', 3020),
    ('devsecops', 'DevSecOps', '/devsecops', 'DevSecOps Platform', '⚙️', 3014),
    ('deception', 'Deception', '/deception', 'Deception & Honeypot', '🕷️', 3013),
    ('password-manager', 'Password Mgr', '/password-mgr', 'Password Manager', '🔑', 3016),
    ('business-continuity', 'Business Cont.', '/business-cont', 'Business Continuity', '💼', 3010),
]

template = """import React, {{ useState, useEffect }} from 'react';
import {{ Container, Row, Col, Card, Table, Button, Alert }} from 'react-bootstrap';
import axios from 'axios';

function {name}Dashboard() {{
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {{
    axios.get('/api{apiPath}/health')
      .then(res => setData(res.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }}, []);

  if (loading) return <Container className="mt-5"><div className="text-center">Loading {serviceName}...</div></Container>;
  if (error) return <Container className="mt-5"><Alert variant="danger">Error: {{error}}</Alert></Container>;

  return (
    <Container className="mt-4">
      <h2>{serviceName} Dashboard</h2>
      <p className="text-muted">{description}</p>
      
      <Row className="mb-4">
        <Col md={{3}}>
          <Card className="text-center">
            <Card.Body>
              <h3>Status</h3>
              <div className="text-success">● {{data?.status || 'Online'}}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={{3}}>
          <Card className="text-center">
            <Card.Body>
              <h3>Port</h3>
              <div>{port}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={{3}}>
          <Card className="text-center">
            <Card.Body>
              <h3>Service</h3>
              <div>{serviceName}</div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={{3}}>
          <Card className="text-center">
            <Card.Body>
              <h3>Health</h3>
              <div className="text-success">● Healthy</div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <h4>API Endpoints</h4>
      <Table striped bordered hover>
        <thead>
          <tr><th>Endpoint</th><th>Method</th><th>Description</th></tr>
        </thead>
        <tbody>
          <tr><td>/api{apiPath}/health</td><td>GET</td><td>Health check</td></tr>
          <tr><td>/api{apiPath}/</td><td>GET</td><td>List resources</td></tr>
          <tr><td>/api{apiPath}/</td><td>POST</td><td>Create resource</td></tr>
        </tbody>
      </Table>
    </Container>
  );
}}

export default {name}Dashboard;
"""

for dir_name, name, api_path, desc, icon, port in services:
    dir_path = os.path.join(base, dir_name)
    os.makedirs(dir_path, exist_ok=True)
    
    content = template.format(
        name=name.replace('-', ''),
        serviceName=name,
        apiPath=api_path,
        description=desc,
        port=port
    )
    
    file_path = os.path.join(dir_path, f'{name.replace("-", "")}Dashboard.js')
    with open(file_path, 'w') as f:
        f.write(content)
    print(f'Created {name} dashboard')

print('All 20 dashboards created!')
