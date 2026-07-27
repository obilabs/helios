const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'helios_client',
  user: 'postgres',
  password: 'postgres'
});

async function updateJackPassword() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Generate new password hash
    const password = 'TestPassword123!';
    const passwordHash = await bcrypt.hash(password, 12);

    console.log('🔐 Generated password hash:', passwordHash);
    console.log('   Hash length:', passwordHash.length);

    // Update Jack's password using parameterized query
    const result = await client.query(
      'UPDATE organization_users SET password_hash = $1 WHERE email = $2 RETURNING email, LENGTH(password_hash) as hash_length',
      [passwordHash, 'jack@gridwrx.io']
    );

    console.log('✅ Password updated successfully!');
    console.log('   Email:', result.rows[0].email);
    console.log('   Hash length in DB:', result.rows[0].hash_length);

    // Verify the hash can be validated
    const verify = await client.query(
      'SELECT password_hash FROM organization_users WHERE email = $1',
      ['jack@gridwrx.io']
    );

    const storedHash = verify.rows[0].password_hash;
    const isValid = await bcrypt.compare(password, storedHash);

    console.log('\n🔍 Verification:');
    console.log('   Stored hash:', storedHash);
    console.log('   Stored hash length:', storedHash.length);
    console.log('   Password validation:', isValid ? '✅ SUCCESS' : '❌ FAILED');

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

updateJackPassword();
