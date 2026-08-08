const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
const fs = require('fs');

// Service account files to test
const serviceAccounts = [
  {
    name: 'helios-workspace-integration',
    path: './sa1.json',
    clientId: '108490795655297452827'
  },
  {
    name: 'helios-472105',
    path: './sa2.json',
    clientId: '101330966159063009312'
  }
];

// Test configuration
const ADMIN_EMAIL = 'mike@gridworx.io'; // The admin email to impersonate
const DOMAIN = 'gridworx.io'; // Your Google Workspace domain

async function testServiceAccount(serviceAccountInfo) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${serviceAccountInfo.name}`);
  console.log(`Client ID: ${serviceAccountInfo.clientId}`);
  console.log(`${'='.repeat(60)}`);

  try {
    // Read the service account file
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountInfo.path, 'utf8'));
    console.log(`✓ Service account file loaded`);
    console.log(`  Project: ${serviceAccount.project_id}`);
    console.log(`  Email: ${serviceAccount.client_email}`);

    // Create JWT client with domain-wide delegation
    const jwtClient = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [
        'https://www.googleapis.com/auth/admin.directory.user.readonly',
        'https://www.googleapis.com/auth/admin.directory.group.readonly',
        'https://www.googleapis.com/auth/admin.directory.orgunit.readonly'
      ],
      subject: ADMIN_EMAIL // This is the key part - impersonating the admin
    });

    console.log(`✓ JWT client created with subject: ${ADMIN_EMAIL}`);

    // Try to authorize
    await jwtClient.authorize();
    console.log(`✓ Authorization successful!`);

    // Create admin client
    const admin = google.admin({ version: 'directory_v1', auth: jwtClient });
    console.log(`✓ Admin SDK client created`);

    // Test 1: List users
    console.log(`\nTesting user list access...`);
    const usersResponse = await admin.users.list({
      domain: DOMAIN,
      maxResults: 5,
      orderBy: 'email'
    });

    const userCount = usersResponse.data.users?.length || 0;
    console.log(`✓ Successfully fetched ${userCount} users`);

    if (userCount > 0) {
      console.log(`\n  Sample users:`);
      usersResponse.data.users.slice(0, 3).forEach(user => {
        console.log(`    - ${user.primaryEmail} (${user.name?.fullName || 'No name'})`);
      });
    }

    // Test 2: List groups
    console.log(`\nTesting group list access...`);
    const groupsResponse = await admin.groups.list({
      domain: DOMAIN,
      maxResults: 5
    });

    const groupCount = groupsResponse.data.groups?.length || 0;
    console.log(`✓ Successfully fetched ${groupCount} groups`);

    // Test 3: List org units
    console.log(`\nTesting org units access...`);
    const orgUnitsResponse = await admin.orgunits.list({
      customerId: 'my_customer',
      type: 'all'
    });

    const orgUnitCount = orgUnitsResponse.data.organizationUnits?.length || 0;
    console.log(`✓ Successfully fetched ${orgUnitCount} org units`);

    console.log(`\n✅ SUCCESS: This service account is properly configured!`);
    console.log(`\n📋 Summary:`);
    console.log(`  - Domain-Wide Delegation: ✓ Working`);
    console.log(`  - Users accessible: ${userCount}`);
    console.log(`  - Groups accessible: ${groupCount}`);
    console.log(`  - Org Units accessible: ${orgUnitCount}`);

    return {
      success: true,
      name: serviceAccountInfo.name,
      clientId: serviceAccountInfo.clientId,
      projectId: serviceAccount.project_id,
      serviceEmail: serviceAccount.client_email,
      userCount,
      groupCount,
      orgUnitCount
    };

  } catch (error) {
    console.log(`\n❌ FAILED: ${error.message}`);

    // Provide specific error guidance
    if (error.message.includes('invalid_grant')) {
      console.log(`\n⚠️ Invalid grant error. Possible causes:`);
      console.log(`  1. Domain-Wide Delegation not configured in Google Admin Console`);
      console.log(`  2. Admin email '${ADMIN_EMAIL}' doesn't exist or isn't a super admin`);
      console.log(`  3. Service account doesn't have required scopes authorized`);
      console.log(`\n📝 To fix:`);
      console.log(`  1. Go to https://admin.google.com/ac/owl/domainwidedelegation`);
      console.log(`  2. Add Client ID: ${serviceAccountInfo.clientId}`);
      console.log(`  3. Add these scopes:`);
      console.log(`     https://www.googleapis.com/auth/admin.directory.user`);
      console.log(`     https://www.googleapis.com/auth/admin.directory.group`);
      console.log(`     https://www.googleapis.com/auth/admin.directory.orgunit`);
    } else if (error.message.includes('unauthorized_client')) {
      console.log(`\n⚠️ Unauthorized client error.`);
      console.log(`  The service account is not authorized for domain-wide delegation.`);
      console.log(`  Client ID ${serviceAccountInfo.clientId} needs to be added in Google Admin Console.`);
    } else if (error.message.includes('Not Authorized')) {
      console.log(`\n⚠️ Not authorized to access this resource.`);
      console.log(`  The admin email may not have sufficient privileges.`);
    }

    return {
      success: false,
      name: serviceAccountInfo.name,
      clientId: serviceAccountInfo.clientId,
      error: error.message
    };
  }
}

