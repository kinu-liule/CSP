const fs = require('fs');
const path = require('path');

const SERVICES = [
  'data-security-service',
  'business-continuity-service',
  'fraud-detection-service',
  'siem-soar-service',
  'ngfw-service',
  'devsecops-service',
  'deception-service',
  'edr-service',
  'cspm-service',
  'xdr-service',
  'threat-intel-service',
  'soar-service',
  'security-data-lake-service',
  'password-manager-service',
  'grc-service',
  'vuln-scanner-service',
  'waf-service',
  'awareness-platform',
];

const BASE = path.resolve(__dirname, '..');
let totalPatched = 0;

function addDeptIdToInsert(sql) {
  // Add department_id to column list
  let newSql = sql.replace(
    /(INSERT\s+INTO\s+\w+\s*\()([\s\S]*?)(\))/i,
    (m, pre, cols, post) => {
      if (cols.includes('department_id')) return m;
      return pre + cols.replace(/\s+$/, '') + ', department_id' + post;
    }
  );

  // Add placeholder to VALUES - look for VALUES (
  newSql = newSql.replace(
    /(VALUES\s*\()([\s\S]*?)(\))/i,
    (m, pre, vals, post) => {
      const phs = vals.match(/\$\d+/g);
      if (!phs) return m; // no $N placeholders, skip
      const maxPh = Math.max(...phs.map(p => parseInt(p.slice(1))));
      return pre + vals.replace(/\s+$/, '') + `, $${maxPh + 1}` + post;
    }
  );

  return newSql;
}

function hasInsert(sql) {
  return /INSERT\s+INTO/i.test(sql);
}

for (const dir of SERVICES) {
  const fp = path.join(BASE, dir, 'server.js');
  if (!fs.existsSync(fp)) {
    console.log(`  SKIP: ${dir}/server.js not found`);
    continue;
  }

  let content = fs.readFileSync(fp, 'utf8');
  const original = content;

  // Strategy: Find all pool.query(`INSERT... blocks
  // Replace the SQL template literal and corresponding values array

  // Step 1: Replace INSERT SQL in template literals
  content = content.replace(
    /(pool\.query\s*\(\s*\n?\s*)`(INSERT[\s\S]*?)`(\s*,)([\s\S]*?)(\s*\)\s*;)/gi,
    (match, queryPrefix, sql, comma, afterSql, closing) => {
      if (!hasInsert(sql)) return match;
      if (sql.includes('department_id')) return match;

      const newSql = addDeptIdToInsert(sql);
      if (newSql === sql) return match;

      // Now modify the array in afterSql
      let newAfterSql = afterSql;
      const arrMatch = afterSql.match(/(\s*)(\[[\s\S]*?\])(\s*)/);
      if (arrMatch) {
        let arrStr = arrMatch[2]; // the [...] array
        if (!arrStr.includes('deptId')) {
          // Add req.deptId before the closing ]
          arrStr = arrStr.replace(/\s*\]$/, ', req.deptId]');
          newAfterSql = arrMatch[1] + arrStr + arrMatch[3];
        }
      }

      totalPatched++;
      return `${queryPrefix}\`${newSql}\`${comma}${newAfterSql}${closing}`;
    }
  );

  if (content !== original) {
    fs.writeFileSync(fp, content, 'utf8');
    console.log(`  PATCHED: ${dir}/server.js`);
  }
}

console.log(`\nTotal INSERTs patched: ${totalPatched}`);
