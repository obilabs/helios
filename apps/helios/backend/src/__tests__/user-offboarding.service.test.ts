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
const mockLogSkipped = jest.fn();
jest.mock('../services/lifecycle-log.service', () => ({
  lifecycleLogService: {
    logSuccess: mockLogSuccess,
    logFailure: mockLogFailure,
    logSkipped: mockLogSkipped,
    createLog: jest.fn(),
  },
}));

// Mock Google APIs
const mockGroupsList = jest.fn();
const mockMembersDelete = jest.fn();
const mockTokensList = jest.fn();
const mockTokensDelete = jest.fn();
const mockUsersUpdate = jest.fn();
const mockUsersSignOut = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    admin: jest.fn(() => ({
      groups: {
        list: mockGroupsList,
      },
      members: {
        delete: mockMembersDelete,
      },
      tokens: {
        list: mockTokensList,
        delete: mockTokensDelete,
      },
      users: {
        update: mockUsersUpdate,
        signOut: mockUsersSignOut,
      },
    })),
    gmail: jest.fn(() => ({
      users: {
        settings: {
          sendAs: {
            update: jest.fn(),
          },
        },
      },
    })),
  },
}));

// Mock google-auth-library
jest.mock('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({
    authorize: jest.fn().mockResolvedValue({}),
  })),
}));

// Import after mocks
import { userOffboardingService } from '../services/user-offboarding.service.js';
import { OffboardingConfig, CreateOffboardingTemplateDTO } from '../types/user-lifecycle.js';

