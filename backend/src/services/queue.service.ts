import Bull, { Queue, Job } from 'bull';
import { logger } from '../utils/logger.js';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379');

export interface BulkOperationJobData {
  bulkOperationId: string;
  organizationId: string;
  operationType: string;
  items: any[];
  options?: any;
}

export class QueueService {
  private static instance: QueueService;
  private bulkOperationQueue: Queue<BulkOperationJobData>;

  private constructor() {
    this.bulkOperationQueue = new Bull('bulk-operations', {
      redis: {
        host: REDIS_HOST,
        port: REDIS_PORT,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 500, // Keep last 500 failed jobs
      },
    });

    // Set up error handlers
    this.bulkOperationQueue.on('error', (error) => {
      logger.error('Bull queue error', { error: error.message });
    });

    this.bulkOperationQueue.on('failed', (job, error) => {
      logger.error('Job failed', {
        jobId: job.id,
        bulkOperationId: job.data.bulkOperationId,
        error: error.message,
      });
    });

    this.bulkOperationQueue.on('completed', (job) => {
      logger.info('Job completed', {
        jobId: job.id,
        bulkOperationId: job.data.bulkOperationId,
      });
    });

    logger.info('Queue service initialized', {
      redis: `${REDIS_HOST}:${REDIS_PORT}`,
    });
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * Add a bulk operation job to the queue
   */
  public async addBulkOperationJob(
    data: BulkOperationJobData,
    priority?: number
  ): Promise<Job<BulkOperationJobData>> {
    const job = await this.bulkOperationQueue.add(data, {
      priority: priority || 10,
      jobId: data.bulkOperationId, // Use bulk operation ID as job ID for idempotency
    });

    logger.info('Bulk operation job added to queue', {
      jobId: job.id,
      bulkOperationId: data.bulkOperationId,
      operationType: data.operationType,
      itemCount: data.items.length,
    });

    return job;
  }

  /**
   * Get job status
   */
  public async getJobStatus(jobId: string): Promise<any> {
    const job = await this.bulkOperationQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      returnValue: job.returnvalue,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    };
  }

  /**
   * Cancel a job
   */
  public async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.bulkOperationQueue.getJob(jobId);
    if (!job) {
      return false;
    }

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      return false;
    }

    await job.remove();
    logger.info('Job cancelled', { jobId });
    return true;
  }

  /**
   * Get queue for processing jobs
   */
  public getBulkOperationQueue(): Queue<BulkOperationJobData> {
    return this.bulkOperationQueue;
  }

  /**
   * Get queue statistics
   */
  public async getQueueStats(): Promise<any> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.bulkOperationQueue.getWaitingCount(),
      this.bulkOperationQueue.getActiveCount(),
      this.bulkOperationQueue.getCompletedCount(),
      this.bulkOperationQueue.getFailedCount(),
      this.bulkOperationQueue.getDelayedCount(),
    ]);

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
    };
  }

  /**
   * Clean old jobs
   */
  public async cleanOldJobs(grace: number = 24 * 60 * 60 * 1000): Promise<void> {
    await this.bulkOperationQueue.clean(grace, 'completed');
    await this.bulkOperationQueue.clean(grace * 7, 'failed'); // Keep failed jobs longer
    logger.info('Old jobs cleaned', { grace });
  }

  /**
   * Close all connections
   */
  public async close(): Promise<void> {
    await this.bulkOperationQueue.close();
    logger.info('Queue service closed');
  }
}

export const queueService = QueueService.getInstance();
