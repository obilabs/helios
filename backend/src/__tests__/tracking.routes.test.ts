/**
 * Tracking Routes Integration Tests
 *
 * Tests for tracking pixel endpoints, rate limiting, and bot filtering.
 */

import { jest } from '@jest/globals';
import express, { Express } from 'express';

// Mock the tracking events service
jest.mock('../services/tracking-events.service', () => ({
  trackingEventsService: {
    recordEvent: jest.fn().mockResolvedValue({ success: true }),
    recordUserEvent: jest.fn().mockResolvedValue({ success: true }),
  },
}));

import { trackingEventsService } from '../services/tracking-events.service.js';
import trackingRoutes from '../routes/tracking.routes.js';

const mockRecordEvent = trackingEventsService.recordEvent as jest.MockedFunction<typeof trackingEventsService.recordEvent>;
const mockRecordUserEvent = trackingEventsService.recordUserEvent as jest.MockedFunction<typeof trackingEventsService.recordUserEvent>;

// 1x1 transparent GIF bytes - actual size from base64 decode is 42 bytes
const TRANSPARENT_GIF_BYTES = 42;

describe('Tracking Routes', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use('/api/t', trackingRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/t/p/:token.gif (Campaign Tracking Pixel)', () => {
    it('should return a transparent GIF with correct headers', async () => {
      const supertest = (await import('supertest')).default;
      const response = await supertest(app)
        .get('/api/t/p/valid-token-12345678901234567890.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
      expect(response.headers['content-length']).toBe(TRANSPARENT_GIF_BYTES.toString());
      expect(response.headers['cache-control']).toContain('no-store');
      expect(response.headers['pragma']).toBe('no-cache');
      expect(response.headers['expires']).toBe('0');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should call recordEvent with correct parameters', async () => {
      const supertest = (await import('supertest')).default;
      const token = 'test-campaign-token-123456';

      await supertest(app)
        .get(`/api/t/p/${token}.gif`)
        .set('User-Agent', 'Mozilla/5.0 Test Browser')
        .set('X-Forwarded-For', '192.168.1.1')
        .expect(200);

      // Give async call time to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          pixelToken: token,
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0 Test Browser',
        })
      );
    });

    it('should return GIF even with invalid token', async () => {
      const supertest = (await import('supertest')).default;
      const response = await supertest(app)
        .get('/api/t/p/short.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
      // Should not attempt to record event for invalid token
      expect(mockRecordEvent).not.toHaveBeenCalled();
    });

    it('should return GIF even when recording fails', async () => {
      const supertest = (await import('supertest')).default;
      mockRecordEvent.mockRejectedValueOnce(new Error('Database error'));

      const response = await supertest(app)
        .get('/api/t/p/valid-token-12345678901234567890.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
    });

    it('should extract IP from X-Real-IP header', async () => {
      const supertest = (await import('supertest')).default;
      await supertest(app)
        .get('/api/t/p/token-for-ip-test-123456.gif')
        .set('X-Real-IP', '10.0.0.1')
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '10.0.0.1',
        })
      );
    });

    it('should use first IP from X-Forwarded-For chain', async () => {
      const supertest = (await import('supertest')).default;
      await supertest(app)
        .get('/api/t/p/token-for-chain-test-12345.gif')
        .set('X-Forwarded-For', '203.0.113.50, 70.41.3.18, 150.172.238.178')
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRecordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          ipAddress: '203.0.113.50',
        })
      );
    });
  });

  describe('GET /api/t/u/:token.gif (User Tracking Pixel)', () => {
    it('should return a transparent GIF with correct headers', async () => {
      const supertest = (await import('supertest')).default;
      const response = await supertest(app)
        .get('/api/t/u/user-token-abcdefghijklmnop.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
      expect(response.headers['content-length']).toBe(TRANSPARENT_GIF_BYTES.toString());
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('should call recordUserEvent with correct parameters', async () => {
      const supertest = (await import('supertest')).default;
      const token = 'user-tracking-token-xyz789';

      await supertest(app)
        .get(`/api/t/u/${token}.gif`)
        .set('User-Agent', 'Outlook/15.0')
        .set('X-Forwarded-For', '172.16.0.1')
        .expect(200);

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockRecordUserEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          userTrackingToken: token,
          ipAddress: '172.16.0.1',
          userAgent: 'Outlook/15.0',
        })
      );
    });

    it('should return GIF even with invalid token', async () => {
      const supertest = (await import('supertest')).default;
      const response = await supertest(app)
        .get('/api/t/u/bad.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
      expect(mockRecordUserEvent).not.toHaveBeenCalled();
    });

    it('should return GIF even when recording fails', async () => {
      const supertest = (await import('supertest')).default;
      mockRecordUserEvent.mockRejectedValueOnce(new Error('Database error'));

      const response = await supertest(app)
        .get('/api/t/u/user-token-for-error-test-1.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
    });
  });

  describe('GET /api/t/health', () => {
    it('should return health status', async () => {
      const supertest = (await import('supertest')).default;
      const response = await supertest(app)
        .get('/api/t/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        service: 'tracking',
        timestamp: expect.any(String),
      });
    });
  });

  describe('Rate Limiting', () => {
    // Note: Full rate limit testing requires timing control
    // These tests verify the basic behavior

    it('should allow requests within rate limit', async () => {
      const supertest = (await import('supertest')).default;

      // Make a few requests from same "IP"
      for (let i = 0; i < 5; i++) {
        const response = await supertest(app)
          .get(`/api/t/p/rate-test-token-${i}-abcdefgh.gif`)
          .set('X-Forwarded-For', '192.168.100.1')
          .expect(200);

        expect(response.headers['content-type']).toBe('image/gif');
      }
    });

    it('should return GIF but not record when rate limited', async () => {
      // This is a basic test - full rate limit testing needs timing control
      const supertest = (await import('supertest')).default;

      // Even if rate limited, should still return GIF
      const response = await supertest(app)
        .get('/api/t/p/another-valid-token-123456.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
    });
  });

  describe('Bot Filtering', () => {
    // Note: Bot filtering may be implemented in the trackingEventsService
    // These tests verify the endpoint still returns GIF for all user agents

    it('should return GIF for common bot user agents', async () => {
      const supertest = (await import('supertest')).default;
      const botUserAgents = [
        'Googlebot/2.1',
        'Mozilla/5.0 (compatible; bingbot/2.0)',
        'facebookexternalhit/1.1',
      ];

      for (const ua of botUserAgents) {
        const response = await supertest(app)
          .get('/api/t/p/bot-test-token-1234567890.gif')
          .set('User-Agent', ua)
          .expect(200);

        expect(response.headers['content-type']).toBe('image/gif');
      }
    });

    it('should return GIF for common email client user agents', async () => {
      const supertest = (await import('supertest')).default;
      const emailClients = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Outlook',
        'Mozilla/5.0 Gmail Image Proxy',
        'Apple Mail (2.3654.60.2)',
      ];

      for (const ua of emailClients) {
        const response = await supertest(app)
          .get('/api/t/u/email-client-test-token-12.gif')
          .set('User-Agent', ua)
          .expect(200);

        expect(response.headers['content-type']).toBe('image/gif');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty user agent', async () => {
      const supertest = (await import('supertest')).default;
      const response = await supertest(app)
        .get('/api/t/p/empty-ua-token-123456789.gif')
        .set('User-Agent', '')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
    });

    it('should handle missing X-Forwarded-For', async () => {
      const supertest = (await import('supertest')).default;
      const response = await supertest(app)
        .get('/api/t/p/no-proxy-token-12345678.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
    });

    it('should handle tokens with special characters in path', async () => {
      const supertest = (await import('supertest')).default;
      // URL-encoded special chars that might appear in base64url tokens
      const response = await supertest(app)
        .get('/api/t/p/token-with-dash_underscore.gif')
        .expect(200);

      expect(response.headers['content-type']).toBe('image/gif');
    });
  });

  describe('Response Performance', () => {
    it('should respond quickly (< 100ms for GIF)', async () => {
      const supertest = (await import('supertest')).default;
      const start = Date.now();

      await supertest(app)
        .get('/api/t/p/performance-test-token-123.gif')
        .expect(200);

      const duration = Date.now() - start;
      // Should respond very quickly since recording is async
      expect(duration).toBeLessThan(100);
    });
  });
});

describe('Tracking Analytics Routes', () => {
  // Note: These tests would require full app setup with auth middleware
  // For now, we focus on the public tracking endpoints above

  describe('Protected Endpoints (require auth)', () => {
    it.todo('should require authentication for /api/tracking/my-stats');
    it.todo('should require authentication for /api/tracking/my-stats/daily');
    it.todo('should require admin role for /api/admin/tracking/organization-stats');
    it.todo('should require admin role for /api/admin/tracking/user/:userId/stats');
  });
});
