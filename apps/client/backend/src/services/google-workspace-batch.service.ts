/**
 * Google Workspace Batch API Service
 *
 * Provides batch operations for Google Workspace Admin SDK.
 * Google's Batch API allows up to 100 requests per batch, significantly
 * improving performance for bulk operations.
 *
 * Reference: https://cloud.google.com/compute/docs/api/how-tos/batch
 */

import { google, admin_directory_v1 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { logger } from '../utils/logger.js';
import { decodeServiceAccountKey } from './gw-credentials.js';
import { db } from '../database/connection.js';

export interface BatchRequest {
  id: string;
  method: 'users.update' | 'users.insert' | 'users.delete' | 'members.insert' | 'members.delete';
  userKey?: string;
  groupKey?: string;
  memberKey?: string;
  body?: any;
}

export interface BatchResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
  statusCode?: number;
}

export interface BulkUserUpdate {
  email: string;
  googleWorkspaceId?: string;
  updates: {
    firstName?: string;
    lastName?: string;
    jobTitle?: string;
    department?: string;
    managerEmail?: string;
    organizationalUnit?: string;
    suspended?: boolean;
  };
}

export interface BulkGroupMemberOperation {
  groupId: string;
  groupExternalId: string;
  userEmail: string;
  operation: 'add' | 'remove';
  role?: 'MEMBER' | 'MANAGER' | 'OWNER';
}

/**
 * Maximum requests per batch (Google's limit is 100, but we use 50 for safety)
 */
const BATCH_SIZE = 50;

/**
 * Delay between batches to avoid rate limiting (milliseconds)
 */
const BATCH_DELAY_MS = 200;

