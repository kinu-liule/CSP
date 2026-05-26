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

for (const dash of DASHBOARDS) {
  const fullPath = path.join(BASE, dash.replace('/', '\\'));
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Fix double-wrapped delete buttons with named function
  // Pattern: {writeAllowed && ({writeAllowed && (<Button ... onClick={() => delete}FnName(id)}>Delete</Button>)}
  // Target:  {writeAllowed && (<Button ... onClick={() => deleteFnName(id)}>Delete</Button>)}
  content = content.replace(
    /\{writeAllowed\s*&&\s*\(\{writeAllowed\s*&&\s*(<Button[^>]*onClick=\{\(\)\s*=>\s*delete\})(\w+)\(([^)]*)\)\}[^}]*\}[^}]*\}/g,
    (match, beforeBtn, fnSuffix, fnArgs) => {
      modified = true;
      const deleteCall = `delete${fnSuffix}(${fnArgs})`;
      const btnWithDelete = beforeBtn.replace(/onClick=\{\(\)\s*=>\s*delete\}$/, `onClick={() => ${deleteCall}`);
      return `{writeAllowed && (${btnWithDelete}>Delete</Button>)}`;
    }
  );

  // Fix double-wrapped async axios.delete buttons (simpler pattern when above doesn't match)
  // Pattern: {writeAllowed && ({writeAllowed && (<Button ... onClick={async () => { await axios.delete}(`/api/...
  content = content.replace(
    /\{writeAllowed\s*&&\s*\(\{writeAllowed\s*&&\s*(<Button[^>]*onClick=\{async\s*\(\)\s*=>\s*\{\s*await\s+axios\.delete\})(\}\s*\()`/g,
    (match, beforeBtn) => {
      modified = true;
      return `{writeAllowed && (${beforeBtn}(\`/api`;
    }
  );

  // Fix remaining double-wrapped async axios.delete patterns (variation)
  content = content.replace(
    /\{writeAllowed\s*&&\s*\(\{writeAllowed\s*&&\s*(<Button[^>]*onClick=\{async\s*\(\)\s*=>\s*\{\s*await\s+axios\.delete\})\(\}/g,
    (match, beforeBtn) => {
      modified = true;
      return `{writeAllowed && (${beforeBtn}(`;
    }
  );

  // Fix any remaining })} that is broken (catch-all)
  content = content.replace(/delete\}\s*(\w+)\s*\(/g, (m, fnName) => {
    modified = true;
    return `delete${fnName}(`;
  });

  content = content.replace(/axios\.delete\}\s*\(/g, () => {
    modified = true;
    return `axios.delete(`;
  });

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`  FIXED: ${dash}`);
  }
}

console.log('\nDone fixing dashboards (v2).');
