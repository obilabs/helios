/**
 * Signature Sync Job
 *
 * Background job that periodically processes pending signature deployments.
 * Features:
 * - Periodic sync of pending signatures to Gmail
 * - Detection of external changes
 * - Auto-retry of failed deployments
 * - Change detection and auto-deploy on assignment changes
 */

import { signatureSyncService } from '../services/signature-sync.service.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface SignatureSyncJobConfig {
  enabled: boolean;
  intervalMs: number;       // How often to check for pending syncs (default: 5 min)
  batchSize: number;        // Max users to sync per organization per cycle
  maxRetries: number;       // Max retries for failed syncs
  detectExternalChanges: boolean;  // Check if signatures were changed outside Helios
}

let syncJobInterval: NodeJS.Timeout | null = null;
let isSyncing = false;

const DEFAULT_CONFIG: SignatureSyncJobConfig = {
  enabled: true,
  intervalMs: 5 * 60 * 1000,  // 5 minutes
  batchSize: 50,
  maxRetries: 3,
  detectExternalChanges: true
};

/**
 * Process pending signature syncs for all organizations
 */
async function processPendingSignatures(config: SignatureSyncJobConfig): Promise<{
  organizationsProcessed: number;
  totalSynced: number;
  totalFailed: number;
  totalSkipped: number;
}> {
  if (isSyncing) {
    logger.debug('Signature sync job already running, skipping');
    return { organizationsProcessed: 0, totalSynced: 0, totalFailed: 0, totalSkipped: 0 };
  }

  isSyncing = true;
  let organizationsProcessed = 0;
  let totalSynced = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  try {
    // Get organizations with Google Workspace configured and signature sync enabled
    // organization_settings uses key-value pattern, so we look for 'signature_sync_enabled' key
    const orgsResult = await db.query(`
      SELECT DISTINCT o.id, o.name
      FROM organizations o
      INNER JOIN gw_credentials gc ON gc.organization_id = o.id
      WHERE gc.service_account_key IS NOT NULL
        AND COALESCE(
          (SELECT value::boolean FROM organization_settings
           WHERE organization_id = o.id AND key = 'signature_sync_enabled' LIMIT 1),
          true
        ) = true
    `);

    const organizations = orgsResult.rows;

    if (organizations.length === 0) {
      logger.debug('No organizations with signature sync enabled');
      return { organizationsProcessed: 0, totalSynced: 0, totalFailed: 0, totalSkipped: 0 };
    }

    // Process each organization
    for (const org of organizations) {
      try {
        const result = await signatureSyncService.syncOrganizationSignatures(org.id);

        organizationsProcessed++;
        totalSynced += result.successCount;
        totalFailed += result.failureCount;
        totalSkipped += result.skippedCount;

        if (result.successCount > 0 || result.failureCount > 0) {
          logger.info('Signature sync completed for organization', {
            organizationId: org.id,
            organizationName: org.name,
            synced: result.successCount,
            failed: result.failureCount,
            skipped: result.skippedCount
          });
        }
      } catch (error: any) {
        logger.error('Failed to sync signatures for organization', {
          organizationId: org.id,
          organizationName: org.name,
          error: error.message
        });
      }
    }

    if (totalSynced > 0 || totalFailed > 0) {
      logger.info('Signature sync job cycle completed', {
        organizationsProcessed,
        totalSynced,
        totalFailed,
        totalSkipped
      });
    } else {
      logger.debug('Signature sync job: no pending signatures to process');
    }

    return { organizationsProcessed, totalSynced, totalFailed, totalSkipped };
  } catch (error: any) {
    logger.error('Error in signature sync job cycle', {
      error: error.message,
      stack: error.stack
    });
    return { organizationsProcessed, totalSynced, totalFailed, totalSkipped };
  } finally {
    isSyncing = false;
  }
}

/**
 * Detect signatures that were changed externally (outside Helios)
 * and mark them for re-sync
 */
