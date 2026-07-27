const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function checkCounts() {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE user_status = 'suspended') as suspended,
        COUNT(*) FILTER (WHERE user_status = 'active' OR is_active = true) as active,
        COUNT(*) FILTER (WHERE role = 'admin') as admins,
        COUNT(*) FILTER (WHERE google_workspace_id IS NOT NULL) as from_google,
        COUNT(*) FILTER (WHERE google_workspace_id IS NULL) as local_only
      FROM organization_users
      WHERE organization_id = '161da501-7076-4bd5-91b5-248e35f178c1'
        AND deleted_at IS NULL
    `);

    console.log('\n=== Organization Users Counts ===');
    console.table(result.rows);

    // Also check what's in gw_synced_users
    const gwResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM gw_synced_users
      WHERE organization_id = '161da501-7076-4bd5-91b5-248e35f178c1'
    `);

    console.log('\n=== Google Workspace Synced Users ===');
    console.table(gwResult.rows);

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkCounts();
