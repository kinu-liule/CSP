const fs = require('fs');
const c = fs.readFileSync('C:/Users/Arbaj Khan LLC/Documents/all-in-on CS Solution/cybersec-platform/awareness-platform/server.js', 'utf8');
const lines = c.split('\n');
let count = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.includes("'INSERT INTO") && l.includes("'INSERT INTO") && !l.includes('comment')) {
    // Find the end of this string
    let j = i;
    let closed = false;
    while (j < lines.length && j < i + 20) {
      const trimmed = lines[j].trim();
      if (trimmed.endsWith("',") || trimmed.endsWith("')") || trimmed.endsWith("');")) {
        if (j > i) {
          console.log('Multi-line INSERT at lines ' + (i+1) + '-' + (j+1) + ': ' + l.trim().substring(0, 80));
          count++;
        }
        closed = true;
        i = j;
        break;
      }
      j++;
    }
    if (!closed) {
      console.log('UNCLOSED string starting at line ' + (i+1) + ': ' + l.trim().substring(0, 80));
    }
  }
}
console.log('Total multi-line INSERTs: ' + count);
