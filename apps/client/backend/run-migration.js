const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getExecutedMigrations() {
  const result = await pool.query('SELECT migration_name FROM migrations ORDER BY id');
  return result.rows.map(row => row.migration_name);
}

async function runMigration() {
  try {
    // Ensure migrations table exists
    await ensureMigrationsTable();

    // Get list of executed migrations
    const executedMigrations = await getExecutedMigrations();

    // Read all migration files
    const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    let executedCount = 0;

    for (const file of migrationFiles) {
      if (!executedMigrations.includes(file)) {
        console.log(`Running migration: ${file}`);
        const migrationPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(migrationPath, 'utf8');

        await pool.query(sql);
        await pool.query('INSERT INTO migrations (migration_name) VALUES ($1)', [file]);
        console.log(`✅ Migration ${file} completed successfully`);
        executedCount++;
      }
    }

    if (executedCount === 0) {
      console.log('✅ No pending migrations');
    } else {
      console.log(`\n✅ Executed ${executedCount} migration(s) successfully`);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
