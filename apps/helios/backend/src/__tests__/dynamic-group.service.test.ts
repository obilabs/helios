import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the database connection
const mockQuery = jest.fn();
jest.mock('../database/connection', () => ({
  db: {
    query: mockQuery,
  },
}));

// Import after mocking
import {
  dynamicGroupService,
  DynamicGroupRule,
  DynamicGroupField,
  DynamicGroupOperator,
} from '../services/dynamic-group.service.js';

describe('DynamicGroupService', () => {
  const testOrganizationId = '11111111-1111-1111-1111-111111111111';
  const testGroupId = '22222222-2222-2222-2222-222222222222';

  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getRules', () => {
    it('should return all rules for a group ordered by sort_order', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          accessGroupId: testGroupId,
          field: 'department',
          operator: 'equals',
          value: 'Engineering',
          caseSensitive: false,
          includeNested: false,
          sortOrder: 1,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'rule-2',
          accessGroupId: testGroupId,
          field: 'job_title',
          operator: 'contains',
          value: 'Developer',
          caseSensitive: false,
          includeNested: false,
          sortOrder: 2,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockRules });

      const rules = await dynamicGroupService.getRules(testGroupId);

      expect(rules).toHaveLength(2);
      expect(rules[0].field).toBe('department');
      expect(rules[1].field).toBe('job_title');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [testGroupId]
      );
    });

    it('should return empty array when no rules exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const rules = await dynamicGroupService.getRules(testGroupId);

      expect(rules).toHaveLength(0);
    });
  });

  describe('addRule', () => {
    it('should add a new rule with correct sort order', async () => {
      // Mock getting next sort order
      mockQuery.mockResolvedValueOnce({ rows: [{ next_order: 3 }] });
      // Mock insert
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'new-rule',
            accessGroupId: testGroupId,
            field: 'department',
            operator: 'equals',
            value: 'Sales',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 3,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      });

      const rule = await dynamicGroupService.addRule(testGroupId, {
        field: 'department',
        operator: 'equals',
        value: 'Sales',
      });

      expect(rule.field).toBe('department');
      expect(rule.operator).toBe('equals');
      expect(rule.value).toBe('Sales');
      expect(rule.sortOrder).toBe(3);
    });

    it('should respect caseSensitive option', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ next_order: 1 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'new-rule',
            accessGroupId: testGroupId,
            field: 'email',
            operator: 'contains',
            value: '@example.com',
            caseSensitive: true,
            includeNested: false,
            sortOrder: 1,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01',
          },
        ],
      });

      const rule = await dynamicGroupService.addRule(testGroupId, {
        field: 'email',
        operator: 'contains',
        value: '@example.com',
        caseSensitive: true,
      });

      expect(rule.caseSensitive).toBe(true);
    });
  });

  describe('updateRule', () => {
    it('should update rule fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            accessGroupId: testGroupId,
            field: 'department',
            operator: 'not_equals',
            value: 'HR',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
            createdAt: '2024-01-01',
            updatedAt: '2024-01-02',
          },
        ],
      });

      const updated = await dynamicGroupService.updateRule('rule-1', {
        operator: 'not_equals',
        value: 'HR',
      });

      expect(updated).not.toBeNull();
      expect(updated?.operator).toBe('not_equals');
      expect(updated?.value).toBe('HR');
    });

    it('should return null if rule not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.updateRule('nonexistent', {
        value: 'test',
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteRule', () => {
    it('should delete a rule and return true', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'rule-1' }] });

      const result = await dynamicGroupService.deleteRule('rule-1');

      expect(result).toBe(true);
    });

    it('should return false if rule not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.deleteRule('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('evaluateRules', () => {
    beforeEach(() => {
      // Mock group query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            organizationId: testOrganizationId,
            membershipType: 'dynamic',
            ruleLogic: 'AND',
          },
        ],
      });
    });

    it('should return empty results when no rules exist', async () => {
      // Mock getRules returning empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(result.matchingUserIds).toHaveLength(0);
      expect(result.matchingUserCount).toBe(0);
    });

    it('should throw error when group not found', async () => {
      // Reset and mock group not found
      mockQuery.mockReset();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        dynamicGroupService.evaluateRules('nonexistent')
      ).rejects.toThrow('Group not found');
    });

    it('should evaluate equals operator correctly', async () => {
      // Mock getRules
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            accessGroupId: testGroupId,
            field: 'department',
            operator: 'equals',
            value: 'Engineering',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      // Mock user query results
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }],
      });

      // Mock update last_rule_evaluation
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(result.matchingUserCount).toBe(2);
      expect(result.matchingUserIds).toContain('user-1');
      expect(result.matchingUserIds).toContain('user-2');
    });

    it('should evaluate contains operator correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            accessGroupId: testGroupId,
            field: 'job_title',
            operator: 'contains',
            value: 'Engineer',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(result.matchingUserCount).toBe(3);
    });

    it('should evaluate is_empty operator correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            accessGroupId: testGroupId,
            field: 'cost_center',
            operator: 'is_empty',
            value: '',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(result.matchingUserCount).toBe(1);
      // Verify the query contains IS NULL OR = ''
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('IS NULL'),
        expect.any(Array)
      );
    });

    it('should evaluate in_list operator correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            accessGroupId: testGroupId,
            field: 'department',
            operator: 'in_list',
            value: 'Engineering, Sales, Marketing',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(result.matchingUserCount).toBe(2);
    });

    it('should evaluate regex operator correctly', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            accessGroupId: testGroupId,
            field: 'email',
            operator: 'regex',
            value: '^[a-z]+@example\\.com$',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      // Verify regex operator is used in query
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('~'),
        expect.any(Array)
      );
    });

    it('should return matching users when returnUsers option is set', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            accessGroupId: testGroupId,
            field: 'department',
            operator: 'equals',
            value: 'Engineering',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock user details query
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe',
            department: 'Engineering',
            jobTitle: 'Developer',
          },
        ],
      });

      const result = await dynamicGroupService.evaluateRules(testGroupId, {
        returnUsers: true,
      });

      expect(result.matchingUsers).toBeDefined();
      expect(result.matchingUsers).toHaveLength(1);
      expect(result.matchingUsers?.[0].email).toBe('john@example.com');
    });
  });

  describe('evaluateRules with AND/OR logic', () => {
    it('should use AND logic (intersection) when ruleLogic is AND', async () => {
      // Mock group with AND logic
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            organizationId: testOrganizationId,
            membershipType: 'dynamic',
            ruleLogic: 'AND',
          },
        ],
      });

      // Mock two rules
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'equals',
            value: 'Engineering',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
          {
            id: 'rule-2',
            field: 'job_title',
            operator: 'contains',
            value: 'Senior',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 2,
          },
        ],
      });

      // First rule matches users 1, 2, 3
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }],
      });

      // Second rule matches users 2, 3, 4
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-2' }, { id: 'user-3' }, { id: 'user-4' }],
      });

      // Update last_rule_evaluation
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      // AND logic: intersection of [1,2,3] and [2,3,4] = [2,3]
      expect(result.matchingUserCount).toBe(2);
      expect(result.matchingUserIds).toContain('user-2');
      expect(result.matchingUserIds).toContain('user-3');
      expect(result.matchingUserIds).not.toContain('user-1');
      expect(result.matchingUserIds).not.toContain('user-4');
    });

    it('should use OR logic (union) when ruleLogic is OR', async () => {
      // Mock group with OR logic
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            organizationId: testOrganizationId,
            membershipType: 'dynamic',
            ruleLogic: 'OR',
          },
        ],
      });

      // Mock two rules
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'equals',
            value: 'Engineering',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
          {
            id: 'rule-2',
            field: 'department',
            operator: 'equals',
            value: 'Sales',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 2,
          },
        ],
      });

      // First rule matches users 1, 2
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }],
      });

      // Second rule matches users 3, 4
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-3' }, { id: 'user-4' }],
      });

      // Update last_rule_evaluation
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      // OR logic: union of [1,2] and [3,4] = [1,2,3,4]
      expect(result.matchingUserCount).toBe(4);
      expect(result.matchingUserIds).toContain('user-1');
      expect(result.matchingUserIds).toContain('user-2');
      expect(result.matchingUserIds).toContain('user-3');
      expect(result.matchingUserIds).toContain('user-4');
    });

    it('should return empty array when AND rules have no intersection', async () => {
      // Mock group with AND logic
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            organizationId: testOrganizationId,
            membershipType: 'dynamic',
            ruleLogic: 'AND',
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'equals',
            value: 'Engineering',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
          {
            id: 'rule-2',
            field: 'department',
            operator: 'equals',
            value: 'Sales',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 2,
          },
        ],
      });

      // First rule matches users 1, 2
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }],
      });

      // Second rule matches users 3, 4 (no overlap)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-3' }, { id: 'user-4' }],
      });

      // Update last_rule_evaluation
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      // AND logic: intersection of [1,2] and [3,4] = []
      expect(result.matchingUserCount).toBe(0);
      expect(result.matchingUserIds).toHaveLength(0);
    });
  });

  describe('applyRules', () => {
    it('should add new members and remove old members', async () => {
      // Mock evaluateRules call chain
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            organizationId: testOrganizationId,
            membershipType: 'dynamic',
            ruleLogic: 'AND',
          },
        ],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'equals',
            value: 'Engineering',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }, { id: 'user-3' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] }); // update last_rule_evaluation

      // Mock current members: [user-2, user-4]
      mockQuery.mockResolvedValueOnce({
        rows: [{ user_id: 'user-2' }, { user_id: 'user-4' }],
      });

      // Mock add new members (user-1, user-3)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock remove old members (user-4)
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.applyRules(testGroupId);

      expect(result.added).toBe(2); // user-1, user-3
      expect(result.removed).toBe(1); // user-4
      expect(result.unchanged).toBe(1); // user-2
    });
  });

  describe('setMembershipType', () => {
    it('should update membership type to dynamic', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dynamicGroupService.setMembershipType(testGroupId, 'dynamic', {
        ruleLogic: 'OR',
        refreshInterval: 60,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE access_groups'),
        ['dynamic', 'OR', 60, testGroupId]
      );
    });

    it('should update membership type to static', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dynamicGroupService.setMembershipType(testGroupId, 'static');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE access_groups'),
        ['static', undefined, undefined, testGroupId]
      );
    });
  });

  describe('getGroupsNeedingRefresh', () => {
    it('should return groups that need refresh', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'group-1' }, { id: 'group-2' }],
      });

      const groups = await dynamicGroupService.getGroupsNeedingRefresh();

      expect(groups).toHaveLength(2);
      expect(groups).toContain('group-1');
      expect(groups).toContain('group-2');
    });

    it('should return empty array when no groups need refresh', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const groups = await dynamicGroupService.getGroupsNeedingRefresh();

      expect(groups).toHaveLength(0);
    });
  });

  describe('getReportingChain', () => {
    it('should return all reports for a manager', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'user-1',
            email: 'alice@example.com',
            firstName: 'Alice',
            lastName: 'Smith',
            directManagerId: 'manager-1',
            depth: 1,
          },
          {
            id: 'user-2',
            email: 'bob@example.com',
            firstName: 'Bob',
            lastName: 'Jones',
            directManagerId: 'user-1',
            depth: 2,
          },
        ],
      });

      const result = await dynamicGroupService.getReportingChain(
        testOrganizationId,
        'manager-1'
      );

      expect(result.managerId).toBe('manager-1');
      expect(result.reports).toHaveLength(2);
      expect(result.reports[0].depth).toBe(1);
      expect(result.reports[1].depth).toBe(2);
    });
  });

  describe('userReportsTo', () => {
    it('should return true when user reports to manager (nested)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });

      const result = await dynamicGroupService.userReportsTo(
        testOrganizationId,
        'user-1',
        'manager-1',
        true
      );

      expect(result).toBe(true);
    });

    it('should return false when user does not report to manager', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.userReportsTo(
        testOrganizationId,
        'user-1',
        'manager-1',
        true
      );

      expect(result).toBe(false);
    });

    it('should check direct reports only when includeNested is false', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ exists: true }] });

      const result = await dynamicGroupService.userReportsTo(
        testOrganizationId,
        'user-1',
        'manager-1',
        false
      );

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('reporting_manager_id = $3'),
        ['user-1', testOrganizationId, 'manager-1']
      );
    });
  });

  describe('getManagementChain', () => {
    it('should return the management chain for a user', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'manager-1',
            email: 'manager@example.com',
            firstName: 'Manager',
            lastName: 'One',
            depth: 1,
          },
          {
            id: 'ceo',
            email: 'ceo@example.com',
            firstName: 'CEO',
            lastName: 'Boss',
            depth: 2,
          },
        ],
      });

      const result = await dynamicGroupService.getManagementChain(
        testOrganizationId,
        'user-1'
      );

      expect(result).toHaveLength(2);
      expect(result[0].depth).toBe(1);
      expect(result[1].depth).toBe(2);
    });

    it('should return empty array when user has no manager', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.getManagementChain(
        testOrganizationId,
        'ceo'
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('Operator-specific tests', () => {
    beforeEach(() => {
      // Mock group query for each test
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            organizationId: testOrganizationId,
            membershipType: 'dynamic',
            ruleLogic: 'AND',
          },
        ],
      });
    });

    it('should handle not_equals operator', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'not_equals',
            value: 'HR',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('!='),
        expect.any(Array)
      );
    });

    it('should handle starts_with operator', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'email',
            operator: 'starts_with',
            value: 'dev',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIKE LOWER($2) || '%'"),
        expect.any(Array)
      );
    });

    it('should handle ends_with operator', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'email',
            operator: 'ends_with',
            value: '@example.com',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("LIKE '%' || LOWER($2)"),
        expect.any(Array)
      );
    });

    it('should handle is_not_empty operator', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'cost_center',
            operator: 'is_not_empty',
            value: '',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }, { id: 'user-2' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("IS NOT NULL AND"),
        expect.any(Array)
      );
    });

    it('should handle not_in_list operator', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'not_in_list',
            value: 'HR, Legal, Finance',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('!= ALL'),
        expect.any(Array)
      );
    });

    it('should handle case-sensitive equals', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'equals',
            value: 'Engineering',
            caseSensitive: true,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      // Case sensitive should NOT use LOWER()
      expect(mockQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('LOWER'),
        expect.any(Array)
      );
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            organizationId: testOrganizationId,
            membershipType: 'dynamic',
            ruleLogic: 'AND',
          },
        ],
      });
    });

    it('should handle empty rule value for in_list', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'in_list',
            value: '',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({ rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      expect(result.matchingUserCount).toBe(0);
    });

    it('should handle special characters in values', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'contains',
            value: "R&D / Special's Team",
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'user-1' }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      // Should use parameterized query, not string interpolation
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('$2'),
        expect.any(Array)
      );
    });

    it('should handle database error gracefully', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 'rule-1',
            field: 'department',
            operator: 'regex',
            value: '[invalid regex',
            caseSensitive: false,
            includeNested: false,
            sortOrder: 1,
          },
        ],
      });

      // Simulate database error for invalid regex
      mockQuery.mockRejectedValueOnce(new Error('invalid regular expression'));

      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await dynamicGroupService.evaluateRules(testGroupId);

      // Should return empty results rather than throw
      expect(result.matchingUserCount).toBe(0);
    });
  });
});
