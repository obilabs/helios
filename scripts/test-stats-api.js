async function testStatsAPI() {
  try {
    // First login to get a valid token
    const loginResponse = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'jack@gridwrx.io',
        password: 'P@ssw0rd123!'
      })
    });

    const loginData = await loginResponse.json();
    console.log('Login response:', JSON.stringify(loginData, null, 2));

    if (!loginData.success || !loginData.data?.tokens?.accessToken) {
      console.error('Login failed');
      return;
    }

    const token = loginData.data.tokens.accessToken;

    // Now call the stats API
    const statsResponse = await fetch('http://localhost:3001/api/organization/stats', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const statsData = await statsResponse.json();
    console.log('\n=== Stats API Response ===');
    console.log(JSON.stringify(statsData, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

testStatsAPI();
