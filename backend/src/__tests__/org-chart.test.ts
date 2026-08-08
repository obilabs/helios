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

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'admin-user-id',
      email: 'admin@gridworx.io',
      organizationId: 'test-org-id',
      role: 'admin',
    };
    next();
  },
}));

// Import routes after mocking
import orgChartRoutes from '../routes/org-chart.routes.js';

describe('Org Chart Routes', () => {
  let app: Express;

  const testOrgId = 'test-org-id';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', orgChartRoutes);
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/org-chart', () => {
    it('should return org chart with hierarchy structure', async () => {
      // Mock hierarchy query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: '1', first_name: 'Jack', last_name: 'Chen', email: 'jack@gridworx.io', job_title: 'CEO', department: 'Executive', level: 0, reporting_manager_id: null },
          { user_id: '2', first_name: 'Sarah', last_name: 'Chen', email: 'sarah@gridworx.io', job_title: 'CTO', department: 'Engineering', level: 1, reporting_manager_id: '1' },
          { user_id: '3', first_name: 'Michael', last_name: 'Rodriguez', email: 'michael@gridworx.io', job_title: 'VP Engineering', department: 'Engineering', level: 2, reporting_manager_id: '2' },
        ],
      });

      // Mock orphans query
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      // Mock stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_users: '3', max_depth: '2', avg_span: '1.5' }],
      });

      const response = await request(app)
        .get('/api/org-chart')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.root).toBeDefined();
      expect(response.body.data.stats).toBeDefined();
      expect(response.body.data.stats.totalUsers).toBe(3);
      expect(response.body.data.stats.maxDepth).toBe(2);
    });

    it('should return orphaned users separately', async () => {
      // Mock hierarchy query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: '1', first_name: 'Jack', last_name: 'Chen', email: 'jack@gridworx.io', job_title: 'CEO', department: 'Executive', level: 0, reporting_manager_id: null },
        ],
      });

      // Mock orphans query - users with invalid manager references
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: '101', first_name: 'Frank', last_name: 'Thompson', email: 'frank@gridworx.io', job_title: 'Security Consultant', department: 'IT', reporting_manager_id: 'deleted-user-id' },
        ],
      });

      // Mock stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_users: '2', max_depth: '0', avg_span: '0' }],
      });

      const response = await request(app)
        .get('/api/org-chart')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.orphans).toBeDefined();
      expect(response.body.data.orphans).toHaveLength(1);
      expect(response.body.data.orphans[0].name).toBe('Frank Thompson');
    });

    it('should build correct tree structure with direct reports', async () => {
      // Mock hierarchy with multiple levels
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'ceo', first_name: 'John', last_name: 'CEO', email: 'ceo@gridworx.io', job_title: 'CEO', department: 'Executive', level: 0, reporting_manager_id: null },
          { user_id: 'cto', first_name: 'Jane', last_name: 'CTO', email: 'cto@gridworx.io', job_title: 'CTO', department: 'Engineering', level: 1, reporting_manager_id: 'ceo' },
          { user_id: 'dev1', first_name: 'Dev', last_name: 'One', email: 'dev1@gridworx.io', job_title: 'Developer', department: 'Engineering', level: 2, reporting_manager_id: 'cto' },
        ],
      });

      // Mock orphans query
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock stats query
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_users: '3', max_depth: '2', avg_span: '1' }],
      });

      const response = await request(app)
        .get('/api/org-chart')
        .expect(200);

      const root = response.body.data.root;
      expect(root.userId).toBe('ceo');
      expect(root.directReports).toHaveLength(1);
      expect(root.directReports[0].userId).toBe('cto');
      expect(root.directReports[0].directReports).toHaveLength(1);
      expect(root.directReports[0].directReports[0].userId).toBe('dev1');
    });
  });

  describe('PUT /api/users/:userId/manager', () => {
    it('should update manager relationship', async () => {
      // Mock validation query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'manager-1' }],
      });

      // Mock update query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@gridworx.io', first_name: 'Test', last_name: 'User', reporting_manager_id: 'manager-1' }],
      });

      const response = await request(app)
        .put('/api/users/user-1/manager')
        .send({ managerId: 'manager-1' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should reject circular manager references', async () => {
      // Mock validation query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-1' }],
      });

      // Mock update query that throws circular reference error
      mockQuery.mockRejectedValueOnce(new Error('Circular manager reference detected'));

      const response = await request(app)
        .put('/api/users/user-1/manager')
        .send({ managerId: 'user-1' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('circular');
    });

    it('should reject if user tries to be their own manager', async () => {
      // Mock validation query - both IDs (user-1 for user and user-1 for manager) resolve to same user
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-1' }],
      });

      // Mock update query that throws self-manager error from database trigger
      mockQuery.mockRejectedValueOnce(new Error('A user cannot be their own manager'));

      const response = await request(app)
        .put('/api/users/user-1/manager')
        .send({ managerId: 'user-1' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('own manager');
    });

    it('should allow removing manager (setting to null)', async () => {
      // Mock validation query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });

      // Mock update query
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1', email: 'user@gridworx.io', first_name: 'Test', last_name: 'User', reporting_manager_id: null }],
      });

      const response = await request(app)
        .put('/api/users/user-1/manager')
        .send({ managerId: null })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/users/:userId/direct-reports', () => {
    it('should return direct reports for a manager', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { user_id: 'report-1', email: 'report1@gridworx.io', first_name: 'Report', last_name: 'One', job_title: 'Developer', department: 'Engineering', direct_reports_count: '0' },
          { user_id: 'report-2', email: 'report2@gridworx.io', first_name: 'Report', last_name: 'Two', job_title: 'Developer', department: 'Engineering', direct_reports_count: '2' },
        ],
      });

      const response = await request(app)
        .get('/api/users/manager-id/direct-reports')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Report One');
      expect(response.body.data[1].directReportsCount).toBe(2);
    });

    it('should return empty array if no direct reports', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .get('/api/users/user-with-no-reports/direct-reports')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });
});

