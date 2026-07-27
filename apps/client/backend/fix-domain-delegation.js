const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function showDelegationFix() {
  console.log('='.repeat(80));
  console.log('🔧 GOOGLE WORKSPACE DOMAIN-WIDE DELEGATION FIX');
  console.log('='.repeat(80));

  try {
    // Get credentials from database
    const result = await pool.query('SELECT * FROM gw_credentials LIMIT 1');

    if (result.rows.length === 0) {
      console.log('❌ No credentials found in database');
      return;
    }

    const row = result.rows[0];
    const serviceAccount = JSON.parse(row.service_account_key);

    console.log('\n📋 STEP-BY-STEP FIX:\n');

    console.log('1️⃣  Open Google Admin Console:');
    console.log('    https://admin.google.com/ac/owl/domainwidedelegation\n');

    console.log('2️⃣  Look for this Client ID in the list:');
    console.log(`    ${serviceAccount.client_id}\n`);

    console.log('3️⃣  If it exists, click "Edit". If not, click "Add new"\n');

    console.log('4️⃣  In the Client ID field, paste:');
    console.log(`    ${serviceAccount.client_id}\n`);

    console.log('5️⃣  In the OAuth Scopes field, paste EXACTLY these scopes (all on one line):');
    console.log('    https://www.googleapis.com/auth/admin.directory.user,https://www.googleapis.com/auth/admin.directory.group,https://www.googleapis.com/auth/admin.directory.orgunit,https://www.googleapis.com/auth/admin.directory.domain,https://www.googleapis.com/auth/admin.reports.audit.readonly\n');

    console.log('    OR paste them one per line:');
    console.log('    https://www.googleapis.com/auth/admin.directory.user');
    console.log('    https://www.googleapis.com/auth/admin.directory.group');
    console.log('    https://www.googleapis.com/auth/admin.directory.orgunit');
    console.log('    https://www.googleapis.com/auth/admin.directory.domain');
    console.log('    https://www.googleapis.com/auth/admin.reports.audit.readonly\n');

    console.log('6️⃣  Click "Authorize"\n');

    console.log('7️⃣  Wait 1-2 minutes for changes to propagate\n');

    console.log('8️⃣  Go back to Helios and try "Test Connection" or "Sync"\n');

    console.log('='.repeat(80));
    console.log('⚠️  IMPORTANT NOTES:');
    console.log('='.repeat(80));

    console.log('\n✅ Your current configuration:');
    console.log(`   Domain: ${row.domain}`);
    console.log(`   Admin Email: ${row.admin_email}`);
    console.log(`   Service Account: ${serviceAccount.client_email}`);
    console.log(`   Project: ${serviceAccount.project_id}`);

    console.log('\n❗ Common mistakes to avoid:');
    console.log('   - Don\'t use .readonly versions of scopes (except for reports.audit)');
    console.log('   - Make sure ALL 5 scopes are added');
    console.log('   - Ensure you click "Authorize" after adding scopes');
    console.log('   - The admin email must be a Super Admin');

    console.log('\n🔍 If it still doesn\'t work:');
    console.log('   - Remove the existing entry and add it again');
    console.log('   - Double-check the Client ID matches exactly');
    console.log('   - Verify mike@gridworx.io is still a Super Admin');
    console.log('   - Try a different Super Admin email if needed');

    console.log('\n='.repeat(80));

  } catch (error) {
    console.log('❌ ERROR:', error.message);
  } finally {
    await pool.end();
  }
}

// Run the fix guide
showDelegationFix().catch(console.error);