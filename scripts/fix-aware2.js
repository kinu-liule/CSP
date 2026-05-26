const fs = require('fs');
const path = require('path');

const fp = path.resolve(__dirname, '..', 'awareness-platform', 'server.js');
let content = fs.readFileSync(fp, 'utf8');

let modified = false;
const lines = content.split('\n');
const result = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  
  const trimmed = line.trimStart();
  if (trimmed.startsWith("'INSERT INTO")) {
    const quoteIdx = line.indexOf("'");
    let sqlContent = '';
    let closingLineIdx = -1;
    let closingQuoteIdx = -1;
    let searchIdx = i;
    let foundClose = false;
    
    while (searchIdx < lines.length) {
      const searchLine = searchIdx === i ? line : lines[searchIdx];
      const startSearch = searchIdx === i ? quoteIdx + 1 : 0;
      const quotePos = searchLine.indexOf("'", startSearch);
      
      if (quotePos !== -1) {
        closingLineIdx = searchIdx;
        closingQuoteIdx = quotePos;
        
        if (searchIdx === i) {
          sqlContent = line.substring(quoteIdx + 1, quotePos);
        } else {
          let parts = [];
          parts.push(line.substring(quoteIdx + 1));
          for (let k = i + 1; k < searchIdx; k++) {
            parts.push(lines[k]);
          }
          parts.push(searchLine.substring(0, quotePos));
          sqlContent = parts.join('\n');
        }
        
        foundClose = true;
        break;
      }
      
      searchIdx++;
      if (searchIdx > i + 20) break;
    }
    
    if (foundClose && sqlContent.includes('INSERT INTO')) {
      modified = true;
      // Add department_id if not present
      if (!sqlContent.includes('department_id')) {
        sqlContent = sqlContent.replace(
          /(INSERT\s+INTO\s+\w+\s*\()([^)]*)(\))/i,
          (m, pre, cols, post) => pre + cols.replace(/\s+$/, '') + ', department_id' + post
        );
        sqlContent = sqlContent.replace(
          /(VALUES\s*\()([^)]*)(\))/i,
          (m, pre, vals, post) => {
            const phs = vals.match(/\$\d+/g);
            if (!phs) return m;
            const maxPh = Math.max(...phs.map(p => parseInt(p.slice(1))));
            return pre + vals.replace(/\s+$/, '') + `, $${maxPh + 1}` + post;
          }
        );
      }
      
      // Reconstruct with backtick
      const openingLine = line.substring(0, quoteIdx) + '`' + sqlContent;
      
      if (closingLineIdx === i) {
        result.push(openingLine + '`');
      } else {
        result.push(openingLine);
        for (let k = i + 1; k < closingLineIdx; k++) {
          result.push(lines[k]);
        }
        const closeLine = lines[closingLineIdx];
        const beforeQuote = closeLine.substring(0, closingQuoteIdx);
        const afterQuote = closeLine.substring(closingQuoteIdx + 1);
        result.push(beforeQuote + '`' + afterQuote);
      }
      
      i = closingLineIdx + 1;
      continue;
    }
  }
  
  result.push(line);
  i++;
}

if (modified) {
  // Also handle req.deptId in arrays - add if missing
  let finalContent = result.join('\n');
  // Find pool.query('INSERT...', [...]) where array doesn't have req.deptId
  finalContent = finalContent.replace(
    /(pool\.query\s*\(\s*`INSERT[^`]*`\s*,)(\s*\n?\s*\[[\s\S]*?\])\s*\n?\s*\);/gi,
    (match, prefix, arr) => {
      if (arr.includes('deptId') || arr.includes('req.deptId')) return match;
      // Add req.deptId to array
      const arrMatch = arr.match(/(\[[\s\S]*?)(\])/);
      if (arrMatch) {
        const arrContent = arrMatch[1];
        const arrClose = arrMatch[2];
        return prefix + arrContent.replace(/\s+$/, '') + ', req.deptId' + arrClose + '\n  );';
      }
      return match;
    }
  );
  
  fs.writeFileSync(fp, finalContent, 'utf8');
  console.log('FIXED: awareness-platform/server.js');
} else {
  console.log('No changes needed');
}
