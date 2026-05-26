// Database initialization and migration
const db = require('./client');

async function initializeDatabase() {
  try {
    // Create database if not exists (handled by postgres, just ensure connection)
    const client = await db.pool.connect();
    console.log('Database connected successfully');
    
    // Check if tables exist by querying one of them
    try {
      await client.query('SELECT 1 FROM tenants LIMIT 1');
      console.log('Database schema already exists');
    } catch (err) {
      console.log('Database schema not found, creating...');
      // Read and execute schema.sql
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Execute schema in transaction
      await client.query('BEGIN');
      const statements = schema.split(';').filter(s => s.trim());
      for (const statement of statements) {
        if (statement.trim()) {
          await client.query(statement);
        }
      }
      await client.query('COMMIT');
      console.log('Database schema created successfully');
    }
    
    client.release();
    return true;
  } catch (err) {
    console.error('Database initialization failed:', err);
    return false;
  }
}

module.exports = { initializeDatabase };
