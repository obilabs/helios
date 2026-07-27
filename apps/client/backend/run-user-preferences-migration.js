const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/helios_client'
});

async function runMigration() {
  try {
    console.log('Running user preferences migration...');

    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '025_add_user_preferences.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    await pool.query(sql);

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();
