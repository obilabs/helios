const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios',
  user: 'postgres',
  password: 'postgres'
});

async function testExactScopes() {
  console.log('🔍 Testing with EXACT scopes used by Helios');
  console.log('='.repeat(60));

  try {
    // Get credentials from database
    const result = await pool.query('SELECT * FROM gw_credentials LIMIT 1');

    if (result.rows.length === 0) {
      console.log('❌ No credentials found in database');
      return;
    }

    const row = result.rows[0];
    const serviceAccount = JSON.parse(row.service_account_key);

    console.log('📊 Configuration:');
    console.log(`  Domain: ${row.domain}`);
    console.log(`  Admin Email: ${row.admin_email}`);
    console.log(`  Client ID: ${serviceAccount.client_id}`);
    console.log('='.repeat(60));

    // EXACT scopes that Helios uses in createAdminClient
    const scopes = [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.group',
      'https://www.googleapis.com/auth/admin.directory.orgunit',
      'https://www.googleapis.com/auth/admin.directory.domain',
      'https://www.googleapis.com/auth/admin.reports.audit.readonly'
    ];

    console.log('📋 Testing with these exact scopes:');
    scopes.forEach(scope => console.log(`  - ${scope}`));
    console.log('='.repeat(60));

    // Create JWT client - EXACTLY as Helios does
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: scopes,
      subject: row.admin_email  // Impersonate the admin
    });

    console.log('🔐 Attempting authorization...');
    await jwtClient.authorize();
    console.log('✅ Authorization successful!');

    // Create admin client - EXACTLY as Helios does
    const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

    // Test user list - same as Helios
    console.log('\n📊 Testing user list...');
    const usersResponse = await admin.users.list({
      customer: 'my_customer',
      maxResults: 5,
      orderBy: 'email'
    });

    const users = usersResponse.data.users || [];
    console.log(`✅ Successfully fetched ${users.length} users!`);

    if (users.length > 0) {
      console.log('\nUsers found:');
      users.forEach(user => {
        const status = user.suspended ? '❌' : '✅';
        const admin = user.isAdmin ? '👑' : '👤';
        console.log(`  ${status} ${admin} ${user.primaryEmail}`);
      });
    }

    // Test domain list
    console.log('\n📊 Testing domain access...');
    const domainsResponse = await admin.domains.list({
      customer: 'my_customer'
    });

    const domains = domainsResponse.data.domains || [];
    console.log(`✅ Successfully accessed ${domains.length} domain(s)!`);

    // Test groups
    console.log('\n📊 Testing groups...');
    const groupsResponse = await admin.groups.list({
      customer: 'my_customer',
      maxResults: 5
    });

    const groups = groupsResponse.data.groups || [];
    console.log(`✅ Successfully fetched ${groups.length} groups!`);

    console.log('\n' + '='.repeat(60));
    console.log('🎉 SUCCESS! Everything works with these scopes!');
    console.log('='.repeat(60));
    console.log('\n✅ You can now use Helios to:');
    console.log('  - Test connection');
    console.log('  - Sync users and groups');
    console.log('  - View organizational units');
    console.log('  - Access audit reports');

  } catch (error) {
    console.log('\n❌ ERROR:', error.message);

    if (error.message.includes('unauthorized_client')) {
      console.log('\n⚠️ The scopes in Google Admin Console don\'t match!');
      console.log('\n📝 Please follow these steps:');
      console.log('1. Go to https://admin.google.com/ac/owl/domainwidedelegation');
      console.log(`2. Find Client ID: ${serviceAccount?.client_id || 'Check database'}`);
      console.log('3. Click "Edit" (or remove and re-add)');
      console.log('4. Add ALL these scopes EXACTLY:');
      console.log('   https://www.googleapis.com/auth/admin.directory.user');
      console.log('   https://www.googleapis.com/auth/admin.directory.group');
      console.log('   https://www.googleapis.com/auth/admin.directory.orgunit');
      console.log('   https://www.googleapis.com/auth/admin.directory.domain');
      console.log('   https://www.googleapis.com/auth/admin.reports.audit.readonly');
      console.log('5. Click "Authorize"');
      console.log('6. Wait 1-2 minutes and try again');
    }
  } finally {
    await pool.end();
  }
}

// Run the test
testExactScopes().catch(console.error);