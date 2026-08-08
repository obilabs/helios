const fetch = require('node-fetch');

async function testLoginFlow() {
  try {
    console.log('🧪 Testing Complete Login Flow\n');

    // Step 1: Login
    console.log('1️⃣  Testing login...');
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'jack@gridwrx.io',
        password: 'TestPassword123!'
      }),
    });

    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      console.error('❌ Login failed:', loginData);
      process.exit(1);
    }

    console.log('✅ Login successful!');
    console.log('   User:', loginData.data.user.email);
    console.log('   Organization:', loginData.data.organization.name);
    console.log('   Token length:', loginData.data.tokens.accessToken.length);

    const token = loginData.data.tokens.accessToken;

    // Step 2: Verify token
    console.log('\n2️⃣  Testing token verification...');
    const verifyResponse = await fetch('http://localhost:3001/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const verifyData = await verifyResponse.json();

    if (!verifyResponse.ok) {
      console.error('❌ Token verification failed:', verifyData);
      process.exit(1);
    }

    console.log('✅ Token verification successful!');
    console.log('   Verified user:', verifyData.data.user.email);
    console.log('   User ID:', verifyData.data.user.id);
    console.log('   Role:', verifyData.data.user.role);

    // Step 3: Simulate page refresh (verify token again)
    console.log('\n3️⃣  Simulating page refresh (verify token again)...');
    const refreshVerifyResponse = await fetch('http://localhost:3001/api/auth/verify', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const refreshVerifyData = await refreshVerifyResponse.json();

    if (!refreshVerifyResponse.ok) {
      console.error('❌ Token verification after refresh failed:', refreshVerifyData);
      process.exit(1);
    }

    console.log('✅ Token still valid after refresh!');
    console.log('   User:', refreshVerifyData.data.user.email);

    console.log('\n🎉 All tests passed! Login flow is working correctly.');
    console.log('\n📋 Summary:');
    console.log('   ✅ Login endpoint working');
    console.log('   ✅ Token generation working');
    console.log('   ✅ Token verification working');
    console.log('   ✅ Token persistence working');
    console.log('\n🔑 Test credentials:');
    console.log('   Email: jack@gridwrx.io');
    console.log('   Password: TestPassword123!');

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    process.exit(1);
  }
}

testLoginFlow();
