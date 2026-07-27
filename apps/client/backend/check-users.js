const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

const orgId = '161da501-7076-4bd5-91b5-248e35f178c1';

async function checkUsers() {
  try {
    console.log('=== Organization Users ===');
    const orgUsers = await pool.query(
      'SELECT email, first_name, last_name FROM organization_users WHERE organization_id = $1',
      [orgId]
    );
    console.log('Count:', orgUsers.rows.length);
    console.log('Emails:', orgUsers.rows.map(u => u.email));

    console.log('\n=== GW Synced Users ===');
    const gwUsers = await pool.query(
      'SELECT email, full_name FROM gw_synced_users WHERE organization_id = $1',
      [orgId]
    );
    console.log('Count:', gwUsers.rows.length);
    console.log('Emails:', gwUsers.rows.map(u => u.email));

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkUsers();
