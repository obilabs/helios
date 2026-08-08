import { Job } from 'bull';
import { queueService, BulkOperationJobData } from '../services/queue.service.js';
import { bulkOperationsService } from '../services/bulk-operations.service.js';
import { logger } from '../utils/logger.js';

/**
 * Bulk operation worker
 * Processes bulk operation jobs from the queue
 */
export class BulkOperationWorker {
  private isRunning = false;

  /**
   * Start the worker
   */
  public start(): void {
    if (this.isRunning) {
      logger.warn('Bulk operation worker is already running');
      return;
    }

    const queue = queueService.getBulkOperationQueue();

    queue.process(async (job: Job<BulkOperationJobData>) => {
      logger.info('Processing bulk operation job', {
        jobId: job.id,
        bulkOperationId: job.data.bulkOperationId,
        operationType: job.data.operationType,
        itemCount: job.data.items.length,
      });

      try {
        // Process the bulk operation with progress callback
        const result = await bulkOperationsService.processBulkOperation(
          job.data.bulkOperationId,
          (progress) => {
            // Update job progress
            job.progress(progress);
          }
        );

        logger.info('Bulk operation job completed', {
          jobId: job.id,
          bulkOperationId: job.data.bulkOperationId,
          successCount: result.successCount,
          failureCount: result.failureCount,
        });

        return result;
      } catch (error: any) {
        logger.error('Bulk operation job failed', {
          jobId: job.id,
          bulkOperationId: job.data.bulkOperationId,
          error: error.message,
          stack: error.stack,
        });

        throw error;
      }
    });

    this.isRunning = true;
    logger.info('Bulk operation worker started');
  }

  /**
   * Stop the worker
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Bulk operation worker is not running');
      return;
    }

    await queueService.close();
    this.isRunning = false;
    logger.info('Bulk operation worker stopped');
  }
}

export const bulkOperationWorker = new BulkOperationWorker();

// Auto-start the worker if this file is run directly
if (require.main === module) {
  bulkOperationWorker.start();

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, stopping worker...');
    await bulkOperationWorker.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, stopping worker...');
    await bulkOperationWorker.stop();
    process.exit(0);
  });
}
