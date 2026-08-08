// Quick test script for Labels API
const fetch = require('node-fetch');

async function testLabelsAPI() {
  try {
    // Login first
    console.log('1. Logging in...');
    const loginRes = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jack@gridwrx.io',
        password: 'TestPassword123!'
      })
    });

    const loginData = await loginRes.json();
    if (!loginData.success) {
      console.error('Login failed:', loginData);
      return;
    }

    const token = loginData.data.tokens.accessToken;
    console.log('✓ Login successful');

    // Test GET /api/organization/labels
    console.log('\n2. Fetching labels...');
    const labelsRes = await fetch('http://localhost:3001/api/organization/labels', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const labelsData = await labelsRes.json();
    console.log('✓ Labels response:', JSON.stringify(labelsData, null, 2));

    // Test GET /api/organization/available-entities
    console.log('\n3. Fetching available entities...');
    const entitiesRes = await fetch('http://localhost:3001/api/organization/available-entities', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const entitiesData = await entitiesRes.json();
    console.log('✓ Available entities:', JSON.stringify(entitiesData, null, 2));

    // Test GET /api/organization/labels/with-availability
    console.log('\n4. Fetching labels with availability...');
    const withAvailRes = await fetch('http://localhost:3001/api/organization/labels/with-availability', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const withAvailData = await withAvailRes.json();
    console.log('✓ Labels with availability:', JSON.stringify(withAvailData, null, 2));

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testLabelsAPI();
