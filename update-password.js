const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://cybersec:securepassword@localhost:5432/cybersec_platform' });

async function updatePassword() {
  const hash = bcrypt.hashSync('admin123', 10);
  console.log('New hash:', hash);
  await pool.query("UPDATE users SET password_hash = $1 WHERE username = 'admin'", [hash]);
  console.log('Password updated');
  await pool.end();
}

updatePassword().catch(console.error);
