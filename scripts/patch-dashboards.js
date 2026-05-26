const fs = require('fs');
const path = require('path');

const DASHBOARDS = [
  'iam/IAMDashboard.js',
  'waf/WAFDashboard.js',
  'waf/WAFCashboard.js',
  'ngfw/NGFWDashboard.js',
  'siem-soar/SIEMSOARDashboard.js',
  'vuln-scanner/VulnScannerDashboard.js',
  'fraud/FraudDashboard.js',
  'awareness/AwarenessDashboard.js',
  'grc/GRCDashboard.js',
  'asset-management/AssetMgmtDashboard.js',
  'cspm/CSPMDashboard.js',
  'edr/EDRDashboard.js',
  'threat-intel/ThreatIntelDashboard.js',
  'soar/SOARDashboard.js',
  'data-security/DataSecurityDashboard.js',
  'data-lake/DataLakeDashboard.js',
  'xdr/XDRDashboard.js',
  'devsecops/DevSecOpsDashboard.js',
  'deception/DeceptionDashboard.js',
  'password-manager/PasswordMgrDashboard.js',
  'business-continuity/BusinessContDashboard.js',
  'risk-engine/RiskEngineDashboard.js',
];

const BASE = path.resolve(__dirname, '..', 'frontend', 'src', 'pages');
const IMPORTS = {
  'iam/IAMDashboard.js': '../../utils/auth',
  'waf/WAFDashboard.js': '../../utils/auth',
  'waf/WAFCashboard.js': '../../utils/auth',
  'ngfw/NGFWDashboard.js': '../../utils/auth',
  'siem-soar/SIEMSOARDashboard.js': '../../utils/auth',
  'vuln-scanner/VulnScannerDashboard.js': '../../utils/auth',
  'fraud/FraudDashboard.js': '../../utils/auth',
  'awareness/AwarenessDashboard.js': '../../utils/auth',
  'grc/GRCDashboard.js': '../../utils/auth',
  'asset-management/AssetMgmtDashboard.js': '../../utils/auth',
  'cspm/CSPMDashboard.js': '../../utils/auth',
  'edr/EDRDashboard.js': '../../utils/auth',
  'threat-intel/ThreatIntelDashboard.js': '../../utils/auth',
  'soar/SOARDashboard.js': '../../utils/auth',
  'data-security/DataSecurityDashboard.js': '../../utils/auth',
  'data-lake/DataLakeDashboard.js': '../../utils/auth',
  'xdr/XDRDashboard.js': '../../utils/auth',
  'devsecops/DevSecOpsDashboard.js': '../../utils/auth',
  'deception/DeceptionDashboard.js': '../../utils/auth',
  'password-manager/PasswordMgrDashboard.js': '../../utils/auth',
  'business-continuity/BusinessContDashboard.js': '../../utils/auth',
  'risk-engine/RiskEngineDashboard.js': '../../utils/auth',
};

for (const dash of DASHBOARDS) {
  const fullPath = path.join(BASE, dash.replace('/', '\\'));
  if (!fs.existsSync(fullPath)) {
    console.log(`  NOT FOUND: ${dash}`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');

  // Skip if already patched
  if (content.includes('canWrite')) {
    console.log(`  SKIP (already patched): ${dash}`);
    continue;
  }

  // 1. Add import
  const importPath = IMPORTS[dash];
  content = content.replace(
    /(import .+ from '[^']+';[\s\S]*?)(const\s+\w+\s*=\s*\(\s*\)\s*=>|function\s+\w+\s*\(|\bexport default\b)/,
    (match, imports, funcStart) => {
      return imports + `import { canWrite } from '${importPath}';\n` + funcStart;
    }
  );

  // 2. Add writeAllowed variable after the component function declaration
  content = content.replace(
    /(function\s+\w+\s*\([^)]*\)\s*\{)/,
    (match) => match + '\n  const writeAllowed = canWrite();'
  );
  content = content.replace(
    /(const\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{)/,
    (match) => match + '\n  const writeAllowed = canWrite();'
  );

  // 3. Wrap "Add" and "Create" buttons with conditional
  content = content.replace(
    /(<Button\s[^>]*)(onClick=\{\(\)\s*=>\s*\{?\s*set\w+Modal\s*\(\s*true\s*\)\s*;?\s*\}?\s*\}\s*>)(\s*(?:Add|Create)\s*<\/Button>)/gi,
    (match, prefix, onClick, text) => {
      return `{writeAllowed && (${prefix}${onClick}${text})}`;
    }
  );

  // 4. Wrap Delete buttons with conditional
  content = content.replace(
    /(variant="danger"[^>]*>Delete\s*<\/Button>)/gi,
    (match) => `{writeAllowed && (${match})}`
  );

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`  PATCHED: ${dash}`);
}

console.log('\nDone patching dashboards.');
