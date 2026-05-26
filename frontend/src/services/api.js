import axios from 'axios';

const API_URL = '';

function getHeaders() {
  const tenantId = localStorage.getItem('tenantId');
  const token = localStorage.getItem('token');
  return {
    'x-tenant-id': tenantId || '',
    'Authorization': token ? `Bearer ${token}` : ''
  };
}

export const awarenessService = {
  getCampaigns: async () => (await axios.get(`${API_URL}/awareness/campaigns`, { headers: getHeaders() })).data,
  createCampaign: async (data) => (await axios.post(`${API_URL}/awareness/campaigns`, data, { headers: getHeaders() })).data,
  executeCampaign: async (id) => (await axios.post(`${API_URL}/awareness/campaigns/${id}/execute`, {}, { headers: getHeaders() })).data,
  getCampaignDeliveries: async (id) => (await axios.get(`${API_URL}/awareness/campaigns/${id}/deliveries`, { headers: getHeaders() })).data,
  getTrainingModules: async () => (await axios.get(`${API_URL}/awareness/training/modules`, { headers: getHeaders() })).data,
  assignTraining: async (data) => (await axios.post(`${API_URL}/awareness/training/assign`, data, { headers: getHeaders() })).data,
  completeTraining: async (data) => (await axios.post(`${API_URL}/awareness/training/complete`, data, { headers: getHeaders() })).data,
  getOrgRisk: async () => (await axios.get(`${API_URL}/awareness/risk/org`, { headers: getHeaders() })).data,
  getUserRisk: async (userId) => (await axios.get(`${API_URL}/awareness/risk/user/${userId}`, { headers: getHeaders() })).data,
  getUserRiskProfiles: async () => (await axios.get(`${API_URL}/awareness/user-risk-profiles`, { headers: getHeaders() })).data,
  getIncidents: async () => (await axios.get(`${API_URL}/awareness/incidents`, { headers: getHeaders() })).data,
  reportIncident: async (data) => (await axios.post(`${API_URL}/awareness/incidents/report`, data, { headers: getHeaders() })).data,
  triageIncident: async (id) => (await axios.put(`${API_URL}/awareness/incidents/${id}/triage`, {}, { headers: getHeaders() })).data,
  getAlerts: async () => (await axios.get(`${API_URL}/awareness/alerts`, { headers: getHeaders() })).data,
  createAlertRule: async (data) => (await axios.post(`${API_URL}/awareness/alerts/rules`, data, { headers: getHeaders() })).data,
  resolveAlert: async (id) => (await axios.put(`${API_URL}/awareness/alerts/${id}/resolve`, {}, { headers: getHeaders() })).data,
  getLandingPages: async () => (await axios.get(`${API_URL}/awareness/landing-pages`, { headers: getHeaders() })).data,
  createLandingPage: async (data) => (await axios.post(`${API_URL}/awareness/landing-pages`, data, { headers: getHeaders() })).data,
  updateLandingPage: async (id, data) => (await axios.put(`${API_URL}/awareness/landing-pages/${id}`, data, { headers: getHeaders() })).data,
  deleteLandingPage: async (id) => (await axios.delete(`${API_URL}/awareness/landing-pages/${id}`, { headers: getHeaders() })).data,
  getTemplates: async () => (await axios.get(`${API_URL}/awareness/templates`, { headers: getHeaders() })).data,
  createTemplate: async (data) => (await axios.post(`${API_URL}/awareness/templates`, data, { headers: getHeaders() })).data,
  updateTemplate: async (id, data) => (await axios.put(`${API_URL}/awareness/templates/${id}`, data, { headers: getHeaders() })).data,
  deleteTemplate: async (id) => (await axios.delete(`${API_URL}/awareness/templates/${id}`, { headers: getHeaders() })).data,
  getGroups: async () => (await axios.get(`${API_URL}/awareness/groups`, { headers: getHeaders() })).data,
  createGroup: async (data) => (await axios.post(`${API_URL}/awareness/groups`, data, { headers: getHeaders() })).data,
  getSendingProfiles: async () => (await axios.get(`${API_URL}/awareness/sending-profiles`, { headers: getHeaders() })).data,
  createSendingProfile: async (data) => (await axios.post(`${API_URL}/awareness/sending-profiles`, data, { headers: getHeaders() })).data,
  updateSendingProfile: async (id, data) => (await axios.put(`${API_URL}/awareness/sending-profiles/${id}`, data, { headers: getHeaders() })).data,
  deleteSendingProfile: async (id) => (await axios.delete(`${API_URL}/awareness/sending-profiles/${id}`, { headers: getHeaders() })).data,
  getAnalyticsCampaigns: async () => (await axios.get(`${API_URL}/awareness/analytics/campaigns`, { headers: getHeaders() })).data,
  getAnalyticsRiskTrends: async () => (await axios.get(`${API_URL}/awareness/analytics/risk-trends`, { headers: getHeaders() })).data,
  getSimulationResults: async () => (await axios.get(`${API_URL}/awareness/simulations/results`, { headers: getHeaders() })).data,
};

