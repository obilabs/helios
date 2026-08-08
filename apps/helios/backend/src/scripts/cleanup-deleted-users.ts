/**
 * Database Cleanup Script: Remove Stale Deleted Users
 *
 * This script removes users that were synced from Google Workspace
 * but are now deleted in Google. Run this before doing a fresh sync
 * after the deleted users fix.
 *
 * Usage:
 *   npx ts-node src/scripts/cleanup-deleted-users.ts <organization-id>
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

async function cleanupDeletedUsers(organizationId: string) {
  try {
    logger.info('Starting cleanup of deleted users', { organizationId });

    // Step 1: Get counts before cleanup
    const beforeCounts = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = $1) as gw_synced,
        (SELECT COUNT(*) FROM organization_users WHERE organization_id = $1 AND google_workspace_id IS NOT NULL) as org_users_from_google,
        (SELECT COUNT(*) FROM organization_users WHERE organization_id = $1 AND google_workspace_id IS NULL) as org_users_local
      FROM (SELECT 1) AS dummy
    `, [organizationId]);

    const before = beforeCounts.rows[0];
    logger.info('Current counts', {
      gwSynced: before.gw_synced,
      orgUsersFromGoogle: before.org_users_from_google,
      orgUsersLocal: before.org_users_local
    });

    console.log('\n=== BEFORE CLEANUP ===');
    console.log(`Google Workspace synced users (gw_synced_users): ${before.gw_synced}`);
    console.log(`Organization users from Google: ${before.org_users_from_google}`);
    console.log(`Organization users (local only): ${before.org_users_local}`);

    // Step 2: Clear gw_synced_users table (safe - will be repopulated on next sync)
    console.log('\n=== STEP 1: Clearing Google Workspace cache ===');
    const deleteGwSynced = await db.query(
      'DELETE FROM gw_synced_users WHERE organization_id = $1',
      [organizationId]
    );
    logger.info('Cleared gw_synced_users', { deletedCount: deleteGwSynced.rowCount });
    console.log(`✅ Deleted ${deleteGwSynced.rowCount} records from gw_synced_users`);

    // Step 3: Delete audit logs for Google Workspace users first (to avoid FK constraint)
    console.log('\n=== STEP 2: Removing audit logs for Google users ===');
    const deleteAuditLogs = await db.query(`
      DELETE FROM audit_logs
      WHERE user_id IN (
        SELECT id FROM organization_users
        WHERE organization_id = $1
          AND google_workspace_id IS NOT NULL
      )
    `, [organizationId]);
    logger.info('Deleted audit logs for Google users', { deletedCount: deleteAuditLogs.rowCount });
    console.log(`✅ Deleted ${deleteAuditLogs.rowCount} audit log entries (for Google synced users)`);

    // Step 4: Delete organization_users that came from Google Workspace
    console.log('\n=== STEP 3: Removing organization users synced from Google ===');
    console.log('⚠️  WARNING: This will delete users that were synced from Google Workspace');
    console.log('⚠️  Local Helios portal users (not from Google) will be preserved');

    const deleteOrgUsers = await db.query(`
      DELETE FROM organization_users
      WHERE organization_id = $1
        AND google_workspace_id IS NOT NULL
    `, [organizationId]);

    logger.info('Deleted organization_users from Google', { deletedCount: deleteOrgUsers.rowCount });
    console.log(`✅ Deleted ${deleteOrgUsers.rowCount} organization users (from Google sync)`);

    // Step 4: Show final counts
    const afterCounts = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = $1) as gw_synced,
        (SELECT COUNT(*) FROM organization_users WHERE organization_id = $1 AND google_workspace_id IS NOT NULL) as org_users_from_google,
        (SELECT COUNT(*) FROM organization_users WHERE organization_id = $1 AND google_workspace_id IS NULL) as org_users_local
      FROM (SELECT 1) AS dummy
    `, [organizationId]);

    const after = afterCounts.rows[0];

    console.log('\n=== AFTER CLEANUP ===');
    console.log(`Google Workspace synced users (gw_synced_users): ${after.gw_synced}`);
    console.log(`Organization users from Google: ${after.org_users_from_google}`);
    console.log(`Organization users (local only): ${after.org_users_local}`);

    console.log('\n=== SUMMARY ===');
    console.log(`✅ Cleanup completed successfully`);
    console.log(`📊 Removed ${deleteGwSynced.rowCount} Google Workspace cache records`);
    console.log(`📊 Removed ${deleteOrgUsers.rowCount} organization users (from Google)`);
    console.log(`📊 Preserved ${after.org_users_local} local Helios users`);

    console.log('\n⚡ NEXT STEPS:');
    console.log('1. Restart the backend server to pick up the deleted users fix');
    console.log('2. Click "Sync Now" in the dashboard to pull fresh data from Google');
    console.log('3. Verify the counts match your Google Workspace Admin Console');

    logger.info('Cleanup completed', {
      gwSyncedRemoved: deleteGwSynced.rowCount,
      orgUsersRemoved: deleteOrgUsers.rowCount,
      localUsersPreserved: after.org_users_local
    });

  } catch (error: any) {
    logger.error('Cleanup failed', { organizationId, error: error.message });
    console.error('\n❌ ERROR:', error.message);
    throw error;
  } finally {
    await db.close();
  }
}

// Main execution
const organizationId = process.argv[2];

if (!organizationId) {
  console.error('Usage: npx ts-node src/scripts/cleanup-deleted-users.ts <organization-id>');
  console.error('\nTo find your organization ID:');
  console.error('  SELECT id, name FROM organizations;');
  process.exit(1);
}

// Validate UUID format
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!uuidRegex.test(organizationId)) {
  console.error('❌ Invalid organization ID format. Must be a UUID.');
  console.error('Example: 123e4567-e89b-12d3-a456-426614174000');
  process.exit(1);
}

console.log('╔════════════════════════════════════════════════════════════╗');
console.log('║   HELIOS - Deleted Users Cleanup Script                   ║');
console.log('╚════════════════════════════════════════════════════════════╝');
console.log(`\nOrganization ID: ${organizationId}`);
console.log('This script will remove stale user data from the database.');
console.log('\n⚠️  CAUTION: This operation cannot be undone!');
console.log('⚠️  Make sure you have a database backup before proceeding.\n');

// Run cleanup
cleanupDeletedUsers(organizationId)
  .then(() => {
    console.log('\n✅ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
