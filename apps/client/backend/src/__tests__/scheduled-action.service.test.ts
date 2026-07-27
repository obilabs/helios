import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

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

// Mock lifecycle log service
const mockLogSuccess = jest.fn();
const mockLogFailure = jest.fn();
jest.mock('../services/lifecycle-log.service', () => ({
  lifecycleLogService: {
    logSuccess: mockLogSuccess,
    logFailure: mockLogFailure,
    logSkipped: jest.fn(),
  },
}));

// Mock onboarding service
const mockGetOnboardingTemplate = jest.fn();
const mockExecuteOnboarding = jest.fn();
jest.mock('../services/user-onboarding.service', () => ({
  userOnboardingService: {
    getTemplate: mockGetOnboardingTemplate,
    executeOnboarding: mockExecuteOnboarding,
  },
}));

// Mock offboarding service
const mockGetOffboardingTemplate = jest.fn();
const mockExecuteFromTemplate = jest.fn();
jest.mock('../services/user-offboarding.service', () => ({
  userOffboardingService: {
    getTemplate: mockGetOffboardingTemplate,
    executeFromTemplate: mockExecuteFromTemplate,
  },
}));

// Import after mocks
import { scheduledActionService } from '../services/scheduled-action.service.js';
import { CreateScheduledActionDTO } from '../types/user-lifecycle.js';