export const authService = {
  login: async (username, password, tenantId) => {
    const response = await axios.post(`${API_URL}/iam/auth/login`, { username, password }, { headers: { 'x-tenant-id': tenantId } });
    return response.data;
  },
  getUsers: async () => (await axios.get(`${API_URL}/iam/users`, { headers: getHeaders() })).data,
};

export const wafService = {
  getRules: async () => (await axios.get(`${API_URL}/waf/rules`, { headers: getHeaders() })).data,
  createRule: async (ruleData) => (await axios.post(`${API_URL}/waf/rules`, ruleData, { headers: getHeaders() })).data,
};

export const ngfwService = {
  getRules: async () => (await axios.get(`${API_URL}/ngfw/rules`, { headers: getHeaders() })).data,
  createRule: async (data) => (await axios.post(`${API_URL}/ngfw/rules`, data, { headers: getHeaders() })).data,
  getDashboard: async () => (await axios.get(`${API_URL}/ngfw/dashboard`, { headers: getHeaders() })).data,
  getLogs: async (limit = 50) => (await axios.get(`${API_URL}/ngfw/logs?limit=${limit}`, { headers: getHeaders() })).data,
  getZones: async () => (await axios.get(`${API_URL}/ngfw/zones`, { headers: getHeaders() })).data,
  createZone: async (data) => (await axios.post(`${API_URL}/ngfw/zones`, data, { headers: getHeaders() })).data,
};

export const siemService = {
  getEvents: async () => (await axios.get(`${API_URL}/siem/events`, { headers: getHeaders() })).data,
};

export const vulnScannerService = {
  getScans: async () => (await axios.get(`${API_URL}/scanner/scans`, { headers: getHeaders() })).data,
};

export const fraudDetectionService = {
  getAlerts: async () => (await axios.get(`${API_URL}/fraud/alerts`, { headers: getHeaders() })).data,
};

export const grcService = {
  getControls: async () => (await axios.get(`${API_URL}/grc/controls`, { headers: getHeaders() })).data,
  getDashboard: async () => (await axios.get(`${API_URL}/grc/dashboard`, { headers: getHeaders() })).data,
  getPolicies: async () => (await axios.get(`${API_URL}/grc/policies`, { headers: getHeaders() })).data,
  createPolicy: async (data) => (await axios.post(`${API_URL}/grc/policies`, data, { headers: getHeaders() })).data,
  updatePolicy: async (id, data) => (await axios.put(`${API_URL}/grc/policies/${id}`, data, { headers: getHeaders() })).data,
  deletePolicy: async (id) => (await axios.delete(`${API_URL}/grc/policies/${id}`, { headers: getHeaders() })).data,
  getRisks: async () => (await axios.get(`${API_URL}/grc/risks`, { headers: getHeaders() })).data,
  createRisk: async (data) => (await axios.post(`${API_URL}/grc/risks`, data, { headers: getHeaders() })).data,
};

export const assetManagementService = {
  getAssets: async () => (await axios.get(`${API_URL}/assets/assets`, { headers: getHeaders() })).data,
  getAsset: async (id) => (await axios.get(`${API_URL}/assets/assets/${id}`, { headers: getHeaders() })).data,
  createAsset: async (data) => (await axios.post(`${API_URL}/assets/assets`, data, { headers: getHeaders() })).data,
  updateAsset: async (id, data) => (await axios.put(`${API_URL}/assets/assets/${id}`, data, { headers: getHeaders() })).data,
  deleteAsset: async (id) => (await axios.delete(`${API_URL}/assets/assets/${id}`, { headers: getHeaders() })).data,
  getAssetVulns: async (id) => (await axios.get(`${API_URL}/assets/assets/${id}/vulns`, { headers: getHeaders() })).data,
};

