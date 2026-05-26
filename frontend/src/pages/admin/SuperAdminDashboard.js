import React, { useState } from 'react';
import { Container, Tab, Row, Col } from 'react-bootstrap';
import OrgRequests from './OrgRequests';
import PlatformTenants from './PlatformTenants';
import PlatformUsers from './PlatformUsers';
import PlatformBilling from './PlatformBilling';
import PlatformApiKeys from './PlatformApiKeys';
import PlatformNotifications from './PlatformNotifications';
import PlatformEmailTemplates from './PlatformEmailTemplates';
import PlatformBackup from './PlatformBackup';
import PlatformAudit from './PlatformAudit';
import PlatformAnalytics from './PlatformAnalytics';
import PlatformHealth from './PlatformHealth';
import GlobalPolicies from './GlobalPolicies';
import ServiceReqManagement from './ServiceReqManagement';
import PlatformOverview from './PlatformOverview';
import ServiceManagement from './ServiceManagement';
import PlatformBranding from './PlatformBranding';
import AuditLogDetail from './AuditLogDetail';
import MaintenanceMode from './MaintenanceMode';
import WebhookConfig from './WebhookConfig';
import ComplianceReports from './ComplianceReports';
import Announcements from './Announcements';
import IpAllowBlock from './IpAllowBlock';
import ResourceQuotas from './ResourceQuotas';
import SessionManagement from './SessionManagement';
import SsoConfig from './SsoConfig';
import TenantImpersonation from './TenantImpersonation';
import SlaReports from './SlaReports';
import BulkOperations from './BulkOperations';
import AdminSettings from './AdminSettings';

const groups = [
  {
    label: 'Dashboard',
    items: [
      { key: 'overview', label: 'Overview', icon: '📊' },
    ],
  },
  {
    label: 'Management',
    items: [
      { key: 'tenants', label: 'Tenants', icon: '🏢' },
      { key: 'users', label: 'Platform Users', icon: '👥' },
      { key: 'adminsettings', label: 'Admin Settings', icon: '🔐' },
      { key: 'billing', label: 'Billing', icon: '💰' },
      { key: 'apikeys', label: 'API Keys', icon: '🔑' },
      { key: 'branding', label: 'Branding', icon: '🎨' },
      { key: 'quotas', label: 'Quotas', icon: '📦' },
    ],
  },
  {
    label: 'Requests',
    items: [
      { key: 'requests', label: 'New Orgs', icon: '🏗️' },
      { key: 'svcreq', label: 'Service Upgrades', icon: '📨' },
    ],
  },
  {
    label: 'Monitoring',
    items: [
      { key: 'health', label: 'System Health', icon: '❤️' },
      { key: 'sla', label: 'SLA Reports', icon: '📊' },
      { key: 'services', label: 'Services', icon: '⚙️' },
    ],
  },
  {
    label: 'Security & Compliance',
    items: [
      { key: 'policies', label: 'Policies', icon: '🔒' },
      { key: 'compliance', label: 'Compliance', icon: '📋' },
      { key: 'iprules', label: 'IP Rules', icon: '🛡️' },
      { key: 'sso', label: 'SSO', icon: '🔐' },
      { key: 'sessions', label: 'Sessions', icon: '🔄' },
      { key: 'impersonate', label: 'Impersonate', icon: '⭐' },
    ],
  },
  {
    label: 'Communications',
    items: [
      { key: 'notifications', label: 'Notifications', icon: '📢' },
      { key: 'email', label: 'Email Templates', icon: '📧' },
      { key: 'webhooks', label: 'Webhooks', icon: '🔌' },
      { key: 'announcements', label: 'Announcements', icon: '📢' },
    ],
  },
  {
    label: 'Audit & Analytics',
    items: [
      { key: 'audit', label: 'Audit', icon: '📋' },
      { key: 'auditdetail', label: 'Audit Detail', icon: '📄' },
      { key: 'analytics', label: 'Analytics', icon: '📊' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { key: 'maintenance', label: 'Maintenance', icon: '🚦' },
      { key: 'backup', label: 'Backup', icon: '📦' },
      { key: 'bulk', label: 'Bulk Operations', icon: '🚀' },
    ],
  },
];

const allTabs = groups.flatMap(g => g.items);

function SuperAdminDashboard() {
  const [activeTab, setActiveTab] = useState('overview');

  const findComponent = (key) => {
    const item = allTabs.find(t => t.key === key);
    if (!item) return null;
    const map = {
      overview: PlatformOverview, requests: OrgRequests, svcreq: ServiceReqManagement,
      tenants: PlatformTenants, users: PlatformUsers, adminsettings: AdminSettings, billing: PlatformBilling,
      apikeys: PlatformApiKeys, notifications: PlatformNotifications, email: PlatformEmailTemplates,
      backup: PlatformBackup, audit: PlatformAudit, auditdetail: AuditLogDetail,
      analytics: PlatformAnalytics, health: PlatformHealth, policies: GlobalPolicies,
      services: ServiceManagement, branding: PlatformBranding, maintenance: MaintenanceMode,
      webhooks: WebhookConfig, compliance: ComplianceReports, announcements: Announcements,
      iprules: IpAllowBlock, quotas: ResourceQuotas, sessions: SessionManagement,
      sso: SsoConfig, impersonate: TenantImpersonation, sla: SlaReports, bulk: BulkOperations,
    };
    return map[key] || null;
  };

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      <div style={{
        width: 240, minWidth: 240, background: '#0f172a', color: '#e2e8f0',
        display: 'flex', flexDirection: 'column', borderRight: '1px solid #1e293b',
      }}>
        <div style={{ padding: '20px 18px 14px', borderBottom: '1px solid #1e293b' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🛡️</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc', lineHeight: 1.2 }}>CyberSec</div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500 }}>Platform Admin</div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          {groups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 4 }}>
              <div style={{
                padding: '8px 18px 4px', fontSize: 10, fontWeight: 600,
                color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const isActive = activeTab === item.key;
                return (
                  <div
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 18px', cursor: 'pointer', fontSize: 13,
                      background: isActive ? '#1e293b' : 'transparent',
                      color: isActive ? '#f8fafc' : '#94a3b8',
                      borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                      transition: 'all 0.12s ease',
                      fontWeight: isActive ? 600 : 400,
                    }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = '#1a1f33'; e.currentTarget.style.color = '#e2e8f0'; }}}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8'; }}}
                  >
                    <span style={{ fontSize: 16, width: 20, textAlign: 'center' }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{
          padding: '12px 18px', borderTop: '1px solid #1e293b',
          fontSize: 11, color: '#475569',
        }}>
          v3.0.0
        </div>
      </div>
      <div style={{ flex: 1, padding: '24px 28px', background: '#f8fafc', overflow: 'auto' }}>
        <Tab.Container activeKey={activeTab} onSelect={() => {}}>
          <Tab.Content>
            {allTabs.map(t => (
              <Tab.Pane key={t.key} eventKey={t.key}>
                {activeTab === t.key && React.createElement(findComponent(t.key))}
              </Tab.Pane>
            ))}
          </Tab.Content>
        </Tab.Container>
      </div>
    </div>
  );
}

export default SuperAdminDashboard;
