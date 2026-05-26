const fs = require('fs');
const path = require('path');

const SERVICES = [
  'waf-service',
  'ngfw-service',
  'siem-soar-service',
  'vuln-scanner-service',
  'fraud-detection-service',
  'grc-service',
  'awareness-platform',
  'asset-management-service',
  'cspm-service',
  'edr-service',
  'threat-intel-service',
  'soar-service',
  'data-security-service',
  'security-data-lake-service',
  'xdr-service',
  'devsecops-service',
  'deception-service',
  'password-manager-service',
  'business-continuity-service',
];

const BASE = path.resolve(__dirname, '..');

for (const dir of SERVICES) {
  const fullPath = path.join(BASE, dir, 'server.js');
  if (!fs.existsSync(fullPath)) continue;
  let content = fs.readFileSync(fullPath, 'utf8');

  // Fix 1: Remove the broken INSERT department_id column + value
  content = content.replace(
    /department_id,\n?\s*\n?/g,
    ''
  );
  content = content.replace(
    /,\s*req\.body\.department_id \|\| (deptId|null)/g,
    ''
  );
  content = content.replace(
    /,\s*deptId/g,
    ''
  );

  // Fix 2: Remove any broken deptId variable declarations
  content = content.replace(
    /  const deptId = req\.departmentScope\?\.departmentIds\?\.\[0\] \|\| req\.body\.department_id \|\| null;\n/g,
    ''
  );

  // Fix 3: Clean up empty department_id columns
  content = content.replace(
    /,\s*department_id\s*\)/g,
    ')'
  );
  content = content.replace(
    /department_id,\s+/g,
    ''
  );

  fs.writeFileSync(fullPath, content, 'utf8');
  console.log(`  FIXED: ${dir}/server.js`);
}

console.log('\nInsert fixes applied.');
