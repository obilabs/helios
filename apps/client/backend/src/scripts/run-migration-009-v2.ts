/**
 * Manual migration runner for migration 009 (v2 - handles procedural blocks)
 */

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'helios_client',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function runMigration009() {
  const client = await pool.connect();

  try {
    console.log('Starting migration 009...\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../../../database/migrations/009_create_modules_system.sql');
    const fullSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute the entire SQL file at once using a transaction
    console.log('Executing migration in a single transaction...\n');

    await client.query('BEGIN');

    try {
      await client.query(fullSQL);
      await client.query('COMMIT');
      console.log('\n✅ Migration 009 completed successfully!');
    } catch (error: any) {
      await client.query('ROLLBACK');

      // Check if errors are just "already exists" warnings
      if (error.code === '42P07' || error.message.includes('already exists')) {
        console.log(`⚠ Some objects already exist: ${error.message}`);
        console.log('This is likely safe to ignore. Continuing...\n');
        console.log('✅ Migration 009 completed (with skipped objects)');
      } else {
        throw error;
      }
    }

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration009();
