import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { Navbar, Nav, NavDropdown, Container, Button } from 'react-bootstrap';
import 'bootstrap/dist/css/bootstrap.min.css';
import axios from 'axios';
import SidebarNav from './components/SidebarNav';
import ErrorBoundary from './components/ErrorBoundary';
import { canAccess, canAdmin, isSuperAdmin, isOrgPortal, isSuperPortal, getEffectiveRole, refreshSubscriptions } from './utils/auth';

import Login from './pages/Login';
import Register from './pages/Register';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import IAMDashboard from './pages/iam/IAMDashboard';
import UserManagement from './pages/admin/UserManagement';
import RoleManagement from './pages/admin/RoleManagement';
import AuditLogs from './pages/admin/AuditLogs';
import TenantSettings from './pages/admin/TenantSettings';
import DepartmentsManagement from './pages/admin/DepartmentsManagement';
import OrgRequests from './pages/admin/OrgRequests';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import SuperAdminLanding from './pages/admin/SuperAdminLanding';
import SuperAdminServices from './pages/admin/SuperAdminServices';
import WAFDashboard from './pages/waf/WAFDashboard';
import NGFWDashboard from './pages/ngfw/NGFWDashboard';
import SIEMSOARDashboard from './pages/siem-soar/SIEMSOARDashboard';
import VulnScannerDashboard from './pages/vuln-scanner/VulnScannerDashboard';
import FraudDashboard from './pages/fraud/FraudDashboard';
import AwarenessDashboard from './pages/awareness/AwarenessDashboard';
import GRCDashboard from './pages/grc/GRCDashboard';
import RiskEngineDashboard from './pages/risk-engine/RiskEngineDashboard';
import AssetMgmtDashboard from './pages/asset-management/AssetMgmtDashboard';
import CSPMDashboard from './pages/cspm/CSPMDashboard';
import EDRDashboard from './pages/edr/EDRDashboard';
import ThreatIntelDashboard from './pages/threat-intel/ThreatIntelDashboard';
import SOARDashboard from './pages/soar/SOARDashboard';
import DataSecurityDashboard from './pages/data-security/DataSecurityDashboard';
import DataLakeDashboard from './pages/data-lake/DataLakeDashboard';
import XDRDashboard from './pages/xdr/XDRDashboard';
import DevSecOpsDashboard from './pages/devsecops/DevSecOpsDashboard';
import DeceptionDashboard from './pages/deception/DeceptionDashboard';
import PasswordMgrDashboard from './pages/password-manager/PasswordMgrDashboard';
import BusinessContDashboard from './pages/business-continuity/BusinessContDashboard';
import ServiceRequests from './pages/ServiceRequests';

axios.defaults.baseURL = process.env.REACT_APP_API_URL || '/api';

function ProtectedRoute({ children, service, mode }) {
  if (!service || canAccess(service, mode || 'R')) return children;
  return <Navigate to="/dashboard" replace />;
}

