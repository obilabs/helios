import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock database
const mockQuery = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../database/connection.js', () => ({
  db: {
    query: mockQuery,
  },
}));

// Mock logger
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock lifecycle log service
const mockLogSuccess = jest.fn<(...args: any[]) => Promise<any>>();
const mockLogFailure = jest.fn<(...args: any[]) => Promise<any>>();
const mockLogSkipped = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../services/lifecycle-log.service.js', () => ({
  lifecycleLogService: {
    logSuccess: mockLogSuccess,
    logFailure: mockLogFailure,
    logSkipped: mockLogSkipped,
    createLog: jest.fn(),
  },
}));

// Mock Google APIs
const mockGroupsList = jest.fn<(...args: any[]) => Promise<any>>();
const mockMembersDelete = jest.fn<(...args: any[]) => Promise<any>>();
const mockTokensList = jest.fn<(...args: any[]) => Promise<any>>();
const mockTokensDelete = jest.fn<(...args: any[]) => Promise<any>>();
const mockUsersUpdate = jest.fn<(...args: any[]) => Promise<any>>();
const mockUsersSignOut = jest.fn<(...args: any[]) => Promise<any>>();
// Data Transfer + directory-lookup mocks (drive/calendar transfer step).
const mockUsersGet = jest.fn<(...args: any[]) => Promise<any>>();
const mockTransfersInsert = jest.fn<(...args: any[]) => Promise<any>>();
// Gmail forwarding + delegation mocks.
const mockForwardingAddressesCreate = jest.fn<(...args: any[]) => Promise<any>>();
const mockUpdateAutoForwarding = jest.fn<(...args: any[]) => Promise<any>>();
const mockDelegatesCreate = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('googleapis', () => ({
  google: {
    // `google.admin(...)` returns the same shape for every version (directory_v1
    // and datatransfer_v1 in this service); expose every method both clients use.
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
        get: mockUsersGet,
      },
      transfers: {
        insert: mockTransfersInsert,
      },
    })),
    gmail: jest.fn(() => ({
      users: {
        settings: {
          forwardingAddresses: {
            create: mockForwardingAddressesCreate,
          },
          updateAutoForwarding: mockUpdateAutoForwarding,
          delegates: {
            create: mockDelegatesCreate,
          },
          sendAs: {
            update: jest.fn(),
          },
        },
      },
    })),
  },
}));

// Mock google-auth-library
jest.unstable_mockModule('google-auth-library', () => ({
  JWT: jest.fn().mockImplementation(() => ({
    authorize: jest.fn(async () => ({})),
  })),
}));

// Mock the Google Workspace service the orchestrator delegates the newly-wired
// primitives to (auto-reply / cancel-future-events / add-to-group / move-to-OU /
// delete). These are separate methods on googleWorkspaceService; the existing
// inline-client steps (drive transfer, forwarding, delegation, groups, tokens,
// signout, password, suspend) don't touch this service, so mocking it here does
// not affect them.
const mockSetVacationResponder = jest.fn<(...args: any[]) => Promise<any>>();
const mockCancelFutureEvents = jest.fn<(...args: any[]) => Promise<any>>();
const mockAddUserToGroup = jest.fn<(...args: any[]) => Promise<any>>();
const mockSetOrgUnit = jest.fn<(...args: any[]) => Promise<any>>();
const mockDeleteUser = jest.fn<(...args: any[]) => Promise<any>>();
jest.unstable_mockModule('../services/google-workspace.service.js', () => ({
  googleWorkspaceService: {
    setVacationResponder: mockSetVacationResponder,
    cancelFutureEvents: mockCancelFutureEvents,
    addUserToGroup: mockAddUserToGroup,
    setOrgUnit: mockSetOrgUnit,
    deleteUser: mockDeleteUser,
  },
}));

// Import after mocks
import type { OffboardingConfig, CreateOffboardingTemplateDTO } from '../types/user-lifecycle.js';
const { userOffboardingService } = await import('../services/user-offboarding.service.js');