export const cspmService = {
  getAccounts: async () => (await axios.get(`${API_URL}/cspm/accounts`, { headers: getHeaders() })).data,
  createAccount: async (data) => (await axios.post(`${API_URL}/cspm/accounts`, data, { headers: getHeaders() })).data,
  getFindings: async (params) => (await axios.get(`${API_URL}/cspm/findings`, { headers: getHeaders(), params })).data,
  triggerScan: async () => (await axios.post(`${API_URL}/cspm/scan`, {}, { headers: getHeaders() })).data,
  getCompliance: async () => (await axios.get(`${API_URL}/cspm/compliance`, { headers: getHeaders() })).data,
  getPolicies: async () => (await axios.get(`${API_URL}/cspm/policies`, { headers: getHeaders() })).data,
  createPolicy: async (data) => (await axios.post(`${API_URL}/cspm/policies`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/cspm/metrics`, { headers: getHeaders() })).data,
};

export const edrService = {
  getAgents: async () => (await axios.get(`${API_URL}/edr/agents`, { headers: getHeaders() })).data,
  registerAgent: async (data) => (await axios.post(`${API_URL}/edr/agents`, data, { headers: getHeaders() })).data,
  getTelemetry: async (params) => (await axios.get(`${API_URL}/edr/telemetry`, { headers: getHeaders(), params })).data,
  getDetections: async () => (await axios.get(`${API_URL}/edr/detections`, { headers: getHeaders() })).data,
  triggerResponse: async (data) => (await axios.post(`${API_URL}/edr/response`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/edr/metrics`, { headers: getHeaders() })).data,
};

export const dataSecurityService = {
  getAssets: async () => (await axios.get(`${API_URL}/data-security/assets`, { headers: getHeaders() })).data,
  createAsset: async (data) => (await axios.post(`${API_URL}/data-security/assets`, data, { headers: getHeaders() })).data,
  triggerScan: async () => (await axios.post(`${API_URL}/data-security/scan`, {}, { headers: getHeaders() })).data,
  getPolicies: async () => (await axios.get(`${API_URL}/data-security/policies`, { headers: getHeaders() })).data,
  createPolicy: async (data) => (await axios.post(`${API_URL}/data-security/policies`, data, { headers: getHeaders() })).data,
  getViolations: async () => (await axios.get(`${API_URL}/data-security/violations`, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/data-security/metrics`, { headers: getHeaders() })).data,
};

export const dataLakeService = {
  getEvents: async (params) => (await axios.get(`${API_URL}/data-lake/events`, { headers: getHeaders(), params })).data,
  searchEvents: async (query) => (await axios.get(`${API_URL}/data-lake/search?q=${encodeURIComponent(query)}`, { headers: getHeaders() })).data,
  getAggregations: async (timeRange = '24h') => (await axios.get(`${API_URL}/data-lake/aggregations?time_range=${timeRange}`, { headers: getHeaders() })).data,
  exportEvents: async (data) => (await axios.post(`${API_URL}/data-lake/export`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/data-lake/metrics`, { headers: getHeaders() })).data,
};

export const soarService = {
  getPlaybooks: async () => (await axios.get(`${API_URL}/soar/playbooks`, { headers: getHeaders() })).data,
  createPlaybook: async (data) => (await axios.post(`${API_URL}/soar/playbooks`, data, { headers: getHeaders() })).data,
  executePlaybook: async (id) => (await axios.post(`${API_URL}/soar/playbooks/${id}/execute`, {}, { headers: getHeaders() })).data,
  getCases: async () => (await axios.get(`${API_URL}/soar/cases`, { headers: getHeaders() })).data,
  createCase: async (data) => (await axios.post(`${API_URL}/soar/cases`, data, { headers: getHeaders() })).data,
  getConnectors: async () => (await axios.get(`${API_URL}/soar/connectors`, { headers: getHeaders() })).data,
  createConnector: async (data) => (await axios.post(`${API_URL}/soar/connectors`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/soar/metrics`, { headers: getHeaders() })).data,
};

export const threatIntelService = {
  getIOCs: async (params) => (await axios.get(`${API_URL}/threat-intel/iocs`, { headers: getHeaders(), params })).data,
  submitIOC: async (data) => (await axios.post(`${API_URL}/threat-intel/iocs`, data, { headers: getHeaders() })).data,
  getIOC: async (id) => (await axios.get(`${API_URL}/threat-intel/iocs/${id}`, { headers: getHeaders() })).data,
  scanIOC: async (data) => (await axios.post(`${API_URL}/threat-intel/scan`, data, { headers: getHeaders() })).data,
  getFeeds: async () => (await axios.get(`${API_URL}/threat-intel/feeds`, { headers: getHeaders() })).data,
  createFeed: async (data) => (await axios.post(`${API_URL}/threat-intel/feeds`, data, { headers: getHeaders() })).data,
  getTTPs: async () => (await axios.get(`${API_URL}/threat-intel/ttps`, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/threat-intel/metrics`, { headers: getHeaders() })).data,
};

