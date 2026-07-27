/**
 * Script to set Jack's password to a known value for testing
 * Run with: node set-jack-password.js
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'helios_client',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function setJackPassword() {
  console.log('🔐 Setting Jack\'s password...\n');

  try {
    // Find Jack
    const userResult = await pool.query(
      'SELECT id, email, first_name, last_name FROM organization_users WHERE email = $1',
      ['jack@gridworx.io']
    );

    if (userResult.rows.length === 0) {
      console.error('❌ User jack@gridworx.io not found!');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log('✅ Found user:', user.email);
    console.log('   Name:', `${user.first_name} ${user.last_name}`);
    console.log('   ID:', user.id);

    // Hash the new password
    const newPassword = 'Password123!';
    const hash = await bcrypt.hash(newPassword, 12);

    console.log('\n🔒 Hashing password...');
    console.log('   Password:', newPassword);

    // Update password
    await pool.query(
      'UPDATE organization_users SET password_hash = $1 WHERE id = $2',
      [hash, user.id]
    );

    console.log('\n✅ Password updated successfully!');
    console.log('\nTest credentials:');
    console.log('  Email:', user.email);
    console.log('  Password:', newPassword);
    console.log('\nYou can now login with these credentials.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setJackPassword();
