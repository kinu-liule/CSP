const fs = require('fs');
const path = require('path');

const DASHBOARDS = [
  { file: 'waf/WAFDashboard.js', importDepth: '../../utils/auth' },
  { file: 'waf/WAFCashboard.js', importDepth: '../../utils/auth' },
  { file: 'ngfw/NGFWDashboard.js', importDepth: '../../utils/auth' },
  { file: 'siem-soar/SIEMSOARDashboard.js', importDepth: '../../utils/auth' },
  { file: 'vuln-scanner/VulnScannerDashboard.js', importDepth: '../../utils/auth' },
  { file: 'fraud/FraudDashboard.js', importDepth: '../../utils/auth' },
  { file: 'awareness/AwarenessDashboard.js', importDepth: '../../utils/auth' },
  { file: 'grc/GRCDashboard.js', importDepth: '../../utils/auth' },
  { file: 'asset-management/AssetMgmtDashboard.js', importDepth: '../../utils/auth' },
  { file: 'cspm/CSPMDashboard.js', importDepth: '../../utils/auth' },
  { file: 'edr/EDRDashboard.js', importDepth: '../../utils/auth' },
  { file: 'threat-intel/ThreatIntelDashboard.js', importDepth: '../../utils/auth' },
  { file: 'soar/SOARDashboard.js', importDepth: '../../utils/auth' },
  { file: 'data-security/DataSecurityDashboard.js', importDepth: '../../utils/auth' },
  { file: 'data-lake/DataLakeDashboard.js', importDepth: '../../utils/auth' },
  { file: 'xdr/XDRDashboard.js', importDepth: '../../utils/auth' },
  { file: 'devsecops/DevSecOpsDashboard.js', importDepth: '../../utils/auth' },
  { file: 'deception/DeceptionDashboard.js', importDepth: '../../utils/auth' },
  { file: 'password-manager/PasswordMgrDashboard.js', importDepth: '../../utils/auth' },
  { file: 'business-continuity/BusinessContDashboard.js', importDepth: '../../utils/auth' },
  { file: 'risk-engine/RiskEngineDashboard.js', importDepth: '../../utils/auth' },
];

const BASE = path.resolve(__dirname, '..', 'frontend', 'src', 'pages');

function wrapButton(content, pattern, wrapper) {
  let match;
  const regex = new RegExp(pattern, 'gi');
  const results = [];
  while ((match = regex.exec(content)) !== null) {
    results.push({ index: match.index, length: match[0].length, text: match[0] });
  }
  // Process in reverse to maintain indices
  results.reverse();
  for (const r of results) {
    const wrapped = wrapper(r.text);
    content = content.slice(0, r.index) + wrapped + content.slice(r.index + r.length);
  }
  return content;
}

for (const dash of DASHBOARDS) {
  const fullPath = path.join(BASE, dash.file.replace('/', '\\'));
  if (!fs.existsSync(fullPath)) {
    console.log(`  NOT FOUND: ${dash.file}`);
    continue;
  }
  let content = fs.readFileSync(fullPath, 'utf8');

  const hasImport = content.includes('canWrite');
  if (!hasImport) {
    content = content.replace(
      /(import .+ from '[^']+';[\s\S]*?)(const\s+\w+\s*=\s*\(\s*\)\s*=>|function\s+\w+\s*\(|\bexport default\b)/,
      (match, imports, funcStart) => {
        return imports + `import { canWrite } from '${dash.importDepth}';\n` + funcStart;
      }
    );
  }

  if (!content.includes('writeAllowed')) {
    content = content.replace(
      /(function\s+\w+\s*\([^)]*\)\s*\{)/,
      (match) => match + '\n  const writeAllowed = canWrite();'
    );
    content = content.replace(
      /(const\s+\w+\s*=\s*\(\s*\)\s*=>\s*\{)/,
      (match) => match + '\n  const writeAllowed = canWrite();'
    );
  }

  // Wrap Add/Create buttons that open modals — match any Button containing Add or Create
  content = wrapButton(content, '<Button[^>]*onClick=\\{[^}]*\\}[^>]*>(Add|Create)[^<]*<\\/Button>', (match) => {
    if (match.trim().startsWith('{writeAllowed')) return match;
    return `{writeAllowed && (${match})}`;
  });

  // Wrap Delete buttons (variant=danger that say Delete)
  content = wrapButton(content, '<Button[^>]*variant="danger"[^>]*>[^<]*Delete[^<]*<\\/Button>', (match) => {
    if (match.trim().startsWith('{writeAllowed')) return match;
    return `{writeAllowed && (${match})}`;
  });

  // Wrap generic "Delete" buttons without variant
  content = wrapButton(content, '<Button[^>]*onClick=\\{[^}]*delete|remove[^}]*\\}[^>]*>[^<]*<\\/Button>', (match) => {
    if (match.trim().startsWith('{writeAllowed')) return match;
    return `{writeAllowed && (${match})}`;
  });

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`  PATCHED: ${dash.file}`);
}

console.log('\nDone v2 patching.');
