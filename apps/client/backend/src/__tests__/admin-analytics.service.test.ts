/**
 * Admin Analytics Service Tests
 *
 * Tests for organization-wide email engagement analytics functionality.
 */

import { jest } from '@jest/globals';

// Mock the database connection
jest.mock('../database/connection', () => ({
  db: {
    query: jest.fn(),
  },
}));

// Mock the user analytics service
jest.mock('../services/user-analytics.service', () => ({
  userAnalyticsService: {
    getMyStats: jest.fn(),
  },
}));

import { db } from '../database/connection.js';
import { userAnalyticsService } from '../services/user-analytics.service.js';
import { adminAnalyticsService, OrgAnalytics } from '../services/admin-analytics.service.js';

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;
const mockGetMyStats = userAnalyticsService.getMyStats as jest.MockedFunction<typeof userAnalyticsService.getMyStats>;

describe('AdminAnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrganizationStats', () => {
    const organizationId = 'org-123';

    it('should return comprehensive organization stats', async () => {
      // Mock getOrgSummary
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '1000', unique_opens: '500', active_users: '25' }],
      } as any);

      // Mock getTopPerformers
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-1',
            name: 'John Doe',
            email: 'john@example.com',
            department: 'Engineering',
            opens: '150',
            unique_opens: '75',
          },
          {
            user_id: 'user-2',
            name: 'Jane Smith',
            email: 'jane@example.com',
            department: 'Marketing',
            opens: '120',
            unique_opens: '60',
          },
        ],
      } as any);

      // Mock getDepartmentBreakdown
      mockQuery.mockResolvedValueOnce({
        rows: [
          { department: 'Engineering', opens: '400', unique_opens: '200', users: '10' },
          { department: 'Marketing', opens: '300', unique_opens: '150', users: '8' },
          { department: 'Unassigned', opens: '100', unique_opens: '50', users: '5' },
        ],
      } as any);

      // Mock getOrgDailyStats
      const today = new Date();
      mockQuery.mockResolvedValueOnce({
        rows: [
          { date: today, total_opens: '50', unique_opens: '25', active_users: '10' },
        ],
      } as any);

      // Mock getTrackedUserCount
      mockQuery.mockResolvedValueOnce({
        rows: [{ count: '30' }],
      } as any);

      const result = await adminAnalyticsService.getOrganizationStats(organizationId);

      expect(result.totalOpens).toBe(1000);
      expect(result.uniqueOpens).toBe(500);
      expect(result.activeUsers).toBe(25);
      expect(result.trackedUsers).toBe(30);
      expect(result.topPerformers).toHaveLength(2);
      expect(result.topPerformers[0].name).toBe('John Doe');
      expect(result.byDepartment).toHaveLength(3);
      expect(result.dailyStats).toHaveLength(1);
    });

    it('should return empty stats on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await adminAnalyticsService.getOrganizationStats(organizationId);

      expect(result.totalOpens).toBe(0);
      expect(result.uniqueOpens).toBe(0);
      expect(result.activeUsers).toBe(0);
      expect(result.trackedUsers).toBe(0);
      expect(result.topPerformers).toEqual([]);
      expect(result.byDepartment).toEqual([]);
      expect(result.dailyStats).toEqual([]);
    });

    it('should use default 30 days if not specified', async () => {
      // Setup minimal mocks
      mockQuery.mockResolvedValue({ rows: [{ total_opens: '0', unique_opens: '0', active_users: '0', count: '0' }] } as any);

      await adminAnalyticsService.getOrganizationStats(organizationId);

      // Check that 30 is passed to the query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [organizationId, 30]
      );
    });

    it('should allow custom day range', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total_opens: '0', unique_opens: '0', active_users: '0', count: '0' }] } as any);

      await adminAnalyticsService.getOrganizationStats(organizationId, 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [organizationId, 7]
      );
    });
  });

  describe('getUserStats', () => {
    it('should delegate to userAnalyticsService', async () => {
      const userId = 'user-123';
      const mockStats = {
        today: { opens: 10, unique: 5 },
        thisWeek: { opens: 50, unique: 25 },
        thisMonth: { opens: 200, unique: 100 },
        trend: { direction: 'up' as const, percentage: 25 },
        peakHours: [],
        byDevice: { desktop: 50, mobile: 40, tablet: 10 },
      };

      mockGetMyStats.mockResolvedValueOnce(mockStats);

      const result = await adminAnalyticsService.getUserStats(userId);

      expect(mockGetMyStats).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockStats);
    });
  });

  describe('getEngagementTrend', () => {
    const organizationId = 'org-123';

    it('should calculate trend between periods', async () => {
      // Current period
      mockQuery.mockResolvedValueOnce({
        rows: [{ opens: '100', unique_opens: '50', active_users: '10' }],
      } as any);

      // Previous period
      mockQuery.mockResolvedValueOnce({
        rows: [{ opens: '80', unique_opens: '40', active_users: '8' }],
      } as any);

      const result = await adminAnalyticsService.getEngagementTrend(organizationId, 7);

      expect(result.currentPeriod).toEqual({ opens: 100, uniqueOpens: 50, activeUsers: 10 });
      expect(result.previousPeriod).toEqual({ opens: 80, uniqueOpens: 40, activeUsers: 8 });
      expect(result.trend.opens).toBe(25); // 25% increase
      expect(result.trend.uniqueOpens).toBe(25);
      expect(result.trend.activeUsers).toBe(25);
    });

    it('should handle zero previous period', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ opens: '100', unique_opens: '50', active_users: '10' }],
      } as any);

      mockQuery.mockResolvedValueOnce({
        rows: [{ opens: '0', unique_opens: '0', active_users: '0' }],
      } as any);

      const result = await adminAnalyticsService.getEngagementTrend(organizationId);

      expect(result.trend.opens).toBe(100); // 100% when previous was 0
    });

    it('should return zeros on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await adminAnalyticsService.getEngagementTrend(organizationId);

      expect(result.currentPeriod).toEqual({ opens: 0, uniqueOpens: 0, activeUsers: 0 });
      expect(result.previousPeriod).toEqual({ opens: 0, uniqueOpens: 0, activeUsers: 0 });
      expect(result.trend).toEqual({ opens: 0, uniqueOpens: 0, activeUsers: 0 });
    });
  });

  describe('getOrgPeakHours', () => {
    const organizationId = 'org-123';

    it('should return peak hours with day names', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { day_of_week: '1', hour: '10', open_count: '100' }, // Monday
          { day_of_week: '2', hour: '14', open_count: '80' },  // Tuesday
          { day_of_week: '3', hour: '11', open_count: '75' },  // Wednesday
        ],
      } as any);

      const result = await adminAnalyticsService.getOrgPeakHours(organizationId);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ hour: 10, day: 'Monday', avgOpens: 100 });
      expect(result[1]).toEqual({ hour: 14, day: 'Tuesday', avgOpens: 80 });
      expect(result[2]).toEqual({ hour: 11, day: 'Wednesday', avgOpens: 75 });
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await adminAnalyticsService.getOrgPeakHours(organizationId);

      expect(result).toEqual([]);
    });
  });

  describe('getOrgDeviceStats', () => {
    const organizationId = 'org-123';

    it('should return device breakdown', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ desktop: '500', mobile: '300', tablet: '200', total: '1000' }],
      } as any);

      const result = await adminAnalyticsService.getOrgDeviceStats(organizationId);

      expect(result).toEqual({
        desktop: 500,
        mobile: 300,
        tablet: 200,
        total: 1000,
      });
    });

    it('should return zeros on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await adminAnalyticsService.getOrgDeviceStats(organizationId);

      expect(result).toEqual({ desktop: 0, mobile: 0, tablet: 0, total: 0 });
    });
  });

  describe('getInactiveTrackedUsers', () => {
    const organizationId = 'org-123';

    it('should return users with no recent activity', async () => {
      const lastActivity = new Date('2024-01-01');
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            user_id: 'user-1',
            name: 'John Inactive',
            email: 'john@example.com',
            last_activity: lastActivity,
          },
          {
            user_id: 'user-2',
            name: 'Jane Never',
            email: 'jane@example.com',
            last_activity: null,
          },
        ],
      } as any);

      const result = await adminAnalyticsService.getInactiveTrackedUsers(organizationId);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('John Inactive');
      expect(result[0].lastActivity).toEqual(lastActivity);
      expect(result[1].name).toBe('Jane Never');
      expect(result[1].lastActivity).toBeNull();
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await adminAnalyticsService.getInactiveTrackedUsers(organizationId);

      expect(result).toEqual([]);
    });
  });

  describe('department breakdown calculations', () => {
    const organizationId = 'org-123';

    it('should calculate average opens per user correctly', async () => {
      // Setup mocks for full getOrganizationStats
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '0', unique_opens: '0', active_users: '0' }],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      // Department breakdown with 100 opens / 10 users = 10 avg
      mockQuery.mockResolvedValueOnce({
        rows: [
          { department: 'Engineering', opens: '100', unique_opens: '50', users: '10' },
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      const result = await adminAnalyticsService.getOrganizationStats(organizationId);

      expect(result.byDepartment[0].avgOpensPerUser).toBe(10);
    });

    it('should handle zero users in department', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '0', unique_opens: '0', active_users: '0' }],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({
        rows: [
          { department: 'Empty', opens: '0', unique_opens: '0', users: '0' },
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      const result = await adminAnalyticsService.getOrganizationStats(organizationId);

      expect(result.byDepartment[0].avgOpensPerUser).toBe(0);
    });

    it('should round avgOpensPerUser to one decimal', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '0', unique_opens: '0', active_users: '0' }],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      // 33 opens / 10 users = 3.3
      mockQuery.mockResolvedValueOnce({
        rows: [
          { department: 'Sales', opens: '33', unique_opens: '15', users: '10' },
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] } as any);

      const result = await adminAnalyticsService.getOrganizationStats(organizationId);

      expect(result.byDepartment[0].avgOpensPerUser).toBe(3.3);
    });
  });
});
