/**
 * Scheduled Action Processor
 *
 * Background job that processes scheduled user lifecycle actions.
 * Runs periodically to check for pending actions that are due for execution.
 */

import { scheduledActionService } from '../services/scheduled-action.service.js';
import { logger } from '../utils/logger.js';

interface ProcessorConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  maxRetries: number;
}

let processorInterval: NodeJS.Timeout | null = null;
let isProcessing = false;

const DEFAULT_CONFIG: ProcessorConfig = {
  enabled: true,
  intervalMs: 60000, // 1 minute
  batchSize: 10,
  maxRetries: 3
};

/**
 * Process pending scheduled actions
 */
async function processActions(config: ProcessorConfig): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  if (isProcessing) {
    logger.debug('Scheduled action processor already running, skipping');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  isProcessing = true;
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    logger.debug('Starting scheduled action processing cycle');

    // Process pending actions across all organizations
    // The service method handles fetching due actions and executing them
    const result = await scheduledActionService.processPendingActions(config.batchSize);

    processed = result.processed;
    succeeded = result.succeeded;
    failed = result.failed;

    if (processed > 0) {
      logger.info('Scheduled action processing cycle completed', {
        processed,
        succeeded,
        failed
      });
    } else {
      logger.debug('No scheduled actions to process');
    }

    return { processed, succeeded, failed };
  } catch (error: any) {
    logger.error('Error in scheduled action processing cycle', {
      error: error.message,
      stack: error.stack
    });
    return { processed, succeeded, failed };
  } finally {
    isProcessing = false;
  }
}

/**
 * Start the scheduled action processor
 */
export function startScheduledActionProcessor(
  customConfig?: Partial<ProcessorConfig>
): void {
  const config: ProcessorConfig = {
    ...DEFAULT_CONFIG,
    ...customConfig
  };

  if (!config.enabled) {
    logger.info('Scheduled action processor is disabled');
    return;
  }

  if (processorInterval) {
    logger.warn('Scheduled action processor already running');
    return;
  }

  logger.info('Starting scheduled action processor', {
    intervalMs: config.intervalMs,
    batchSize: config.batchSize
  });

  // Run immediately on start
  processActions(config).catch(error => {
    logger.error('Error in initial scheduled action processing', { error: error.message });
  });

  // Then run at regular intervals
  processorInterval = setInterval(() => {
    processActions(config).catch(error => {
      logger.error('Error in scheduled action processing', { error: error.message });
    });
  }, config.intervalMs);

  // Ensure interval is unref'd so it doesn't prevent process exit
  processorInterval.unref();
}

/**
 * Stop the scheduled action processor
 */
export function stopScheduledActionProcessor(): void {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
    logger.info('Scheduled action processor stopped');
  }
}

/**
 * Check if the processor is currently running
 */
export function isScheduledActionProcessorRunning(): boolean {
  return processorInterval !== null;
}

/**
 * Manually trigger processing (for testing or admin actions)
 */
export async function triggerProcessing(batchSize?: number): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  return processActions({
    ...DEFAULT_CONFIG,
    batchSize: batchSize || DEFAULT_CONFIG.batchSize
  });
}

export default {
  start: startScheduledActionProcessor,
  stop: stopScheduledActionProcessor,
  isRunning: isScheduledActionProcessorRunning,
  trigger: triggerProcessing
};