function AdminRoute({ children, minRole }) {
  const role = getEffectiveRole();
  const hierarchy = { super_admin: 100, platform_admin: 90, admin: 80, billing_manager: 70, integration_manager: 70, network_operator: 70, customer_success_manager: 70, security_analyst: 65, manager: 60, security_auditor: 55, compliance_officer: 55, analyst: 40, support_agent: 30, readonly_auditor: 25, user: 20 };
  if (!minRole) return children;
  if (hierarchy[role] >= hierarchy[minRole]) return children;
  return <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

function AppContent() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      refreshSubscriptions();
      axios.get('/iam/users/me').then(res => {
        setUser(res.data);
        setLoading(false);
      }).catch(() => {
        localStorage.removeItem('token');
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  if (loading) return <div className="text-center mt-5">Loading...</div>;

  // ========= PORTAL MODE: Super Admin (port 9090) =========
  if (isSuperPortal()) {
    return (
      <>
        {user && (
          <Navbar bg="dark" variant="dark" expand="lg" className="top-navbar">
            <Navbar.Brand as={Link} to="/admin">CyberSec Platform</Navbar.Brand>
            <Navbar.Toggle aria-controls="basic-navbar-nav" />
            <Navbar.Collapse id="basic-navbar-nav">
              <Nav className="me-auto">
                <Nav.Link as={Link} to="/admin">Platform Admin</Nav.Link>
              </Nav>
              <Nav>
                <span className="text-light me-3">{user.username}</span>
                <Button variant="outline-light" size="sm" onClick={handleLogout}>Logout</Button>
              </Nav>
            </Navbar.Collapse>
          </Navbar>
        )}
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={user ? <Navigate to="/admin" /> : <SuperAdminLanding />} />
            <Route path="/services" element={<SuperAdminServices />} />
            <Route path="/login" element={user ? <Navigate to="/admin" /> : <Login setUser={setUser} />} />
            <Route path="/admin/*" element={user ? <SuperAdminDashboard /> : <Navigate to="/login" />} />
            <Route path="*" element={<Navigate to={user ? "/admin" : "/"} />} />
          </Routes>
        </ErrorBoundary>
      </>
    );
  }

  // ========= PORTAL MODE: Organization (port 8081) =========
  const isHome = location.pathname === '/' && !user;
  if (isHome) {
    return <Home />;
  }

  return (
    <>
      {user && (
        <Navbar bg="dark" variant="dark" expand="lg" className="top-navbar">
          <Navbar.Brand as={Link} to="/dashboard">CyberSec Platform</Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <button className="sidebar-toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
              &#9776;
            </button>
            <Nav className="me-auto">
              <Nav.Link as={Link} to="/dashboard">Dashboard</Nav.Link>
              {canAdmin() && (
                <NavDropdown title="Administration" id="admin-dropdown">
                  <NavDropdown.Item as={Link} to="/admin/users">User Management</NavDropdown.Item>
                  <NavDropdown.Item as={Link} to="/admin/roles">Role Management</NavDropdown.Item>
                  <NavDropdown.Item as={Link} to="/admin/audit">Audit Logs</NavDropdown.Item>
                  <NavDropdown.Item as={Link} to="/admin/departments">Departments</NavDropdown.Item>
                  <NavDropdown.Item as={Link} to="/admin/settings">Tenant Settings</NavDropdown.Item>
                </NavDropdown>
              )}
            </Nav>
            <Nav>
              <span className="text-light me-3">{user.username}</span>
              <Button variant="outline-light" size="sm" onClick={handleLogout}>Logout</Button>
            </Nav>
          </Navbar.Collapse>
        </Navbar>
      )}
      <div className="app-layout">
        {user && (
          <>
            <div className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
            <div className={`sidebar-wrapper ${sidebarOpen ? 'open' : ''}`}>
              <SidebarNav onNavigate={() => setSidebarOpen(false)} userRoles={user?.roles} />
            </div>
          </>
        )}
        <Container className="mt-4 main-content">
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login setUser={setUser} />} />
              <Route path="/register" element={user ? <Navigate to="/dashboard" /> : <Register setUser={setUser} />} />
              <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
              <Route path="/iam/*" element={user ? <ProtectedRoute service="iam"><IAMDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/waf/*" element={user ? <ProtectedRoute service="waf"><WAFDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/ngfw/*" element={user ? <ProtectedRoute service="ngfw"><NGFWDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/siem-soar/*" element={user ? <ProtectedRoute service="siem-soar"><SIEMSOARDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/vuln-scanner/*" element={user ? <ProtectedRoute service="vuln-scanner"><VulnScannerDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/fraud/*" element={user ? <ProtectedRoute service="fraud"><FraudDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/awareness/*" element={user ? <ProtectedRoute service="awareness"><AwarenessDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/grc/*" element={user ? <ProtectedRoute service="grc"><GRCDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/asset-mgmt/*" element={user ? <ProtectedRoute service="asset-mgmt"><AssetMgmtDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/cspm/*" element={user ? <ProtectedRoute service="cspm"><CSPMDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/edr/*" element={user ? <ProtectedRoute service="edr"><EDRDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/threat-intel/*" element={user ? <ProtectedRoute service="threat-intel"><ThreatIntelDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/soar/*" element={user ? <ProtectedRoute service="soar"><SOARDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/data-security/*" element={user ? <ProtectedRoute service="data-security"><DataSecurityDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/data-lake/*" element={user ? <ProtectedRoute service="data-lake"><DataLakeDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/xdr/*" element={user ? <ProtectedRoute service="xdr"><XDRDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/devsecops/*" element={user ? <ProtectedRoute service="devsecops"><DevSecOpsDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/deception/*" element={user ? <ProtectedRoute service="deception"><DeceptionDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/password-mgr/*" element={user ? <ProtectedRoute service="password-mgr"><PasswordMgrDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/business-cont/*" element={user ? <ProtectedRoute service="business-cont"><BusinessContDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/risk-engine/*" element={user ? <ProtectedRoute service="risk-engine"><RiskEngineDashboard /></ProtectedRoute> : <Navigate to="/login" />} />
              <Route path="/service-requests" element={user ? <ServiceRequests /> : <Navigate to="/login" />} />
              <Route path="/admin/users" element={user ? <AdminRoute minRole="admin"><UserManagement /></AdminRoute> : <Navigate to="/login" />} />
              <Route path="/admin/roles" element={user ? <AdminRoute minRole="admin"><RoleManagement /></AdminRoute> : <Navigate to="/login" />} />
              <Route path="/admin/audit" element={user ? <AdminRoute minRole="manager"><AuditLogs /></AdminRoute> : <Navigate to="/login" />} />
              <Route path="/admin/settings" element={user ? <AdminRoute minRole="admin"><TenantSettings /></AdminRoute> : <Navigate to="/login" />} />
              <Route path="/admin/departments" element={user ? <AdminRoute minRole="manager"><DepartmentsManagement /></AdminRoute> : <Navigate to="/login" />} />
              <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Home />} />
              <Route path="*" element={<Navigate to={user ? "/dashboard" : "/"} />} />
            </Routes>
          </ErrorBoundary>
        </Container>
      </div>
    </>
  );
}

export default App;

