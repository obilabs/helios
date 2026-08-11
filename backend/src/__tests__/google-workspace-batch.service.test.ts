/**
 * Unit tests for Google Workspace Batch Service
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { BulkUserUpdate, BulkGroupMemberOperation } from '../services/google-workspace-batch.service.js';

// Mock the database connection
jest.unstable_mockModule('../database/connection.js', () => ({
  db: {
    query: jest.fn<(...args: any[]) => Promise<any>>(),
  },
}));

// Mock googleapis
jest.unstable_mockModule('googleapis', () => ({
  google: {
    admin: jest.fn(() => ({
      users: {
        update: jest.fn(),
        list: jest.fn(),
      },
      members: {
        insert: jest.fn(),
        delete: jest.fn(),
      },
    })),
  },
  admin_directory_v1: {},
}));

// Mock google-auth-library
jest.unstable_mockModule('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({
    authorize: jest.fn(async () => ({})),
  })),
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Import after mocks
const { googleWorkspaceBatchService } = await import('../services/google-workspace-batch.service.js');
const { db } = await import('../database/connection.js');
const { google } = await import('googleapis');

describe('GoogleWorkspaceBatchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('estimateOperationTime', () => {
    it('should estimate time correctly for small batch', () => {
      const estimate = googleWorkspaceBatchService.estimateOperationTime(10);

      expect(estimate.batchCount).toBe(1); // 10 items fits in one batch of 50
      expect(estimate.estimatedSeconds).toBeGreaterThan(0);
      expect(estimate.estimatedMinutes).toBeGreaterThanOrEqual(1);
    });

    it('should estimate time correctly for large batch', () => {
      const estimate = googleWorkspaceBatchService.estimateOperationTime(200);

      expect(estimate.batchCount).toBe(4); // 200 items = 4 batches of 50
      expect(estimate.estimatedSeconds).toBeGreaterThan(10);
    });

    it('should estimate time correctly for single item', () => {
      const estimate = googleWorkspaceBatchService.estimateOperationTime(1);

      expect(estimate.batchCount).toBe(1);
      expect(estimate.estimatedSeconds).toBe(1);
    });
  });

  describe('bulkUpdateUsers', () => {
    const mockCredentials = {
      client_email: 'test@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----',
    };

    beforeEach(() => {
      // Mock database to return credentials
      (db.query as any).mockResolvedValue({
        rows: [{
          service_account_key: JSON.stringify(mockCredentials),
          admin_email: 'admin@test.com',
        }],
      });
    });

    it('should return error when Google Workspace is not configured', async () => {
      (db.query as any).mockResolvedValueOnce({ rows: [] });

      const updates: BulkUserUpdate[] = [{
        email: 'user@test.com',
        updates: { firstName: 'Test' },
      }];

      const result = await googleWorkspaceBatchService.bulkUpdateUsers(
        'org-123',
        updates
      );

      expect(result.success).toBe(false);
      expect(result.failureCount).toBe(1);
      expect(result.results[0].error).toBe('Google Workspace not configured');
    });

    it('should process updates successfully', async () => {
      const mockUpdate = jest.fn<any>().mockResolvedValue({ data: { primaryEmail: 'user@test.com' } });
      (google.admin as any).mockReturnValue({
        users: { update: mockUpdate },
        members: { insert: jest.fn(), delete: jest.fn() },
      });

      const updates: BulkUserUpdate[] = [
        { email: 'user1@test.com', updates: { firstName: 'Test1' } },
        { email: 'user2@test.com', updates: { lastName: 'User2' } },
      ];

      const result = await googleWorkspaceBatchService.bulkUpdateUsers(
        'org-123',
        updates
      );

      expect(result.totalProcessed).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
    });

    it('should handle partial failures', async () => {
      const mockUpdate = jest.fn<any>()
        .mockResolvedValueOnce({ data: {} })
        .mockRejectedValueOnce(new Error('User not found'));

      (google.admin as any).mockReturnValue({
        users: { update: mockUpdate },
        members: { insert: jest.fn(), delete: jest.fn() },
      });

      const updates: BulkUserUpdate[] = [
        { email: 'user1@test.com', updates: { firstName: 'Test1' } },
        { email: 'user2@test.com', updates: { firstName: 'Test2' } },
      ];

      const result = await googleWorkspaceBatchService.bulkUpdateUsers(
        'org-123',
        updates
      );

      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toBe('User not found');
    });

    it('should skip updates with no changes', async () => {
      const mockUpdate = jest.fn<any>().mockResolvedValue({ data: {} });
      (google.admin as any).mockReturnValue({
        users: { update: mockUpdate },
        members: { insert: jest.fn(), delete: jest.fn() },
      });

      const updates: BulkUserUpdate[] = [
        { email: 'user@test.com', updates: {} }, // No actual updates
      ];

      const result = await googleWorkspaceBatchService.bulkUpdateUsers(
        'org-123',
        updates
      );

      expect(result.successCount).toBe(1);
      expect(result.results[0].data?.message).toBe('No updates to apply');
    });
  });

  describe('bulkSuspendUsers', () => {
    const mockCredentials = {
      client_email: 'test@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----',
    };

    beforeEach(() => {
      (db.query as any).mockResolvedValue({
        rows: [{
          service_account_key: JSON.stringify(mockCredentials),
          admin_email: 'admin@test.com',
        }],
      });
    });

    it('should suspend users successfully', async () => {
      const mockUpdate = jest.fn<any>().mockResolvedValue({ data: {} });
      (google.admin as any).mockReturnValue({
        users: { update: mockUpdate },
        members: { insert: jest.fn(), delete: jest.fn() },
      });

      const result = await googleWorkspaceBatchService.bulkSuspendUsers(
        'org-123',
        ['user1@test.com', 'user2@test.com']
      );

      expect(result.successCount).toBe(2);
      expect(mockUpdate).toHaveBeenCalledTimes(2);

      // Verify that suspended: true is in the request body
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ suspended: true }),
        })
      );
    });
  });

  describe('bulkMoveToOU', () => {
    const mockCredentials = {
      client_email: 'test@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----',
    };

    beforeEach(() => {
      (db.query as any).mockResolvedValue({
        rows: [{
          service_account_key: JSON.stringify(mockCredentials),
          admin_email: 'admin@test.com',
        }],
      });
    });

    it('should move users to OU successfully', async () => {
      const mockUpdate = jest.fn<any>().mockResolvedValue({ data: {} });
      (google.admin as any).mockReturnValue({
        users: { update: mockUpdate },
        members: { insert: jest.fn(), delete: jest.fn() },
      });

      const result = await googleWorkspaceBatchService.bulkMoveToOU(
        'org-123',
        ['user1@test.com'],
        '/Engineering'
      );

      expect(result.successCount).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ orgUnitPath: '/Engineering' }),
        })
      );
    });
  });

  describe('bulkGroupMemberOperations', () => {
    const mockCredentials = {
      client_email: 'test@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----',
    };

    beforeEach(() => {
      (db.query as any).mockResolvedValue({
        rows: [{
          service_account_key: JSON.stringify(mockCredentials),
          admin_email: 'admin@test.com',
        }],
      });
    });

    it('should add members to group successfully', async () => {
      const mockInsert = jest.fn<any>().mockResolvedValue({ data: {} });
      (google.admin as any).mockReturnValue({
        users: { update: jest.fn() },
        members: { insert: mockInsert, delete: jest.fn() },
      });

      const operations: BulkGroupMemberOperation[] = [
        {
          groupId: 'group-1',
          groupExternalId: 'group-1-external',
          userEmail: 'user1@test.com',
          operation: 'add',
        },
      ];

      const result = await googleWorkspaceBatchService.bulkGroupMemberOperations(
        'org-123',
        operations
      );

      expect(result.successCount).toBe(1);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          groupKey: 'group-1-external',
          requestBody: expect.objectContaining({
            email: 'user1@test.com',
            role: 'MEMBER',
          }),
        })
      );
    });

    it('should remove members from group successfully', async () => {
      const mockDelete = jest.fn<any>().mockResolvedValue({ data: {} });
      (google.admin as any).mockReturnValue({
        users: { update: jest.fn() },
        members: { insert: jest.fn(), delete: mockDelete },
      });

      const operations: BulkGroupMemberOperation[] = [
        {
          groupId: 'group-1',
          groupExternalId: 'group-1-external',
          userEmail: 'user1@test.com',
          operation: 'remove',
        },
      ];

      const result = await googleWorkspaceBatchService.bulkGroupMemberOperations(
        'org-123',
        operations
      );

      expect(result.successCount).toBe(1);
      expect(mockDelete).toHaveBeenCalledWith(
        expect.objectContaining({
          groupKey: 'group-1-external',
          memberKey: 'user1@test.com',
        })
      );
    });

    it('should handle "Member already exists" gracefully', async () => {
      const mockInsert = jest.fn<any>().mockRejectedValue(new Error('Member already exists'));
      (google.admin as any).mockReturnValue({
        users: { update: jest.fn() },
        members: { insert: mockInsert, delete: jest.fn() },
      });

      const operations: BulkGroupMemberOperation[] = [
        {
          groupId: 'group-1',
          groupExternalId: 'group-1-external',
          userEmail: 'user1@test.com',
          operation: 'add',
        },
      ];

      const result = await googleWorkspaceBatchService.bulkGroupMemberOperations(
        'org-123',
        operations
      );

      expect(result.successCount).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data?.message).toBe('Already a member');
    });

    it('should handle "Resource Not Found" gracefully for remove', async () => {
      const mockDelete = jest.fn<any>().mockRejectedValue(new Error('Resource Not Found'));
      (google.admin as any).mockReturnValue({
        users: { update: jest.fn() },
        members: { insert: jest.fn(), delete: mockDelete },
      });

      const operations: BulkGroupMemberOperation[] = [
        {
          groupId: 'group-1',
          groupExternalId: 'group-1-external',
          userEmail: 'user1@test.com',
          operation: 'remove',
        },
      ];

      const result = await googleWorkspaceBatchService.bulkGroupMemberOperations(
        'org-123',
        operations
      );

      expect(result.successCount).toBe(1);
      expect(result.results[0].data?.message).toBe('Already removed');
    });

    it('should progress callback correctly', async () => {
      const mockInsert = jest.fn<any>().mockResolvedValue({ data: {} });
      (google.admin as any).mockReturnValue({
        users: { update: jest.fn() },
        members: { insert: mockInsert, delete: jest.fn() },
      });

      const progressUpdates: [number, number][] = [];
      const progressCallback = (processed: number, total: number) => {
        progressUpdates.push([processed, total]);
      };

      const operations: BulkGroupMemberOperation[] = [
        { groupId: 'g1', groupExternalId: 'g1-ext', userEmail: 'u1@test.com', operation: 'add' },
        { groupId: 'g2', groupExternalId: 'g2-ext', userEmail: 'u2@test.com', operation: 'add' },
      ];

      await googleWorkspaceBatchService.bulkGroupMemberOperations(
        'org-123',
        operations,
        progressCallback
      );

      expect(progressUpdates.length).toBeGreaterThan(0);
      // Last update should show completion
      const lastUpdate = progressUpdates[progressUpdates.length - 1];
      expect(lastUpdate[0]).toBe(2);
      expect(lastUpdate[1]).toBe(2);
    });
  });

  describe('bulkActivateUsers', () => {
    const mockCredentials = {
      client_email: 'test@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nMOCK_KEY\n-----END PRIVATE KEY-----',
    };

    beforeEach(() => {
      (db.query as any).mockResolvedValue({
        rows: [{
          service_account_key: JSON.stringify(mockCredentials),
          admin_email: 'admin@test.com',
        }],
      });
    });

    it('should activate (unsuspend) users successfully', async () => {
      const mockUpdate = jest.fn<any>().mockResolvedValue({ data: {} });
      (google.admin as any).mockReturnValue({
        users: { update: mockUpdate },
        members: { insert: jest.fn(), delete: jest.fn() },
      });

      const result = await googleWorkspaceBatchService.bulkActivateUsers(
        'org-123',
        ['user1@test.com']
      );

      expect(result.successCount).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({ suspended: false }),
        })
      );
    });
  });
});
