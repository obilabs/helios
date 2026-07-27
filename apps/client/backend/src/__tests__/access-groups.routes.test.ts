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

// Mock Google Workspace service
const mockGoogleWorkspaceService = {
  syncGroupMembers: jest.fn(),
  getGroupMemberEmails: jest.fn(),
  addUserToGroup: jest.fn(),
  removeUserFromGroup: jest.fn(),
};
jest.mock('../services/google-workspace.service', () => ({
  googleWorkspaceService: mockGoogleWorkspaceService,
}));

// Mock activity tracker
const mockActivityTracker = {
  trackGroupChange: jest.fn().mockResolvedValue(undefined),
};
jest.mock('../services/activity-tracker.service', () => ({
  activityTracker: mockActivityTracker,
}));

// Mock dynamic group service
const mockDynamicGroupService = {
  getRules: jest.fn(),
  addRule: jest.fn(),
  updateRule: jest.fn(),
  deleteRule: jest.fn(),
  evaluateRules: jest.fn(),
  applyRules: jest.fn(),
  setMembershipType: jest.fn(),
};
jest.mock('../services/dynamic-group.service', () => ({
  dynamicGroupService: mockDynamicGroupService,
  DynamicGroupField: {},
  DynamicGroupOperator: {},
  RuleLogic: {},
}));

// Mock authentication middleware
jest.mock('../middleware/auth', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'test-user-id',
      email: 'admin@example.com',
      organizationId: 'test-org-id',
      role: 'admin',
    };
    next();
  },
}));

// Import routes after mocking
import accessGroupsRoutes from '../routes/access-groups.routes.js';

