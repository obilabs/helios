import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

// Mock database
const mockQuery = jest.fn();
jest.mock('../database/connection', () => ({
  db: {
    query: mockQuery,
  },
}));

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock cache service
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  invalidate: jest.fn(),
  getStats: jest.fn(),
};

jest.mock('../services/media-asset-cache.service', () => ({
  mediaAssetCacheService: mockCacheService,
}));

// Mock storage service
const mockStorageService = {
  getFile: jest.fn(),
  getSettings: jest.fn(),
};

jest.mock('../services/media-asset-storage.service', () => ({
  mediaAssetStorageService: mockStorageService,
}));

// Import routes after mocking
import assetProxyRoutes from '../routes/asset-proxy.routes.js';

describe('Asset Proxy Routes', () => {
  let app: Express;

  const testAsset = {
    id: 'asset-uuid-123',
    organizationId: 'org-uuid',
    storageType: 'google_drive',
    storagePath: 'file-id-123',
    name: 'Test Image',
    filename: 'test-image.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
    folderId: null,
    category: 'signatures',
    accessToken: 'public-token-abc',
    isPublic: true,
    accessCount: 0,
    lastAccessedAt: null,
    createdBy: 'user-uuid',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testFileContent = Buffer.from('PNG binary content here...');

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/a', assetProxyRoutes);

    mockQuery.mockReset();
    jest.clearAllMocks();

    // Default mock implementations
    mockCacheService.getStats.mockResolvedValue({
      connected: true,
      keyCount: 10,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /a/_health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/a/_health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.service).toBe('asset-proxy');
      expect(response.body.cache.connected).toBe(true);
    });
  });

  describe('GET /a/:token', () => {
    it('should return 404 for non-existent asset', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);
      mockQuery.mockResolvedValueOnce({ rows: [] }); // No asset found

      const response = await request(app)
        .get('/a/non-existent-token')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Asset not found');
    });

    it('should serve asset from cache on cache hit', async () => {
      mockCacheService.get.mockResolvedValueOnce({
        data: testFileContent,
        mimeType: 'image/png',
        cachedAt: new Date(),
      });

      // Mock getAssetByToken for access stats
      mockQuery.mockResolvedValueOnce({
        rows: [testAsset],
      });

      // Mock access stats update
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['x-cache']).toBe('HIT');
      expect(response.headers['cache-control']).toBe('public, max-age=3600');
      expect(response.body).toEqual(testFileContent);
    });

    it('should fetch from storage on cache miss', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);

      // Mock getAssetByToken
      mockQuery.mockResolvedValueOnce({
        rows: [testAsset],
      });

      // Mock getFile from storage
      mockStorageService.getFile.mockResolvedValueOnce({
        success: true,
        data: testFileContent,
        mimeType: 'image/png',
      });

      // Mock getSettings for cache TTL
      mockStorageService.getSettings.mockResolvedValueOnce({
        cacheTtlSeconds: 3600,
      });

      // Mock access stats update
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['x-cache']).toBe('MISS');
      expect(response.body).toEqual(testFileContent);

      // Verify cache was updated
      expect(mockCacheService.set).toHaveBeenCalledWith(
        testAsset.accessToken,
        testFileContent,
        'image/png',
        3600
      );
    });

    it('should return 403 for non-public assets', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);

      const privateAsset = { ...testAsset, isPublic: false };
      mockQuery.mockResolvedValueOnce({
        rows: [privateAsset],
      });

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Access denied');
    });

    it('should return 503 when storage is unavailable', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);

      mockQuery.mockResolvedValueOnce({
        rows: [testAsset],
      });

      mockStorageService.getFile.mockResolvedValueOnce({
        success: false,
        error: 'Google Drive API error',
      });

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Storage temporarily unavailable');
    });

    it('should handle server errors gracefully', async () => {
      mockCacheService.get.mockRejectedValueOnce(new Error('Unexpected error'));

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');
    });
  });

  describe('GET /a/:token/:filename', () => {
    it('should serve asset with filename in URL', async () => {
      mockCacheService.get.mockResolvedValueOnce({
        data: testFileContent,
        mimeType: 'image/png',
        cachedAt: new Date(),
      });

      mockQuery.mockResolvedValueOnce({
        rows: [testAsset],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}/custom-name.png`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.body).toEqual(testFileContent);
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      mockCacheService.get.mockResolvedValue({
        data: testFileContent,
        mimeType: 'image/png',
        cachedAt: new Date(),
      });

      mockQuery.mockResolvedValue({ rows: [testAsset] });

      // Make several requests - all should succeed
      for (let i = 0; i < 5; i++) {
        await request(app)
          .get(`/a/${testAsset.accessToken}`)
          .expect(200);
      }
    });

    // Note: Testing rate limit exceeded requires more requests than practical in a unit test
    // In production, this would be tested with integration tests
  });

  describe('Access Tracking', () => {
    it('should increment access count asynchronously', async () => {
      mockCacheService.get.mockResolvedValueOnce({
        data: testFileContent,
        mimeType: 'image/png',
        cachedAt: new Date(),
      });

      mockQuery.mockResolvedValueOnce({ rows: [testAsset] });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // Access stats update

      await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(200);

      // Wait a bit for async update
      await new Promise(resolve => setTimeout(resolve, 50));

      // Verify access stats update was called
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE media_assets'),
        [testAsset.id]
      );
    });
  });

  describe('Content Headers', () => {
    it('should set correct Content-Type header', async () => {
      const jpegAsset = { ...testAsset, mimeType: 'image/jpeg' };
      const jpegContent = Buffer.from('JPEG content');

      mockCacheService.get.mockResolvedValueOnce({
        data: jpegContent,
        mimeType: 'image/jpeg',
        cachedAt: new Date(),
      });

      mockQuery.mockResolvedValueOnce({ rows: [jpegAsset] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/a/${jpegAsset.accessToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/jpeg');
    });

    it('should set Content-Length header', async () => {
      mockCacheService.get.mockResolvedValueOnce({
        data: testFileContent,
        mimeType: 'image/png',
        cachedAt: new Date(),
      });

      mockQuery.mockResolvedValueOnce({ rows: [testAsset] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(200);

      expect(response.headers['content-length']).toBe(testFileContent.length.toString());
    });

    it('should set Cache-Control header', async () => {
      mockCacheService.get.mockResolvedValueOnce(null);

      mockQuery.mockResolvedValueOnce({ rows: [testAsset] });

      mockStorageService.getFile.mockResolvedValueOnce({
        success: true,
        data: testFileContent,
        mimeType: 'image/png',
      });

      mockStorageService.getSettings.mockResolvedValueOnce({
        cacheTtlSeconds: 7200, // 2 hours
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get(`/a/${testAsset.accessToken}`)
        .expect(200);

      expect(response.headers['cache-control']).toBe('public, max-age=7200');
    });
  });

  describe('Different File Types', () => {
    const fileTypes = [
      { mime: 'image/png', extension: 'png' },
      { mime: 'image/jpeg', extension: 'jpg' },
      { mime: 'image/gif', extension: 'gif' },
      { mime: 'image/webp', extension: 'webp' },
      { mime: 'image/svg+xml', extension: 'svg' },
      { mime: 'video/mp4', extension: 'mp4' },
      { mime: 'application/pdf', extension: 'pdf' },
    ];

    fileTypes.forEach(({ mime, extension }) => {
      it(`should serve ${extension} files correctly`, async () => {
        const asset = {
          ...testAsset,
          mimeType: mime,
          filename: `test.${extension}`,
        };

        mockCacheService.get.mockResolvedValueOnce({
          data: Buffer.from(`${extension} content`),
          mimeType: mime,
          cachedAt: new Date(),
        });

        mockQuery.mockResolvedValueOnce({ rows: [asset] });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .get(`/a/${asset.accessToken}`)
          .expect(200);

        expect(response.headers['content-type']).toBe(mime);
      });
    });
  });
});
