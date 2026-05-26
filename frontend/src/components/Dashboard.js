import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const services = [
    // Original services
    { name: 'WAF', path: '/waf', icon: '🛡️', desc: 'Web Application Firewall', color: 'primary' },
    { name: 'NGFW', path: '/ngfw', icon: '🔥', desc: 'Next-Gen Firewall', color: 'danger' },
    { name: 'SIEM/SOAR', path: '/siem', icon: '📊', desc: 'SIEM & SOAR Platform', color: 'warning' },
    { name: 'Vulnerabilities', path: '/vulnerabilities', icon: '🔍', desc: 'Vulnerability Scanner', color: 'info' },
    { name: 'Fraud Detection', path: '/fraud', icon: '🚨', desc: 'Fraud Detection', color: 'danger' },
    { name: 'Awareness', path: '/awareness', icon: '📚', desc: 'Security Awareness', color: 'success' },
    { name: 'GRC', path: '/grc', icon: '📋', desc: 'Governance, Risk & Compliance', color: 'secondary' },
    { name: 'Risk Engine', path: '/risk-engine', icon: '🧠', desc: 'Python Risk Scoring', color: 'dark' },
    // New services - 12 total
    { name: 'Asset Management', path: '/assets', icon: '🖥️', desc: 'Asset Discovery & Tracking', color: 'primary' },
    { name: 'CSPM', path: '/cspm', icon: '☁️', desc: 'Cloud Security Posture', color: 'info' },
    { name: 'EDR', path: '/edr', icon: '🛡️', desc: 'Endpoint Detection & Response', color: 'danger' },
    { name: 'Threat Intel', path: '/threat-intel', icon: '🎯', desc: 'Threat Intelligence', color: 'warning' },
    { name: 'SOAR', path: '/soar', icon: '🤖', desc: 'Security Orchestration', color: 'success' },
    { name: 'Data Security', path: '/data-security', icon: '🔐', desc: 'DLP & Encryption', color: 'dark' },
    { name: 'Data Lake', path: '/data-lake', icon: '🌊', desc: 'Security Data Lake', color: 'info' },
    { name: 'XDR', path: '/xdr', icon: '🔗', desc: 'Extended Detection & Response', color: 'danger' },
    { name: 'DevSecOps', path: '/devsecops', icon: '⚙️', desc: 'CI/CD Security', color: 'warning' },
    { name: 'Deception', path: '/deception', icon: '🕸️', desc: 'Honeypots & Deception', color: 'secondary' },
    { name: 'Password Manager', path: '/password-manager', icon: '🔑', desc: 'Secure Vault', color: 'success' },
    { name: 'Business Continuity', path: '/business-continuity', icon: '🏥️', desc: 'BCP & DR Planning', color: 'primary' },
  ];

  return (
    <div className="min-vh-100 bg-light">
      <nav className="navbar navbar-expand-lg navbar-dark bg-dark">
        <div className="container-fluid">
          <Link className="navbar-brand" to="/dashboard">CyberSec Platform</Link>
          <div className="d-flex align-items-center">
            <span className="text-light me-3">{user?.username} ({user?.tenantId})</span>
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      </nav>
      
      <div className="container mt-4">
        <h2>Welcome, {user?.username}</h2>
        <p className="text-muted">Multi-Tenant Cybersecurity Platform Dashboard</p>
        
        <div className="row mt-4">
          {/* Original Services */}
          <div className="col-12 mb-3">
            <h4 className="text-muted">Core Services</h4>
          </div>
          {services.slice(0, 8).map(s => (
            <div key={s.path} className="col-lg-3 col-md-4 col-sm-6 mb-3">
              <Link to={s.path} className="text-decoration-none">
                <div className={`card h-100 shadow-sm hover-shadow border-${s.color}`}>
                  <div className="card-body text-center">
                    <div style={{ fontSize: '2rem' }}>{s.icon}</div>
                    <h5 className={`card-title text-${s.color}`}>{s.name}</h5>
                    <p className="card-text text-muted small">{s.desc}</p>
                  </div>
                </div>
              </Link>
            </div>
          ))}

          {/* New Services */}
          <div className="col-12 mb-3 mt-4">
            <h4 className="text-muted">Extended Services (12)</h4>
          </div>
          {services.slice(8).map(s => (
            <div key={s.path} className="col-lg-3 col-md-4 col-sm-6 mb-3">
              <Link to={s.path} className="text-decoration-none">
                <div className={`card h-100 shadow-sm hover-shadow border-${s.color}`}>
                  <div className="card-body text-center">
                    <div style={{ fontSize: '2rem' }}>{s.icon}</div>
                    <h5 className={`card-title text-${s.color}`}>{s.name}</h5>
                    <p className="card-text text-muted small">{s.desc}</p>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>

        <div className="row mt-4">
          <div className="col-12">
            <div className="card">
              <div className="card-header bg-dark text-white">
                <h5 className="mb-0">Platform Overview</h5>
              </div>
              <div className="card-body">
                <div className="row text-center">
                  <div className="col-md-3">
                    <h3 className="text-primary">20+</h3>
                    <p className="text-muted">Security Services</p>
                  </div>
                  <div className="col-md-3">
                    <h3 className="text-success">12</h3>
                    <p className="text-muted">New Services Added</p>
                  </div>
                  <div className="col-md-3">
                    <h3 className="text-warning">Node.js</h3>
                    <p className="text-muted">Backend Stack</p>
                  </div>
                  <div className="col-md-3">
                    <h3 className="text-info">Python</h3>
                    <p className="text-muted">Risk Engine</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
