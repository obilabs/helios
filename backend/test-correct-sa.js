const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Configuration
const SERVICE_ACCOUNT_PATH = './sa-correct.json';
const ADMIN_EMAIL = 'mike@gridworx.io';
const DOMAIN = 'gridworx.io';

async function testServiceAccount() {
  console.log('🔍 Testing Google Workspace Service Account');
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Admin Email: ${ADMIN_EMAIL}`);
  console.log('='.repeat(60));

  try {
    // Read the service account file
    const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
    console.log('✓ Service account file loaded');
    console.log(`  Project: ${serviceAccount.project_id}`);
    console.log(`  Client Email: ${serviceAccount.client_email}`);
    console.log(`  Client ID: ${serviceAccount.client_id}`);
    console.log('='.repeat(60));

    // Create JWT client with domain-wide delegation
    console.log('Creating JWT client with domain-wide delegation...');
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user.readonly',
        'https://www.googleapis.com/auth/admin.directory.group.readonly',
        'https://www.googleapis.com/auth/admin.directory.orgunit.readonly'
      ],
      subject: ADMIN_EMAIL
    });

    // Try to authorize
    console.log('Authorizing...');
    await jwtClient.authorize();
    console.log('✅ Authorization successful!');

    // Create admin client
    const admin = google.admin({ version: 'directory_v1', auth: jwtClient });

    // Test: List users
    console.log('\nFetching users...');
    const usersResponse = await admin.users.list({
      domain: DOMAIN,
      maxResults: 100,
      orderBy: 'email'
    });

    const users = usersResponse.data.users || [];
    console.log(`✅ Successfully fetched ${users.length} users`);

    if (users.length > 0) {
      console.log('\nUsers found:');
      users.forEach(user => {
        const status = user.suspended ? '❌ Suspended' : '✅ Active';
        const admin = user.isAdmin ? '👑 Admin' : '👤 User';
        console.log(`  ${status} ${admin} ${user.primaryEmail} - ${user.name?.fullName || 'No name'}`);
      });
    }

    // Test: List groups
    console.log('\nFetching groups...');
    const groupsResponse = await admin.groups.list({
      domain: DOMAIN,
      maxResults: 50
    });

    const groups = groupsResponse.data.groups || [];
    console.log(`✅ Successfully fetched ${groups.length} groups`);

    if (groups.length > 0) {
      console.log('\nGroups found:');
      groups.forEach(group => {
        console.log(`  📁 ${group.email} - ${group.name || 'No name'}`);
      });
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 SUCCESS! This service account works perfectly!');
    console.log('='.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`  ✅ Domain-Wide Delegation: Working`);
    console.log(`  ✅ Client ID: ${serviceAccount.client_id}`);
    console.log(`  ✅ Users accessible: ${users.length}`);
    console.log(`  ✅ Groups accessible: ${groups.length}`);
    console.log(`  ✅ Project: ${serviceAccount.project_id}`);
    console.log(`  ✅ Service Account: ${serviceAccount.client_email}`);
    console.log('\n✨ You can now use this service account file in Helios!');
    console.log(`   File: helios-workspace-automation-e90b097ddb9f.json`);

    return {
      success: true,
      userCount: users.length,
      groupCount: groups.length
    };

  } catch (error) {
    console.log('\n❌ FAILED:', error.message);

    if (error.message.includes('invalid_grant')) {
      console.log('\n⚠️ Error Details:');
      console.log('  The service account cannot impersonate the admin email.');
      console.log('\n📝 Possible fixes:');
      console.log(`  1. Verify mike@gridworx.io is a Super Admin`);
      console.log(`  2. Check Domain-Wide Delegation is configured`);
      console.log(`  3. Verify the Client ID matches what's in Google Admin Console`);
    }

    return {
      success: false,
      error: error.message
    };
  }
}

// Run the test
testServiceAccount().catch(console.error);