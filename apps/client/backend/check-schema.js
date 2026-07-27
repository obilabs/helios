const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function checkSchema() {
  try {
    const result = await pool.query(`
      SELECT column_name, is_nullable, data_type, column_default
      FROM information_schema.columns
      WHERE table_name = 'organization_users'
      AND column_name IN ('password_hash', 'email', 'google_workspace_id')
      ORDER BY column_name
    `);

    console.log('organization_users schema:');
    result.rows.forEach(r => {
      console.log(`  ${r.column_name}: ${r.data_type}, nullable=${r.is_nullable}, default=${r.column_default}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
