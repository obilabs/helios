const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function markAllMigrations() {
  try {
    const existingMigrations = [
      '001_add_password_setup_system.sql',
      '002_add_extended_user_fields.sql',
      '007_create_departments.sql',
      '007_file_drop_module.sql',
      '008_add_group_mapping_and_user_fields.sql',
      '008_add_social_and_photo_fields.sql',
      '009_add_prebuilt_templates.sql',
      '009_create_modules_system.sql',
      '009b_fix_indexes.sql',
      '009c_create_remaining_tables.sql',
      '010_create_template_studio_system.sql'
    ];

    for (const migration of existingMigrations) {
      await pool.query(
        'INSERT INTO migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
        [migration]
      );
      console.log(`✓ Marked ${migration}`);
    }

    console.log('\n✅ All migrations marked');

  } catch (error) {
    console.error('❌ Failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

markAllMigrations();
