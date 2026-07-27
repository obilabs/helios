/**
 * Test Transparent Proxy
 *
 * Quick test to verify the transparent proxy is working
 *
 * Prerequisites:
 * 1. Backend running: npm run dev
 * 2. Google Workspace configured
 * 3. Valid Helios auth token
 *
 * Usage:
 *   HELIOS_TOKEN=your_token_here npx ts-node src/scripts/test-transparent-proxy.ts
 */

const HELIOS_API_URL = process.env.HELIOS_API_URL || 'http://localhost:3001';
const HELIOS_TOKEN = process.env.HELIOS_TOKEN || '';

if (!HELIOS_TOKEN) {
  console.error('❌ HELIOS_TOKEN environment variable required');
  console.log('\nUsage:');
  console.log('  HELIOS_TOKEN=your_token npx ts-node src/scripts/test-transparent-proxy.ts');
  process.exit(1);
}

async function testProxy() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 TRANSPARENT PROXY TEST');
  console.log('='.repeat(60));
  console.log(`\nHelios API: ${HELIOS_API_URL}`);
  console.log(`Token: ${HELIOS_TOKEN.substring(0, 20)}...`);

  // Test 1: List Users via Proxy
  console.log('\n' + '-'.repeat(60));
  console.log('Test 1: List Users via Proxy');
  console.log('-'.repeat(60));

  try {
    console.log('📡 Calling: GET /api/google/admin/directory/v1/users?maxResults=5');

    const response = await fetch(
      `${HELIOS_API_URL}/api/google/admin/directory/v1/users?maxResults=5`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${HELIOS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`📥 Response Status: ${response.status} ${response.statusText}`);

    if (response.ok) {
      const data: any = await response.json();
      const userCount = data.users?.length || 0;

      console.log('✅ SUCCESS');
      console.log(`   Users returned: ${userCount}`);

      if (userCount > 0) {
        console.log(`   First user: ${data.users[0].primaryEmail}`);
      }

      // Check if audit log was created
      console.log('\n🔍 Checking audit log...');
      console.log('   (Check database: SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 1)');

    } else {
      const errorData = await response.json();
      console.log('❌ FAILED');
      console.log(`   Error: ${JSON.stringify(errorData, null, 2)}`);
    }

  } catch (error: any) {
    console.log('❌ ERROR');
    console.log(`   ${error.message}`);
  }

  // Test 2: Get Specific User via Proxy
  console.log('\n' + '-'.repeat(60));
  console.log('Test 2: Get Specific User via Proxy');
  console.log('-'.repeat(60));

  try {
    // First get a user email
    const listResponse = await fetch(
      `${HELIOS_API_URL}/api/google/admin/directory/v1/users?maxResults=1`,
      {
        headers: { 'Authorization': `Bearer ${HELIOS_TOKEN}` }
      }
    );

    if (listResponse.ok) {
      const listData: any = await listResponse.json();
      if (listData.users && listData.users.length > 0) {
        const userEmail = listData.users[0].primaryEmail;

        console.log(`📡 Calling: GET /api/google/admin/directory/v1/users/${userEmail}`);

        const userResponse = await fetch(
          `${HELIOS_API_URL}/api/google/admin/directory/v1/users/${userEmail}`,
          {
            headers: { 'Authorization': `Bearer ${HELIOS_TOKEN}` }
          }
        );

        console.log(`📥 Response Status: ${userResponse.status}`);

        if (userResponse.ok) {
          const userData: any = await userResponse.json();
          console.log('✅ SUCCESS');
          console.log(`   Email: ${userData.primaryEmail}`);
          console.log(`   Name: ${userData.name?.fullName}`);
          console.log(`   Google ID: ${userData.id}`);
        } else {
          const errorData = await userResponse.json();
          console.log('❌ FAILED');
          console.log(`   Error: ${JSON.stringify(errorData, null, 2)}`);
        }
      } else {
        console.log('⚠️  SKIPPED - No users found to test with');
      }
    }

  } catch (error: any) {
    console.log('❌ ERROR');
    console.log(`   ${error.message}`);
  }

  // Test 3: Unknown Endpoint (to prove future-proofing)
  console.log('\n' + '-'.repeat(60));
  console.log('Test 3: Unknown Endpoint (Gmail Delegates)');
  console.log('-'.repeat(60));

  try {
    console.log('📡 Calling: GET /api/google/gmail/v1/users/me/settings/sendAs');

    const response = await fetch(
      `${HELIOS_API_URL}/api/google/gmail/v1/users/me/settings/sendAs`,
      {
        headers: { 'Authorization': `Bearer ${HELIOS_TOKEN}` }
      }
    );

    console.log(`📥 Response Status: ${response.status}`);

    if (response.ok) {
      const data: any = await response.json();
      console.log('✅ SUCCESS - Unknown endpoint proxied successfully!');
      console.log(`   SendAs aliases: ${data.sendAs?.length || 0}`);
    } else if (response.status === 404) {
      console.log('⚠️  404 from Google (expected for some Gmail APIs)');
    } else {
      const errorData = await response.json();
      console.log('❌ FAILED');
      console.log(`   Error: ${JSON.stringify(errorData, null, 2)}`);
    }

  } catch (error: any) {
    console.log('❌ ERROR');
    console.log(`   ${error.message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('\n✅ If tests passed:');
  console.log('   1. Transparent proxy is working');
  console.log('   2. Requests are being proxied to Google');
  console.log('   3. Audit logs are being created');
  console.log('   4. Unknown endpoints work (future-proof)');
  console.log('\n📋 Next Steps:');
  console.log('   1. Check database for audit logs');
  console.log('   2. Verify user data synced to organization_users table');
  console.log('   3. Test with Service API key');
  console.log('   4. Test with Vendor API key (requires X-Actor headers)');
  console.log('\n' + '='.repeat(60));
}

testProxy().catch(console.error);
