const fs = require('fs');
const path = require('path');

const SERVICES = [
  { dir: 'waf-service', file: 'server.js', alias: 'r' },
  { dir: 'ngfw-service', file: 'server.js', alias: 'r' },
  { dir: 'siem-soar-service', file: 'server.js', alias: 'e' },
  { dir: 'vuln-scanner-service', file: 'server.js', alias: 'v' },
  { dir: 'fraud-detection-service', file: 'server.js', alias: 't' },
  { dir: 'grc-service', file: 'server.js', alias: 'p' },
  { dir: 'awareness-platform', file: 'server.js', alias: 'c' },
];

const BASE = path.resolve(__dirname, '..');

for (const svc of SERVICES) {
  const fullPath = path.join(BASE, svc.dir, svc.file);
  let content = fs.readFileSync(fullPath, 'utf8');
  let modified = false;

  // Replace ALL route handlers: app.get/post/put/delete('/path', requireTenant, async...
  // Add DepartmentScope.requireAccess after requireTenant on all routes
  const routeRegex = /(app\.(?:get|post|put|delete)\('[^']+',\s*)(requireTenant)(,\s*async\s*\()/g;
  const newContent = content.replace(routeRegex, (match, prefix, auth, suffix) => {
    if (match.includes('DepartmentScope')) return match; // skip if already has it
    modified = true;
    return `${prefix}${auth}, DepartmentScope.requireAccess('${svc.alias}')${suffix}`;
  });

  if (modified) {
    // Also fix the INSERT issue - replace literal string with actual value
    let fixed = newContent.replace(
      /req\.body\.department_id \|\| null/g,
      'req.body.department_id || deptId'
    );
    // Also add deptId variable to POST handlers if not present
    fixed = fixed.replace(
      /(app\.post\([^)]+,\s*requireTenant,\s*DepartmentScope\.requireAccess\([^)]+\),\s*async\s*\(req,\s*res\)\s*\{[\s\S]*?const\s*\{)/g,
      (match) => {
        if (match.includes('deptId')) return match;
        const deptLine = `  const deptId = req.departmentScope?.departmentIds?.[0] || req.body.department_id || null;\n`;
        return match.replace(/\{/, '{' + deptLine);
      }
    );
    fs.writeFileSync(fullPath, fixed, 'utf8');
    console.log(`  FIXED: ${svc.dir}/${svc.file}`);
  } else {
    console.log(`  SKIP (no changes): ${svc.dir}/${svc.file}`);
  }
}

console.log('\nDone fixing services.');