describe('Org Chart Data Integrity', () => {
  describe('Hierarchy Validation', () => {
    it('should have single root (CEO) at level 0', () => {
      const hierarchy = [
        { user_id: '1', job_title: 'CEO', level: 0, reporting_manager_id: null },
        { user_id: '2', job_title: 'CTO', level: 1, reporting_manager_id: '1' },
        { user_id: '3', job_title: 'CFO', level: 1, reporting_manager_id: '1' },
      ];

      const rootNodes = hierarchy.filter(u => u.reporting_manager_id === null);
      expect(rootNodes).toHaveLength(1);
      expect(rootNodes[0].level).toBe(0);
    });

    it('should have C-Suite at level 1', () => {
      const hierarchy = [
        { user_id: '1', job_title: 'CEO', level: 0, reporting_manager_id: null },
        { user_id: '2', job_title: 'CTO', level: 1, reporting_manager_id: '1' },
        { user_id: '3', job_title: 'CFO', level: 1, reporting_manager_id: '1' },
        { user_id: '4', job_title: 'CMO', level: 1, reporting_manager_id: '1' },
        { user_id: '5', job_title: 'COO', level: 1, reporting_manager_id: '1' },
      ];

      const cSuite = hierarchy.filter(u => u.level === 1);
      expect(cSuite.length).toBeGreaterThanOrEqual(4);

      const cSuiteTitles = cSuite.map(u => u.job_title);
      expect(cSuiteTitles).toContain('CTO');
      expect(cSuiteTitles).toContain('CFO');
      expect(cSuiteTitles).toContain('CMO');
      expect(cSuiteTitles).toContain('COO');
    });

    it('should have VPs at level 2', () => {
      const hierarchy = [
        { user_id: '1', job_title: 'CEO', level: 0 },
        { user_id: '2', job_title: 'CTO', level: 1 },
        { user_id: '3', job_title: 'VP Engineering', level: 2 },
        { user_id: '4', job_title: 'VP Product', level: 2 },
      ];

      const vps = hierarchy.filter(u => u.level === 2 && u.job_title.includes('VP'));
      expect(vps.length).toBeGreaterThanOrEqual(2);
    });

    it('should have no circular references', () => {
      const hierarchy = [
        { user_id: '1', job_title: 'CEO', reporting_manager_id: null },
        { user_id: '2', job_title: 'CTO', reporting_manager_id: '1' },
        { user_id: '3', job_title: 'VP', reporting_manager_id: '2' },
      ];

      // Check that no user's manager chain leads back to themselves
      const checkCircular = (userId: string, visited: Set<string>): boolean => {
        if (visited.has(userId)) return true; // Circular detected
        visited.add(userId);

        const user = hierarchy.find(u => u.user_id === userId);
        if (!user || !user.reporting_manager_id) return false;

        return checkCircular(user.reporting_manager_id, visited);
      };

      hierarchy.forEach(user => {
        const hasCircular = checkCircular(user.user_id, new Set());
        expect(hasCircular).toBe(false);
      });
    });
  });

  describe('Orphan Detection', () => {
    it('should identify users without managers (excluding CEO)', () => {
      const users = [
        { user_id: '1', job_title: 'CEO', reporting_manager_id: null },
        { user_id: '2', job_title: 'CTO', reporting_manager_id: '1' },
        { user_id: '3', job_title: 'Contractor', reporting_manager_id: null }, // Orphan
        { user_id: '4', job_title: 'New Hire', reporting_manager_id: null }, // Orphan
      ];

      const orphans = users.filter(
        u => u.reporting_manager_id === null &&
             !u.job_title.includes('CEO') &&
             !u.job_title.includes('Chief Executive')
      );

      expect(orphans).toHaveLength(2);
      expect(orphans.map(o => o.job_title)).toContain('Contractor');
      expect(orphans.map(o => o.job_title)).toContain('New Hire');
    });

    it('should identify users with invalid manager references', () => {
      const users = [
        { user_id: '1', job_title: 'CEO', reporting_manager_id: null },
        { user_id: '2', job_title: 'Employee', reporting_manager_id: 'deleted-user' },
      ];

      const validUserIds = users.map(u => u.user_id);

      const invalidRefs = users.filter(
        u => u.reporting_manager_id !== null &&
             !validUserIds.includes(u.reporting_manager_id)
      );

      expect(invalidRefs).toHaveLength(1);
      expect(invalidRefs[0].job_title).toBe('Employee');
    });
  });
});
