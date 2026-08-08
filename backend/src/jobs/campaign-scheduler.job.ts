/**
 * Campaign Scheduler Job
 *
 * Background job that manages campaign lifecycle:
 * - Activates scheduled campaigns when start_date is reached
 * - Completes active campaigns when end_date is reached
 * - Triggers signature sync when campaigns change state
 */

import { signatureCampaignService } from '../services/signature-campaign.service.js';
import { signatureSyncService } from '../services/signature-sync.service.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

interface CampaignSchedulerConfig {
  enabled: boolean;
  intervalMs: number;  // How often to check campaign schedules (default: 1 min)
}

let schedulerInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

const DEFAULT_CONFIG: CampaignSchedulerConfig = {
  enabled: true,
  intervalMs: 60 * 1000,  // 1 minute
};

/**
 * Process campaign schedule changes
 */
async function processCampaignSchedules(): Promise<{
  activated: number;
  completed: number;
  errors: number;
}> {
  if (isProcessing) {
    logger.debug('Campaign scheduler already running, skipping');
    return { activated: 0, completed: 0, errors: 0 };
  }

  isProcessing = true;
  let activated = 0;
  let completed = 0;
  let errors = 0;

  try {
    // Activate scheduled campaigns that have reached their start date
    const toActivate = await signatureCampaignService.getCampaignsToActivate();

    for (const campaign of toActivate) {
      try {
        await signatureCampaignService.launchCampaign(campaign.id);
        activated++;

        logger.info('Activated scheduled campaign', {
          campaignId: campaign.id,
          name: campaign.name,
          organizationId: campaign.organizationId,
        });

        // Mark affected users for signature sync
        const affectedUsers = await signatureCampaignService.getCampaignAffectedUsers(campaign.id);
        if (affectedUsers.length > 0) {
          const userIds = affectedUsers.map(u => u.userId);
          await signatureSyncService.markUsersPending(userIds);

          logger.info('Marked users for signature sync after campaign activation', {
            campaignId: campaign.id,
            userCount: userIds.length,
          });
        }
      } catch (error) {
        errors++;
        logger.error('Failed to activate campaign', {
          campaignId: campaign.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Complete active campaigns that have reached their end date
    const toComplete = await signatureCampaignService.getCampaignsToComplete();

    for (const campaign of toComplete) {
      try {
        await signatureCampaignService.completeCampaign(campaign.id);
        completed++;

        logger.info('Completed campaign', {
          campaignId: campaign.id,
          name: campaign.name,
          organizationId: campaign.organizationId,
        });

        // If auto_revert is enabled, mark affected users for signature sync
        // so their signatures revert to the non-campaign version
        if (campaign.autoRevert) {
          const affectedUsers = await signatureCampaignService.getCampaignAffectedUsers(campaign.id);
          if (affectedUsers.length > 0) {
            const userIds = affectedUsers.map(u => u.userId);
            await signatureSyncService.markUsersPending(userIds);

            logger.info('Marked users for signature revert after campaign completion', {
              campaignId: campaign.id,
              userCount: userIds.length,
            });
          }
        }
      } catch (error) {
        errors++;
        logger.error('Failed to complete campaign', {
          campaignId: campaign.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    if (activated > 0 || completed > 0) {
      logger.info('Campaign scheduler cycle completed', {
        activated,
        completed,
        errors,
      });
    } else {
      logger.debug('Campaign scheduler: no campaigns to process');
    }

    return { activated, completed, errors };
  } catch (error) {
    logger.error('Error in campaign scheduler cycle', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { activated, completed, errors: errors + 1 };
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the campaign scheduler job
 */
export function startCampaignSchedulerJob(
  customConfig?: Partial<CampaignSchedulerConfig>
): void {
  const config: CampaignSchedulerConfig = {
    ...DEFAULT_CONFIG,
    ...customConfig,
  };

  if (!config.enabled) {
    logger.info('Campaign scheduler job is disabled');
    return;
  }

  if (schedulerInterval) {
    logger.warn('Campaign scheduler job already running');
    return;
  }

  logger.info('Starting campaign scheduler job', {
    intervalMs: config.intervalMs,
  });

  // Run immediately on start
  processCampaignSchedules().catch(error => {
    logger.error('Error in initial campaign scheduler run', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  });

  // Then run at regular intervals
  schedulerInterval = setInterval(() => {
    processCampaignSchedules().catch(error => {
      logger.error('Error in campaign scheduler job', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });
  }, config.intervalMs);

  // Unref so it doesn't prevent process exit
  schedulerInterval.unref();
}

/**
 * Stop the campaign scheduler job
 */
export function stopCampaignSchedulerJob(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Campaign scheduler job stopped');
  }
}

/**
 * Check if the campaign scheduler job is running
 */
export function isCampaignSchedulerJobRunning(): boolean {
  return schedulerInterval !== null;
}

/**
 * Manually trigger campaign schedule processing (for testing or admin actions)
 */
export async function triggerCampaignScheduleProcess(): Promise<{
  activated: number;
  completed: number;
  errors: number;
}> {
  return processCampaignSchedules();
}

export default {
  start: startCampaignSchedulerJob,
  stop: stopCampaignSchedulerJob,
  isRunning: isCampaignSchedulerJobRunning,
  trigger: triggerCampaignScheduleProcess,
};
