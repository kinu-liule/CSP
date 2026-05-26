const fs = require('fs');
const path = require('path');

const fp = path.resolve('C:/Users/Arbaj Khan LLC/Documents/all-in-on CS Solution/cybersec-platform', 'awareness-platform', 'server.js');
let content = fs.readFileSync(fp, 'utf8');
let modified = false;

newContent = content.replace(
  /(pool\.query\s*\()\s*\n?\s*'(INSERT\s+INTO[\s\S]*?)'\s*,(\s*\n?\s*\[[\s\S]*?\])\s*\n?\s*\);/gi,
  (match, prefix, sql, after) => {
    if (sql.includes('department_id')) return match;

    let newSql = sql.replace(
      /(INSERT\s+INTO\s+\w+\s*\()([^)]*)(\))/i,
      (m, pre, cols, post) => {
        return pre + cols.replace(/\s+$/, '') + ', department_id' + post;
      }
    );

    newSql = newSql.replace(
      /(VALUES\s*\()([^)]*)(\))/i,
      (m, pre, vals, post) => {
        const phs = vals.match(/\$\d+/g);
        if (!phs) return m;
        const maxPh = Math.max(...phs.map(p => parseInt(p.slice(1))));
        return pre + vals.replace(/\s+$/, '') + `, $${maxPh + 1}` + post;
      }
    );

    if (newSql === sql) return match;
    modified = true;

    let newAfter = after;
    const arrEnd = newAfter.lastIndexOf(']');
    if (arrEnd > -1 && !newAfter.includes('deptId')) {
      const beforeEnd = newAfter.slice(0, arrEnd);
      const afterEnd = newAfter.slice(arrEnd);
      newAfter = beforeEnd.replace(/\s+$/, '') + ', req.deptId' + afterEnd;
    }

    return `${prefix}\n  '${newSql}',${newAfter}\n  );`;
  }
);

if (modified) {
  fs.writeFileSync(fp, newContent, 'utf8');
  console.log('PATCHED: awareness-platform/server.js');
} else {
  console.log('No changes needed for awareness-platform');
}
