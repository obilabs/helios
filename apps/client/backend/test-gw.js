const fs = require('fs');
const http = require('http');

// Step 1: Get auth token
const loginData = JSON.stringify({
  email: 'mike@gridworx.io',
  password: 'admin123'
});

const loginOptions = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': loginData.length
  }
};

const loginReq = http.request(loginOptions, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    const result = JSON.parse(data);
    if (result.success) {
      const token = result.data.tokens.accessToken;
      const organizationId = result.data.organization.id;
      console.log('✅ Logged in successfully');
      console.log('Organization ID:', organizationId);

      // Step 2: Setup Google Workspace
      const serviceAccount = JSON.parse(fs.readFileSync('./temp-sa.json', 'utf8'));

      const setupData = JSON.stringify({
        organizationId: organizationId,
        domain: 'gridworx.io',
        organizationName: 'Gridworx',
        adminEmail: 'mike@gridworx.io',
        credentials: serviceAccount
      });

      const setupOptions = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/google-workspace/setup',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Length': setupData.length
        }
      };

      const setupReq = http.request(setupOptions, (setupRes) => {
        let setupResult = '';

        setupRes.on('data', (chunk) => {
          setupResult += chunk;
        });

        setupRes.on('end', () => {
          const setupData = JSON.parse(setupResult);
          if (setupData.success) {
            console.log('✅ Google Workspace setup successful!');
            testConnection(token);
          } else {
            console.log('❌ Setup failed:', setupData.error || setupData.message);
          }
        });
      });

      setupReq.on('error', (error) => {
        console.error('Setup request error:', error);
      });

      setupReq.write(setupData);
      setupReq.end();
    } else {
      console.log('❌ Login failed:', result.error);
    }
  });
});

loginReq.on('error', (error) => {
  console.error('Login request error:', error);
});

loginReq.write(loginData);
loginReq.end();

function testConnection(token) {
  console.log('\n🔍 Testing Google Workspace connection...');

  const testData = JSON.stringify({
    organizationId: '161da501-7076-4bd5-91b5-248e35f178c1',
    domain: 'gridworx.io'
  });

  const testOptions = {
    hostname: 'localhost',
    port: 3001,
    path: '/api/google-workspace/test-connection',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': testData.length
    }
  };

  const testReq = http.request(testOptions, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      const result = JSON.parse(data);
      if (result.success) {
        console.log('✅ Connection test successful!');
        console.log('Details:', result.details);
      } else {
        console.log('❌ Connection test failed:', result.error || result.message);
      }
    });
  });

  testReq.on('error', (error) => {
    console.error('Test request error:', error);
  });

  testReq.write(testData);
  testReq.end();
}