export class GoogleWorkspaceBatchService {
  /**
   * Get credentials and create admin client
   */
  private async getAdminClient(organizationId: string): Promise<{
    client: admin_directory_v1.Admin;
    adminEmail: string;
  } | null> {
    try {
      const result = await db.query(
        'SELECT service_account_key, admin_email FROM gw_credentials WHERE organization_id = $1',
        [organizationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const { service_account_key, admin_email } = result.rows[0];
      const credentials = decodeServiceAccountKey(service_account_key);

      const jwtClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/admin.directory.user',
          'https://www.googleapis.com/auth/admin.directory.group',
          'https://www.googleapis.com/auth/admin.directory.group.member'
        ],
        subject: admin_email
      });

      const client = google.admin({ version: 'directory_v1', auth: jwtClient });
      return { client, adminEmail: admin_email };
    } catch (error: any) {
      logger.error('Failed to create admin client', { organizationId, error: error.message });
      return null;
    }
  }

  /**
   * Process bulk user updates with batching
   * Updates users in Google Workspace based on local changes
   */
  async bulkUpdateUsers(
    organizationId: string,
    updates: BulkUserUpdate[],
    progressCallback?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    results: BatchResult[];
  }> {
    const results: BatchResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    const adminClient = await this.getAdminClient(organizationId);
    if (!adminClient) {
      return {
        success: false,
        totalProcessed: 0,
        successCount: 0,
        failureCount: updates.length,
        results: updates.map(u => ({
          id: u.email,
          success: false,
          error: 'Google Workspace not configured'
        }))
      };
    }

    const { client } = adminClient;

    // Process in batches
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, Math.min(i + BATCH_SIZE, updates.length));

      // Process batch items sequentially with rate limiting
      // (Google's nodejs client doesn't have native batch support,
      // so we process individually but in parallel with concurrency limit)
      const batchPromises = batch.map(async (update, index) => {
        try {
          // Add small delay based on index to spread requests
          await this.delay(index * 50);

          const userKey = update.googleWorkspaceId || update.email;
          const requestBody = this.buildUserUpdateBody(update.updates);

          if (Object.keys(requestBody).length === 0) {
            return {
              id: update.email,
              success: true,
              data: { message: 'No updates to apply' }
            };
          }

          const response = await client.users.update({
            userKey,
            requestBody
          });

          return {
            id: update.email,
            success: true,
            data: response.data,
            statusCode: 200
          };
        } catch (error: any) {
          logger.error('Failed to update user in Google Workspace', {
            email: update.email,
            error: error.message
          });
          return {
            id: update.email,
            success: false,
            error: error.message,
            statusCode: error.code || 500
          };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      // Report progress
      if (progressCallback) {
        progressCallback(i + batch.length, updates.length);
      }

      // Delay between batches to avoid rate limiting
      if (i + BATCH_SIZE < updates.length) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    logger.info('Bulk user update completed', {
      organizationId,
      totalProcessed: updates.length,
      successCount,
      failureCount
    });

    return {
      success: failureCount === 0,
      totalProcessed: updates.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Process bulk user suspensions
   */
  async bulkSuspendUsers(
    organizationId: string,
    userEmails: string[],
    progressCallback?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    results: BatchResult[];
  }> {
    const updates: BulkUserUpdate[] = userEmails.map(email => ({
      email,
      updates: { suspended: true }
    }));

    return this.bulkUpdateUsers(organizationId, updates, progressCallback);
  }

  /**
   * Process bulk user activations (unsuspend)
   */
  async bulkActivateUsers(
    organizationId: string,
    userEmails: string[],
    progressCallback?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    results: BatchResult[];
  }> {
    const updates: BulkUserUpdate[] = userEmails.map(email => ({
      email,
      updates: { suspended: false }
    }));

    return this.bulkUpdateUsers(organizationId, updates, progressCallback);
  }

  /**
   * Process bulk OU moves
   */
  async bulkMoveToOU(
    organizationId: string,
    userEmails: string[],
    targetOU: string,
    progressCallback?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    results: BatchResult[];
  }> {
    const updates: BulkUserUpdate[] = userEmails.map(email => ({
      email,
      updates: { organizationalUnit: targetOU }
    }));

    return this.bulkUpdateUsers(organizationId, updates, progressCallback);
  }

  /**
   * Process bulk group membership operations
   */
  async bulkGroupMemberOperations(
    organizationId: string,
    operations: BulkGroupMemberOperation[],
    progressCallback?: (processed: number, total: number) => void
  ): Promise<{
    success: boolean;
    totalProcessed: number;
    successCount: number;
    failureCount: number;
    results: BatchResult[];
  }> {
    const results: BatchResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    const adminClient = await this.getAdminClient(organizationId);
    if (!adminClient) {
      return {
        success: false,
        totalProcessed: 0,
        successCount: 0,
        failureCount: operations.length,
        results: operations.map(op => ({
          id: `${op.groupId}:${op.userEmail}`,
          success: false,
          error: 'Google Workspace not configured'
        }))
      };
    }

    const { client } = adminClient;

    // Process in batches
    for (let i = 0; i < operations.length; i += BATCH_SIZE) {
      const batch = operations.slice(i, Math.min(i + BATCH_SIZE, operations.length));

      const batchPromises = batch.map(async (op, index) => {
        try {
          await this.delay(index * 50);

          const id = `${op.groupId}:${op.userEmail}`;

          if (op.operation === 'add') {
            await client.members.insert({
              groupKey: op.groupExternalId,
              requestBody: {
                email: op.userEmail,
                role: op.role || 'MEMBER'
              }
            });
          } else {
            await client.members.delete({
              groupKey: op.groupExternalId,
              memberKey: op.userEmail
            });
          }

          return {
            id,
            success: true,
            statusCode: 200
          };
        } catch (error: any) {
          // Ignore "Member already exists" or "Resource not found" for idempotency
          if (
            (op.operation === 'add' && error.message?.includes('Member already exists')) ||
            (op.operation === 'remove' && error.message?.includes('Resource Not Found'))
          ) {
            return {
              id: `${op.groupId}:${op.userEmail}`,
              success: true,
              data: { message: op.operation === 'add' ? 'Already a member' : 'Already removed' }
            };
          }

          logger.error('Failed group membership operation', {
            groupId: op.groupId,
            userEmail: op.userEmail,
            operation: op.operation,
            error: error.message
          });

          return {
            id: `${op.groupId}:${op.userEmail}`,
            success: false,
            error: error.message,
            statusCode: error.code || 500
          };
        }
      });

      const batchResults = await Promise.all(batchPromises);

      for (const result of batchResults) {
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      if (progressCallback) {
        progressCallback(i + batch.length, operations.length);
      }

      if (i + BATCH_SIZE < operations.length) {
        await this.delay(BATCH_DELAY_MS);
      }
    }

    logger.info('Bulk group membership operation completed', {
      organizationId,
      totalProcessed: operations.length,
      successCount,
      failureCount
    });

    return {
      success: failureCount === 0,
      totalProcessed: operations.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Build the Google Workspace user update request body
   */
  private buildUserUpdateBody(updates: BulkUserUpdate['updates']): admin_directory_v1.Schema$User {
    const body: admin_directory_v1.Schema$User = {};

    if (updates.firstName || updates.lastName) {
      body.name = {};
      if (updates.firstName) body.name.givenName = updates.firstName;
      if (updates.lastName) body.name.familyName = updates.lastName;
    }

    if (updates.jobTitle || updates.department) {
      body.organizations = [{
        primary: true,
        title: updates.jobTitle,
        department: updates.department
      }];
    }

    if (updates.managerEmail !== undefined) {
      body.relations = updates.managerEmail
        ? [{ type: 'manager', value: updates.managerEmail }]
        : [];
    }

    if (updates.organizationalUnit) {
      body.orgUnitPath = updates.organizationalUnit;
    }

    if (updates.suspended !== undefined) {
      body.suspended = updates.suspended;
    }

    return body;
  }

  /**
   * Utility function for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Estimate time for bulk operation
   */
  estimateOperationTime(itemCount: number): {
    estimatedSeconds: number;
    estimatedMinutes: number;
    batchCount: number;
  } {
    const batchCount = Math.ceil(itemCount / BATCH_SIZE);
    // Each item takes ~50ms, plus batch delay
    const itemTime = itemCount * 50;
    const batchDelays = (batchCount - 1) * BATCH_DELAY_MS;
    const estimatedMs = itemTime + batchDelays;
    const estimatedSeconds = Math.ceil(estimatedMs / 1000);

    return {
      estimatedSeconds,
      estimatedMinutes: Math.ceil(estimatedSeconds / 60),
      batchCount
    };
  }
}

export const googleWorkspaceBatchService = new GoogleWorkspaceBatchService();
