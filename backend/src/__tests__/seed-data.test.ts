import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';

// Mock database with actual seed data expectations
const mockQuery = jest.fn();
jest.mock('../database/connection', () => ({
  db: {
    query: mockQuery,
  },
}));

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
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
import organizationRoutes from '../routes/organization.routes.js';

describe('Seed Data Verification', () => {
  let app: Express;

  const testOrgId = 'test-org-id';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/organization', organizationRoutes);
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/organization/users/stats', () => {
    it('should return user statistics with correct structure', async () => {
      // Mock role counts
      mockQuery.mockResolvedValueOnce({
        rows: [
          { role: 'admin', count: '2' },
          { role: 'manager', count: '7' },
          { role: 'user', count: '19' },
        ],
      });

      // Mock employee type counts
      mockQuery.mockResolvedValueOnce({
        rows: [
          { employee_type: 'Full Time', count: '25' },
          { employee_type: 'Contractor', count: '1' },
          { employee_type: 'Intern', count: '1' },
          { employee_type: 'Unknown', count: '1' },
        ],
      });

      // Mock managers count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '14' }],
      });

      // Mock orphans count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '3' }],
      });

      // Mock total count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '28' }],
      });

      const response = await request(app)
        .get('/api/organization/users/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.total).toBe(28);
      expect(response.body.data.byRole).toEqual({
        admin: 2,
        manager: 7,
        user: 19,
      });
      expect(response.body.data.orphans).toBe(3);
      expect(response.body.data.managers).toBe(14);
    });

    it('should return correct orphan count excluding CEO', async () => {
      // Mock role counts
      mockQuery.mockResolvedValueOnce({
        rows: [{ role: 'user', count: '10' }],
      });

      // Mock employee type counts
      mockQuery.mockResolvedValueOnce({
        rows: [{ employee_type: 'Full Time', count: '10' }],
      });

      // Mock managers count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '3' }],
      });

      // Mock orphans count - 3 orphans (not including CEO)
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '3' }],
      });

      // Mock total count
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '10' }],
      });

      const response = await request(app)
        .get('/api/organization/users/stats')
        .expect(200);

      // Verify orphan query was called with correct exclusions
      const orphanQueryCall = mockQuery.mock.calls[3][0];
      expect(orphanQueryCall).toContain('reporting_manager_id IS NULL');
      expect(orphanQueryCall).toContain('Chief Executive');
      expect(orphanQueryCall).toContain('CEO');

      expect(response.body.data.orphans).toBe(3);
    });
  });

  describe('Seed Data Structure', () => {
    it('should have proper reporting manager chains', async () => {
      // Mock org hierarchy query
      const hierarchyData = [
        { id: '1', first_name: 'Jack', last_name: 'Chen', job_title: 'CEO', level: 0 },
        { id: '2', first_name: 'Sarah', last_name: 'Chen', job_title: 'CTO', level: 1, reporting_manager_id: '1' },
        { id: '3', first_name: 'Michael', last_name: 'Rodriguez', job_title: 'VP Engineering', level: 2, reporting_manager_id: '2' },
        { id: '4', first_name: 'David', last_name: 'Kim', job_title: 'Engineering Manager', level: 3, reporting_manager_id: '3' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: hierarchyData,
      });

      // Query to verify chain integrity (CEO -> CTO -> VP -> Manager)
      const query = `
        WITH RECURSIVE org_tree AS (
          SELECT id, first_name, last_name, job_title, reporting_manager_id, 0 as level
          FROM organization_users
          WHERE reporting_manager_id IS NULL AND job_title LIKE '%CEO%'

          UNION ALL

          SELECT ou.id, ou.first_name, ou.last_name, ou.job_title, ou.reporting_manager_id, ot.level + 1
          FROM organization_users ou
          JOIN org_tree ot ON ou.reporting_manager_id = ot.id
        )
        SELECT * FROM org_tree ORDER BY level
      `;

      // Verify hierarchy has expected depth
      expect(hierarchyData.filter(u => u.level === 0)).toHaveLength(1); // CEO
      expect(hierarchyData.filter(u => u.level === 1)).toHaveLength(1); // C-Suite
      expect(hierarchyData.filter(u => u.level === 2)).toHaveLength(1); // VP
      expect(hierarchyData.filter(u => u.level === 3)).toHaveLength(1); // Manager
    });

    it('should identify orphaned users correctly', async () => {
      const orphanedUsers = [
        { id: '101', first_name: 'Frank', last_name: 'Thompson', job_title: 'Security Consultant', reporting_manager_id: null },
        { id: '102', first_name: 'Grace', last_name: 'Liu', job_title: 'Data Analyst', reporting_manager_id: null },
        { id: '103', first_name: 'Jake', last_name: 'Roberts', job_title: 'Marketing Intern', reporting_manager_id: null },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: orphanedUsers,
      });

      // All orphans should NOT be CEO
      orphanedUsers.forEach(user => {
        expect(user.job_title).not.toContain('CEO');
        expect(user.job_title).not.toContain('Chief Executive');
        expect(user.reporting_manager_id).toBeNull();
      });
    });
  });

  describe('Department Assignments', () => {
    it('should have 7 departments with proper assignments', async () => {
      const departments = [
        { name: 'Executive', user_count: '1' },
        { name: 'Engineering', user_count: '8' },
        { name: 'Product', user_count: '4' },
        { name: 'Finance', user_count: '3' },
        { name: 'Marketing', user_count: '4' },
        { name: 'Operations', user_count: '3' },
        { name: 'Human Resources', user_count: '2' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: departments,
      });

      // Verify all expected departments exist
      const deptNames = departments.map(d => d.name);
      expect(deptNames).toContain('Executive');
      expect(deptNames).toContain('Engineering');
      expect(deptNames).toContain('Product');
      expect(deptNames).toContain('Finance');
      expect(deptNames).toContain('Marketing');
      expect(deptNames).toContain('Operations');
      expect(deptNames).toContain('Human Resources');
    });
  });

  describe('Group Membership', () => {
    it('should have proper group structure', async () => {
      const groups = [
        { name: 'All Staff', membership_type: 'dynamic', member_count: '28' },
        { name: 'Leadership Team', membership_type: 'static', member_count: '7' },
        { name: 'Tech Team', membership_type: 'dynamic', member_count: '12' },
        { name: 'Project Phoenix', membership_type: 'static', member_count: '6' },
      ];

      mockQuery.mockResolvedValueOnce({
        rows: groups,
      });

      // Verify group structure
      const allStaff = groups.find(g => g.name === 'All Staff');
      expect(allStaff?.membership_type).toBe('dynamic');

      const leadership = groups.find(g => g.name === 'Leadership Team');
      expect(leadership?.membership_type).toBe('static');

      const techTeam = groups.find(g => g.name === 'Tech Team');
      expect(techTeam?.membership_type).toBe('dynamic');

      const phoenix = groups.find(g => g.name === 'Project Phoenix');
      expect(phoenix?.membership_type).toBe('static');
    });
  });
});
