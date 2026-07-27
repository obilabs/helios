/**
 * User Tracking Service Tests
 *
 * Tests for token generation, idempotency, lookup, and management.
 */

import { jest } from '@jest/globals';

// Mock the database connection
jest.mock('../database/connection', () => ({
  db: {
    query: jest.fn(),
  },
}));

import { db } from '../database/connection.js';
import { userTrackingService, UserTrackingToken } from '../services/user-tracking.service.js';

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;

describe('UserTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a URL-safe token', () => {
      const token = userTrackingService.generateToken();

      // Should be base64url encoded (no +, /, =)
      expect(token).not.toMatch(/[+/=]/);
      // Should only contain URL-safe characters
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate tokens of correct length', () => {
      const token24 = userTrackingService.generateToken(24);
      const token32 = userTrackingService.generateToken(32);

      // base64url encoding: 4 chars per 3 bytes, no padding
      // 24 bytes = 32 chars, 32 bytes = 43 chars (rounded up)
      expect(token24.length).toBe(32);
      expect(token32.length).toBe(43);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(userTrackingService.generateToken());
      }
      // All tokens should be unique
      expect(tokens.size).toBe(100);
    });

    it('should generate cryptographically random tokens', () => {
      // Generate many tokens and check for no obvious patterns
      const token1 = userTrackingService.generateToken();
      const token2 = userTrackingService.generateToken();

      // Tokens should not be similar
      expect(token1).not.toBe(token2);
      expect(token1.substring(0, 5)).not.toBe(token2.substring(0, 5));
    });
  });

  describe('getOrCreateToken', () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    const organizationId = '987fcdeb-51a2-3b4c-5d6e-f7890abcdef1';

    it('should return existing token if user already has one', async () => {
      const existingToken: UserTrackingToken = {
        id: 'token-id-1',
        userId,
        organizationId,
        pixelToken: 'existing-token-abc123',
        isActive: true,
        createdAt: new Date(),
      };

      // First call returns existing token
      mockQuery.mockResolvedValueOnce({
        rows: [existingToken],
        rowCount: 1,
      } as any);

      const result = await userTrackingService.getOrCreateToken(userId, organizationId);

      expect(result).toEqual(existingToken);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('should create new token if user does not have one', async () => {
      // First call (getTokenForUser) returns no rows
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const newToken: UserTrackingToken = {
        id: 'new-token-id',
        userId,
        organizationId,
        pixelToken: 'new-token-xyz789',
        isActive: true,
        createdAt: new Date(),
      };

      // Second call (insert) returns new token
      mockQuery.mockResolvedValueOnce({
        rows: [newToken],
        rowCount: 1,
      } as any);

      const result = await userTrackingService.getOrCreateToken(userId, organizationId);

      expect(result).toEqual(newToken);
      expect(mockQuery).toHaveBeenCalledTimes(2);

      // Verify insert was called with correct parameters
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('INSERT INTO signature_user_tracking');
      expect(insertCall[1]).toContain(userId);
      expect(insertCall[1]).toContain(organizationId);
    });

    it('should be idempotent (ON CONFLICT DO UPDATE)', async () => {
      // Simulate getTokenForUser returning nothing
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      // Insert with ON CONFLICT should handle race conditions
      const token: UserTrackingToken = {
        id: 'token-id',
        userId,
        organizationId,
        pixelToken: 'token-abc',
        isActive: true,
        createdAt: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [token], rowCount: 1 } as any);

      await userTrackingService.getOrCreateToken(userId, organizationId);

      // Verify the insert query uses ON CONFLICT
      const insertCall = mockQuery.mock.calls[1];
      expect(insertCall[0]).toContain('ON CONFLICT');
    });

    it('should throw error on database failure during insert', async () => {
      // First call (getTokenForUser) returns no rows
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      // Second call (insert) fails
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      await expect(
        userTrackingService.getOrCreateToken(userId, organizationId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getTokenByPixel', () => {
    it('should return token when found', async () => {
      const pixelToken = 'test-pixel-token-abc123';
      const expectedToken: UserTrackingToken = {
        id: 'token-id',
        userId: 'user-123',
        organizationId: 'org-456',
        pixelToken,
        isActive: true,
        createdAt: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [expectedToken],
        rowCount: 1,
      } as any);

      const result = await userTrackingService.getTokenByPixel(pixelToken);

      expect(result).toEqual(expectedToken);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('pixel_token = $1'),
        [pixelToken]
      );
    });

    it('should return null when token not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await userTrackingService.getTokenByPixel('nonexistent-token');

      expect(result).toBeNull();
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Connection lost'));

      const result = await userTrackingService.getTokenByPixel('any-token');

      expect(result).toBeNull();
    });
  });

  describe('getTokenForUser', () => {
    it('should return token when user has one', async () => {
      const userId = 'user-123';
      const expectedToken: UserTrackingToken = {
        id: 'token-id',
        userId,
        organizationId: 'org-456',
        pixelToken: 'pixel-token',
        isActive: true,
        createdAt: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [expectedToken],
        rowCount: 1,
      } as any);

      const result = await userTrackingService.getTokenForUser(userId);

      expect(result).toEqual(expectedToken);
    });

    it('should return null when user has no token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await userTrackingService.getTokenForUser('user-without-token');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await userTrackingService.getTokenForUser('any-user');

      expect(result).toBeNull();
    });
  });

  describe('deactivateToken', () => {
    it('should set is_active to false', async () => {
      const userId = 'user-123';
      mockQuery.mockResolvedValueOnce({ rowCount: 1 } as any);

      await userTrackingService.deactivateToken(userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = false'),
        [userId]
      );
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        userTrackingService.deactivateToken('user-123')
      ).rejects.toThrow('Update failed');
    });
  });

  describe('activateToken', () => {
    it('should set is_active to true', async () => {
      const userId = 'user-123';
      mockQuery.mockResolvedValueOnce({ rowCount: 1 } as any);

      await userTrackingService.activateToken(userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        [userId]
      );
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Update failed'));

      await expect(
        userTrackingService.activateToken('user-123')
      ).rejects.toThrow('Update failed');
    });
  });

  describe('getOrganizationTokens', () => {
    const organizationId = 'org-123';

    it('should return all tokens for an organization', async () => {
      const tokens: UserTrackingToken[] = [
        {
          id: 'token-1',
          userId: 'user-1',
          organizationId,
          pixelToken: 'pixel-1',
          isActive: true,
          createdAt: new Date(),
        },
        {
          id: 'token-2',
          userId: 'user-2',
          organizationId,
          pixelToken: 'pixel-2',
          isActive: false,
          createdAt: new Date(),
        },
      ];

      // Count query
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '2' }] } as any);
      // Select query
      mockQuery.mockResolvedValueOnce({ rows: tokens, rowCount: 2 } as any);

      const result = await userTrackingService.getOrganizationTokens(organizationId);

      expect(result.tokens).toEqual(tokens);
      expect(result.total).toBe(2);
    });

    it('should filter by active only when requested', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await userTrackingService.getOrganizationTokens(organizationId, { activeOnly: true });

      // Both queries should include is_active = true
      expect(mockQuery.mock.calls[0][0]).toContain('is_active = true');
      expect(mockQuery.mock.calls[1][0]).toContain('is_active = true');
    });

    it('should support pagination', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '100' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      await userTrackingService.getOrganizationTokens(organizationId, {
        limit: 20,
        offset: 40,
      });

      // Check that limit and offset are passed
      const selectCall = mockQuery.mock.calls[1];
      expect(selectCall[1]).toContain(20); // limit
      expect(selectCall[1]).toContain(40); // offset
    });

    it('should throw on database error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      await expect(
        userTrackingService.getOrganizationTokens(organizationId)
      ).rejects.toThrow('Query failed');
    });
  });

  describe('getPixelUrl', () => {
    it('should return full pixel URL when user has token', async () => {
      const userId = 'user-123';
      const baseUrl = 'https://app.example.com';
      const pixelToken = 'my-pixel-token';

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'token-id',
          userId,
          organizationId: 'org-1',
          pixelToken,
          isActive: true,
          createdAt: new Date(),
        }],
        rowCount: 1,
      } as any);

      const result = await userTrackingService.getPixelUrl(userId, baseUrl);

      expect(result).toBe(`${baseUrl}/api/t/u/${pixelToken}.gif`);
    });

    it('should return null when user has no token', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const result = await userTrackingService.getPixelUrl('user-without-token', 'https://app.example.com');

      expect(result).toBeNull();
    });
  });

  describe('bulkCreateTokens', () => {
    it('should create tokens for multiple users', async () => {
      const users = [
        { userId: 'user-1', organizationId: 'org-1' },
        { userId: 'user-2', organizationId: 'org-1' },
        { userId: 'user-3', organizationId: 'org-1' },
      ];

      mockQuery.mockResolvedValueOnce({ rowCount: 3 } as any);

      const created = await userTrackingService.bulkCreateTokens(users);

      expect(created).toBe(3);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO signature_user_tracking')
      );
    });

    it('should return 0 for empty array', async () => {
      const created = await userTrackingService.bulkCreateTokens([]);

      expect(created).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should use ON CONFLICT DO NOTHING for idempotency', async () => {
      const users = [{ userId: 'user-1', organizationId: 'org-1' }];
      mockQuery.mockResolvedValueOnce({ rowCount: 0 } as any);

      await userTrackingService.bulkCreateTokens(users);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT (user_id) DO NOTHING')
      );
    });

    it('should throw on database error', async () => {
      const users = [{ userId: 'user-1', organizationId: 'org-1' }];
      mockQuery.mockRejectedValueOnce(new Error('Bulk insert failed'));

      await expect(
        userTrackingService.bulkCreateTokens(users)
      ).rejects.toThrow('Bulk insert failed');
    });
  });
});