export const xdrService = {
  getAlerts: async () => (await axios.get(`${API_URL}/xdr/alerts`, { headers: getHeaders() })).data,
  getAlert: async (id) => (await axios.get(`${API_URL}/xdr/alerts/${id}`, { headers: getHeaders() })).data,
  respondToAlert: async (id, data) => (await axios.post(`${API_URL}/xdr/alerts/${id}/respond`, data, { headers: getHeaders() })).data,
  getIncidents: async () => (await axios.get(`${API_URL}/xdr/incidents`, { headers: getHeaders() })).data,
  startHunt: async (data) => (await axios.post(`${API_URL}/xdr/hunt`, data, { headers: getHeaders() })).data,
  getHuntResult: async (id) => (await axios.get(`${API_URL}/xdr/hunt/${id}`, { headers: getHeaders() })).data,
  getCorrelations: async () => (await axios.get(`${API_URL}/xdr/correlations`, { headers: getHeaders() })).data,
  createCorrelation: async (data) => (await axios.post(`${API_URL}/xdr/correlations`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/xdr/metrics`, { headers: getHeaders() })).data,
};

export const devsecopsService = {
  getPipelines: async () => (await axios.get(`${API_URL}/devsecops/pipelines`, { headers: getHeaders() })).data,
  registerPipeline: async (data) => (await axios.post(`${API_URL}/devsecops/pipelines`, data, { headers: getHeaders() })).data,
  getScans: async (params) => (await axios.get(`${API_URL}/devsecops/scans`, { headers: getHeaders(), params })).data,
  triggerScan: async (data) => (await axios.post(`${API_URL}/devsecops/scans`, data, { headers: getHeaders() })).data,
  getPolicies: async () => (await axios.get(`${API_URL}/devsecops/policies`, { headers: getHeaders() })).data,
  createPolicy: async (data) => (await axios.post(`${API_URL}/devsecops/policies`, data, { headers: getHeaders() })).data,
  getGates: async (deploymentId) => (await axios.get(`${API_URL}/devsecops/gates?deployment_id=${deploymentId}`, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/devsecops/metrics`, { headers: getHeaders() })).data,
};

export const deceptionService = {
  getHoneypots: async () => (await axios.get(`${API_URL}/deception/honeypots`, { headers: getHeaders() })).data,
  deployHoneypot: async (data) => (await axios.post(`${API_URL}/deception/honeypots`, data, { headers: getHeaders() })).data,
  getAttacks: async () => (await axios.get(`${API_URL}/deception/attacks`, { headers: getHeaders() })).data,
  getHoneytokens: async () => (await axios.get(`${API_URL}/deception/honeytokens`, { headers: getHeaders() })).data,
  generateHoneytoken: async (data) => (await axios.post(`${API_URL}/deception/honeytokens`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/deception/metrics`, { headers: getHeaders() })).data,
};

export const passwordManagerService = {
  getVault: async () => (await axios.get(`${API_URL}/password-manager/vault`, { headers: getHeaders() })).data,
  addEntry: async (data) => (await axios.post(`${API_URL}/password-manager/vault`, data, { headers: getHeaders() })).data,
  getEntry: async (id) => (await axios.get(`${API_URL}/password-manager/vault/${id}`, { headers: getHeaders() })).data,
  generatePassword: async (data) => (await axios.post(`${API_URL}/password-manager/generate`, data, { headers: getHeaders() })).data,
  sharePassword: async (data) => (await axios.post(`${API_URL}/password-manager/share`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/password-manager/metrics`, { headers: getHeaders() })).data,
};

export const iamService = {
  getUsers: async () => (await axios.get(`${API_URL}/iam/users`, { headers: getHeaders() })).data,
  createUser: async (data) => (await axios.post(`${API_URL}/iam/users`, data, { headers: getHeaders() })).data,
};

export const bcpService = {
  getProcesses: async () => (await axios.get(`${API_URL}/bcp/processes`, { headers: getHeaders() })).data,
  createProcess: async (data) => (await axios.post(`${API_URL}/bcp/processes`, data, { headers: getHeaders() })).data,
  getPlans: async () => (await axios.get(`${API_URL}/bcp/plans`, { headers: getHeaders() })).data,
  createPlan: async (data) => (await axios.post(`${API_URL}/bcp/plans`, data, { headers: getHeaders() })).data,
  activatePlan: async (id) => (await axios.post(`${API_URL}/bcp/plans/${id}/activate`, {}, { headers: getHeaders() })).data,
  getTests: async () => (await axios.get(`${API_URL}/bcp/tests`, { headers: getHeaders() })).data,
  createTest: async (data) => (await axios.post(`${API_URL}/bcp/tests`, data, { headers: getHeaders() })).data,
  getMetrics: async () => (await axios.get(`${API_URL}/bcp/metrics`, { headers: getHeaders() })).data,
};

