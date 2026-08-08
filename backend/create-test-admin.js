const { Client } = require('pg');
const bcrypt = require('bcrypt');

const client = new Client({
  host: 'localhost',
  port: 5432,
  database: 'helios',
  user: 'postgres',
  password: 'postgres'
});

async function createTestAdmin() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Get organization ID
    const orgResult = await client.query('SELECT id FROM organizations LIMIT 1');
    if (orgResult.rows.length === 0) {
      console.log('❌ No organization found');
      process.exit(1);
    }
    const organizationId = orgResult.rows[0].id;
    console.log(`📊 Organization ID: ${organizationId}`);

    // Check if test admin already exists
    const existingUser = await client.query(
      'SELECT id, email FROM organization_users WHERE email = $1',
      ['admin@test.local']
    );

    if (existingUser.rows.length > 0) {
      console.log('⚠️  Test admin already exists: admin@test.local');
      console.log('   Password: ***REMOVED-CREDENTIAL***');
      process.exit(0);
    }

    // Hash password
    const password = '***REMOVED-CREDENTIAL***';
    const passwordHash = await bcrypt.hash(password, 12);

    // Create test admin
    const result = await client.query(
      `INSERT INTO organization_users (
        id, organization_id, email, password_hash,
        first_name, last_name, role, is_active, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, true, NOW()
      ) RETURNING id, email, first_name, last_name`,
      [organizationId, 'admin@test.local', passwordHash, 'Test', 'Admin', 'admin']
    );

    console.log('✅ Test admin created successfully!');
    console.log('   Email: admin@test.local');
    console.log('   Password: ***REMOVED-CREDENTIAL***');
    console.log('   Name:', result.rows[0].first_name, result.rows[0].last_name);

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestAdmin();
