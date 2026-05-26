const fs = require('fs');
const content = fs.readFileSync('C:/Users/Arbaj Khan LLC/Documents/all-in-on CS Solution/cybersec-platform/awareness-platform/server.js', 'utf8');
const lines = content.split('\n');
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (l.includes('pool.query(') && l.includes('INSERT INTO')) {
    console.log('Line ' + (i+1) + ' (start): ' + l.trim().substring(0, 120));
  }
  if (l.includes('pool.query(') && !l.includes('INSERT INTO')) {
    // Check next lines
    let j = i + 1;
    while (j < lines.length && j < i + 5) {
      if (lines[j].includes('INSERT INTO')) {
        console.log('Line ' + (i+1) + ' (multi, found at ' + (j+1) + '): ' + lines[j].trim().substring(0, 120));
        break;
      }
      j++;
    }
  }
}
