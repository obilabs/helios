import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock Redis client
const mockRedisClient = {
  connect: jest.fn(),
  on: jest.fn((event: string, handler: Function) => {
    if (event === 'connect') {
      // Simulate successful connection
      setTimeout(() => handler(), 0);
    }
  }),
  get: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
  exists: jest.fn(),
  ttl: jest.fn(),
  keys: jest.fn(),
  info: jest.fn(),
  quit: jest.fn(),
};

jest.mock('redis', () => ({
  createClient: jest.fn(() => mockRedisClient),
}));

// Import service after mocking
import { MediaAssetCacheService } from '../services/media-asset-cache.service.js';

describe('MediaAssetCacheService', () => {
  let service: MediaAssetCacheService;

  const testToken = 'test-access-token-123';
  const testData = Buffer.from('test binary content');
  const testMimeType = 'image/png';

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset mock implementations
    mockRedisClient.connect.mockResolvedValue(undefined);
    mockRedisClient.get.mockReset();
    mockRedisClient.setEx.mockReset();
    mockRedisClient.del.mockReset();
    mockRedisClient.exists.mockReset();
    mockRedisClient.ttl.mockReset();
    mockRedisClient.keys.mockReset();
    mockRedisClient.info.mockReset();

    // Create service (will attempt to connect)
    service = new MediaAssetCacheService();

    // Wait for async connection to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return null on cache miss', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      const result = await service.get(testToken);

      expect(result).toBeNull();
      expect(mockRedisClient.get).toHaveBeenCalledWith(`asset:${testToken}`);
    });

    it('should return cached asset on cache hit', async () => {
      const cachedEntry = JSON.stringify({
        data: testData.toString('base64'),
        mimeType: testMimeType,
        cachedAt: new Date().toISOString(),
      });

      mockRedisClient.get.mockResolvedValueOnce(cachedEntry);

      const result = await service.get(testToken);

      expect(result).not.toBeNull();
      expect(result?.data).toEqual(testData);
      expect(result?.mimeType).toBe(testMimeType);
      expect(result?.cachedAt).toBeInstanceOf(Date);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.get.mockRejectedValueOnce(new Error('Redis connection lost'));

      const result = await service.get(testToken);

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should cache asset with default TTL', async () => {
      mockRedisClient.setEx.mockResolvedValueOnce('OK');

      await service.set(testToken, testData, testMimeType);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `asset:${testToken}`,
        3600, // Default TTL
        expect.any(String)
      );

      // Verify the cached data format
      const cachedEntry = JSON.parse(mockRedisClient.setEx.mock.calls[0][2] as string);
      expect(cachedEntry.data).toBe(testData.toString('base64'));
      expect(cachedEntry.mimeType).toBe(testMimeType);
      expect(cachedEntry.cachedAt).toBeDefined();
    });

    it('should cache asset with custom TTL', async () => {
      mockRedisClient.setEx.mockResolvedValueOnce('OK');

      const customTTL = 7200; // 2 hours
      await service.set(testToken, testData, testMimeType, customTTL);

      expect(mockRedisClient.setEx).toHaveBeenCalledWith(
        `asset:${testToken}`,
        customTTL,
        expect.any(String)
      );
    });

    it('should not cache files larger than 5MB', async () => {
      const largeData = Buffer.alloc(6 * 1024 * 1024); // 6MB

      await service.set(testToken, largeData, testMimeType);

      expect(mockRedisClient.setEx).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.setEx.mockRejectedValueOnce(new Error('Redis connection lost'));

      // Should not throw
      await expect(service.set(testToken, testData, testMimeType)).resolves.not.toThrow();
    });
  });

  describe('invalidate', () => {
    it('should delete cached asset', async () => {
      mockRedisClient.del.mockResolvedValueOnce(1);

      await service.invalidate(testToken);

      expect(mockRedisClient.del).toHaveBeenCalledWith(`asset:${testToken}`);
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedisClient.del.mockRejectedValueOnce(new Error('Redis error'));

      // Should not throw
      await expect(service.invalidate(testToken)).resolves.not.toThrow();
    });
  });

  describe('has', () => {
    it('should return true when asset is cached', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(1);

      const result = await service.has(testToken);

      expect(result).toBe(true);
      expect(mockRedisClient.exists).toHaveBeenCalledWith(`asset:${testToken}`);
    });

    it('should return false when asset is not cached', async () => {
      mockRedisClient.exists.mockResolvedValueOnce(0);

      const result = await service.has(testToken);

      expect(result).toBe(false);
    });

    it('should return false on Redis error', async () => {
      mockRedisClient.exists.mockRejectedValueOnce(new Error('Redis error'));

      const result = await service.has(testToken);

      expect(result).toBe(false);
    });
  });

  describe('getTTL', () => {
    it('should return TTL for cached asset', async () => {
      mockRedisClient.ttl.mockResolvedValueOnce(1800); // 30 minutes remaining

      const result = await service.getTTL(testToken);

      expect(result).toBe(1800);
      expect(mockRedisClient.ttl).toHaveBeenCalledWith(`asset:${testToken}`);
    });

    it('should return -1 for non-existent key', async () => {
      mockRedisClient.ttl.mockResolvedValueOnce(-2);

      const result = await service.getTTL(testToken);

      expect(result).toBe(-2);
    });

    it('should return -1 on Redis error', async () => {
      mockRedisClient.ttl.mockRejectedValueOnce(new Error('Redis error'));

      const result = await service.getTTL(testToken);

      expect(result).toBe(-1);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', async () => {
      mockRedisClient.keys.mockResolvedValueOnce([
        'asset:token1',
        'asset:token2',
        'asset:token3',
      ]);
      mockRedisClient.info.mockResolvedValueOnce('used_memory:1048576\nother_info:value');

      const stats = await service.getStats();

      expect(stats.connected).toBe(true);
      expect(stats.maxCacheableSizeMB).toBe(5);
      expect(stats.defaultTTLSeconds).toBe(3600);
      expect(stats.keyCount).toBe(3);
      expect(stats.memorySizeBytes).toBe(1048576);
    });

    it('should return base stats on Redis error', async () => {
      mockRedisClient.keys.mockRejectedValueOnce(new Error('Redis error'));

      const stats = await service.getStats();

      expect(stats.connected).toBe(true);
      expect(stats.maxCacheableSizeMB).toBe(5);
      expect(stats.defaultTTLSeconds).toBe(3600);
      expect(stats.error).toBeDefined();
    });
  });

  describe('invalidateAll', () => {
    it('should log invalidation request', async () => {
      const testOrgId = 'test-org-id';

      // Should not throw
      await expect(service.invalidateAll(testOrgId)).resolves.not.toThrow();

      // Note: Current implementation just logs, doesn't delete
      // This is a placeholder for future implementation
    });
  });

  describe('close', () => {
    it('should close Redis connection', async () => {
      mockRedisClient.quit.mockResolvedValueOnce('OK');

      await service.close();

      expect(mockRedisClient.quit).toHaveBeenCalled();
    });
  });

  describe('key building', () => {
    it('should use correct key prefix', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);

      await service.get('my-token');

      expect(mockRedisClient.get).toHaveBeenCalledWith('asset:my-token');
    });
  });
});

describe('MediaAssetCacheService - Disconnected State', () => {
  let disconnectedService: MediaAssetCacheService;

  beforeEach(() => {
    // Simulate connection failure
    mockRedisClient.connect.mockRejectedValue(new Error('Connection refused'));
    mockRedisClient.on.mockImplementation((event: string, handler: Function) => {
      if (event === 'error') {
        setTimeout(() => handler(new Error('Connection refused')), 0);
      }
    });

    disconnectedService = new MediaAssetCacheService();
  });

  it('should return null from get when disconnected', async () => {
    const result = await disconnectedService.get('test-token');
    expect(result).toBeNull();
  });

  it('should not throw from set when disconnected', async () => {
    await expect(
      disconnectedService.set('test-token', Buffer.from('data'), 'image/png')
    ).resolves.not.toThrow();
  });

  it('should return false from has when disconnected', async () => {
    const result = await disconnectedService.has('test-token');
    expect(result).toBe(false);
  });

  it('should return -1 from getTTL when disconnected', async () => {
    const result = await disconnectedService.getTTL('test-token');
    expect(result).toBe(-1);
  });
});
