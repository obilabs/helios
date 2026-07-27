const http = require('http');

// Test credentials (Jack user - admin)
const credentials = {
  email: 'jack@obilabs.dev',
  password: '***REMOVED-CREDENTIAL***'
};

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function test() {
  try {
    console.log('🔐 Logging in as Jack...');
    const loginResponse = await makeRequest('POST', '/api/auth/login', credentials);

    if (!loginResponse.success) {
      console.error('❌ Login failed:', loginResponse.message);
      return;
    }

    console.log('✅ Login successful!');
    const token = loginResponse.data.tokens.accessToken;

    console.log('\n📊 Fetching organization stats...');
    const statsResponse = await makeRequest('GET', '/api/organization/stats', null, token);

    if (!statsResponse.success) {
      console.error('❌ Stats fetch failed:', statsResponse.message);
      return;
    }

    console.log('✅ Stats fetched successfully!\n');
    console.log('RAW Response:', JSON.stringify(statsResponse, null, 2));
    console.log('\n=== Platform-Specific Stats ===\n');

    const stats = statsResponse.data;

    // Google Workspace Stats
    console.log('📧 GOOGLE WORKSPACE:');
    if (stats.google && stats.google.connected) {
      console.log(`  ✓ Connected: ${stats.google.connected}`);
      console.log(`  📊 Total Users: ${stats.google.totalUsers}`);
      console.log(`  ⏸️  Suspended: ${stats.google.suspendedUsers}`);
      console.log(`  👑 Admins: ${stats.google.adminUsers}`);
      console.log(`  🕐 Last Sync: ${stats.google.lastSync || 'Never'}`);
      if (stats.google.licenses) {
        console.log(`  📜 Licenses: ${stats.google.licenses.used}/${stats.google.licenses.total}`);
      }
    } else {
      console.log('  ❌ Not connected');
    }

    // Microsoft 365 Stats
    console.log('\n☁️  MICROSOFT 365:');
    if (stats.microsoft && stats.microsoft.connected) {
      console.log(`  ✓ Connected: ${stats.microsoft.connected}`);
      console.log(`  📊 Total Users: ${stats.microsoft.totalUsers}`);
      console.log(`  🚫 Disabled: ${stats.microsoft.disabledUsers}`);
      console.log(`  👑 Admins: ${stats.microsoft.adminUsers}`);
      console.log(`  🕐 Last Sync: ${stats.microsoft.lastSync || 'Never'}`);
    } else {
      console.log('  ❌ Not connected');
    }

    // Helios Portal Stats
    console.log('\n🏠 HELIOS PORTAL (Local):');
    if (stats.helios) {
      console.log(`  📊 Total Users: ${stats.helios.totalUsers}`);
      console.log(`  🎭 Guest Users: ${stats.helios.guestUsers}`);
      console.log(`  ✅ Active Users: ${stats.helios.activeUsers}`);
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

test();