describe('ScheduledActionService', () => {
  const testOrgId = 'test-org-id';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockLogSuccess.mockResolvedValue({});
    mockLogFailure.mockResolvedValue({});
    mockExecuteOnboarding.mockResolvedValue({
      success: true,
      errors: [],
      stepsCompleted: [],
      stepsFailed: [],
      stepsSkipped: [],
    });
    mockExecuteFromTemplate.mockResolvedValue({
      success: true,
      errors: [],
      stepsCompleted: [],
      stepsFailed: [],
      stepsSkipped: [],
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Action CRUD Operations', () => {
    describe('getActions', () => {
      it('should return all actions for an organization', async () => {
        const mockActions = [
          {
            id: 'action-1',
            organization_id: testOrgId,
            user_id: testUserId,
            target_email: 'newuser@gridworx.io',
            target_first_name: 'New',
            target_last_name: 'User',
            action_type: 'onboard',
            action_config: { sendWelcomeEmail: true },
            config_overrides: {},
            scheduled_for: new Date(),
            is_recurring: false,
            status: 'pending',
            total_steps: 10,
            completed_steps: 0,
            retry_count: 0,
            max_retries: 3,
            requires_approval: false,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        // Mock count query
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '1' }] });
        // Mock data query
        mockQuery.mockResolvedValueOnce({ rows: mockActions });

        const result = await scheduledActionService.getActions(testOrgId);

        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(result.actions).toHaveLength(1);
        expect(result.total).toBe(1);
        expect(result.actions[0].actionType).toBe('onboard');
      });

      it('should filter by status when provided', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await scheduledActionService.getActions(testOrgId, { status: 'pending' });

        expect(mockQuery).toHaveBeenCalledTimes(2);
        const [countQuery, countValues] = mockQuery.mock.calls[0];
        expect(countQuery).toContain('status = $2');
        expect(countValues).toContain('pending');
      });

      it('should filter by actionType when provided', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await scheduledActionService.getActions(testOrgId, { actionType: 'offboard' });

        const [countQuery, countValues] = mockQuery.mock.calls[0];
        expect(countQuery).toContain('action_type = $2');
        expect(countValues).toContain('offboard');
      });

      it('should filter by date range when provided', async () => {
        const fromDate = new Date('2025-01-01');
        const toDate = new Date('2025-12-31');

        mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }] });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await scheduledActionService.getActions(testOrgId, { fromDate, toDate });

        const [countQuery] = mockQuery.mock.calls[0];
        expect(countQuery).toContain('scheduled_for >=');
        expect(countQuery).toContain('scheduled_for <=');
      });
    });

    describe('getAction', () => {
      it('should return a single action by ID', async () => {
        const mockAction = {
          id: 'action-1',
          organization_id: testOrgId,
          user_id: testUserId,
          action_type: 'onboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(),
          is_recurring: false,
          status: 'pending',
          total_steps: 10,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

        const action = await scheduledActionService.getAction('action-1');

        expect(action).not.toBeNull();
        expect(action?.id).toBe('action-1');
        expect(action?.actionType).toBe('onboard');
      });

      it('should return null if action not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const action = await scheduledActionService.getAction('nonexistent');

        expect(action).toBeNull();
      });
    });

    describe('getPendingActions', () => {
      it('should return pending actions due for execution', async () => {
        const mockActions = [
          {
            id: 'action-1',
            organization_id: testOrgId,
            action_type: 'onboard',
            scheduled_for: new Date(Date.now() - 60000), // 1 minute ago
            status: 'pending',
            action_config: {},
            config_overrides: {},
            is_recurring: false,
            total_steps: 10,
            completed_steps: 0,
            retry_count: 0,
            max_retries: 3,
            requires_approval: false,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockActions });

        const actions = await scheduledActionService.getPendingActions();

        expect(actions).toHaveLength(1);
        expect(actions[0].status).toBe('pending');
      });

      it('should respect dependency ordering', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await scheduledActionService.getPendingActions();

        const [query] = mockQuery.mock.calls[0];
        expect(query).toContain('depends_on_action_id IS NULL OR EXISTS');
        expect(query).toContain('dep.status = \'completed\'');
      });

      it('should filter by organization when provided', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await scheduledActionService.getPendingActions(testOrgId);

        const [query, values] = mockQuery.mock.calls[0];
        expect(query).toContain('organization_id = $1');
        expect(values).toContain(testOrgId);
      });
    });

    describe('scheduleAction', () => {
      it('should schedule a new onboarding action', async () => {
        const dto: CreateScheduledActionDTO = {
          targetEmail: 'newuser@gridworx.io',
          targetFirstName: 'New',
          targetLastName: 'User',
          actionType: 'onboard',
          scheduledFor: new Date('2025-01-15'),
        };

        const createdAction = {
          id: 'new-action-id',
          organization_id: testOrgId,
          target_email: 'newuser@gridworx.io',
          target_first_name: 'New',
          target_last_name: 'User',
          action_type: 'onboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date('2025-01-15'),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdAction] });

        const action = await scheduledActionService.scheduleAction(testOrgId, dto, testUserId);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(action.targetEmail).toBe('newuser@gridworx.io');
        expect(action.actionType).toBe('onboard');
      });

      it('should schedule action with template config', async () => {
        const mockTemplate = {
          id: 'template-1',
          groupIds: ['group-1', 'group-2'],
          sendWelcomeEmail: true,
        };

        mockGetOnboardingTemplate.mockResolvedValueOnce(mockTemplate);

        const dto: CreateScheduledActionDTO = {
          targetEmail: 'newuser@gridworx.io',
          targetFirstName: 'New',
          targetLastName: 'User',
          actionType: 'onboard',
          onboardingTemplateId: 'template-1',
          scheduledFor: new Date('2025-01-15'),
        };

        const createdAction = {
          id: 'new-action-id',
          organization_id: testOrgId,
          target_email: 'newuser@gridworx.io',
          action_type: 'onboard',
          action_config: mockTemplate,
          config_overrides: {},
          scheduled_for: new Date('2025-01-15'),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdAction] });

        const action = await scheduledActionService.scheduleAction(testOrgId, dto);

        expect(mockGetOnboardingTemplate).toHaveBeenCalledWith('template-1');
      });

      it('should schedule recurring action', async () => {
        const dto: CreateScheduledActionDTO = {
          userId: testUserId,
          actionType: 'suspend',
          scheduledFor: new Date('2025-01-01'),
          isRecurring: true,
          recurrenceInterval: 'weekly',
          recurrenceUntil: new Date('2025-12-31'),
        };

        const createdAction = {
          id: 'recurring-action-id',
          organization_id: testOrgId,
          user_id: testUserId,
          action_type: 'suspend',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date('2025-01-01'),
          is_recurring: true,
          recurrence_interval: 'weekly',
          recurrence_until: new Date('2025-12-31'),
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdAction] });

        const action = await scheduledActionService.scheduleAction(testOrgId, dto);

        expect(action.isRecurring).toBe(true);
        expect(action.recurrenceInterval).toBe('weekly');
      });
    });

    describe('cancelAction', () => {
      it('should cancel a pending action', async () => {
        // Mock getAction
        const mockAction = {
          id: 'action-1',
          organization_id: testOrgId,
          action_type: 'onboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

        const cancelledAction = {
          ...mockAction,
          status: 'cancelled',
          cancelled_by: 'admin-user',
          cancelled_at: new Date(),
          cancellation_reason: 'No longer needed',
        };

        mockQuery.mockResolvedValueOnce({ rows: [cancelledAction] });

        const action = await scheduledActionService.cancelAction(
          'action-1',
          'admin-user',
          'No longer needed'
        );

        expect(action?.status).toBe('cancelled');
        expect(action?.cancelledBy).toBe('admin-user');
      });

      it('should throw error if action is not pending', async () => {
        const mockAction = {
          id: 'action-1',
          organization_id: testOrgId,
          action_type: 'onboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(),
          is_recurring: false,
          status: 'completed',
          total_steps: 10,
          completed_steps: 10,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

        await expect(
          scheduledActionService.cancelAction('action-1', 'admin-user')
        ).rejects.toThrow('Can only cancel pending actions');
      });
    });
  });

  describe('Approval Workflow', () => {
    describe('approveAction', () => {
      it('should approve a pending action that requires approval', async () => {
        const mockAction = {
          id: 'action-1',
          organization_id: testOrgId,
          action_type: 'offboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: true,
          approved_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

        const approvedAction = {
          ...mockAction,
          approved_by: 'manager-user',
          approved_at: new Date(),
          approval_notes: 'Approved for offboarding',
        };

        mockQuery.mockResolvedValueOnce({ rows: [approvedAction] });

        const action = await scheduledActionService.approveAction(
          'action-1',
          'manager-user',
          'Approved for offboarding'
        );

        expect(action?.approvedBy).toBe('manager-user');
        expect(action?.approvedAt).toBeDefined();
      });

      it('should throw error if action does not require approval', async () => {
        const mockAction = {
          id: 'action-1',
          organization_id: testOrgId,
          action_type: 'onboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

        await expect(
          scheduledActionService.approveAction('action-1', 'manager-user')
        ).rejects.toThrow('This action does not require approval');
      });

      it('should throw error if action already approved', async () => {
        const mockAction = {
          id: 'action-1',
          organization_id: testOrgId,
          action_type: 'offboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: true,
          approved_at: new Date(),
          approved_by: 'other-user',
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

        await expect(
          scheduledActionService.approveAction('action-1', 'manager-user')
        ).rejects.toThrow('Action has already been approved');
      });
    });

    describe('rejectAction', () => {
      it('should reject a pending action', async () => {
        const mockAction = {
          id: 'action-1',
          organization_id: testOrgId,
          action_type: 'offboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: true,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

        const rejectedAction = {
          ...mockAction,
          status: 'cancelled',
          rejected_by: 'manager-user',
          rejected_at: new Date(),
          rejection_reason: 'User decided to stay',
        };

        mockQuery.mockResolvedValueOnce({ rows: [rejectedAction] });

        const action = await scheduledActionService.rejectAction(
          'action-1',
          'manager-user',
          'User decided to stay'
        );

        expect(action?.status).toBe('cancelled');
        expect(action?.rejectedBy).toBe('manager-user');
        expect(action?.rejectionReason).toBe('User decided to stay');
      });
    });

    describe('getActionsPendingApproval', () => {
      it('should return actions pending approval', async () => {
        const mockActions = [
          {
            id: 'action-1',
            organization_id: testOrgId,
            action_type: 'offboard',
            action_config: {},
            config_overrides: {},
            scheduled_for: new Date(),
            is_recurring: false,
            status: 'pending',
            total_steps: 0,
            completed_steps: 0,
            retry_count: 0,
            max_retries: 3,
            requires_approval: true,
            approved_at: null,
            rejected_at: null,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockActions });

        const actions = await scheduledActionService.getActionsPendingApproval(testOrgId);

        expect(actions).toHaveLength(1);
        expect(actions[0].requiresApproval).toBe(true);
      });
    });
  });

  describe('Action Execution', () => {
    describe('processPendingActions', () => {
      it('should process pending actions and update status', async () => {
        const mockPendingAction = {
          id: 'action-1',
          organization_id: testOrgId,
          target_email: 'newuser@gridworx.io',
          target_first_name: 'New',
          target_last_name: 'User',
          action_type: 'onboard',
          action_config: { sendWelcomeEmail: true },
          config_overrides: {},
          scheduled_for: new Date(Date.now() - 60000),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Mock getPendingActions
        mockQuery.mockResolvedValueOnce({ rows: [mockPendingAction] });

        // Mock updateStatus (in_progress)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock executeOnboarding result
        mockExecuteOnboarding.mockResolvedValueOnce({
          success: true,
          userId: 'new-user-id',
          errors: [],
          stepsCompleted: ['create_helios_user', 'finalize'],
          stepsFailed: [],
          stepsSkipped: [],
        });

        // Mock update user_id
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock updateStatus (completed)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await scheduledActionService.processPendingActions();

        expect(result.processed).toBe(1);
        expect(result.succeeded).toBe(1);
        expect(result.failed).toBe(0);
        expect(mockExecuteOnboarding).toHaveBeenCalled();
      });

      it('should handle failed actions and schedule retry', async () => {
        const mockPendingAction = {
          id: 'action-1',
          organization_id: testOrgId,
          target_email: 'newuser@gridworx.io',
          target_first_name: 'New',
          target_last_name: 'User',
          action_type: 'onboard',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(Date.now() - 60000),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Mock getPendingActions
        mockQuery.mockResolvedValueOnce({ rows: [mockPendingAction] });

        // Mock updateStatus (in_progress)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock executeOnboarding failure
        mockExecuteOnboarding.mockResolvedValueOnce({
          success: false,
          errors: ['Google Workspace not configured'],
          stepsCompleted: [],
          stepsFailed: ['create_google_account'],
          stepsSkipped: [],
        });

        // Mock scheduleRetry
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await scheduledActionService.processPendingActions();

        expect(result.processed).toBe(1);
        expect(result.failed).toBe(1);
      });

      it('should execute offboarding actions', async () => {
        const mockPendingAction = {
          id: 'action-2',
          organization_id: testOrgId,
          user_id: 'departing-user-id',
          action_type: 'offboard',
          offboarding_template_id: 'template-1',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(Date.now() - 60000),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Mock getPendingActions
        mockQuery.mockResolvedValueOnce({ rows: [mockPendingAction] });

        // Mock updateStatus (in_progress)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock executeFromTemplate
        mockExecuteFromTemplate.mockResolvedValueOnce({
          success: true,
          errors: [],
          stepsCompleted: ['validate_config', 'finalize'],
          stepsFailed: [],
          stepsSkipped: [],
        });

        // Mock updateStatus (completed)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await scheduledActionService.processPendingActions();

        expect(result.succeeded).toBe(1);
        expect(mockExecuteFromTemplate).toHaveBeenCalledWith(
          testOrgId,
          'template-1',
          'departing-user-id',
          expect.objectContaining({
            actionId: 'action-2',
            triggeredBy: 'system',
          })
        );
      });

      it('should execute suspend action', async () => {
        const mockPendingAction = {
          id: 'action-3',
          organization_id: testOrgId,
          user_id: 'user-to-suspend',
          action_type: 'suspend',
          action_config: {},
          config_overrides: {},
          scheduled_for: new Date(Date.now() - 60000),
          is_recurring: false,
          status: 'pending',
          total_steps: 0,
          completed_steps: 0,
          retry_count: 0,
          max_retries: 3,
          requires_approval: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Mock getPendingActions
        mockQuery.mockResolvedValueOnce({ rows: [mockPendingAction] });

        // Mock updateStatus (in_progress)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock user lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'user@gridworx.io' }],
        });

        // Mock user status update
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock updateStatus (completed)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await scheduledActionService.processPendingActions();

        expect(result.succeeded).toBe(1);
        expect(mockLogSuccess).toHaveBeenCalledWith(
          testOrgId,
          'suspend',
          'suspend_account',
          expect.any(Object)
        );
      });
    });
  });

  describe('Recurring Actions', () => {
    it('should schedule next recurrence after completion', async () => {
      const mockRecurringAction = {
        id: 'recurring-action',
        organization_id: testOrgId,
        user_id: 'user-id',
        action_type: 'suspend',
        action_config: {},
        config_overrides: {},
        scheduled_for: new Date('2025-01-01'),
        is_recurring: true,
        recurrence_interval: 'weekly',
        recurrence_until: new Date('2025-12-31'),
        status: 'pending',
        total_steps: 0,
        completed_steps: 0,
        retry_count: 0,
        max_retries: 3,
        requires_approval: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock getPendingActions
      mockQuery.mockResolvedValueOnce({ rows: [mockRecurringAction] });

      // Mock updateStatus (in_progress)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock user lookup
      mockQuery.mockResolvedValueOnce({
        rows: [{ email: 'user@gridworx.io' }],
      });

      // Mock user status update
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock updateStatus (completed)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock schedule next recurrence
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await scheduledActionService.processPendingActions();

      expect(result.succeeded).toBe(1);
      // Should have called query to update scheduled_for for next recurrence
      const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(lastCall[0]).toContain('scheduled_for');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const mockPendingAction = {
        id: 'action-1',
        organization_id: testOrgId,
        target_email: 'newuser@gridworx.io',
        target_first_name: 'New',
        target_last_name: 'User',
        action_type: 'onboard',
        action_config: {},
        config_overrides: {},
        scheduled_for: new Date(Date.now() - 60000),
        is_recurring: false,
        status: 'pending',
        total_steps: 0,
        completed_steps: 0,
        retry_count: 0,
        max_retries: 3,
        requires_approval: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock getPendingActions
      mockQuery.mockResolvedValueOnce({ rows: [mockPendingAction] });

      // Mock updateStatus (in_progress)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock executeOnboarding throws
      mockExecuteOnboarding.mockRejectedValueOnce(new Error('Database connection lost'));

      // Mock scheduleRetry
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await scheduledActionService.processPendingActions();

      expect(result.failed).toBe(1);
    });

    it('should fail action after max retries exceeded', async () => {
      const mockPendingAction = {
        id: 'action-1',
        organization_id: testOrgId,
        target_email: 'newuser@gridworx.io',
        target_first_name: 'New',
        target_last_name: 'User',
        action_type: 'onboard',
        action_config: {},
        config_overrides: {},
        scheduled_for: new Date(Date.now() - 60000),
        is_recurring: false,
        status: 'pending',
        total_steps: 0,
        completed_steps: 0,
        retry_count: 3, // Already at max
        max_retries: 3,
        requires_approval: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock getPendingActions
      mockQuery.mockResolvedValueOnce({ rows: [mockPendingAction] });

      // Mock updateStatus (in_progress)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      // Mock executeOnboarding failure
      mockExecuteOnboarding.mockResolvedValueOnce({
        success: false,
        errors: ['Configuration error'],
        stepsCompleted: [],
        stepsFailed: ['validate_config'],
        stepsSkipped: [],
      });

      // Mock updateStatus (failed - no more retries)
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const result = await scheduledActionService.processPendingActions();

      expect(result.failed).toBe(1);
      // Should have called updateStatus with 'failed', not scheduleRetry
      const lastCall = mockQuery.mock.calls[mockQuery.mock.calls.length - 1];
      expect(lastCall[1][0]).toBe('failed');
    });
  });

  describe('Update Action', () => {
    it('should update scheduled_for for pending action', async () => {
      const mockAction = {
        id: 'action-1',
        organization_id: testOrgId,
        action_type: 'onboard',
        action_config: { sendWelcomeEmail: true },
        config_overrides: {},
        scheduled_for: new Date('2025-01-15'),
        is_recurring: false,
        status: 'pending',
        total_steps: 0,
        completed_steps: 0,
        retry_count: 0,
        max_retries: 3,
        requires_approval: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

      const updatedAction = {
        ...mockAction,
        scheduled_for: new Date('2025-01-20'),
      };

      mockQuery.mockResolvedValueOnce({ rows: [updatedAction] });

      const action = await scheduledActionService.updateAction('action-1', {
        scheduledFor: new Date('2025-01-20'),
      });

      expect(action?.scheduledFor.toISOString()).toBe(new Date('2025-01-20').toISOString());
    });

    it('should throw error when updating non-pending action', async () => {
      const mockAction = {
        id: 'action-1',
        organization_id: testOrgId,
        action_type: 'onboard',
        action_config: {},
        config_overrides: {},
        scheduled_for: new Date(),
        is_recurring: false,
        status: 'in_progress',
        total_steps: 0,
        completed_steps: 0,
        retry_count: 0,
        max_retries: 3,
        requires_approval: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({ rows: [mockAction] });

      await expect(
        scheduledActionService.updateAction('action-1', {
          scheduledFor: new Date('2025-01-20'),
        })
      ).rejects.toThrow('Can only update pending actions');
    });
  });
});
