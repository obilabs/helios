const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function markExistingMigrations() {
  try {
    // Create migrations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Mark migrations 001-010 as already executed
    const existingMigrations = [
      '001_add_password_setup_system.sql',
      '002_add_extended_user_fields.sql',
      '003_add_groups_tables.sql',
      '004_create_google_workspace_system.sql',
      '005_add_google_workspace_fields.sql',
      '006_add_signature_system.sql',
      '007_create_departments.sql',
      '008_add_social_and_photo_fields.sql',
      '009_add_prebuilt_templates.sql',
      '010_create_template_studio_system.sql'
    ];

    for (const migration of existingMigrations) {
      try {
        await pool.query(
          'INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
          [migration]
        );
        console.log(`✓ Marked ${migration} as executed`);
      } catch (err) {
        console.log(`  ${migration} already marked`);
      }
    }

    console.log('\n✅ All existing migrations marked as executed');

  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

markExistingMigrations();
