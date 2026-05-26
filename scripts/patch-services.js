const fs = require('fs');
const path = require('path');

const SERVICES = [
  { dir: 'waf-service', file: 'server.js', table: 'waf_rules', alias: 'r', globalMiddlware: true },
  { dir: 'ngfw-service', file: 'server.js', table: 'firewall_rules', alias: 'r', globalMiddlware: true },
  { dir: 'siem-soar-service', file: 'server.js', table: 'events', alias: 'e', globalMiddlware: true },
  { dir: 'vuln-scanner-service', file: 'server.js', table: 'assets', alias: 'a', globalMiddlware: true },
  { dir: 'fraud-detection-service', file: 'server.js', table: 'transactions', alias: 't', globalMiddlware: true },
  { dir: 'grc-service', file: 'server.js', table: 'policies', alias: 'p', globalMiddlware: true },
  { dir: 'awareness-platform', file: 'server.js', table: 'campaigns', alias: 'c', globalMiddlware: true },
  { dir: 'cspm-service', file: 'server.js', table: 'cspm_accounts', alias: 'ca', globalMiddlware: false },
  { dir: 'edr-service', file: 'server.js', table: 'edr_agents', alias: 'ea', globalMiddlware: false },
  { dir: 'threat-intel-service', file: 'server.js', table: 'threat_iocs', alias: 'ti', globalMiddlware: false },
  { dir: 'soar-service', file: 'server.js', table: 'soar_playbooks', alias: 'sp', globalMiddlware: false },
  { dir: 'data-security-service', file: 'server.js', table: 'data_assets', alias: 'da', globalMiddlware: false },
  { dir: 'security-data-lake-service', file: 'server.js', table: 'security_events', alias: 'se', globalMiddlware: false },
  { dir: 'xdr-service', file: 'server.js', table: 'xdr_alerts', alias: 'xa', globalMiddlware: false },
  { dir: 'devsecops-service', file: 'server.js', table: 'devsecops_pipelines', alias: 'dp', globalMiddlware: false },
  { dir: 'deception-service', file: 'server.js', table: 'deception_honeypots', alias: 'dh', globalMiddlware: false },
  { dir: 'password-manager-service', file: 'server.js', table: 'password_vaults', alias: 'pv', globalMiddlware: false },
  { dir: 'business-continuity-service', file: 'server.js', table: 'bc_plans', alias: 'bp', globalMiddlware: false },
];

const BASE = path.resolve(__dirname, '..');

function patchFile(servicePath, table, alias, useGlobal) {
  const fullPath = path.join(BASE, servicePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Skip if already patched
  if (content.includes('DepartmentScope')) {
    console.log(`  SKIP (already patched): ${servicePath}`);
    return;
  }

  // 1. Add require statement after the last require
  const requireLines = content.match(/^const .+ = require\(.+\);$/gm);
  if (requireLines) {
    const lastRequire = requireLines[requireLines.length - 1];
    const importLine = `const { DepartmentScope } = require('../common/department-scope');`;
    content = content.replace(lastRequire, lastRequire + '\n' + importLine);
    modified = true;
  }

  // 2. For simple services (global middleware pattern), add DepartmentScope.middleware() after app.use(express.json())
  if (useGlobal) {
    content = content.replace(
      "app.use(express.json());",
      "app.use(express.json());\napp.use(DepartmentScope.middleware());"
    );
    modified = true;
  }

  // 3. For JWT-based services (not global), add requireTenant + DepartmentScope.requireAccess after authenticateToken
  // The pattern is to find each route handler and add department scope

  // Replace common list GET patterns - single table queries
  content = content.replace(
    new RegExp(`(app\\.get\\('[^']+',\\s*)(requireTenant|authenticateToken)(,\\s*async\\s*\\(req,\\s*res\\))`),
    (match, prefix, auth, suffix) => {
      return `${prefix}${auth}, requireTenant, DepartmentScope.requireAccess('${alias}')${suffix}`;
    }
  );

  // Replace POST/PUT/DELETE that have requireTenant or authenticateToken
  content = content.replace(
    new RegExp(`(app\\.(?:post|put|delete)\\('[^']+',\\s*)(requireTenant|authenticateToken)(,\\s*async\\s*\\(req,\\s*res\\))`),
    (match, prefix, auth, suffix) => {
      return `${prefix}${auth}, requireTenant, DepartmentScope.requireAccess('${alias}')${suffix}`;
    }
  );

  // 4. Add department_id to INSERT queries
  content = content.replace(
    /(INSERT INTO\s+\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)\s*RETURNING/gi,
    (match, insertInto, columns, values) => {
      const cols = columns.split(',').map(c => c.trim());
      const vals = values.split(',').map(v => v.trim());

      // Only add department_id if it's not already there and has tenant_id
      if (!cols.includes('department_id') && cols.includes('tenant_id')) {
        const newCols = [...cols, 'department_id'];
        const newVals = [...vals, 'req.body.department_id || null'];
        return `${insertInto} (${newCols.join(', ')})\n       VALUES (${newVals.join(', ')})\n       RETURNING`;
      }
      return match;
    }
  );

  // 5. Add requireTenant middleware function if missing (for JWT-based services)
  if (!useGlobal && !content.includes('function requireTenant')) {
    const requireTenantFn = `
// Tenant middleware
const requireTenant = (req, res, next) => {
  const tenantId = req.headers['x-tenant-id'] || req.user?.tenant_id;
  if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
  req.tenantId = tenantId;
  next();
};
`;
    // Insert after authenticateToken function definition
    content = content.replace(
      /(function authenticateToken[\s\S]*?\n})/,
      (match) => match + '\n' + requireTenantFn
    );
    modified = true;
  }

  // 6. Fix duplicate requireTenant in route patterns - remove duplicate
  content = content.replace(
    /requireTenant,\s*requireTenant/g,
    'requireTenant'
  );

  if (modified) {
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`  PATCHED: ${servicePath}`);
  } else {
    console.log(`  NO CHANGES: ${servicePath}`);
  }
}

console.log('Patching services with DepartmentScope...\n');
for (const svc of SERVICES) {
  const servicePath = path.join(svc.dir, svc.file);
  // Check if file exists
  const fullPath = path.join(BASE, servicePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`  NOT FOUND: ${servicePath}`);
    continue;
  }
  try {
    patchFile(servicePath, svc.table, svc.alias, svc.globalMiddlware);
  } catch (err) {
    console.log(`  ERROR: ${servicePath}: ${err.message}`);
  }
}

console.log('\nDone patching services.');