describe('UserOffboardingService', () => {
  const testOrgId = 'test-org-id';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockLogSuccess.mockResolvedValue({});
    mockLogFailure.mockResolvedValue({});
    mockLogSkipped.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Template CRUD Operations', () => {
    describe('getTemplates', () => {
      it('should return all offboarding templates for an organization', async () => {
        const mockTemplates = [
          {
            id: 'template-1',
            organization_id: testOrgId,
            name: 'Standard Offboarding',
            description: 'Default offboarding process',
            drive_action: 'transfer_manager',
            drive_delete_after_days: 90,
            email_action: 'forward_manager',
            email_forward_duration_days: 30,
            email_auto_reply_message: '',
            email_auto_reply_subject: '',
            calendar_decline_future_meetings: true,
            calendar_transfer_meeting_ownership: true,
            calendar_transfer_to_manager: true,
            remove_from_all_groups: true,
            remove_from_shared_drives: true,
            revoke_oauth_tokens: true,
            revoke_app_passwords: true,
            sign_out_all_devices: true,
            reset_password: true,
            remove_signature: true,
            set_offboarding_signature: false,
            offboarding_signature_text: '',
            wipe_mobile_devices: false,
            wipe_requires_confirmation: true,
            account_action: 'suspend_immediately',
            delete_account: false,
            delete_after_days: 90,
            license_action: 'remove_on_suspension',
            notify_manager: true,
            notify_it_admin: true,
            notify_hr: false,
            notification_email_addresses: [],
            is_active: true,
            is_default: true,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockTemplates });

        const templates = await userOffboardingService.getTemplates(testOrgId);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(templates).toHaveLength(1);
        expect(templates[0].name).toBe('Standard Offboarding');
        expect(templates[0].driveAction).toBe('transfer_manager');
        expect(templates[0].isDefault).toBe(true);
      });

      it('should filter by isActive when provided', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await userOffboardingService.getTemplates(testOrgId, { isActive: true });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [query, values] = mockQuery.mock.calls[0];
        expect(query).toContain('is_active = $2');
        expect(values).toContain(true);
      });
    });

    describe('getTemplate', () => {
      it('should return a single template by ID', async () => {
        const mockTemplate = {
          id: 'template-1',
          organization_id: testOrgId,
          name: 'Quick Offboarding',
          drive_action: 'keep',
          drive_delete_after_days: 90,
          email_action: 'keep',
          email_forward_duration_days: 30,
          calendar_decline_future_meetings: true,
          calendar_transfer_meeting_ownership: true,
          calendar_transfer_to_manager: true,
          remove_from_all_groups: true,
          remove_from_shared_drives: true,
          revoke_oauth_tokens: true,
          revoke_app_passwords: true,
          sign_out_all_devices: true,
          reset_password: true,
          remove_signature: true,
          set_offboarding_signature: false,
          wipe_mobile_devices: false,
          wipe_requires_confirmation: true,
          account_action: 'suspend_immediately',
          delete_account: false,
          delete_after_days: 90,
          license_action: 'remove_on_suspension',
          notify_manager: true,
          notify_it_admin: true,
          notify_hr: false,
          notification_email_addresses: [],
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        const template = await userOffboardingService.getTemplate('template-1');

        expect(template).not.toBeNull();
        expect(template?.name).toBe('Quick Offboarding');
        expect(template?.driveAction).toBe('keep');
      });

      it('should return null if template not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const template = await userOffboardingService.getTemplate('nonexistent');

        expect(template).toBeNull();
      });
    });

    describe('createTemplate', () => {
      it('should create a new template with default values', async () => {
        const dto: CreateOffboardingTemplateDTO = {
          name: 'New Offboarding Template',
          description: 'A template for standard offboarding',
        };

        const createdTemplate = {
          id: 'new-template-id',
          organization_id: testOrgId,
          name: 'New Offboarding Template',
          description: 'A template for standard offboarding',
          drive_action: 'transfer_manager',
          drive_delete_after_days: 90,
          email_action: 'forward_manager',
          email_forward_duration_days: 30,
          calendar_decline_future_meetings: true,
          calendar_transfer_meeting_ownership: true,
          calendar_transfer_to_manager: true,
          remove_from_all_groups: true,
          remove_from_shared_drives: true,
          revoke_oauth_tokens: true,
          revoke_app_passwords: true,
          sign_out_all_devices: true,
          reset_password: true,
          remove_signature: true,
          set_offboarding_signature: false,
          wipe_mobile_devices: false,
          wipe_requires_confirmation: true,
          account_action: 'suspend_on_last_day',
          delete_account: false,
          delete_after_days: 90,
          license_action: 'remove_on_suspension',
          notify_manager: true,
          notify_it_admin: true,
          notify_hr: false,
          notification_email_addresses: [],
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdTemplate] });

        const template = await userOffboardingService.createTemplate(testOrgId, dto, testUserId);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(template.name).toBe('New Offboarding Template');
        expect(template.organizationId).toBe(testOrgId);
        expect(template.removeFromAllGroups).toBe(true);
      });

      it('should create a template with custom notification settings', async () => {
        const dto: CreateOffboardingTemplateDTO = {
          name: 'HR Notified Template',
          notifyManager: true,
          notifyItAdmin: true,
          notifyHr: true,
          notificationEmailAddresses: ['hr@gridworx.io', 'security@gridworx.io'],
        };

        const createdTemplate = {
          id: 'new-template-id',
          organization_id: testOrgId,
          name: 'HR Notified Template',
          drive_action: 'transfer_manager',
          drive_delete_after_days: 90,
          email_action: 'forward_manager',
          email_forward_duration_days: 30,
          calendar_decline_future_meetings: true,
          calendar_transfer_meeting_ownership: true,
          calendar_transfer_to_manager: true,
          remove_from_all_groups: true,
          remove_from_shared_drives: true,
          revoke_oauth_tokens: true,
          revoke_app_passwords: true,
          sign_out_all_devices: true,
          reset_password: true,
          remove_signature: true,
          set_offboarding_signature: false,
          wipe_mobile_devices: false,
          wipe_requires_confirmation: true,
          account_action: 'suspend_on_last_day',
          delete_account: false,
          delete_after_days: 90,
          license_action: 'remove_on_suspension',
          notify_manager: true,
          notify_it_admin: true,
          notify_hr: true,
          notification_email_addresses: ['hr@gridworx.io', 'security@gridworx.io'],
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdTemplate] });

        const template = await userOffboardingService.createTemplate(testOrgId, dto);

        expect(template.notifyHr).toBe(true);
        expect(template.notificationEmailAddresses).toHaveLength(2);
      });
    });

    describe('deleteTemplate', () => {
      it('should delete a template and return true', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await userOffboardingService.deleteTemplate('template-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM offboarding_templates'),
          ['template-1']
        );
      });

      it('should return false if template not found', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 0 });

        const result = await userOffboardingService.deleteTemplate('nonexistent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Offboarding Execution', () => {
    const baseConfig: OffboardingConfig = {
      userId: 'user-to-offboard',
      userEmail: 'departing@gridworx.io',
      managerId: 'manager-id',
      managerEmail: 'manager@gridworx.io',
      driveAction: 'keep',
      emailAction: 'keep',
      emailForwardDurationDays: 30,
      calendarDeclineFutureMeetings: false,
      calendarTransferMeetingOwnership: false,
      removeFromAllGroups: false,
      removeFromSharedDrives: false,
      revokeOauthTokens: false,
      revokeAppPasswords: false,
      signOutAllDevices: false,
      resetPassword: false,
      removeSignature: false,
      setOffboardingSignature: false,
      wipeMobileDevices: false,
      accountAction: 'keep_active',
      deleteAccount: false,
      deleteAfterDays: 90,
      licenseAction: 'keep',
      notifyManager: false,
      notifyItAdmin: false,
      notifyHr: false,
      notificationEmailAddresses: [],
    };

    describe('validateConfig', () => {
      it('should fail validation when userId is missing', async () => {
        const config = { ...baseConfig, userId: '' };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('User ID is required');
        expect(mockLogFailure).toHaveBeenCalledWith(
          testOrgId,
          'offboard',
          'validate_config',
          expect.any(String),
          expect.any(Object)
        );
      });

      it('should fail validation when userEmail is missing', async () => {
        const config = { ...baseConfig, userEmail: '' };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('User email is required');
      });

      it('should pass validation with valid config', async () => {
        const result = await userOffboardingService.executeOffboarding(testOrgId, baseConfig);

        expect(result.success).toBe(true);
        expect(result.stepsCompleted).toContain('validate_config');
      });
    });

    describe('removeFromAllGroups', () => {
      it('should remove user from all groups when enabled', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          removeFromAllGroups: true,
        };

        // Mock GW credentials
        mockQuery.mockResolvedValueOnce({
          rows: [{
            service_account_key: JSON.stringify({
              type: 'service_account',
              client_email: 'test@project.iam.gserviceaccount.com',
              private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
            }),
          }],
        });

        // Mock admin email
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@gridworx.io' }],
        });

        // Mock groups list
        mockGroupsList.mockResolvedValueOnce({
          data: {
            groups: [
              { id: 'group-1', email: 'group1@gridworx.io' },
              { id: 'group-2', email: 'group2@gridworx.io' },
            ],
          },
        });

        // Mock members delete
        mockMembersDelete.mockResolvedValue({});

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('remove_from_groups');
        expect(mockGroupsList).toHaveBeenCalledWith({
          userKey: config.userEmail,
        });
        expect(mockMembersDelete).toHaveBeenCalledTimes(2);
      });

      it('should skip group removal when disabled', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          removeFromAllGroups: false,
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsSkipped).toContain('remove_from_groups');
        expect(mockGroupsList).not.toHaveBeenCalled();
      });
    });

    describe('revokeOAuthTokens', () => {
      it('should revoke OAuth tokens when enabled', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          revokeOauthTokens: true,
        };

        // Mock GW credentials
        mockQuery.mockResolvedValueOnce({
          rows: [{
            service_account_key: JSON.stringify({
              type: 'service_account',
              client_email: 'test@project.iam.gserviceaccount.com',
              private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
            }),
          }],
        });

        // Mock admin email
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@gridworx.io' }],
        });

        // Mock tokens list
        mockTokensList.mockResolvedValueOnce({
          data: {
            items: [
              { clientId: 'client-1' },
              { clientId: 'client-2' },
            ],
          },
        });

        // Mock tokens delete
        mockTokensDelete.mockResolvedValue({});

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('revoke_oauth_tokens');
        expect(mockTokensDelete).toHaveBeenCalledTimes(2);
      });
    });

    describe('signOutAllDevices', () => {
      it('should sign out all devices when enabled', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          signOutAllDevices: true,
        };

        // Mock GW credentials
        mockQuery.mockResolvedValueOnce({
          rows: [{
            service_account_key: JSON.stringify({
              type: 'service_account',
              client_email: 'test@project.iam.gserviceaccount.com',
              private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
            }),
          }],
        });

        // Mock admin email
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@gridworx.io' }],
        });

        // Mock signOut
        mockUsersSignOut.mockResolvedValue({});

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('sign_out_devices');
        expect(mockUsersSignOut).toHaveBeenCalledWith({
          userKey: config.userEmail,
        });
      });
    });

    describe('resetPassword', () => {
      it('should reset password when enabled', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          resetPassword: true,
        };

        // Mock GW credentials
        mockQuery.mockResolvedValueOnce({
          rows: [{
            service_account_key: JSON.stringify({
              type: 'service_account',
              client_email: 'test@project.iam.gserviceaccount.com',
              private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
            }),
          }],
        });

        // Mock admin email
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@gridworx.io' }],
        });

        // Mock users update
        mockUsersUpdate.mockResolvedValue({});

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('reset_password');
        expect(mockUsersUpdate).toHaveBeenCalledWith({
          userKey: config.userEmail,
          requestBody: expect.objectContaining({
            password: expect.any(String),
            changePasswordAtNextLogin: true,
          }),
        });
      });
    });

    describe('suspendAccount', () => {
      it('should suspend account immediately when configured', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          accountAction: 'suspend_immediately',
        };

        // Mock GW credentials
        mockQuery.mockResolvedValueOnce({
          rows: [{
            service_account_key: JSON.stringify({
              type: 'service_account',
              client_email: 'test@project.iam.gserviceaccount.com',
              private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
            }),
          }],
        });

        // Mock admin email
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@gridworx.io' }],
        });

        // Mock users update for suspension
        mockUsersUpdate.mockResolvedValue({});

        // Mock Helios user status update
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('suspend_account');
        expect(mockUsersUpdate).toHaveBeenCalledWith({
          userKey: config.userEmail,
          requestBody: {
            suspended: true,
          },
        });
      });

      it('should skip suspension when set to suspend_on_last_day', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          accountAction: 'suspend_on_last_day',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsSkipped).toContain('suspend_account');
      });
    });

    describe('executeFromTemplate', () => {
      it('should execute offboarding from template', async () => {
        // Mock getTemplate
        const mockTemplate = {
          id: 'template-1',
          organization_id: testOrgId,
          name: 'Standard',
          drive_action: 'keep',
          drive_delete_after_days: 90,
          email_action: 'keep',
          email_forward_duration_days: 30,
          email_auto_reply_message: null,
          email_auto_reply_subject: null,
          calendar_decline_future_meetings: false,
          calendar_transfer_meeting_ownership: false,
          calendar_transfer_to_manager: false,
          remove_from_all_groups: false,
          remove_from_shared_drives: false,
          revoke_oauth_tokens: false,
          revoke_app_passwords: false,
          sign_out_all_devices: false,
          reset_password: false,
          remove_signature: false,
          set_offboarding_signature: false,
          wipe_mobile_devices: false,
          wipe_requires_confirmation: true,
          account_action: 'keep_active',
          delete_account: false,
          delete_after_days: 90,
          license_action: 'keep',
          notify_manager: false,
          notify_it_admin: false,
          notify_hr: false,
          notification_email_addresses: [],
          is_active: true,
          is_default: true,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        // Mock user lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'departing@gridworx.io', reporting_manager_id: 'manager-id' }],
        });

        // Mock manager email lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'manager@gridworx.io' }],
        });

        const result = await userOffboardingService.executeFromTemplate(
          testOrgId,
          'template-1',
          'user-id'
        );

        expect(result.success).toBe(true);
        expect(result.stepsCompleted).toContain('validate_config');
      });

      it('should return error if template not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOffboardingService.executeFromTemplate(
          testOrgId,
          'nonexistent',
          'user-id'
        );

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Template not found');
      });

      it('should return error if user not found', async () => {
        // Mock template found
        const mockTemplate = {
          id: 'template-1',
          organization_id: testOrgId,
          name: 'Standard',
          drive_action: 'keep',
          email_action: 'keep',
          email_forward_duration_days: 30,
          calendar_decline_future_meetings: false,
          calendar_transfer_meeting_ownership: false,
          calendar_transfer_to_manager: false,
          remove_from_all_groups: false,
          remove_from_shared_drives: false,
          revoke_oauth_tokens: false,
          revoke_app_passwords: false,
          sign_out_all_devices: false,
          reset_password: false,
          remove_signature: false,
          set_offboarding_signature: false,
          wipe_mobile_devices: false,
          wipe_requires_confirmation: true,
          account_action: 'keep_active',
          delete_account: false,
          delete_after_days: 90,
          license_action: 'keep',
          notify_manager: false,
          notify_it_admin: false,
          notify_hr: false,
          notification_email_addresses: [],
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        // Mock user not found
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOffboardingService.executeFromTemplate(
          testOrgId,
          'template-1',
          'nonexistent-user'
        );

        expect(result.success).toBe(false);
        expect(result.errors).toContain('User not found');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Google API errors gracefully', async () => {
      const config: OffboardingConfig = {
        userId: 'user-id',
        userEmail: 'user@gridworx.io',
        driveAction: 'keep',
        emailAction: 'keep',
        emailForwardDurationDays: 30,
        calendarDeclineFutureMeetings: false,
        calendarTransferMeetingOwnership: false,
        removeFromAllGroups: true,
        removeFromSharedDrives: false,
        revokeOauthTokens: false,
        revokeAppPasswords: false,
        signOutAllDevices: false,
        resetPassword: false,
        removeSignature: false,
        setOffboardingSignature: false,
        wipeMobileDevices: false,
        accountAction: 'keep_active',
        deleteAccount: false,
        deleteAfterDays: 90,
        licenseAction: 'keep',
        notifyManager: false,
        notifyItAdmin: false,
        notifyHr: false,
        notificationEmailAddresses: [],
      };

      // Mock GW credentials
      mockQuery.mockResolvedValueOnce({
        rows: [{
          service_account_key: JSON.stringify({
            type: 'service_account',
            client_email: 'test@project.iam.gserviceaccount.com',
            private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
          }),
        }],
      });

      // Mock admin email
      mockQuery.mockResolvedValueOnce({
        rows: [{ admin_email: 'admin@gridworx.io' }],
      });

      // Mock API error
      mockGroupsList.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      const result = await userOffboardingService.executeOffboarding(testOrgId, config);

      // Should continue but mark step as failed
      expect(result.stepsFailed).toContain('remove_from_groups');
      expect(result.errors.some(e => e.includes('Failed to remove from groups'))).toBe(true);
      expect(mockLogFailure).toHaveBeenCalled();
    });

    it('should handle missing Google Workspace credentials', async () => {
      const config: OffboardingConfig = {
        userId: 'user-id',
        userEmail: 'user@gridworx.io',
        driveAction: 'keep',
        emailAction: 'keep',
        emailForwardDurationDays: 30,
        calendarDeclineFutureMeetings: false,
        calendarTransferMeetingOwnership: false,
        removeFromAllGroups: true,
        removeFromSharedDrives: false,
        revokeOauthTokens: false,
        revokeAppPasswords: false,
        signOutAllDevices: false,
        resetPassword: false,
        removeSignature: false,
        setOffboardingSignature: false,
        wipeMobileDevices: false,
        accountAction: 'keep_active',
        deleteAccount: false,
        deleteAfterDays: 90,
        licenseAction: 'keep',
        notifyManager: false,
        notifyItAdmin: false,
        notifyHr: false,
        notificationEmailAddresses: [],
      };

      // Mock GW credentials not found
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await userOffboardingService.executeOffboarding(testOrgId, config);

      expect(result.stepsFailed).toContain('remove_from_groups');
      expect(result.errors.some(e => e.includes('Google Workspace not configured'))).toBe(true);
    });
  });

  describe('Step Ordering', () => {
    it('should always include finalize step on completion', async () => {
      const config: OffboardingConfig = {
        userId: 'user-id',
        userEmail: 'user@gridworx.io',
        driveAction: 'keep',
        emailAction: 'keep',
        emailForwardDurationDays: 30,
        calendarDeclineFutureMeetings: false,
        calendarTransferMeetingOwnership: false,
        removeFromAllGroups: false,
        removeFromSharedDrives: false,
        revokeOauthTokens: false,
        revokeAppPasswords: false,
        signOutAllDevices: false,
        resetPassword: false,
        removeSignature: false,
        setOffboardingSignature: false,
        wipeMobileDevices: false,
        accountAction: 'keep_active',
        deleteAccount: false,
        deleteAfterDays: 90,
        licenseAction: 'keep',
        notifyManager: false,
        notifyItAdmin: false,
        notifyHr: false,
        notificationEmailAddresses: [],
      };

      const result = await userOffboardingService.executeOffboarding(testOrgId, config);

      expect(result.stepsCompleted).toContain('finalize');
      expect(result.stepsCompleted[result.stepsCompleted.length - 1]).toBe('finalize');
    });
  });

  describe('Notifications', () => {
    it('should send notifications when configured', async () => {
      const config: OffboardingConfig = {
        userId: 'user-id',
        userEmail: 'user@gridworx.io',
        driveAction: 'keep',
        emailAction: 'keep',
        emailForwardDurationDays: 30,
        calendarDeclineFutureMeetings: false,
        calendarTransferMeetingOwnership: false,
        removeFromAllGroups: false,
        removeFromSharedDrives: false,
        revokeOauthTokens: false,
        revokeAppPasswords: false,
        signOutAllDevices: false,
        resetPassword: false,
        removeSignature: false,
        setOffboardingSignature: false,
        wipeMobileDevices: false,
        accountAction: 'keep_active',
        deleteAccount: false,
        deleteAfterDays: 90,
        licenseAction: 'keep',
        notifyManager: true,
        notifyItAdmin: true,
        notifyHr: false,
        notificationEmailAddresses: ['it@gridworx.io'],
      };

      const result = await userOffboardingService.executeOffboarding(testOrgId, config);

      expect(result.stepsCompleted).toContain('send_notifications');
    });
  });
});
