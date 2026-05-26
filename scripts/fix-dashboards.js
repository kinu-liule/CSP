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

function extractDeleteFnName(text) {
  const match = text.match(/delete(\w+)\(/);
  return match ? match[1] : null;
}

for (const dash of DASHBOARDS) {
  const fullPath = path.join(BASE, dash.replace('/', '\\'));
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Fix 1: Remove double wrapping: {writeAllowed && ({writeAllowed && (...)})
  // Replace with single wrap
  const doubleWrapRegex = /\{writeAllowed\s*&&\s*\(\{writeAllowed\s*&&\s*\(([^)]*)\)\}\}/g;
  content = content.replace(doubleWrapRegex, (match, inner) => {
    modified = true;
    return `{writeAllowed && (${inner})}`;
  });

  // Fix 2: Remove extra closing brace from broken delete handlers
  // Pattern: onClick={() => delete)}FunctionName(id)}>Delete</Button>)}
  // Should be: onClick={() => deleteFunctionName(id)}>Delete</Button>)}
  content = content.replace(
    /onClick=\{\(\) => delete\}\)(\w+)\(/g,
    (match, fnSuffix) => {
      modified = true;
      return `onClick={() => delete${fnSuffix}(`;
    }
  );

  // Fix 3: Fix broken inline async delete handlers
  content = content.replace(
    /onClick=\{async \(\) => \{ await axios\.delete\}\)\(/g,
    (match) => {
      modified = true;
      return `onClick={async () => { await axios.delete(`;
    }
  );

  // Fix 4: Any remaining })} that's clearly broken - remove extra }
  content = content.replace(
    /delete\)\}/g,
    (match) => {
      modified = true;
      return `delete}`;
    }
  );

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`  FIXED: ${dash}`);
  }
}

console.log('\nDone fixing dashboards.');
