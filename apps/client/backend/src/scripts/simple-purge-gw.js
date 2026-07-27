const { Client } = require('pg');

async function purgeGoogleWorkspace() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    database: 'helios_client',
    user: 'postgres',
    password: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // 1. Delete Google Workspace credentials (already done)
    const credResult = await client.query(
      `DELETE FROM gw_credentials WHERE organization_id IS NOT NULL`
    );
    console.log(`Deleted ${credResult.rowCount} credentials`);

    // 2. Clear cached data
    try {
      await client.query(`DELETE FROM gw_cached_users`);
      await client.query(`DELETE FROM gw_cached_groups`);
      await client.query(`DELETE FROM gw_cached_org_units`);
      console.log('Cleared cached data');
    } catch (e) {
      console.log('No cached data to clear');
    }

    // 3. Update users to be local only
    const userResult = await client.query(`
      UPDATE organization_users
      SET
        google_workspace_id = NULL
      WHERE google_workspace_id IS NOT NULL
    `);
    console.log(`Converted ${userResult.rowCount} users to local`);

    // 4. Update modules table
    const moduleResult = await client.query(`
      UPDATE modules
      SET
        config = NULL
      WHERE slug = 'google_workspace'
    `);
    console.log('Cleared Google Workspace module config');

    console.log('\n✅ Google Workspace configuration purged!');
    console.log('All users are now local only');
    console.log('You can now reconfigure Google Workspace with your new service account');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

purgeGoogleWorkspace();