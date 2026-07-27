/**
 * Direct Google Workspace API Test
 * Tests if service account can access user data
 */

const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function testGoogleAPI() {
  try {
    console.log('🔍 Fetching Google Workspace credentials from database...\n');

    // Get credentials from database
    const result = await pool.query(`
      SELECT service_account_key, admin_email, domain
      FROM gw_credentials
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.error('❌ No Google Workspace credentials found in database');
      process.exit(1);
    }

    const { service_account_key, admin_email, domain } = result.rows[0];

    // Parse the service account key (stored as JSON text)
    const serviceAccountObj = typeof service_account_key === 'string'
      ? JSON.parse(service_account_key)
      : service_account_key;

    console.log('✓ Credentials found:');
    console.log(`  Admin Email: ${admin_email}`);
    console.log(`  Domain: ${domain}`);
    console.log(`  Service Account: ${serviceAccountObj.client_email}\n`);

    // Create JWT client
    console.log('🔐 Creating JWT client with scopes...\n');

    const jwtClient = new JWT({
      email: serviceAccountObj.client_email,
      key: serviceAccountObj.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user',
        'https://www.googleapis.com/auth/admin.directory.group',
        'https://www.googleapis.com/auth/admin.directory.orgunit',
      ],
      subject: admin_email // Impersonate admin
    });

    // Test 1: Get specific user
    console.log('📋 Test 1: Get user mike@gridworx.io');
    console.log('─'.repeat(60));

    try {
      const url = 'https://admin.googleapis.com/admin/directory/v1/users/mike@gridworx.io';
      const response = await jwtClient.request({ url });

      console.log('✅ SUCCESS! User data retrieved:');
      console.log(JSON.stringify(response.data, null, 2));
    } catch (error) {
      console.error('❌ FAILED to get user:');
      console.error(`   Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }

    console.log('\n');

    // Test 2: List users
    console.log('📋 Test 2: List all users');
    console.log('─'.repeat(60));

    try {
      const url = 'https://admin.googleapis.com/admin/directory/v1/users';
      const response = await jwtClient.request({
        url,
        params: { domain: domain }
      });

      console.log(`✅ SUCCESS! Found ${response.data.users?.length || 0} users:`);
      if (response.data.users) {
        response.data.users.forEach(user => {
          console.log(`   - ${user.primaryEmail} (${user.name?.fullName || 'No name'})`);
        });
      }
    } catch (error) {
      console.error('❌ FAILED to list users:');
      console.error(`   Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
      }
    }

    console.log('\n');
    console.log('═'.repeat(60));
    console.log('Test complete!');
    console.log('═'.repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await pool.end();
  }
}

testGoogleAPI();