export const riskEngineService = {
  score: async (data) => (await axios.post(`${API_URL}/risk/score`, data)).data,
  batchScore: async (data) => (await axios.post(`${API_URL}/risk/batch`, data)).data,
  humanRisk: async (userId) => (await axios.get(`${API_URL}/risk/human/${userId}`)).data,
};

export const adminService = {
  getUsers: async () => (await axios.get(`${API_URL}/iam/users`, { headers: getHeaders() })).data,
  createUser: async (data) => (await axios.post(`${API_URL}/iam/users`, data, { headers: getHeaders() })).data,
  updateUser: async (id, data) => (await axios.put(`${API_URL}/iam/users/${id}`, data, { headers: getHeaders() })).data,
  deleteUser: async (id) => (await axios.delete(`${API_URL}/iam/users/${id}`, { headers: getHeaders() })).data,
  updateUserRoles: async (id, roles) => (await axios.put(`${API_URL}/iam/users/${id}/roles`, { roles }, { headers: getHeaders() })).data,
  getRoles: async () => (await axios.get(`${API_URL}/iam/roles`, { headers: getHeaders() })).data,
  createRole: async (data) => (await axios.post(`${API_URL}/iam/roles`, data, { headers: getHeaders() })).data,
  updateRole: async (id, data) => (await axios.put(`${API_URL}/iam/roles/${id}`, data, { headers: getHeaders() })).data,
  deleteRole: async (id) => (await axios.delete(`${API_URL}/iam/roles/${id}`, { headers: getHeaders() })).data,
  getAuditLogs: async (limit = 50, offset = 0) => (await axios.get(`${API_URL}/iam/audit/logs?limit=${limit}&offset=${offset}`, { headers: getHeaders() })).data,
  getTenants: async () => (await axios.get(`${API_URL}/tenants`, { headers: getHeaders() })).data,
  updateTenant: async (id, data) => (await axios.put(`${API_URL}/tenants/${id}`, data, { headers: getHeaders() })).data,
  getDepartments: async () => (await axios.get(`${API_URL}/iam/departments`, { headers: getHeaders() })).data,
  createDepartment: async (data) => (await axios.post(`${API_URL}/iam/departments`, data, { headers: getHeaders() })).data,
  updateDepartment: async (id, data) => (await axios.put(`${API_URL}/iam/departments/${id}`, data, { headers: getHeaders() })).data,
  deleteDepartment: async (id) => (await axios.delete(`${API_URL}/iam/departments/${id}`, { headers: getHeaders() })).data,
  getUserDepartments: async (userId) => (await axios.get(`${API_URL}/iam/users/${userId}/departments`, { headers: getHeaders() })).data,
  assignUserDepartments: async (userId, departmentIds) => (await axios.put(`${API_URL}/iam/users/${userId}/departments`, { department_ids: departmentIds }, { headers: getHeaders() })).data,
};

export const adminUsersService = {
  getPlatformUsers: async () => (await axios.get(`${API_URL}/admin/users`, { headers: getHeaders() })).data,
  createPlatformUser: async (data) => (await axios.post(`${API_URL}/admin/users`, data, { headers: getHeaders() })).data,
  updatePlatformUser: async (id, data) => (await axios.put(`${API_URL}/admin/users/${id}`, data, { headers: getHeaders() })).data,
  deletePlatformUser: async (id) => (await axios.delete(`${API_URL}/admin/users/${id}`, { headers: getHeaders() })).data,
  togglePlatformUserStatus: async (id, active) => (await axios.put(`${API_URL}/admin/users/${id}/status`, { active }, { headers: getHeaders() })).data,
  resetPassword: async (id, password) => (await axios.put(`${API_URL}/admin/users/${id}/reset-password`, { password }, { headers: getHeaders() })).data,
};

export const subscriptionService = {
  getSubscriptions: async (tenantId) => (await axios.get(`${API_URL}/tenants/${tenantId}/subscriptions`, { headers: getHeaders() })).data,
  updateSubscriptions: async (tenantId, services) => (await axios.put(`${API_URL}/tenants/${tenantId}/subscriptions`, { services }, { headers: getHeaders() })).data,
  bulkAssignServices: async (tenantIds, services) => (await axios.post(`${API_URL}/admin/bulk/assign-services`, { tenantIds, services }, { headers: getHeaders() })).data,
};
