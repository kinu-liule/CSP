const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://cybersec:securepassword@postgres:5432/cybersec_platform'
});

async function resetPassword() {
  const hash = bcrypt.hashSync('admin123', 10);
  console.log('Generated hash:', hash);
  
  try {
    await pool.query("UPDATE users SET password_hash = $1 WHERE username = 'admin'", [hash]);
    console.log('Password reset successfully');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

resetPassword();
