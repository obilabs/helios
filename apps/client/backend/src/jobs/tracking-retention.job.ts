/**
 * Tracking Data Retention Job
 *
 * Background job that purges old tracking events based on organization
 * retention settings. Runs daily at 3am to clean up expired data.
 *
 * Features:
 * - Per-organization retention settings (default: 90 days)
 * - Batch deletion to avoid lock contention
 * - Detailed logging of purged records
 * - Manual trigger support
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface RetentionJobConfig {
  enabled: boolean;
  batchSize: number;        // Records to delete per batch
  delayBetweenBatches: number;  // Ms to wait between batches
}

interface RetentionResult {
  organizationId: string;
  organizationName: string;
  retentionDays: number;
  deletedCount: number;
  error?: string;
}

interface JobResult {
  totalOrganizations: number;
  totalDeleted: number;
  results: RetentionResult[];
}

let retentionJobInterval: NodeJS.Timeout | null = null;
let isRunning = false;

const DEFAULT_CONFIG: RetentionJobConfig = {
  enabled: true,
  batchSize: 1000,
  delayBetweenBatches: 100,
};

const DEFAULT_RETENTION_DAYS = 90;

/**
 * Get retention days setting for an organization
 */
async function getOrganizationRetentionDays(organizationId: string): Promise<number> {
  try {
    const result = await db.query(
      `SELECT value FROM organization_settings
       WHERE organization_id = $1 AND key = 'tracking_retention_days'`,
      [organizationId]
    );

    if (result.rows.length > 0) {
      const days = parseInt(result.rows[0].value, 10);
      if (!isNaN(days) && days >= 7 && days <= 365) {
        return days;
      }
    }

    return DEFAULT_RETENTION_DAYS;
  } catch (error: any) {
    logger.warn('Failed to get retention setting, using default', {
      organizationId,
      error: error.message,
      defaultDays: DEFAULT_RETENTION_DAYS,
    });
    return DEFAULT_RETENTION_DAYS;
  }
}

/**
 * Purge old tracking events for a specific organization
 */
