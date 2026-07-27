const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const fs = require('fs');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function debugAuth() {
  console.log('🔍 Debugging Google Workspace Authorization');
  console.log('='.repeat(60));

  try {
    // Get credentials from database
    const result = await pool.query('SELECT * FROM gw_credentials LIMIT 1');

    if (result.rows.length === 0) {
      console.log('❌ No credentials found in database');
      return;
    }

    const row = result.rows[0];
    console.log('📊 Database Info:');
    console.log(`  Organization ID: ${row.organization_id}`);
    console.log(`  Domain: ${row.domain}`);
    console.log(`  Admin Email: ${row.admin_email}`);
    console.log('='.repeat(60));

    // Parse service account
    const serviceAccount = JSON.parse(row.service_account_key);

    console.log('🔑 Service Account Info:');
    console.log(`  Project ID: ${serviceAccount.project_id}`);
    console.log(`  Client Email: ${serviceAccount.client_email}`);
    console.log(`  Client ID: ${serviceAccount.client_id}`);
    console.log(`  Private Key ID: ${serviceAccount.private_key_id}`);
    console.log('='.repeat(60));

    // Define scopes we're trying to use
    const scopes = [
      'https://www.googleapis.com/auth/admin.directory.user',
      'https://www.googleapis.com/auth/admin.directory.group',
      'https://www.googleapis.com/auth/admin.directory.orgunit',
      'https://www.googleapis.com/auth/admin.directory.domain.readonly'
    ];

    console.log('📋 Scopes being requested:');
    scopes.forEach(scope => console.log(`  - ${scope}`));
    console.log('='.repeat(60));

    console.log('⚙️ IMPORTANT: Domain-Wide Delegation Setup');
    console.log('Go to: https://admin.google.com/ac/owl/domainwidedelegation');
    console.log(`Add Client ID: ${serviceAccount.client_id}`);
    console.log('With these exact scopes:');
    scopes.forEach(scope => console.log(`  ${scope}`));
    console.log('='.repeat(60));

    // Try to create JWT client
    console.log('🔐 Attempting authorization...');
    console.log(`  Impersonating: ${row.admin_email}`);

    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: scopes,
      subject: row.admin_email  // This is the admin we're impersonating
    });

    // Try to authorize
    await jwtClient.authorize();
    console.log('✅ Authorization successful!');

    // Try to list users
    const admin = google.admin({ version: 'directory_v1', auth: jwtClient });
    console.log('\n📊 Testing API access...');

    const usersResponse = await admin.users.list({
      domain: row.domain,
      maxResults: 5
    });

    const users = usersResponse.data.users || [];
    console.log(`✅ Successfully fetched ${users.length} users!`);

    if (users.length > 0) {
      console.log('\nSample users:');
      users.slice(0, 3).forEach(user => {
        console.log(`  - ${user.primaryEmail}`);
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 SUCCESS! Everything is working!');

  } catch (error) {
    console.log('\n❌ ERROR:', error.message);

    if (error.message.includes('unauthorized_client')) {
      console.log('\n⚠️ SOLUTION:');
      console.log('1. The Client ID is not authorized for Domain-Wide Delegation');
      console.log('2. Or the scopes don\'t match exactly');
      console.log('\n📝 TO FIX:');
      console.log('1. Go to https://admin.google.com/ac/owl/domainwidedelegation');
      console.log('2. Find the entry with the Client ID shown above');
      console.log('3. Click "Edit" (or "Add new" if not present)');
      console.log('4. Make sure ALL these scopes are added:');
      console.log('   https://www.googleapis.com/auth/admin.directory.user');
      console.log('   https://www.googleapis.com/auth/admin.directory.group');
      console.log('   https://www.googleapis.com/auth/admin.directory.orgunit');
      console.log('   https://www.googleapis.com/auth/admin.directory.domain.readonly');
      console.log('5. Click "Authorize"');
      console.log('6. Try syncing again in Helios');
    } else if (error.message.includes('invalid_grant')) {
      console.log('\n⚠️ SOLUTION:');
      console.log(`1. Verify ${row.admin_email} is a Super Admin`);
      console.log('2. Check Domain-Wide Delegation is enabled');
      console.log('3. Verify the domain matches');
    }
  } finally {
    await pool.end();
  }
}

// Run the debug
debugAuth().catch(console.error);