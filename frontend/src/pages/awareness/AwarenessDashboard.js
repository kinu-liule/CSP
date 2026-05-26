import React from 'react';
import { Container, Row, Col, Card, Button } from 'react-bootstrap';

const AwarenessDashboard = () => {
  const serviceUrl = '/services';

  return (
    <Container fluid className="p-4">
      <Row className="mb-4">
        <Col>
          <h2 className="mb-1">EthioCyber Grid</h2>
          <p className="text-muted">National Cybersecurity Phishing Simulation &amp; Awareness Training Platform</p>
        </Col>
      </Row>
      <Row className="g-4 mb-4">
        <Col md={4}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Body className="text-center p-4">
              <div className="mb-3" style={{ fontSize: '2.5rem' }}>🎯</div>
              <h5>Phishing Campaigns</h5>
              <p className="text-muted small">Design, launch, and track simulated phishing campaigns across your organization.</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Body className="text-center p-4">
              <div className="mb-3" style={{ fontSize: '2.5rem' }}>📋</div>
              <h5>Training Modules</h5>
              <p className="text-muted small">Assign and track security awareness training with built-in LMS integration.</p>
            </Card.Body>
          </Card>
        </Col>
        <Col md={4}>
          <Card className="h-100 border-0 shadow-sm">
            <Card.Body className="text-center p-4">
              <div className="mb-3" style={{ fontSize: '2.5rem' }}>📊</div>
              <h5>Analytics &amp; Reporting</h5>
              <p className="text-muted small">View campaign results, risk scores, and compliance reports.</p>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <Row>
        <Col className="text-center">
          <Card className="border-0 shadow-sm bg-dark text-white">
            <Card.Body className="p-5">
              <h4 className="mb-3">Launch EthioCyber Grid Admin Portal</h4>
              <p className="mb-4">Access the full administration interface to manage campaigns, templates, groups, users, and more.</p>
              <Button
                variant="primary"
                size="lg"
                href={serviceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open Admin Portal &rarr;
              </Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AwarenessDashboard;