async function purgeOrganizationTrackingEvents(
  organizationId: string,
  retentionDays: number,
  config: RetentionJobConfig
): Promise<number> {
  let totalDeleted = 0;
  let batchCount = 0;

  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    // Delete in batches to avoid long locks
    while (true) {
      const result = await db.query(
        `DELETE FROM signature_tracking_events
         WHERE id IN (
           SELECT id FROM signature_tracking_events
           WHERE organization_id = $1
             AND timestamp < $2
           LIMIT $3
         )
         RETURNING id`,
        [organizationId, cutoffDate.toISOString(), config.batchSize]
      );

      const deletedInBatch = result.rowCount || 0;
      totalDeleted += deletedInBatch;
      batchCount++;

      if (deletedInBatch < config.batchSize) {
        // No more records to delete
        break;
      }

      // Brief delay between batches to reduce database load
      if (config.delayBetweenBatches > 0) {
        await new Promise(resolve => setTimeout(resolve, config.delayBetweenBatches));
      }
    }

    if (totalDeleted > 0) {
      logger.info('Purged old tracking events', {
        organizationId,
        retentionDays,
        deletedCount: totalDeleted,
        batches: batchCount,
      });
    }

    return totalDeleted;
  } catch (error: any) {
    logger.error('Failed to purge tracking events for organization', {
      organizationId,
      retentionDays,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Purge old tracking events for all organizations
 */
async function purgeAllOrganizations(config: RetentionJobConfig): Promise<JobResult> {
  if (isRunning) {
    logger.warn('Tracking retention job already running, skipping');
    return { totalOrganizations: 0, totalDeleted: 0, results: [] };
  }

  isRunning = true;
  const results: RetentionResult[] = [];
  let totalDeleted = 0;

  try {
    // Get all organizations
    const orgsResult = await db.query(`
      SELECT id, name FROM organizations
    `);

    const organizations = orgsResult.rows as { id: string; name: string }[];

    if (organizations.length === 0) {
      logger.debug('No organizations found for tracking retention');
      return { totalOrganizations: 0, totalDeleted: 0, results: [] };
    }

    // Process each organization
    for (const org of organizations) {
      try {
        const retentionDays = await getOrganizationRetentionDays(org.id);
        const deletedCount = await purgeOrganizationTrackingEvents(org.id, retentionDays, config);

        totalDeleted += deletedCount;
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          retentionDays,
          deletedCount,
        });
      } catch (error: any) {
        results.push({
          organizationId: org.id,
          organizationName: org.name,
          retentionDays: await getOrganizationRetentionDays(org.id),
          deletedCount: 0,
          error: error.message,
        });
      }
    }

    if (totalDeleted > 0) {
      logger.info('Tracking retention job completed', {
        totalOrganizations: organizations.length,
        totalDeleted,
      });
    } else {
      logger.debug('Tracking retention job: no old events to purge');
    }

    return {
      totalOrganizations: organizations.length,
      totalDeleted,
      results,
    };
  } catch (error: any) {
    logger.error('Error in tracking retention job', {
      error: error.message,
      stack: error.stack,
    });
    return { totalOrganizations: 0, totalDeleted: 0, results };
  } finally {
    isRunning = false;
  }
}

/**
 * Calculate milliseconds until next 3am
 */
function getMillisecondsUntil3am(): number {
  const now = new Date();
  const target = new Date(now);
  target.setHours(3, 0, 0, 0);

  // If it's already past 3am today, schedule for tomorrow
  if (now >= target) {
    target.setDate(target.getDate() + 1);
  }

  return target.getTime() - now.getTime();
}

/**
 * Schedule the retention job to run daily at 3am
 */
function scheduleNextRun(config: RetentionJobConfig): void {
  const delay = getMillisecondsUntil3am();
  const runTime = new Date(Date.now() + delay);

  logger.info('Scheduling tracking retention job', {
    nextRun: runTime.toISOString(),
    delayMs: delay,
  });

  retentionJobInterval = setTimeout(async () => {
    try {
      await purgeAllOrganizations(config);
    } catch (error: any) {
      logger.error('Error running tracking retention job', { error: error.message });
    }

    // Schedule the next run
    scheduleNextRun(config);
  }, delay);

  // Unref so it doesn't prevent process exit
  retentionJobInterval.unref();
}

/**
 * Start the tracking retention job
 */
export function startTrackingRetentionJob(
  customConfig?: Partial<RetentionJobConfig>
): void {
  const config: RetentionJobConfig = {
    ...DEFAULT_CONFIG,
    ...customConfig,
  };

  if (!config.enabled) {
    logger.info('Tracking retention job is disabled');
    return;
  }

  if (retentionJobInterval) {
    logger.warn('Tracking retention job already scheduled');
    return;
  }

  logger.info('Starting tracking retention job scheduler');

  // Schedule the daily run
  scheduleNextRun(config);
}

/**
 * Stop the tracking retention job
 */
export function stopTrackingRetentionJob(): void {
  if (retentionJobInterval) {
    clearTimeout(retentionJobInterval);
    retentionJobInterval = null;
    logger.info('Tracking retention job stopped');
  }
}

/**
 * Check if the retention job is scheduled
 */
export function isTrackingRetentionJobScheduled(): boolean {
  return retentionJobInterval !== null;
}

/**
 * Manually trigger retention job (for testing or admin actions)
 */
export async function triggerTrackingRetention(
  organizationId?: string
): Promise<JobResult | RetentionResult> {
  const config = DEFAULT_CONFIG;

  if (organizationId) {
    // Purge specific organization
    const org = await db.query(
      'SELECT id, name FROM organizations WHERE id = $1',
      [organizationId]
    );

    if (org.rows.length === 0) {
      throw new Error(`Organization not found: ${organizationId}`);
    }

    const retentionDays = await getOrganizationRetentionDays(organizationId);
    const deletedCount = await purgeOrganizationTrackingEvents(organizationId, retentionDays, config);

    return {
      organizationId,
      organizationName: org.rows[0].name,
      retentionDays,
      deletedCount,
    };
  }

  // Purge all organizations
  return purgeAllOrganizations(config);
}

/**
 * Get retention status for all organizations
 */
export async function getRetentionStatus(): Promise<{
  organizations: Array<{
    id: string;
    name: string;
    retentionDays: number;
    pendingPurge: number;
  }>;
}> {
  const orgsResult = await db.query(`
    SELECT id, name FROM organizations
  `);

  const organizations = [];

  for (const org of orgsResult.rows) {
    const retentionDays = await getOrganizationRetentionDays(org.id);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const pendingResult = await db.query(
      `SELECT COUNT(*)::integer as count FROM signature_tracking_events
       WHERE organization_id = $1 AND timestamp < $2`,
      [org.id, cutoffDate.toISOString()]
    );

    organizations.push({
      id: org.id,
      name: org.name,
      retentionDays,
      pendingPurge: pendingResult.rows[0].count,
    });
  }

  return { organizations };
}

export default {
  start: startTrackingRetentionJob,
  stop: stopTrackingRetentionJob,
  isScheduled: isTrackingRetentionJobScheduled,
  trigger: triggerTrackingRetention,
  getStatus: getRetentionStatus,
};