describe('UserOffboardingService', () => {
  const testOrgId = 'test-org-id';
  const testUserId = 'test-user-id';

  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
    mockLogSuccess.mockResolvedValue({});
    mockLogFailure.mockResolvedValue({});
    mockLogSkipped.mockResolvedValue({});
    // Delegated Google Workspace primitives default to success; individual tests
    // override to assert failure handling.
    mockSetVacationResponder.mockResolvedValue({ success: true });
    mockCancelFutureEvents.mockResolvedValue({ success: true, cancelledCount: 0, declinedCount: 0 });
    mockAddUserToGroup.mockResolvedValue({ success: true });
    mockSetOrgUnit.mockResolvedValue({ success: true });
    mockDeleteUser.mockResolvedValue({ success: true });
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
            notification_email_addresses: [] as any,
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
          notification_email_addresses: [] as any,
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
          notification_email_addresses: [] as any,
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
          notificationEmailAddresses: ['hr@obilabs.dev', 'security@obilabs.dev'],
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
          notification_email_addresses: ['hr@obilabs.dev', 'security@obilabs.dev'],
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
      userEmail: 'departing@obilabs.dev',
      managerId: 'manager-id',
      managerEmail: 'manager@obilabs.dev',
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

    describe('admin self-lockout guard', () => {
      it('refuses to offboard the Google Workspace admin Helios impersonates, before any step runs', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          userEmail: 'admin@obilabs.dev', // same as the impersonation admin below
          accountAction: 'suspend_immediately',
          removeFromAllGroups: true,
        };

        // The guard reads the admin email: target === admin, so it must refuse.
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@obilabs.dev' }],
        });

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.errors.join(' ')).toMatch(/lock Helios out|Refusing to offboard/i);
        // Nothing destructive should have run — the guard short-circuits everything.
        expect(result.stepsCompleted).toHaveLength(0);
      });
    });

    describe('removeFromAllGroups', () => {
      it('should remove user from all groups when enabled', async () => {
        const config: OffboardingConfig = {
          ...baseConfig,
          removeFromAllGroups: true,
        };

        // Self-lockout guard reads the admin email first (departing != admin -> allowed)
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@obilabs.dev' }],
        });

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
          rows: [{ admin_email: 'admin@obilabs.dev' }],
        });

        // Mock groups list
        mockGroupsList.mockResolvedValueOnce({
          data: {
            groups: [
              { id: 'group-1', email: 'group1@obilabs.dev' },
              { id: 'group-2', email: 'group2@obilabs.dev' },
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

        // Self-lockout guard reads the admin email first (departing != admin -> allowed)
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@obilabs.dev' }],
        });

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
          rows: [{ admin_email: 'admin@obilabs.dev' }],
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

        // Self-lockout guard reads the admin email first (departing != admin -> allowed)
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@obilabs.dev' }],
        });

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
          rows: [{ admin_email: 'admin@obilabs.dev' }],
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

        // Self-lockout guard reads the admin email first (departing != admin -> allowed)
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@obilabs.dev' }],
        });

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
          rows: [{ admin_email: 'admin@obilabs.dev' }],
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

        // Self-lockout guard reads the admin email first (departing != admin -> allowed)
        mockQuery.mockResolvedValueOnce({
          rows: [{ admin_email: 'admin@obilabs.dev' }],
        });

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
          rows: [{ admin_email: 'admin@obilabs.dev' }],
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

    // ---------------------------------------------------------------------
    // Google-touching lifecycle steps: Drive/Calendar Data Transfer, Gmail
    // forwarding, and Gmail mailbox delegation. The Google layer is mocked;
    // these prove the CORRECT request shapes (incl. the Data Transfer
    // application IDs, historically swapped) and graceful per-step failure.
    // ---------------------------------------------------------------------

    // Route DB reads by SQL text so query ordering across steps stays robust.
    const SA_KEY_JSON = JSON.stringify({
      type: 'service_account',
      client_email: 'sa@project.iam.gserviceaccount.com',
      private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
    });
    function primeGoogleDb(): void {
      mockQuery.mockImplementation(async (text: string) => {
        if (typeof text === 'string' && text.includes('service_account_key')) {
          return { rows: [{ service_account_key: SA_KEY_JSON }] };
        }
        if (typeof text === 'string' && text.includes('admin_email')) {
          return { rows: [{ admin_email: 'admin@obilabs.dev' }] };
        }
        if (typeof text === 'string' && text.includes('FROM organization_users')) {
          return { rows: [{ email: 'successor@obilabs.dev' }] };
        }
        return { rows: [] };
      });
    }
    function primeUserIds(): void {
      const ids: Record<string, string> = {
        'departing@obilabs.dev': '1001',
        'manager@obilabs.dev': '2002',
        'successor@obilabs.dev': '3003',
      };
      mockUsersGet.mockImplementation(async ({ userKey }: any) => ({
        data: { id: ids[userKey] ?? '9999' },
      }));
    }

    describe('handleDriveTransfer (Data Transfer API)', () => {
      it('transfers Drive AND Calendar to the manager with the correct application IDs', async () => {
        primeGoogleDb();
        primeUserIds();
        mockTransfersInsert.mockResolvedValue({ data: { id: 'transfer-123' } });

        const config: OffboardingConfig = {
          ...baseConfig,
          driveAction: 'transfer_manager',
          calendarTransferMeetingOwnership: true,
          managerEmail: 'manager@obilabs.dev',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('transfer_drive_files');
        expect(mockTransfersInsert).toHaveBeenCalledTimes(1);

        const requestBody = mockTransfersInsert.mock.calls[0][0].requestBody;
        // Owners keyed by immutable numeric ID (resolved via directory users.get).
        expect(requestBody.oldOwnerUserId).toBe('1001');
        expect(requestBody.newOwnerUserId).toBe('2002');

        const appIds = requestBody.applicationDataTransfers.map((a: any) => a.applicationId);
        // Regression guard for the swap bug: Drive is 55656082996, NOT 435070579839.
        expect(appIds).toContain('55656082996'); // Drive
        expect(appIds).toContain('435070579839'); // Calendar
        expect(appIds).not.toContain(undefined);

        const drive = requestBody.applicationDataTransfers.find(
          (a: any) => a.applicationId === '55656082996'
        );
        expect(drive.applicationTransferParams).toEqual([
          { key: 'PRIVACY_LEVEL', value: ['PRIVATE', 'SHARED'] },
        ]);
      });

      it('transfers Drive only (no Calendar) to an explicit user when calendar transfer is off', async () => {
        primeGoogleDb();
        primeUserIds();
        mockTransfersInsert.mockResolvedValue({ data: { id: 'transfer-xyz' } });

        const config: OffboardingConfig = {
          ...baseConfig,
          driveAction: 'transfer_user',
          driveTransferToUserId: 'successor-user-id',
          calendarTransferMeetingOwnership: false,
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('transfer_drive_files');
        const requestBody = mockTransfersInsert.mock.calls[0][0].requestBody;
        const appIds = requestBody.applicationDataTransfers.map((a: any) => a.applicationId);
        expect(appIds).toEqual(['55656082996']); // Drive only
        expect(requestBody.newOwnerUserId).toBe('3003'); // resolved successor
      });

      it('marks the drive step failed WITHOUT aborting the offboard when the transfer API errors', async () => {
        primeGoogleDb();
        primeUserIds();
        mockTransfersInsert.mockRejectedValueOnce(new Error('transfer quota exceeded'));

        const config: OffboardingConfig = {
          ...baseConfig,
          driveAction: 'transfer_manager',
          managerEmail: 'manager@obilabs.dev',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.stepsFailed).toContain('transfer_drive_files');
        expect(result.errors.some((e) => e.includes('transfer quota exceeded'))).toBe(true);
        expect(mockLogFailure).toHaveBeenCalledWith(
          testOrgId,
          'offboard',
          'transfer_drive_files',
          expect.any(Error),
          expect.any(Object)
        );
        // The offboard still ran to completion rather than aborting.
        expect(result.stepsCompleted).toContain('finalize');
      });

      it('does not call the Data Transfer API for a non-transfer drive action (archive)', async () => {
        primeGoogleDb();
        primeUserIds();

        const config: OffboardingConfig = {
          ...baseConfig,
          driveAction: 'archive',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        // Step runs (driveAction !== 'keep') but archive has no Data Transfer mapping.
        expect(result.stepsCompleted).toContain('transfer_drive_files');
        expect(mockTransfersInsert).not.toHaveBeenCalled();
      });
    });

    describe('setupEmailForwarding + mailbox delegation', () => {
      it('registers a forwarding address, enables auto-forwarding, and delegates the mailbox to the manager', async () => {
        primeGoogleDb();
        mockForwardingAddressesCreate.mockResolvedValue({});
        mockUpdateAutoForwarding.mockResolvedValue({});
        mockDelegatesCreate.mockResolvedValue({});

        const config: OffboardingConfig = {
          ...baseConfig,
          emailAction: 'forward_manager',
          managerEmail: 'manager@obilabs.dev',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('setup_email_forwarding');
        expect(result.stepsCompleted).toContain('setup_mailbox_delegation');

        // Gmail settings impersonate the DEPARTING user (userId), never the admin.
        expect(mockForwardingAddressesCreate).toHaveBeenCalledWith({
          userId: 'departing@obilabs.dev',
          requestBody: { forwardingEmail: 'manager@obilabs.dev' },
        });
        expect(mockUpdateAutoForwarding).toHaveBeenCalledWith({
          userId: 'departing@obilabs.dev',
          requestBody: expect.objectContaining({
            enabled: true,
            emailAddress: 'manager@obilabs.dev',
            disposition: 'leaveInInbox',
          }),
        });
        expect(mockDelegatesCreate).toHaveBeenCalledWith({
          userId: 'departing@obilabs.dev',
          requestBody: { delegateEmail: 'manager@obilabs.dev' },
        });
      });

      it('forwards + delegates to the explicit forward-user when emailAction is forward_user', async () => {
        primeGoogleDb();
        mockForwardingAddressesCreate.mockResolvedValue({});
        mockUpdateAutoForwarding.mockResolvedValue({});
        mockDelegatesCreate.mockResolvedValue({});

        const config: OffboardingConfig = {
          ...baseConfig,
          emailAction: 'forward_user',
          emailForwardToUserId: 'successor-user-id',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(mockForwardingAddressesCreate).toHaveBeenCalledWith({
          userId: 'departing@obilabs.dev',
          requestBody: { forwardingEmail: 'successor@obilabs.dev' },
        });
        expect(mockDelegatesCreate).toHaveBeenCalledWith({
          userId: 'departing@obilabs.dev',
          requestBody: { delegateEmail: 'successor@obilabs.dev' },
        });
        expect(result.stepsCompleted).toContain('setup_mailbox_delegation');
      });

      it('fails forwarding gracefully — delegation still runs and the offboard finalizes', async () => {
        primeGoogleDb();
        mockForwardingAddressesCreate.mockRejectedValueOnce(new Error('forwarding not permitted'));
        mockDelegatesCreate.mockResolvedValue({});

        const config: OffboardingConfig = {
          ...baseConfig,
          emailAction: 'forward_manager',
          managerEmail: 'manager@obilabs.dev',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsFailed).toContain('setup_email_forwarding');
        // Independent step: delegation is unaffected by the forwarding failure.
        expect(result.stepsCompleted).toContain('setup_mailbox_delegation');
        expect(result.stepsCompleted).toContain('finalize');
        expect(result.success).toBe(false);
        expect(mockLogFailure).toHaveBeenCalledWith(
          testOrgId,
          'offboard',
          'setup_email_forwarding',
          expect.any(Error),
          expect.any(Object)
        );
      });

      it('skips forwarding and delegation entirely when emailAction is keep', async () => {
        primeGoogleDb();

        const result = await userOffboardingService.executeOffboarding(testOrgId, baseConfig);

        expect(result.stepsSkipped).toContain('setup_email_forwarding');
        expect(result.stepsSkipped).toContain('setup_mailbox_delegation');
        expect(mockForwardingAddressesCreate).not.toHaveBeenCalled();
        expect(mockDelegatesCreate).not.toHaveBeenCalled();
      });
    });

    // ---------------------------------------------------------------------
    // Newly-wired offboarding primitives delegated to googleWorkspaceService:
    // auto-reply (vacation responder), future-event cancellation, add-to-group,
    // move-to-OU, and guarded/deferrable account deletion. The Google service is
    // mocked; these prove the orchestrator invokes the right primitive with the
    // right args, gates each on its config flag, and fails a step gracefully
    // without aborting the offboard.
    // ---------------------------------------------------------------------

    describe('setAutoReply (vacation responder wiring)', () => {
      it('sets the vacation responder via googleWorkspaceService, impersonating the departing user', async () => {
        primeGoogleDb();
        mockSetVacationResponder.mockResolvedValue({ success: true });

        const config: OffboardingConfig = {
          ...baseConfig,
          emailAction: 'auto_reply',
          emailAutoReplyMessage: 'I have left the company. Please contact my manager.',
          emailAutoReplySubject: 'No longer with the company',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('set_auto_reply');
        expect(mockSetVacationResponder).toHaveBeenCalledWith(
          testOrgId,
          'departing@obilabs.dev',
          expect.objectContaining({
            subject: 'No longer with the company',
            body: 'I have left the company. Please contact my manager.',
          })
        );
      });

      it('marks the auto-reply step failed (without aborting) when the vacation responder fails', async () => {
        primeGoogleDb();
        mockSetVacationResponder.mockResolvedValue({ success: false, error: 'user suspended' });

        const config: OffboardingConfig = {
          ...baseConfig,
          emailAction: 'auto_reply',
          emailAutoReplyMessage: 'Gone.',
          emailAutoReplySubject: 'Gone',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsFailed).toContain('set_auto_reply');
        expect(result.success).toBe(false);
        expect(result.stepsCompleted).toContain('finalize');
      });

      it('skips auto-reply when emailAction is not auto_reply', async () => {
        primeGoogleDb();

        const result = await userOffboardingService.executeOffboarding(testOrgId, baseConfig);

        expect(result.stepsSkipped).toContain('set_auto_reply');
        expect(mockSetVacationResponder).not.toHaveBeenCalled();
      });
    });

    describe('cancelFutureEvents wiring', () => {
      it('cancels future calendar events when cancelFutureEvents is set', async () => {
        primeGoogleDb();
        mockCancelFutureEvents.mockResolvedValue({ success: true, cancelledCount: 2, declinedCount: 3 });

        const config: OffboardingConfig = {
          ...baseConfig,
          cancelFutureEvents: true,
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('cancel_future_events');
        expect(mockCancelFutureEvents).toHaveBeenCalledWith(testOrgId, 'departing@obilabs.dev');
      });

      it('also runs via the pre-existing (previously inert) calendarDeclineFutureMeetings flag', async () => {
        primeGoogleDb();
        mockCancelFutureEvents.mockResolvedValue({ success: true, cancelledCount: 0, declinedCount: 0 });

        const config: OffboardingConfig = {
          ...baseConfig,
          calendarDeclineFutureMeetings: true,
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('cancel_future_events');
        expect(mockCancelFutureEvents).toHaveBeenCalledTimes(1);
      });

      it('skips calendar cancellation when neither flag is set', async () => {
        primeGoogleDb();

        const result = await userOffboardingService.executeOffboarding(testOrgId, baseConfig);

        expect(result.stepsSkipped).toContain('cancel_future_events');
        expect(mockCancelFutureEvents).not.toHaveBeenCalled();
      });

      it('marks the calendar step failed without aborting when the sweep errors', async () => {
        primeGoogleDb();
        mockCancelFutureEvents.mockResolvedValue({ success: false, error: 'calendar api down' });

        const config: OffboardingConfig = { ...baseConfig, cancelFutureEvents: true };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsFailed).toContain('cancel_future_events');
        expect(result.stepsCompleted).toContain('finalize');
        expect(result.success).toBe(false);
      });
    });

    describe('addToOffboardedGroup wiring', () => {
      it('adds the departing user to the configured offboarded group', async () => {
        primeGoogleDb();
        mockAddUserToGroup.mockResolvedValue({ success: true });

        const config: OffboardingConfig = {
          ...baseConfig,
          offboardedGroupEmail: 'offboarded@obilabs.dev',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('add_to_offboarded_group');
        expect(mockAddUserToGroup).toHaveBeenCalledWith(
          testOrgId,
          'departing@obilabs.dev',
          'offboarded@obilabs.dev'
        );
      });

      it('skips when no offboarded group is configured', async () => {
        primeGoogleDb();

        const result = await userOffboardingService.executeOffboarding(testOrgId, baseConfig);

        expect(result.stepsSkipped).toContain('add_to_offboarded_group');
        expect(mockAddUserToGroup).not.toHaveBeenCalled();
      });
    });

    describe('moveToOrgUnit wiring', () => {
      it('moves the departing user into the configured org unit', async () => {
        primeGoogleDb();
        mockSetOrgUnit.mockResolvedValue({ success: true });

        const config: OffboardingConfig = {
          ...baseConfig,
          orgUnitPath: '/Offboarded',
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('move_to_org_unit');
        expect(mockSetOrgUnit).toHaveBeenCalledWith(testOrgId, 'departing@obilabs.dev', '/Offboarded');
      });

      it('skips when no org unit is configured', async () => {
        primeGoogleDb();

        const result = await userOffboardingService.executeOffboarding(testOrgId, baseConfig);

        expect(result.stepsSkipped).toContain('move_to_org_unit');
        expect(mockSetOrgUnit).not.toHaveBeenCalled();
      });
    });

    describe('account deletion (opt-in, guarded, deferrable)', () => {
      it('DEFERS deletion by default: records intent and never calls deleteUser', async () => {
        primeGoogleDb();

        const config: OffboardingConfig = {
          ...baseConfig,
          deleteAccount: true,
          deleteAfterDays: 30,
          // deleteImmediately not set -> deferral
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('schedule_account_deletion');
        expect(result.stepsCompleted).not.toContain('delete_account');
        expect(mockDeleteUser).not.toHaveBeenCalled();
        // Intent recorded in the audit log with the scheduled deletion window.
        expect(mockLogSuccess).toHaveBeenCalledWith(
          testOrgId,
          'offboard',
          'schedule_account_deletion',
          expect.objectContaining({
            details: expect.objectContaining({ deferred: true, deleteAfterDays: 30 }),
          })
        );
      });

      it('HARD-DELETES inline only with the explicit immediate flag', async () => {
        primeGoogleDb();
        mockDeleteUser.mockResolvedValue({ success: true });

        const config: OffboardingConfig = {
          ...baseConfig,
          deleteAccount: true,
          deleteImmediately: true,
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsCompleted).toContain('delete_account');
        expect(mockDeleteUser).toHaveBeenCalledWith(testOrgId, 'departing@obilabs.dev');
      });

      it('skips deletion entirely when deleteAccount is false (suspend remains the default)', async () => {
        primeGoogleDb();

        const result = await userOffboardingService.executeOffboarding(testOrgId, baseConfig);

        expect(result.stepsSkipped).toContain('delete_account');
        expect(mockDeleteUser).not.toHaveBeenCalled();
      });

      it('marks the delete step failed (without aborting) when deleteUser fails', async () => {
        primeGoogleDb();
        mockDeleteUser.mockResolvedValue({ success: false, error: 'protected admin' });

        const config: OffboardingConfig = {
          ...baseConfig,
          deleteAccount: true,
          deleteImmediately: true,
        };

        const result = await userOffboardingService.executeOffboarding(testOrgId, config);

        expect(result.stepsFailed).toContain('delete_account');
        expect(result.success).toBe(false);
        expect(result.stepsCompleted).toContain('finalize');
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
          email_auto_reply_message: null as any,
          email_auto_reply_subject: null as any,
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
          notification_email_addresses: [] as any,
          is_active: true,
          is_default: true,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        // Mock user lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'departing@obilabs.dev', reporting_manager_id: 'manager-id' }],
        });

        // Mock manager email lookup
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'manager@obilabs.dev' }],
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
          notification_email_addresses: [] as any,
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
        userEmail: 'user@obilabs.dev',
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
        rows: [{ admin_email: 'admin@obilabs.dev' }],
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
        userEmail: 'user@obilabs.dev',
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
        userEmail: 'user@obilabs.dev',
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
        userEmail: 'user@obilabs.dev',
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
        notificationEmailAddresses: ['it@obilabs.dev'],
      };

      const result = await userOffboardingService.executeOffboarding(testOrgId, config);

      expect(result.stepsCompleted).toContain('send_notifications');
    });
  });
});