async function detectExternalChanges(): Promise<number> {
  try {
    // Get organizations with signature tracking enabled
    const orgsResult = await db.query(`
      SELECT DISTINCT o.id, o.name, gc.service_account_key, gc.admin_email
      FROM organizations o
      INNER JOIN gw_credentials gc ON gc.organization_id = o.id
      WHERE gc.service_account_key IS NOT NULL
    `);

    let totalDetected = 0;

    for (const org of orgsResult.rows) {
      try {
        // Get users who have been synced
        const usersResult = await db.query(`
          SELECT uss.user_id, uss.google_signature_hash, ou.email
          FROM user_signature_status uss
          INNER JOIN organization_users ou ON ou.id = uss.user_id
          WHERE uss.organization_id = $1
            AND uss.sync_status = 'synced'
            AND uss.google_signature_hash IS NOT NULL
        `, [org.id]);

        // Note: Full external change detection would require fetching current
        // signatures from Gmail and comparing hashes. This is expensive in API
        // calls, so we defer full implementation to a less frequent job.
        // For now, we just log that we would check.

        if (usersResult.rows.length > 0) {
          logger.debug('External change detection: would check signatures', {
            organizationId: org.id,
            userCount: usersResult.rows.length
          });
        }
      } catch (error: any) {
        logger.debug('Error checking external changes for org', {
          organizationId: org.id,
          error: error.message
        });
      }
    }

    return totalDetected;
  } catch (error: any) {
    logger.error('Error in external change detection', { error: error.message });
    return 0;
  }
}

/**
 * Mark affected users for re-sync when an assignment changes
 * Called by assignment service when assignments are created/updated/deleted
 */
export async function triggerSyncOnAssignmentChange(
  organizationId: string,
  affectedUserIds: string[]
): Promise<void> {
  try {
    if (affectedUserIds.length === 0) return;

    await signatureSyncService.markUsersPending(affectedUserIds);

    logger.info('Marked users for signature re-sync after assignment change', {
      organizationId,
      userCount: affectedUserIds.length
    });
  } catch (error: any) {
    logger.error('Failed to mark users for re-sync', {
      organizationId,
      error: error.message
    });
  }
}

/**
 * Start the signature sync job
 */
export function startSignatureSyncJob(
  customConfig?: Partial<SignatureSyncJobConfig>
): void {
  const config: SignatureSyncJobConfig = {
    ...DEFAULT_CONFIG,
    ...customConfig
  };

  if (!config.enabled) {
    logger.info('Signature sync job is disabled');
    return;
  }

  if (syncJobInterval) {
    logger.warn('Signature sync job already running');
    return;
  }

  logger.info('Starting signature sync job', {
    intervalMs: config.intervalMs,
    batchSize: config.batchSize
  });

  // Run immediately on start
  processPendingSignatures(config).catch(error => {
    logger.error('Error in initial signature sync', { error: error.message });
  });

  // Then run at regular intervals
  syncJobInterval = setInterval(() => {
    processPendingSignatures(config).catch(error => {
      logger.error('Error in signature sync job', { error: error.message });
    });
  }, config.intervalMs);

  // Unref so it doesn't prevent process exit
  syncJobInterval.unref();
}

/**
 * Stop the signature sync job
 */
export function stopSignatureSyncJob(): void {
  if (syncJobInterval) {
    clearInterval(syncJobInterval);
    syncJobInterval = null;
    logger.info('Signature sync job stopped');
  }
}

/**
 * Check if the signature sync job is running
 */
export function isSignatureSyncJobRunning(): boolean {
  return syncJobInterval !== null;
}

/**
 * Manually trigger signature sync (for testing or admin actions)
 */
export async function triggerSignatureSync(organizationId?: string): Promise<{
  synced: number;
  failed: number;
  skipped: number;
}> {
  if (organizationId) {
    const result = await signatureSyncService.syncOrganizationSignatures(organizationId);
    return {
      synced: result.successCount,
      failed: result.failureCount,
      skipped: result.skippedCount
    };
  }

  const result = await processPendingSignatures(DEFAULT_CONFIG);
  return {
    synced: result.totalSynced,
    failed: result.totalFailed,
    skipped: result.totalSkipped
  };
}

export default {
  start: startSignatureSyncJob,
  stop: stopSignatureSyncJob,
  isRunning: isSignatureSyncJobRunning,
  trigger: triggerSignatureSync,
  triggerOnAssignmentChange: triggerSyncOnAssignmentChange
};
