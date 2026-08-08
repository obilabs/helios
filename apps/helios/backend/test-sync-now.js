const fetch = require('node-fetch');

async function testSync() {
  console.log('🔄 Testing Google Workspace Sync');
  console.log('='.repeat(60));

  try {
    // First, test the connection
    console.log('1️⃣ Testing connection...');
    const testResponse = await fetch('http://localhost:3001/api/google-workspace/test-connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organizationId: '161da501-7076-4bd5-91b5-248e35f178c1',
        domain: 'obilabs.dev'
      })
    });

    const testData = await testResponse.json();
    if (testData.success) {
      console.log('✅ Connection successful!');
      console.log(`   Users accessible: ${testData.details?.userCount || 0}`);
    } else {
      console.log('❌ Connection failed:', testData.error || testData.message);
      return;
    }

    console.log('\n2️⃣ Triggering sync...');
    const syncResponse = await fetch('http://localhost:3001/api/google-workspace/sync-now', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        organizationId: '161da501-7076-4bd5-91b5-248e35f178c1'
      })
    });

    const syncData = await syncResponse.json();
    console.log('\nSync Response:', JSON.stringify(syncData, null, 2));

    if (syncData.success) {
      console.log('\n✅ Sync completed successfully!');
      if (syncData.stats) {
        console.log('📊 Stats:');
        console.log(`   Total users: ${syncData.stats.total_users || 0}`);
        console.log(`   Active users: ${syncData.stats.active_users || 0}`);
        console.log(`   Admin users: ${syncData.stats.admin_users || 0}`);
        console.log(`   Suspended users: ${syncData.stats.suspended_users || 0}`);
      }
    } else {
      console.log('❌ Sync failed:', syncData.error || syncData.message);
    }

    // Get cached users
    console.log('\n3️⃣ Fetching cached users...');
    const usersResponse = await fetch('http://localhost:3001/api/google-workspace/cached-users/161da501-7076-4bd5-91b5-248e35f178c1');
    const usersData = await usersResponse.json();

    if (usersData.success && usersData.data) {
      console.log(`\n✅ Found ${usersData.data.count} cached users:`);
      if (usersData.data.users && usersData.data.users.length > 0) {
        usersData.data.users.forEach(user => {
          const status = user.is_suspended ? '❌' : '✅';
          const admin = user.is_admin ? '👑' : '👤';
          console.log(`   ${status} ${admin} ${user.email} - ${user.full_name || 'No name'}`);
        });
      }
    }

  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testSync().catch(console.error);