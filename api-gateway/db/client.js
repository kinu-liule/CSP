// Database client with fallback for when DB is unavailable
const { Pool } = require('pg');

let pool;
let dbAvailable = false;

try {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'api_gateway',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  
  pool.on('error', (err) => {
    console.error('Database error:', err.message);
    dbAvailable = false;
  });
  
  // Test connection
  pool.query('SELECT NOW()').then(() => {
    console.log('Database connected successfully');
    dbAvailable = true;
  }).catch(() => {
    console.log('Database not available - running in memory mode');
    dbAvailable = false;
  });
  
} catch (err) {
  console.log('Database not available - running in memory mode');
}

const query = async (text, params) => {
  if (!dbAvailable || !pool) {
    throw new Error('Database not available');
  }
  return pool.query(text, params);
};

module.exports = {
  query,
  getClient: async () => {
    if (!dbAvailable || !pool) throw new Error('Database not available');
    return pool.connect();
  },
  pool,
  isAvailable: () => dbAvailable
};
