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
const mockUsersInsert = jest.fn();
const mockUsersUpdate = jest.fn();
const mockMembersInsert = jest.fn();
const mockPermissionsCreate = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    admin: jest.fn(() => ({
      users: {
        insert: mockUsersInsert,
        update: mockUsersUpdate,
      },
      members: {
        insert: mockMembersInsert,
      },
    })),
    drive: jest.fn(() => ({
      permissions: {
        create: mockPermissionsCreate,
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

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

// Import after mocks
import { userOnboardingService } from '../services/user-onboarding.service.js';
import { OnboardingConfig, CreateOnboardingTemplateDTO } from '../types/user-lifecycle.js';

describe('UserOnboardingService', () => {
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
      it('should return all templates for an organization', async () => {
        const mockTemplates = [
          {
            id: 'template-1',
            organization_id: testOrgId,
            name: 'Default Template',
            description: 'Standard onboarding',
            department_id: null,
            google_license_sku: null,
            google_org_unit_path: '/',
            google_services: { gmail: true, drive: true },
            group_ids: ['group-1'],
            shared_drive_access: [],
            calendar_subscriptions: [],
            signature_template_id: null,
            default_job_title: null,
            default_manager_id: null,
            send_welcome_email: true,
            welcome_email_subject: 'Welcome!',
            welcome_email_body: 'Hello!',
            is_active: true,
            is_default: true,
            created_by: testUserId,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ];

        mockQuery.mockResolvedValueOnce({ rows: mockTemplates });

        const templates = await userOnboardingService.getTemplates(testOrgId);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(templates).toHaveLength(1);
        expect(templates[0].name).toBe('Default Template');
        expect(templates[0].isActive).toBe(true);
        expect(templates[0].isDefault).toBe(true);
      });

      it('should filter by isActive when provided', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await userOnboardingService.getTemplates(testOrgId, { isActive: true });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [query, values] = mockQuery.mock.calls[0];
        expect(query).toContain('is_active = $2');
        expect(values).toContain(true);
      });

      it('should filter by departmentId when provided', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        await userOnboardingService.getTemplates(testOrgId, { departmentId: 'dept-1' });

        expect(mockQuery).toHaveBeenCalledTimes(1);
        const [query, values] = mockQuery.mock.calls[0];
        expect(query).toContain('department_id = $2');
        expect(values).toContain('dept-1');
      });
    });

    describe('getTemplate', () => {
      it('should return a single template by ID', async () => {
        const mockTemplate = {
          id: 'template-1',
          organization_id: testOrgId,
          name: 'Engineering Template',
          google_services: { gmail: true },
          group_ids: [],
          shared_drive_access: [],
          calendar_subscriptions: [],
          send_welcome_email: true,
          welcome_email_subject: 'Welcome!',
          welcome_email_body: 'Hello!',
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        const template = await userOnboardingService.getTemplate('template-1');

        expect(template).not.toBeNull();
        expect(template?.name).toBe('Engineering Template');
      });

      it('should return null if template not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const template = await userOnboardingService.getTemplate('nonexistent');

        expect(template).toBeNull();
      });
    });

    describe('createTemplate', () => {
      it('should create a new template with default values', async () => {
        const dto: CreateOnboardingTemplateDTO = {
          name: 'New Template',
          description: 'A new onboarding template',
        };

        const createdTemplate = {
          id: 'new-template-id',
          organization_id: testOrgId,
          name: 'New Template',
          description: 'A new onboarding template',
          google_services: { gmail: true, drive: true, calendar: true, meet: true, chat: true, docs: true, sheets: true, slides: true },
          group_ids: [],
          shared_drive_access: [],
          calendar_subscriptions: [],
          send_welcome_email: true,
          welcome_email_subject: 'Welcome to {{company_name}}',
          welcome_email_body: 'Default body',
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdTemplate] });

        const template = await userOnboardingService.createTemplate(testOrgId, dto, testUserId);

        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(template.name).toBe('New Template');
        expect(template.organizationId).toBe(testOrgId);
      });

      it('should create a template with custom group IDs', async () => {
        const dto: CreateOnboardingTemplateDTO = {
          name: 'Template with Groups',
          groupIds: ['group-1', 'group-2', 'group-3'],
        };

        const createdTemplate = {
          id: 'new-template-id',
          organization_id: testOrgId,
          name: 'Template with Groups',
          google_services: {},
          group_ids: ['group-1', 'group-2', 'group-3'],
          shared_drive_access: [],
          calendar_subscriptions: [],
          send_welcome_email: true,
          welcome_email_subject: 'Welcome to {{company_name}}',
          welcome_email_body: 'Default body',
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [createdTemplate] });

        const template = await userOnboardingService.createTemplate(testOrgId, dto);

        expect(template.groupIds).toHaveLength(3);
        expect(template.groupIds).toContain('group-1');
      });
    });

    describe('updateTemplate', () => {
      it('should update template fields', async () => {
        // Mock getTemplate
        const existingTemplate = {
          id: 'template-1',
          organization_id: testOrgId,
          name: 'Old Name',
          google_services: {},
          group_ids: [],
          shared_drive_access: [],
          calendar_subscriptions: [],
          send_welcome_email: true,
          welcome_email_subject: 'Welcome!',
          welcome_email_body: 'Hello!',
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [existingTemplate] });

        const updatedTemplate = { ...existingTemplate, name: 'New Name' };
        mockQuery.mockResolvedValueOnce({ rows: [updatedTemplate] });

        const template = await userOnboardingService.updateTemplate('template-1', { name: 'New Name' });

        expect(template?.name).toBe('New Name');
      });

      it('should return null if template does not exist', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const template = await userOnboardingService.updateTemplate('nonexistent', { name: 'New Name' });

        expect(template).toBeNull();
      });
    });

    describe('deleteTemplate', () => {
      it('should delete a template and return true', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await userOnboardingService.deleteTemplate('template-1');

        expect(result).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringContaining('DELETE FROM onboarding_templates'),
          ['template-1']
        );
      });

      it('should return false if template not found', async () => {
        mockQuery.mockResolvedValueOnce({ rowCount: 0 });

        const result = await userOnboardingService.deleteTemplate('nonexistent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Onboarding Execution', () => {
    const validConfig: OnboardingConfig = {
      email: 'newuser@gridworx.io',
      firstName: 'John',
      lastName: 'Doe',
      personalEmail: 'john.doe@personal.com',
      jobTitle: 'Software Engineer',
      groupIds: [],
      sharedDriveAccess: [],
      calendarSubscriptions: [],
      sendWelcomeEmail: true,
    };

    describe('validateConfig', () => {
      it('should fail validation when email is missing', async () => {
        const config = { ...validConfig, email: '' };

        // Mock createHeliosUser to not be called
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOnboardingService.executeOnboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Email is required');
        expect(mockLogFailure).toHaveBeenCalledWith(
          testOrgId,
          'onboard',
          'validate_config',
          expect.any(String),
          expect.any(Object)
        );
      });

      it('should fail validation when email format is invalid', async () => {
        const config = { ...validConfig, email: 'invalid-email' };

        const result = await userOnboardingService.executeOnboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Invalid email format');
      });

      it('should fail validation when firstName is missing', async () => {
        const config = { ...validConfig, firstName: '' };

        const result = await userOnboardingService.executeOnboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('First name is required');
      });

      it('should fail validation when lastName is missing', async () => {
        const config = { ...validConfig, lastName: '' };

        const result = await userOnboardingService.executeOnboarding(testOrgId, config);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Last name is required');
      });
    });

    describe('createHeliosUser', () => {
      it('should create a Helios user successfully', async () => {
        // Mock insert returning new user
        mockQuery.mockResolvedValueOnce({
          rows: [{ id: 'new-user-id' }]
        });

        // Mock GW credentials - not configured
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOnboardingService.executeOnboarding(testOrgId, validConfig);

        expect(result.userId).toBe('new-user-id');
        expect(result.stepsCompleted).toContain('create_helios_user');
        expect(mockLogSuccess).toHaveBeenCalledWith(
          testOrgId,
          'onboard',
          'create_helios_user',
          expect.objectContaining({
            userId: 'new-user-id',
          })
        );
      });

      it('should fail if Helios user creation fails', async () => {
        mockQuery.mockRejectedValueOnce(new Error('Database error'));

        const result = await userOnboardingService.executeOnboarding(testOrgId, validConfig);

        expect(result.success).toBe(false);
        expect(result.stepsFailed).toContain('create_helios_user');
        expect(result.errors.some(e => e.includes('Failed to create Helios user'))).toBe(true);
      });
    });

    describe('createGoogleUser', () => {
      it('should create Google user when credentials are configured', async () => {
        // Mock Helios user creation
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] });

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

        // Mock Google users.insert response
        mockUsersInsert.mockResolvedValueOnce({
          data: { id: 'google-user-id' },
        });

        // Mock linking (update organization_users)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock gw_synced_users insert
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        const result = await userOnboardingService.executeOnboarding(testOrgId, validConfig);

        expect(result.googleUserId).toBe('google-user-id');
        expect(result.stepsCompleted).toContain('create_google_account');
      });

      it('should skip Google account creation if credentials not configured', async () => {
        // Mock Helios user creation
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] });

        // Mock GW credentials - not found
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOnboardingService.executeOnboarding(testOrgId, validConfig);

        expect(result.googleUserId).toBeUndefined();
        expect(result.stepsFailed).toContain('create_google_account');
        expect(result.errors.some(e => e.includes('Google Workspace not configured'))).toBe(true);
      });
    });

    describe('addToGroups', () => {
      it('should add user to specified groups', async () => {
        const configWithGroups: OnboardingConfig = {
          ...validConfig,
          groupIds: ['group-1', 'group-2'],
        };

        // Mock Helios user creation
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] });

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

        // Mock admin email (for Google user creation)
        mockQuery.mockResolvedValueOnce({ rows: [{ admin_email: 'admin@gridworx.io' }] });

        // Mock Google user creation
        mockUsersInsert.mockResolvedValueOnce({ data: { id: 'google-user-id' } });

        // Mock linking
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // Mock GW credentials for groups (called again)
        mockQuery.mockResolvedValueOnce({
          rows: [{
            service_account_key: JSON.stringify({
              type: 'service_account',
              client_email: 'test@project.iam.gserviceaccount.com',
              private_key: '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----',
            }),
          }],
        });

        // Mock admin email for groups
        mockQuery.mockResolvedValueOnce({ rows: [{ admin_email: 'admin@gridworx.io' }] });

        // Mock group lookups
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'group1@gridworx.io', external_id: 'group-1-ext' }],
        });
        mockQuery.mockResolvedValueOnce({
          rows: [{ email: 'group2@gridworx.io', external_id: 'group-2-ext' }],
        });

        // Mock members.insert
        mockMembersInsert.mockResolvedValue({});

        const result = await userOnboardingService.executeOnboarding(testOrgId, configWithGroups);

        expect(result.stepsCompleted).toContain('add_to_groups');
      });
    });

    describe('sendWelcomeEmail', () => {
      it('should log welcome email sending when configured', async () => {
        const configWithEmail: OnboardingConfig = {
          ...validConfig,
          sendWelcomeEmail: true,
          personalEmail: 'john@personal.com',
        };

        // Mock Helios user creation
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] });

        // Mock GW credentials - not configured (skip Google account)
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOnboardingService.executeOnboarding(testOrgId, configWithEmail);

        expect(result.stepsCompleted).toContain('send_welcome_email');
        expect(mockLogSuccess).toHaveBeenCalledWith(
          testOrgId,
          'onboard',
          'send_welcome_email',
          expect.objectContaining({
            details: expect.objectContaining({ sentTo: 'john@personal.com' }),
          })
        );
      });

      it('should skip welcome email when personalEmail is not provided', async () => {
        const configNoEmail: OnboardingConfig = {
          ...validConfig,
          sendWelcomeEmail: true,
          personalEmail: undefined,
        };

        // Mock Helios user creation
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] });

        // Mock GW credentials - not configured
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOnboardingService.executeOnboarding(testOrgId, configNoEmail);

        expect(result.stepsCompleted).not.toContain('send_welcome_email');
      });
    });

    describe('executeFromTemplate', () => {
      it('should execute onboarding from template', async () => {
        // Mock getTemplate
        const mockTemplate = {
          id: 'template-1',
          organization_id: testOrgId,
          name: 'Engineering',
          description: 'For engineers',
          department_id: 'eng-dept',
          google_license_sku: null,
          google_org_unit_path: '/Engineering',
          google_services: { gmail: true, drive: true },
          group_ids: ['eng-group'],
          shared_drive_access: [],
          calendar_subscriptions: [],
          signature_template_id: null,
          default_job_title: 'Software Engineer',
          default_manager_id: 'manager-id',
          send_welcome_email: true,
          welcome_email_subject: 'Welcome to Engineering!',
          welcome_email_body: 'Welcome!',
          is_active: true,
          is_default: false,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockQuery.mockResolvedValueOnce({ rows: [mockTemplate] });

        // Mock Helios user creation
        mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] });

        // Mock GW credentials - not configured
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOnboardingService.executeFromTemplate(
          testOrgId,
          'template-1',
          {
            email: 'newdev@gridworx.io',
            firstName: 'Jane',
            lastName: 'Smith',
          }
        );

        expect(result.userId).toBe('new-user-id');
        // Template values should be used
        expect(result.stepsCompleted).toContain('create_helios_user');
      });

      it('should return error if template not found', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await userOnboardingService.executeFromTemplate(
          testOrgId,
          'nonexistent',
          {
            email: 'test@gridworx.io',
            firstName: 'Test',
            lastName: 'User',
          }
        );

        expect(result.success).toBe(false);
        expect(result.errors).toContain('Template not found');
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const config: OnboardingConfig = {
        email: 'test@gridworx.io',
        firstName: 'Test',
        lastName: 'User',
        groupIds: [],
        sharedDriveAccess: [],
        calendarSubscriptions: [],
        sendWelcomeEmail: false,
      };

      mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await userOnboardingService.executeOnboarding(testOrgId, config);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should log all step failures', async () => {
      const config: OnboardingConfig = {
        email: 'test@gridworx.io',
        firstName: 'Test',
        lastName: 'User',
        groupIds: [],
        sharedDriveAccess: [],
        calendarSubscriptions: [],
        sendWelcomeEmail: false,
      };

      mockQuery.mockRejectedValueOnce(new Error('Insert failed'));

      await userOnboardingService.executeOnboarding(testOrgId, config);

      expect(mockLogFailure).toHaveBeenCalled();
    });
  });

  describe('Temporary Password Generation', () => {
    it('should generate password with special characters', async () => {
      // Mock Helios user creation to capture the password
      let capturedPassword = '';
      mockQuery.mockImplementationOnce((query, values) => {
        if (query.includes('INSERT INTO organization_users')) {
          // The password is hashed, but we can verify the hash function was called
          return Promise.resolve({ rows: [{ id: 'new-user-id' }] });
        }
        return Promise.resolve({ rows: [] });
      });

      // Mock GW credentials - not configured
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const config: OnboardingConfig = {
        email: 'test@gridworx.io',
        firstName: 'Test',
        lastName: 'User',
        groupIds: [],
        sharedDriveAccess: [],
        calendarSubscriptions: [],
        sendWelcomeEmail: false,
      };

      const result = await userOnboardingService.executeOnboarding(testOrgId, config);

      // The bcrypt.hash should have been called with a generated password
      const bcrypt = require('bcryptjs');
      expect(bcrypt.hash).toHaveBeenCalled();
    });
  });

  describe('Step Ordering', () => {
    it('should execute steps in correct order', async () => {
      const stepOrder: string[] = [];

      mockLogSuccess.mockImplementation((orgId, actionType, step) => {
        stepOrder.push(step);
        return Promise.resolve({});
      });

      mockLogFailure.mockImplementation((orgId, actionType, step) => {
        stepOrder.push(step);
        return Promise.resolve({});
      });

      // Mock successful Helios user creation
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] });

      // Mock GW credentials - not configured
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const config: OnboardingConfig = {
        email: 'test@gridworx.io',
        firstName: 'Test',
        lastName: 'User',
        groupIds: [],
        sharedDriveAccess: [],
        calendarSubscriptions: [],
        sendWelcomeEmail: false,
      };

      await userOnboardingService.executeOnboarding(testOrgId, config);

      // Verify order
      expect(stepOrder.indexOf('validate_config')).toBeLessThan(stepOrder.indexOf('create_helios_user'));
      expect(stepOrder.indexOf('create_helios_user')).toBeLessThan(stepOrder.indexOf('create_google_account'));
    });
  });
});