describe('Access Groups Routes', () => {
  let app: Express;

  const testOrgId = 'test-org-id';
  const testGroupId = '33333333-3333-3333-3333-333333333333';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/organization/access-groups', accessGroupsRoutes);
    mockQuery.mockReset();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/organization/access-groups', () => {
    it('should list all access groups for the organization', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: testGroupId,
            name: 'Engineering',
            description: 'Engineering team',
            email: 'engineering@example.com',
            platform: 'google_workspace',
            group_type: 'google_group',
            member_count: '5',
          },
          {
            id: '44444444-4444-4444-4444-444444444444',
            name: 'Sales',
            description: 'Sales team',
            email: 'sales@example.com',
            platform: 'google_workspace',
            group_type: 'google_group',
            member_count: '10',
          },
        ],
      });

      const response = await request(app)
        .get('/api/organization/access-groups')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Engineering');
      expect(response.body.data[1].name).toBe('Sales');
    });

    it('should return empty array when no groups exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/organization/access-groups')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/organization/access-groups/:id', () => {
    it('should return group details with members', async () => {
      // Mock group query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testGroupId,
          name: 'Engineering',
          description: 'Engineering team',
          email: 'engineering@example.com',
          platform: 'google_workspace',
        }],
      });

      // Mock members query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 'member-1', user_id: 'user-1', email: 'alice@example.com', first_name: 'Alice', last_name: 'Smith' },
          { id: 'member-2', user_id: 'user-2', email: 'bob@example.com', first_name: 'Bob', last_name: 'Jones' },
        ],
      });

      const response = await request(app)
        .get(`/api/organization/access-groups/${testGroupId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.group.name).toBe('Engineering');
      expect(response.body.data.members).toHaveLength(2);
    });

    it('should return 404 if group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/api/organization/access-groups/nonexistent')
        .expect(404);

      expect(response.body.success).toBe(false);
      // Handle both old string format and new standardized format
      const errorMessage = typeof response.body.error === 'string'
        ? response.body.error
        : response.body.error?.message;
      expect(errorMessage).toBe('Access group not found');
    });
  });

  describe('PUT /api/organization/access-groups/:id', () => {
    it('should update group name and description', async () => {
      // Mock existing group
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testGroupId,
          name: 'Old Name',
          description: 'Old description',
          email: 'old@example.com',
        }],
      });

      // Mock update
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testGroupId,
          name: 'New Name',
          description: 'New description',
          email: 'old@example.com',
        }],
      });

      const response = await request(app)
        .put(`/api/organization/access-groups/${testGroupId}`)
        .send({
          name: 'New Name',
          description: 'New description',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Name');
      expect(mockActivityTracker.trackGroupChange).toHaveBeenCalled();
    });

    it('should return 404 if group not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .put('/api/organization/access-groups/nonexistent')
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/organization/access-groups', () => {
    it('should create a new group', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 'new-group-id',
          name: 'New Group',
          description: 'A new group',
          email: 'newgroup@example.com',
          platform: 'manual',
          group_type: 'manual',
        }],
      });

      const response = await request(app)
        .post('/api/organization/access-groups')
        .send({
          name: 'New Group',
          description: 'A new group',
          email: 'newgroup@example.com',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Group');
      expect(mockActivityTracker.trackGroupChange).toHaveBeenCalled();
    });

    it('should return 400 if name is missing', async () => {
      const response = await request(app)
        .post('/api/organization/access-groups')
        .send({ description: 'No name provided' })
        .expect(400);

      expect(response.body.success).toBe(false);
      // Handle both old string format and new standardized format
      const errorMessage = typeof response.body.error === 'string'
        ? response.body.error
        : response.body.error?.message;
      // The error message may be "Group name is required" or generic "Validation failed"
      expect(errorMessage).toMatch(/Group name is required|Validation failed/);
    });
  });

  describe('DELETE /api/organization/access-groups/:id', () => {
    it('should soft delete a group', async () => {
      // Mock existing group
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: testGroupId, name: 'Group to Delete' }],
      });

      // Mock soft delete
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete(`/api/organization/access-groups/${testGroupId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockActivityTracker.trackGroupChange).toHaveBeenCalledWith(
        testOrgId,
        testGroupId,
        testUserId,
        'admin@example.com',
        'deleted',
        expect.any(Object)
      );
    });
  });

  describe('POST /api/organization/access-groups/:id/members', () => {
    it('should add a member to a group', async () => {
      // Mock group check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: testGroupId }],
      });

      // Mock member insert
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock group info
      mockQuery.mockResolvedValueOnce({
        rows: [{ name: 'Test Group', external_id: null, platform: 'manual' }],
      });

      // Mock user info
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: 'newuser@example.com', first_name: 'New', last_name: 'User' }],
      });

      const response = await request(app)
        .post(`/api/organization/access-groups/${testGroupId}/members`)
        .send({ userId: 'new-user-id' })
        .expect(200);

      expect(response.body.success).toBe(true);
      // successResponse wraps message in data object
      expect(response.body.data.message).toBe('Member added to access group');
    });

    it('should sync to Google Workspace if group is from GW', async () => {
      // Mock group check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: testGroupId }],
      });

      // Mock member insert
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock group info (Google Workspace group)
      mockQuery.mockResolvedValueOnce({
        rows: [{
          name: 'GW Group',
          external_id: 'gw-group-id',
          platform: 'google_workspace',
        }],
      });

      // Mock user info
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', first_name: 'Test', last_name: 'User' }],
      });

      mockGoogleWorkspaceService.addUserToGroup.mockResolvedValueOnce({ success: true });

      const response = await request(app)
        .post(`/api/organization/access-groups/${testGroupId}/members`)
        .send({ userId: 'user-id' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockGoogleWorkspaceService.addUserToGroup).toHaveBeenCalledWith(
        testOrgId,
        'user@example.com',
        'gw-group-id'
      );
    });
  });

  describe('DELETE /api/organization/access-groups/:id/members/:userId', () => {
    it('should remove a member from a group', async () => {
      // Mock group check
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: testGroupId }],
      });

      // Mock member soft delete
      mockQuery.mockResolvedValueOnce({ rows: [] });

      // Mock group info
      mockQuery.mockResolvedValueOnce({
        rows: [{ name: 'Test Group', external_id: null, platform: 'manual' }],
      });

      // Mock user info
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: 'user@example.com', first_name: 'Test', last_name: 'User' }],
      });

      const response = await request(app)
        .delete(`/api/organization/access-groups/${testGroupId}/members/user-to-remove`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Dynamic Group Rules Endpoints', () => {
    describe('GET /api/organization/access-groups/:id/rules', () => {
      it('should return rules for a group', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            membership_type: 'dynamic',
            rule_logic: 'AND',
          }],
        });

        mockDynamicGroupService.getRules.mockResolvedValueOnce([
          { id: 'rule-1', field: 'department', operator: 'equals', value: 'Engineering' },
        ]);

        const response = await request(app)
          .get(`/api/organization/access-groups/${testGroupId}/rules`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.rules).toHaveLength(1);
        expect(response.body.data.groupConfig.membershipType).toBe('dynamic');
      });
    });

    describe('POST /api/organization/access-groups/:id/rules', () => {
      it('should add a new rule', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: testGroupId, name: 'Test Group' }],
        });

        mockDynamicGroupService.addRule.mockResolvedValueOnce({
          id: 'new-rule-id',
          field: 'department',
          operator: 'equals',
          value: 'Sales',
        });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/rules`)
          .send({
            field: 'department',
            operator: 'equals',
            value: 'Sales',
          })
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.field).toBe('department');
        expect(mockActivityTracker.trackGroupChange).toHaveBeenCalled();
      });

      it('should return 400 if required fields are missing', async () => {
        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/rules`)
          .send({ field: 'department' })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });

    describe('DELETE /api/organization/access-groups/:id/rules/:ruleId', () => {
      it('should delete a rule', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: testGroupId, name: 'Test Group' }],
        });

        mockDynamicGroupService.deleteRule.mockResolvedValueOnce(true);

        const response = await request(app)
          .delete(`/api/organization/access-groups/${testGroupId}/rules/rule-to-delete`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockActivityTracker.trackGroupChange).toHaveBeenCalled();
      });
    });

    describe('POST /api/organization/access-groups/:id/evaluate', () => {
      it('should evaluate rules and return matching users', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: testGroupId }],
        });

        mockDynamicGroupService.evaluateRules.mockResolvedValueOnce({
          matchingUserIds: ['user-1', 'user-2', 'user-3'],
          matchingUserCount: 3,
          matchingUsers: [
            { id: 'user-1', email: 'alice@example.com', firstName: 'Alice', lastName: 'Smith' },
            { id: 'user-2', email: 'bob@example.com', firstName: 'Bob', lastName: 'Jones' },
            { id: 'user-3', email: 'charlie@example.com', firstName: 'Charlie', lastName: 'Brown' },
          ],
          evaluatedAt: '2024-01-01T00:00:00Z',
        });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/evaluate`)
          .send({ returnUsers: true })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.matchingUserCount).toBe(3);
        expect(response.body.data.matchingUsers).toHaveLength(3);
      });
    });

    describe('POST /api/organization/access-groups/:id/apply-rules', () => {
      it('should apply rules and update membership', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'Dynamic Group',
            membership_type: 'dynamic',
          }],
        });

        mockDynamicGroupService.applyRules.mockResolvedValueOnce({
          added: 5,
          removed: 2,
          unchanged: 10,
        });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/apply-rules`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.added).toBe(5);
        expect(response.body.data.removed).toBe(2);
        expect(mockActivityTracker.trackGroupChange).toHaveBeenCalled();
      });

      it('should return 400 if group is not dynamic', async () => {
        // Mock group check (static group)
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'Static Group',
            membership_type: 'static',
          }],
        });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/apply-rules`)
          .expect(400);

        expect(response.body.success).toBe(false);
        // Handle both old string format and new standardized format
        const errorMessage = typeof response.body.error === 'string'
          ? response.body.error
          : response.body.error?.message;
        expect(errorMessage).toContain('not a dynamic group');
      });
    });

    describe('PUT /api/organization/access-groups/:id/membership-type', () => {
      it('should change membership type to dynamic', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'Test Group',
            membership_type: 'static',
          }],
        });

        mockDynamicGroupService.setMembershipType.mockResolvedValueOnce(undefined);

        const response = await request(app)
          .put(`/api/organization/access-groups/${testGroupId}/membership-type`)
          .send({
            membershipType: 'dynamic',
            ruleLogic: 'AND',
            refreshInterval: 60,
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(mockDynamicGroupService.setMembershipType).toHaveBeenCalledWith(
          testGroupId,
          'dynamic',
          { ruleLogic: 'AND', refreshInterval: 60 }
        );
      });

      it('should return 400 for invalid membership type', async () => {
        const response = await request(app)
          .put(`/api/organization/access-groups/${testGroupId}/membership-type`)
          .send({ membershipType: 'invalid' })
          .expect(400);

        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('Group Sync Endpoints', () => {
    describe('POST /api/organization/access-groups/:id/sync/google', () => {
      it('should sync group members to Google Workspace', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'GW Group',
            platform: 'google_workspace',
            external_id: 'gw-external-id',
            synced_at: null,
          }],
        });

        // Mock get members
        mockQuery.mockResolvedValueOnce({
          rows: [
            { email: 'user1@example.com' },
            { email: 'user2@example.com' },
          ],
        });

        mockGoogleWorkspaceService.syncGroupMembers.mockResolvedValueOnce({
          success: true,
          added: 1,
          removed: 0,
          errors: [],
          details: { heliosMemberCount: 2, gwMemberCount: 1 },
        });

        // Mock update synced_at
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/sync/google`)
          .send({ direction: 'push' })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.added).toBe(1);
        expect(mockGoogleWorkspaceService.syncGroupMembers).toHaveBeenCalled();
        expect(mockActivityTracker.trackGroupChange).toHaveBeenCalled();
      });

      it('should return 400 if group is not a Google Workspace group', async () => {
        // Mock group check (manual group)
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'Manual Group',
            platform: 'manual',
            external_id: null,
          }],
        });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/sync/google`)
          .expect(400);

        expect(response.body.success).toBe(false);
        // Handle both old string format and new standardized format
        const errorMessage = typeof response.body.error === 'string'
          ? response.body.error
          : response.body.error?.message;
        expect(errorMessage).toContain('not a Google Workspace group');
      });

      it('should return 400 if group has no external_id', async () => {
        // Mock group check (no external_id)
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'GW Group',
            platform: 'google_workspace',
            external_id: null,
          }],
        });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/sync/google`)
          .expect(400);

        expect(response.body.success).toBe(false);
        // Handle both old string format and new standardized format
        const errorMessage = typeof response.body.error === 'string'
          ? response.body.error
          : response.body.error?.message;
        expect(errorMessage).toContain('does not have a Google Workspace ID');
      });

      it('should handle sync with errors', async () => {
        // Mock group check
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'GW Group',
            platform: 'google_workspace',
            external_id: 'gw-external-id',
          }],
        });

        // Mock get members
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'user1@example.com' }],
        });

        mockGoogleWorkspaceService.syncGroupMembers.mockResolvedValueOnce({
          success: false,
          added: 0,
          removed: 0,
          errors: ['Failed to add user1@example.com: Permission denied'],
        });

        // Mock update synced_at
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post(`/api/organization/access-groups/${testGroupId}/sync/google`)
          .expect(200);

        // The endpoint returns success:true but includes errors in data
        // (sync completed but with some failures)
        expect(response.body.success).toBe(true);
        expect(response.body.data.errors).toHaveLength(1);
      });
    });

    describe('GET /api/organization/access-groups/:id/sync/status', () => {
      it('should return sync status for a Google Workspace group', async () => {
        // Mock group query
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'GW Group',
            platform: 'google_workspace',
            external_id: 'gw-external-id',
            synced_at: '2024-01-01T00:00:00Z',
          }],
        });

        // Mock member count
        mockQuery.mockResolvedValueOnce({
          rows: [{ count: '5' }],
        });

        mockGoogleWorkspaceService.getGroupMemberEmails.mockResolvedValueOnce({
          success: true,
          members: ['a@example.com', 'b@example.com', 'c@example.com'],
        });

        const response = await request(app)
          .get(`/api/organization/access-groups/${testGroupId}/sync/status`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.heliosMemberCount).toBe(5);
        expect(response.body.data.googleMemberCount).toBe(3);
        expect(response.body.data.syncAvailable).toBe(true);
      });

      it('should indicate sync not available for manual groups', async () => {
        // Mock group query
        mockQuery.mockResolvedValueOnce({
          rows: [{
            id: testGroupId,
            name: 'Manual Group',
            platform: 'manual',
            external_id: null,
          }],
        });

        // Mock member count
        mockQuery.mockResolvedValueOnce({
          rows: [{ count: '3' }],
        });

        const response = await request(app)
          .get(`/api/organization/access-groups/${testGroupId}/sync/status`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.syncAvailable).toBe(false);
        expect(response.body.data.googleMemberCount).toBeNull();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await request(app)
        .get('/api/organization/access-groups')
        .expect(500);

      expect(response.body.success).toBe(false);
      // Handle both old string format and new standardized format
      const errorMessage = typeof response.body.error === 'string'
        ? response.body.error
        : response.body.error?.message;
      expect(errorMessage).toBe('Failed to list access groups');
    });

    it('should handle Google Workspace sync errors', async () => {
      // Mock group check
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: testGroupId,
          name: 'GW Group',
          platform: 'google_workspace',
          external_id: 'gw-external-id',
        }],
      });

      // Mock get members
      mockQuery.mockResolvedValueOnce({ rows: [] });

      mockGoogleWorkspaceService.syncGroupMembers.mockRejectedValueOnce(
        new Error('Google API unavailable')
      );

      const response = await request(app)
        .post(`/api/organization/access-groups/${testGroupId}/sync/google`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });
});
