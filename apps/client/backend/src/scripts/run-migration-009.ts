/**
 * Manual migration runner for migration 009
 * This script runs the migration in smaller chunks to avoid pg driver issues
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
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Split by semicolon and filter out comments and empty lines
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      // Skip if it's just a comment block
      if (statement.match(/^\/\*.*\*\/$/s)) {
        continue;
      }

      try {
        console.log(`Executing statement ${i + 1}/${statements.length}...`);
        await client.query(statement + ';');
        console.log(`✓ Statement ${i + 1} completed\n`);
      } catch (error: any) {
        // Check if it's a benign error (already exists)
        if (error.code === '42P07' || error.message.includes('already exists')) {
          console.log(`⚠ Skipping (already exists): ${error.message}\n`);
          continue;
        }
        throw error;
      }
    }

    console.log('\n✅ Migration 009 completed successfully!');

  } catch (error: any) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration009();
