/**
 * User Analytics Service Tests
 *
 * Tests for personal email engagement analytics functionality.
 */

import { jest } from '@jest/globals';

// Mock the database connection
jest.mock('../database/connection', () => ({
  db: {
    query: jest.fn(),
  },
}));

import { db } from '../database/connection.js';
import { userAnalyticsService, UserAnalytics, DailyStats } from '../services/user-analytics.service.js';

const mockQuery = db.query as jest.MockedFunction<typeof db.query>;

describe('UserAnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getMyStats', () => {
    const userId = 'user-123';

    it('should return comprehensive analytics for a user', async () => {
      // Mock responses for all parallel queries
      // getPeriodStats('today')
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '10', unique_opens: '5' }],
      } as any);
      // getPeriodStats('week')
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '50', unique_opens: '25' }],
      } as any);
      // getPeriodStats('month')
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '200', unique_opens: '100' }],
      } as any);
      // getPeriodStats('last_week')
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_opens: '40', unique_opens: '20' }],
      } as any);
      // getPeakHours
      mockQuery.mockResolvedValueOnce({
        rows: [
          { day_of_week: '1', hour: '10', open_count: '15' },
          { day_of_week: '2', hour: '14', open_count: '12' },
        ],
      } as any);
      // getDeviceBreakdown
      mockQuery.mockResolvedValueOnce({
        rows: [{ desktop: '100', mobile: '80', tablet: '20' }],
      } as any);

      const result = await userAnalyticsService.getMyStats(userId);

      expect(result.today).toEqual({ opens: 10, unique: 5 });
      expect(result.thisWeek).toEqual({ opens: 50, unique: 25 });
      expect(result.thisMonth).toEqual({ opens: 200, unique: 100 });
      expect(result.trend.direction).toBe('up'); // 50 vs 40 = 25% increase
      expect(result.peakHours).toHaveLength(2);
      expect(result.byDevice).toEqual({ desktop: 100, mobile: 80, tablet: 20 });
    });

    it('should return empty stats on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database error'));

      const result = await userAnalyticsService.getMyStats(userId);

      expect(result.today).toEqual({ opens: 0, unique: 0 });
      expect(result.thisWeek).toEqual({ opens: 0, unique: 0 });
      expect(result.thisMonth).toEqual({ opens: 0, unique: 0 });
      expect(result.trend).toEqual({ direction: 'stable', percentage: 0 });
      expect(result.peakHours).toEqual([]);
      expect(result.byDevice).toEqual({ desktop: 0, mobile: 0, tablet: 0 });
    });
  });

  describe('getDailyStats', () => {
    const userId = 'user-123';

    it('should return daily statistics', async () => {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 86400000);

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            date: today,
            total_opens: '20',
            unique_opens: '10',
            desktop_opens: '12',
            mobile_opens: '6',
            tablet_opens: '2',
          },
          {
            date: yesterday,
            total_opens: '15',
            unique_opens: '8',
            desktop_opens: '10',
            mobile_opens: '4',
            tablet_opens: '1',
          },
        ],
      } as any);

      const result = await userAnalyticsService.getDailyStats(userId, 30);

      expect(result).toHaveLength(2);
      expect(result[0].opens).toBe(20);
      expect(result[0].unique).toBe(10);
      expect(result[0].desktop).toBe(12);
      expect(result[0].mobile).toBe(6);
      expect(result[0].tablet).toBe(2);
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await userAnalyticsService.getDailyStats(userId);

      expect(result).toEqual([]);
    });

    it('should use default 30 days if not specified', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await userAnalyticsService.getDailyStats(userId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('$2'),
        [userId, 30]
      );
    });

    it('should allow custom day range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      await userAnalyticsService.getDailyStats(userId, 7);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        [userId, 7]
      );
    });
  });

  describe('getHourlyStats', () => {
    const userId = 'user-123';

    it('should return hourly breakdown for a day', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { hour: '9', opens: '5' },
          { hour: '10', opens: '12' },
          { hour: '14', opens: '8' },
        ],
      } as any);

      const date = new Date('2024-01-15');
      const result = await userAnalyticsService.getHourlyStats(userId, date);

      // Should fill in all 24 hours
      expect(result).toHaveLength(24);
      expect(result[9].opens).toBe(5);
      expect(result[10].opens).toBe(12);
      expect(result[14].opens).toBe(8);
      // Hours with no data should be 0
      expect(result[0].opens).toBe(0);
      expect(result[23].opens).toBe(0);
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Query failed'));

      const result = await userAnalyticsService.getHourlyStats(userId, new Date());

      expect(result).toEqual([]);
    });
  });

  describe('getQuickSummary', () => {
    const userId = 'user-123';

    it('should return summary statistics', async () => {
      // Total opens
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '500' }] } as any);
      // Average daily
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_daily: '16.67' }] } as any);
      // Most active day
      mockQuery.mockResolvedValueOnce({ rows: [{ day_name: 'Tuesday  ', count: '100' }] } as any);
      // Most active hour
      mockQuery.mockResolvedValueOnce({ rows: [{ hour: '10', count: '50' }] } as any);

      const result = await userAnalyticsService.getQuickSummary(userId);

      expect(result.totalOpens).toBe(500);
      expect(result.avgDailyOpens).toBeCloseTo(16.67);
      expect(result.mostActiveDay).toBe('Tuesday');
      expect(result.mostActiveHour).toBe(10);
    });

    it('should return default values on error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB error'));

      const result = await userAnalyticsService.getQuickSummary(userId);

      expect(result.totalOpens).toBe(0);
      expect(result.avgDailyOpens).toBe(0);
      expect(result.mostActiveDay).toBeNull();
      expect(result.mostActiveHour).toBeNull();
    });

    it('should handle null results for day and hour', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ total: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ avg_daily: null }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);

      const result = await userAnalyticsService.getQuickSummary(userId);

      expect(result.mostActiveDay).toBeNull();
      expect(result.mostActiveHour).toBeNull();
    });
  });

  describe('trend calculation', () => {
    // Testing the trend calculation logic through getMyStats

    it('should detect upward trend (>5% increase)', async () => {
      // Setup mocks for 100 opens this week vs 50 opens last week (100% increase)
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '100', unique_opens: '50' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '50', unique_opens: '25' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ desktop: '0', mobile: '0', tablet: '0' }] } as any);

      const result = await userAnalyticsService.getMyStats('user-1');

      expect(result.trend.direction).toBe('up');
      expect(result.trend.percentage).toBe(100);
    });

    it('should detect downward trend (>5% decrease)', async () => {
      // Setup mocks for 50 opens this week vs 100 opens last week (50% decrease)
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '50', unique_opens: '25' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '100', unique_opens: '50' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ desktop: '0', mobile: '0', tablet: '0' }] } as any);

      const result = await userAnalyticsService.getMyStats('user-1');

      expect(result.trend.direction).toBe('down');
      expect(result.trend.percentage).toBe(50);
    });

    it('should show stable trend (<5% change)', async () => {
      // Setup mocks for 100 opens this week vs 102 opens last week (2% decrease)
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '100', unique_opens: '50' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '102', unique_opens: '51' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ desktop: '0', mobile: '0', tablet: '0' }] } as any);

      const result = await userAnalyticsService.getMyStats('user-1');

      expect(result.trend.direction).toBe('stable');
    });

    it('should handle zero previous week (shows 100% up)', async () => {
      // Setup mocks for 50 opens this week vs 0 opens last week
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '50', unique_opens: '25' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ desktop: '0', mobile: '0', tablet: '0' }] } as any);

      const result = await userAnalyticsService.getMyStats('user-1');

      expect(result.trend.direction).toBe('up');
      expect(result.trend.percentage).toBe(100);
    });

    it('should handle both weeks zero (shows stable)', async () => {
      // Setup mocks for 0 opens both weeks
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ desktop: '0', mobile: '0', tablet: '0' }] } as any);

      const result = await userAnalyticsService.getMyStats('user-1');

      expect(result.trend.direction).toBe('stable');
      expect(result.trend.percentage).toBe(0);
    });
  });

  describe('peak hours calculation', () => {
    it('should return day names correctly', async () => {
      // Setup minimal mocks for other queries
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ total_opens: '0', unique_opens: '0' }] } as any);
      // Peak hours - day 0 = Sunday, day 1 = Monday, etc.
      mockQuery.mockResolvedValueOnce({
        rows: [
          { day_of_week: '0', hour: '10', open_count: '20' }, // Sunday
          { day_of_week: '1', hour: '14', open_count: '15' }, // Monday
          { day_of_week: '6', hour: '11', open_count: '10' }, // Saturday
        ],
      } as any);
      mockQuery.mockResolvedValueOnce({ rows: [{ desktop: '0', mobile: '0', tablet: '0' }] } as any);

      const result = await userAnalyticsService.getMyStats('user-1');

      expect(result.peakHours).toHaveLength(3);
      expect(result.peakHours[0].day).toBe('Sunday');
      expect(result.peakHours[0].hour).toBe(10);
      expect(result.peakHours[0].avgOpens).toBe(20);
      expect(result.peakHours[1].day).toBe('Monday');
      expect(result.peakHours[2].day).toBe('Saturday');
    });
  });
});
