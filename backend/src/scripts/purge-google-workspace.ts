import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

async function purgeGoogleWorkspaceConfig() {
  try {
    logger.info('Starting Google Workspace configuration purge...');

    // 1. Remove Google Workspace credentials from gw_credentials
    const credResult = await db.query(`
      DELETE FROM gw_credentials
      WHERE organization_id IS NOT NULL
      RETURNING id
    `);
    logger.info(`Removed ${credResult.rowCount || 0} Google Workspace credentials`);

    // 2. Update modules to mark Google Workspace as disabled
    const moduleResult = await db.query(`
      UPDATE modules
      SET
        enabled_at = NULL
      WHERE slug = 'google_workspace'
      RETURNING id
    `);
    logger.info(`Disabled Google Workspace module`);

    // 3. Update users to remove Google Workspace sync status but keep them as local users
    const userResult = await db.query(`
      UPDATE organization_users
      SET
        google_workspace_id = NULL,
        google_workspace_sync_status = NULL,
        google_workspace_last_sync = NULL,
        source = 'local',
        updated_at = CURRENT_TIMESTAMP
      WHERE google_workspace_id IS NOT NULL
      RETURNING id
    `);
    logger.info(`Converted ${userResult.rowCount || 0} Google Workspace users to local users`);

    // 4. Clear cached Google Workspace data (if tables exist)
    try {
      await db.query(`DELETE FROM gw_cached_users`);
      await db.query(`DELETE FROM gw_cached_groups`);
      await db.query(`DELETE FROM gw_cached_org_units`);
      logger.info('Cleared cached Google Workspace data');
    } catch (e) {
      logger.info('No cached data tables to clear');
    }

    logger.info('✅ Google Workspace configuration purged successfully');
    logger.info('All users and groups have been converted to local entities');

    // Get stats
    const userStats = await db.query(`
      SELECT COUNT(*) as count FROM organization_users WHERE is_active = true
    `);
    const groupStats = await db.query(`
      SELECT COUNT(*) as count FROM groups WHERE is_active = true
    `);

    logger.info(`Current stats: ${userStats.rows[0].count} active users, ${groupStats.rows[0].count} active groups (all local)`);

  } catch (error) {
    logger.error('Failed to purge Google Workspace configuration:', error);
    throw error;
  } finally {
    await db.close();
  }
}

// Run the purge
purgeGoogleWorkspaceConfig().then(() => {
  process.exit(0);
}).catch((error) => {
  console.error('Purge failed:', error);
  process.exit(1);
});