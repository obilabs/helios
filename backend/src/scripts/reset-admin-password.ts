/**
 * Reset Admin Password Script
 * Sets password for admin@gridworx.io to "admin123"
 */
import { db } from '../database/connection.js';
import bcrypt from 'bcryptjs';

async function resetAdminPassword() {
  try {
    console.log('🔐 Resetting admin password...');

    // Find admin user
    const adminResult = await db.query(
      `SELECT id, email, first_name, last_name FROM organization_users WHERE email = $1`,
      ['mike@gridworx.io']
    );

    if (adminResult.rows.length === 0) {
      console.error('❌ Admin user not found!');
      process.exit(1);
    }

    const admin = adminResult.rows[0];
    console.log(`✓ Found admin: ${admin.email} (${admin.first_name} ${admin.last_name})`);

    // Hash new password
    const newPassword = 'admin123';
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await db.query(
      `UPDATE organization_users SET password_hash = $1, is_active = true WHERE id = $2`,
      [passwordHash, admin.id]
    );

    console.log('✅ Password reset successfully!');
    console.log('');
    console.log('Login credentials:');
    console.log(`  Email: ${admin.email}`);
    console.log(`  Password: ${newPassword}`);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetAdminPassword();
