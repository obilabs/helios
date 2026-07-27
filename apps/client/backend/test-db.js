const { Client } = require('pg');

// Read from environment or use defaults
const client = new Client({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'helios_client',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres'
});

client.connect()
  .then(() => {
    console.log('✅ Successfully connected to PostgreSQL database');
    return client.query('SELECT COUNT(*) as count FROM organizations');
  })
  .then(result => {
    console.log('✅ Organizations table exists');
    console.log(`   Found ${result.rows[0].count} organizations`);
    if (result.rows[0].count > 0) {
      console.log('   → You should see the LOGIN screen');
    } else {
      console.log('   → You should see the ONBOARDING/SETUP screen');
    }
    client.end();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
    console.log('   → You will see the ONBOARDING/SETUP screen (this is correct when DB is not available)');
    process.exit(1);
  });