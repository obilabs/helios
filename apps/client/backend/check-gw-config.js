const fs = require('fs');
const { google } = require('googleapis');

async function testGoogleWorkspace() {
  try {
    // Load your service account
    const serviceAccountKey = JSON.parse(fs.readFileSync('./temp-sa.json', 'utf8'));

    console.log('🔍 Service Account Details:');
    console.log('Project ID:', serviceAccountKey.project_id);
    console.log('Client Email:', serviceAccountKey.client_email);
    console.log('Client ID:', serviceAccountKey.client_id);
    console.log('');

    // Create JWT client with domain-wide delegation
    const jwtClient = new google.auth.JWT({
      email: serviceAccountKey.client_email,
      key: serviceAccountKey.private_key,
      scopes: ['https://www.googleapis.com/auth/admin.directory.user.readonly'],
      subject: 'mike@gridworx.io' // Admin email to impersonate
    });

    // Test authentication
    console.log('🔑 Testing authentication with DWD...');
    await jwtClient.authorize();
    console.log('✅ Authentication successful!');

    // Try to list users
    const admin = google.admin({ version: 'directory_v1', auth: jwtClient });
    console.log('\n📋 Attempting to list users from gridworx.io...');

    const response = await admin.users.list({
      domain: 'gridworx.io',
      maxResults: 5
    });

    if (response.data.users) {
      console.log(`✅ Found ${response.data.users.length} users:`);
      response.data.users.forEach(user => {
        console.log(`  - ${user.primaryEmail} (${user.name.fullName})`);
      });
    } else {
      console.log('⚠️ No users found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('unauthorized_client')) {
      console.log('\n📝 To fix this error:');
      console.log('1. Go to https://admin.google.com/ac/owl/domainwidedelegation');
      console.log('2. Add client ID: 100076217128097286865');
      console.log('3. Add these scopes:');
      console.log('   - https://www.googleapis.com/auth/admin.directory.user');
      console.log('   - https://www.googleapis.com/auth/admin.directory.group');
      console.log('   - https://www.googleapis.com/auth/admin.directory.orgunit');
    } else if (error.message.includes('Not a valid email')) {
      console.log('\n⚠️ The admin email "mike@gridworx.io" might not be a super admin.');
      console.log('Please ensure this account has super admin privileges in Google Workspace.');
    }
  }
}

testGoogleWorkspace();