async function main() {
  console.log(`🔍 Testing Google Workspace Service Accounts`);
  console.log(`Domain: ${DOMAIN}`);
  console.log(`Admin Email: ${ADMIN_EMAIL}`);

  const results = [];

  for (const sa of serviceAccounts) {
    const result = await testServiceAccount(sa);
    results.push(result);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`FINAL RESULTS`);
  console.log(`${'='.repeat(60)}`);

  const workingAccounts = results.filter(r => r.success);
  const failedAccounts = results.filter(r => !r.success);

  if (workingAccounts.length > 0) {
    console.log(`\n✅ Working Service Accounts (${workingAccounts.length}):`);
    workingAccounts.forEach(account => {
      console.log(`\n  ${account.name}:`);
      console.log(`    Client ID: ${account.clientId}`);
      console.log(`    Project: ${account.projectId}`);
      console.log(`    Email: ${account.serviceEmail}`);
      console.log(`    Users: ${account.userCount}, Groups: ${account.groupCount}, Org Units: ${account.orgUnitCount}`);
    });

    console.log(`\n🎯 RECOMMENDATION: Use "${workingAccounts[0].name}" service account`);
    console.log(`   File: ${serviceAccounts.find(sa => sa.name === workingAccounts[0].name).path}`);
  }

  if (failedAccounts.length > 0) {
    console.log(`\n❌ Failed Service Accounts (${failedAccounts.length}):`);
    failedAccounts.forEach(account => {
      console.log(`\n  ${account.name}:`);
      console.log(`    Client ID: ${account.clientId}`);
      console.log(`    Error: ${account.error}`);
    });
  }

  if (workingAccounts.length === 0) {
    console.log(`\n❌ No working service accounts found!`);
    console.log(`\n📝 Next steps:`);
    console.log(`1. Go to https://admin.google.com/ac/owl/domainwidedelegation`);
    console.log(`2. Add one of these Client IDs:`);
    serviceAccounts.forEach(sa => {
      console.log(`   - ${sa.clientId} (${sa.name})`);
    });
    console.log(`3. Add these OAuth scopes:`);
    console.log(`   https://www.googleapis.com/auth/admin.directory.user`);
    console.log(`   https://www.googleapis.com/auth/admin.directory.group`);
    console.log(`   https://www.googleapis.com/auth/admin.directory.orgunit`);
    console.log(`4. Click "Authorize"`);
    console.log(`5. Run this test again`);
  }
}

// Run the test
main().catch(console.error);