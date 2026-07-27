/**
 * Route Guards Test Suite (TASK-AUS-T04)
 * Tests for admin and employee route guards
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express, { Express, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Import the actual middleware (no mocking for these tests)
import { requireAuth, requireAdmin, requireEmployee } from '../middleware/auth.js';

// Mock logger to suppress output
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secure_jwt_secret_key_here';

/**
 * Generate a test JWT token
 */
function generateToken(payload: {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
  isExternalAdmin?: boolean;
  type?: string;
}) {
  return jwt.sign(
    { ...payload, type: payload.type || 'access' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Route Guards', () => {
  let app: Express;

  const testOrgId = 'test-org-id';

  // Test user configurations
  const internalAdmin = {
    userId: 'internal-admin-id',
    email: 'admin@example.com',
    role: 'admin',
    organizationId: testOrgId,
    isExternalAdmin: false,
  };

  const externalAdmin = {
    userId: 'external-admin-id',
    email: 'external@consultant.com',
    role: 'admin',
    organizationId: testOrgId,
    isExternalAdmin: true,
  };

  const regularUser = {
    userId: 'regular-user-id',
    email: 'user@example.com',
    role: 'user',
    organizationId: testOrgId,
    isExternalAdmin: false,
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requireAuth middleware', () => {
    beforeEach(() => {
      // Set up a test route that requires authentication
      app.get('/api/test/auth', requireAuth, (req: Request, res: Response) => {
        res.json({
          success: true,
          user: req.user,
        });
      });
    });

    it('should reject requests without Authorization header', async () => {
      const response = await request(app)
        .get('/api/test/auth')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Authentication required');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/test/auth')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should accept valid token and attach user to request', async () => {
      const token = generateToken(internalAdmin);

      const response = await request(app)
        .get('/api/test/auth')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(internalAdmin.email);
      expect(response.body.user.isAdmin).toBe(true);
      expect(response.body.user.isEmployee).toBe(true);
    });

    it('should set isEmployee=false for external admin', async () => {
      const token = generateToken(externalAdmin);

      const response = await request(app)
        .get('/api/test/auth')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.isAdmin).toBe(true);
      expect(response.body.user.isEmployee).toBe(false);
    });

    it('should set isAdmin=false for regular user', async () => {
      const token = generateToken(regularUser);

      const response = await request(app)
        .get('/api/test/auth')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user.isAdmin).toBe(false);
      expect(response.body.user.isEmployee).toBe(true);
    });
  });

  describe('requireAdmin middleware', () => {
    beforeEach(() => {
      // Set up a test route that requires admin access
      app.get('/api/test/admin', requireAuth, requireAdmin, (req: Request, res: Response) => {
        res.json({
          success: true,
          message: 'Admin access granted',
        });
      });
    });

    it('should allow internal admin access', async () => {
      const token = generateToken(internalAdmin);

      const response = await request(app)
        .get('/api/test/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Admin access granted');
    });

    it('should allow external admin access', async () => {
      const token = generateToken(externalAdmin);

      const response = await request(app)
        .get('/api/test/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Admin access granted');
    });

    it('should deny regular user access', async () => {
      const token = generateToken(regularUser);

      const response = await request(app)
        .get('/api/test/admin')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toBe('Admin access required');
    });

    it('should deny unauthenticated access', async () => {
      const response = await request(app)
        .get('/api/test/admin')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('requireEmployee middleware', () => {
    beforeEach(() => {
      // Set up a test route that requires employee access
      app.get('/api/test/employee', requireAuth, requireEmployee, (req: Request, res: Response) => {
        res.json({
          success: true,
          message: 'Employee access granted',
        });
      });
    });

    it('should allow internal admin access (internal admins are employees)', async () => {
      const token = generateToken(internalAdmin);

      const response = await request(app)
        .get('/api/test/employee')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Employee access granted');
    });

    it('should allow regular user access (regular users are employees)', async () => {
      const token = generateToken(regularUser);

      const response = await request(app)
        .get('/api/test/employee')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Employee access granted');
    });

    it('should deny external admin access (external admins are NOT employees)', async () => {
      const token = generateToken(externalAdmin);

      const response = await request(app)
        .get('/api/test/employee')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.message).toContain('Employee access required');
    });

    it('should deny unauthenticated access', async () => {
      const response = await request(app)
        .get('/api/test/employee')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Combined middleware scenarios', () => {
    beforeEach(() => {
      // Admin-only route
      app.get('/api/admin/users', requireAuth, requireAdmin, (req: Request, res: Response) => {
        res.json({ success: true, route: 'admin-users' });
      });

      // Employee-only route (like People Directory)
      app.get('/api/people', requireAuth, requireEmployee, (req: Request, res: Response) => {
        res.json({ success: true, route: 'people' });
      });

      // Mixed route (admin can access, but employee-specific data)
      app.get('/api/me/profile', requireAuth, requireEmployee, (req: Request, res: Response) => {
        res.json({ success: true, route: 'my-profile' });
      });
    });

    it('internal admin can access both admin and employee routes', async () => {
      const token = generateToken(internalAdmin);

      // Can access admin route
      let response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.route).toBe('admin-users');

      // Can access employee route
      response = await request(app)
        .get('/api/people')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.route).toBe('people');

      // Can access my-profile route
      response = await request(app)
        .get('/api/me/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.route).toBe('my-profile');
    });

    it('external admin can access admin routes but NOT employee routes', async () => {
      const token = generateToken(externalAdmin);

      // Can access admin route
      let response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.route).toBe('admin-users');

      // CANNOT access employee route (People Directory)
      response = await request(app)
        .get('/api/people')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(response.body.success).toBe(false);

      // CANNOT access my-profile route
      response = await request(app)
        .get('/api/me/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(response.body.success).toBe(false);
    });

    it('regular user can access employee routes but NOT admin routes', async () => {
      const token = generateToken(regularUser);

      // CANNOT access admin route
      let response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(response.body.success).toBe(false);

      // Can access employee route (People Directory)
      response = await request(app)
        .get('/api/people')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.route).toBe('people');

      // Can access my-profile route
      response = await request(app)
        .get('/api/me/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.route).toBe('my-profile');
    });
  });

  describe('Token edge cases', () => {
    beforeEach(() => {
      app.get('/api/test', requireAuth, (req: Request, res: Response) => {
        res.json({ success: true });
      });
    });

    it('should reject token with wrong type (refresh instead of access)', async () => {
      const token = generateToken({ ...internalAdmin, type: 'refresh' });

      const response = await request(app)
        .get('/api/test')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should reject malformed Authorization header', async () => {
      const token = generateToken(internalAdmin);

      // Missing "Bearer " prefix
      let response = await request(app)
        .get('/api/test')
        .set('Authorization', token)
        .expect(401);
      expect(response.body.success).toBe(false);

      // Wrong scheme
      response = await request(app)
        .get('/api/test')
        .set('Authorization', `Basic ${token}`)
        .expect(401);
      expect(response.body.success).toBe(false);
    });

    it('should handle legacy tokens without isExternalAdmin (default to false)', async () => {
      // Generate token without isExternalAdmin field
      const legacyPayload = {
        userId: 'legacy-user-id',
        email: 'legacy@example.com',
        role: 'admin',
        organizationId: testOrgId,
        type: 'access',
        // Note: no isExternalAdmin field
      };
      const token = jwt.sign(legacyPayload, JWT_SECRET, { expiresIn: '1h' });

      // Set up employee route
      app.get('/api/legacy-test', requireAuth, requireEmployee, (req: Request, res: Response) => {
        res.json({
          success: true,
          isEmployee: req.user?.isEmployee,
        });
      });

      const response = await request(app)
        .get('/api/legacy-test')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Should default to isEmployee=true when isExternalAdmin is not set
      expect(response.body.success).toBe(true);
      expect(response.body.isEmployee).toBe(true);
    });
  });
});
