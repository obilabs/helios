import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock the database connection
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
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocking
import { signatureTemplateService } from '../services/signature-template.service.js';
import { SignatureTemplateStatus, MERGE_FIELDS } from '../types/signatures.js';

describe('SignatureTemplateService', () => {
  const testOrganizationId = '11111111-1111-1111-1111-111111111111';
  const testTemplateId = '22222222-2222-2222-2222-222222222222';
  const testUserId = '33333333-3333-3333-3333-333333333333';

  const mockTemplateRow = {
    id: testTemplateId,
    organization_id: testOrganizationId,
    name: 'Corporate Standard',
    description: 'Standard corporate signature',
    html_content: '<p>{{full_name}}</p><p>{{job_title}} | {{department}}</p><p>{{email}}</p>',
    plain_text_content: '{{full_name}}\n{{job_title}} | {{department}}\n{{email}}',
    merge_fields: ['full_name', 'job_title', 'department', 'email'],
    is_default: false,
    is_campaign_template: false,
    status: 'active' as SignatureTemplateStatus,
    version: 1,
    created_by: testUserId,
    created_at: new Date('2025-01-01'),
    updated_at: new Date('2025-01-01'),
  };

  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==========================================
  // TEMPLATE CRUD OPERATIONS
  // ==========================================

  describe('getTemplates', () => {
    it('should return all templates for an organization', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTemplateRow] });

      const templates = await signatureTemplateService.getTemplates(testOrganizationId);

      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe('Corporate Standard');
      expect(templates[0].organizationId).toBe(testOrganizationId);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [testOrganizationId]
      );
    });

    it('should filter by status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTemplateRow] });

      await signatureTemplateService.getTemplates(testOrganizationId, { status: 'active' });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('status = $2'),
        [testOrganizationId, 'active']
      );
    });

    it('should filter by campaign template flag', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await signatureTemplateService.getTemplates(testOrganizationId, { isCampaignTemplate: true });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('is_campaign_template = $2'),
        [testOrganizationId, true]
      );
    });

    it('should include assignment counts when requested', async () => {
      const rowWithCounts = {
        ...mockTemplateRow,
        assignment_count: 3,
        affected_users: 25,
      };
      mockQuery.mockResolvedValueOnce({ rows: [rowWithCounts] });

      const templates = await signatureTemplateService.getTemplates(testOrganizationId, {
        includeAssignmentCounts: true,
      });

      expect(templates[0]).toHaveProperty('assignmentCount', 3);
      expect(templates[0]).toHaveProperty('affectedUsers', 25);
    });

    it('should return empty array when no templates exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const templates = await signatureTemplateService.getTemplates(testOrganizationId);

      expect(templates).toHaveLength(0);
    });
  });

  describe('getTemplate', () => {
    it('should return a single template by ID', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTemplateRow] });

      const template = await signatureTemplateService.getTemplate(testTemplateId);

      expect(template).not.toBeNull();
      expect(template?.id).toBe(testTemplateId);
      expect(template?.name).toBe('Corporate Standard');
    });

    it('should return null when template does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const template = await signatureTemplateService.getTemplate('nonexistent');

      expect(template).toBeNull();
    });
  });

  describe('getDefaultTemplate', () => {
    it('should return the default template for an organization', async () => {
      const defaultTemplate = { ...mockTemplateRow, is_default: true };
      mockQuery.mockResolvedValueOnce({ rows: [defaultTemplate] });

      const template = await signatureTemplateService.getDefaultTemplate(testOrganizationId);

      expect(template).not.toBeNull();
      expect(template?.isDefault).toBe(true);
    });

    it('should return null when no default template exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const template = await signatureTemplateService.getDefaultTemplate(testOrganizationId);

      expect(template).toBeNull();
    });
  });

  describe('createTemplate', () => {
    it('should create a new template', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTemplateRow] });

      const result = await signatureTemplateService.createTemplate(
        testOrganizationId,
        {
          name: 'Corporate Standard',
          htmlContent: '<p>{{full_name}}</p>',
        },
        testUserId
      );

      expect(result.name).toBe('Corporate Standard');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO signature_templates'),
        expect.arrayContaining([testOrganizationId, 'Corporate Standard'])
      );
    });

    it('should extract merge fields from HTML content', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTemplateRow] });

      await signatureTemplateService.createTemplate(
        testOrganizationId,
        {
          name: 'Test',
          htmlContent: '<p>{{first_name}} {{last_name}} - {{email}}</p>',
        }
      );

      // The merge fields should be extracted and stored
      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.stringContaining('first_name'),
        ])
      );
    });

    it('should generate plain text from HTML if not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [mockTemplateRow] });

      await signatureTemplateService.createTemplate(
        testOrganizationId,
        {
          name: 'Test',
          htmlContent: '<p>Hello World</p>',
        }
      );

      // Should have been called with generated plain text
      expect(mockQuery).toHaveBeenCalled();
    });
  });

  describe('updateTemplate', () => {
    it('should update an existing template', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] }) // getTemplate
        .mockResolvedValueOnce({ rows: [{ ...mockTemplateRow, name: 'Updated Name', version: 2 }] }); // update

      const result = await signatureTemplateService.updateTemplate(testTemplateId, {
        name: 'Updated Name',
      });

      expect(result?.name).toBe('Updated Name');
      expect(result?.version).toBe(2);
    });

    it('should return null when template does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await signatureTemplateService.updateTemplate('nonexistent', {
        name: 'New Name',
      });

      expect(result).toBeNull();
    });

    it('should increment version on update', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] })
        .mockResolvedValueOnce({ rows: [{ ...mockTemplateRow, version: 2 }] });

      await signatureTemplateService.updateTemplate(testTemplateId, {
        name: 'Updated',
      });

      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('version = version + 1'),
        expect.any(Array)
      );
    });

    it('should re-extract merge fields when content changes', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] })
        .mockResolvedValueOnce({ rows: [mockTemplateRow] });

      await signatureTemplateService.updateTemplate(testTemplateId, {
        htmlContent: '<p>{{new_field}}</p>',
      });

      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.stringContaining('merge_fields'),
        expect.any(Array)
      );
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template without active assignments', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] }) // check assignments
        .mockResolvedValueOnce({ rows: [{ id: testTemplateId }] }); // delete

      const result = await signatureTemplateService.deleteTemplate(testTemplateId);

      expect(result).toBe(true);
    });

    it('should throw error when template has active assignments', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '5' }] });

      await expect(
        signatureTemplateService.deleteTemplate(testTemplateId)
      ).rejects.toThrow('Cannot delete template with active assignments');
    });

    it('should return false when template does not exist', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await signatureTemplateService.deleteTemplate('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('cloneTemplate', () => {
    it('should clone a template with new name', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] }) // getTemplate (original)
        .mockResolvedValueOnce({ rows: [{ ...mockTemplateRow, id: 'new-id', name: 'Clone of Corporate' }] }); // create

      const result = await signatureTemplateService.cloneTemplate(
        testTemplateId,
        'Clone of Corporate',
        testUserId
      );

      expect(result?.name).toBe('Clone of Corporate');
    });

    it('should set cloned template as draft and not default', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...mockTemplateRow, is_default: true, status: 'active' }] })
        .mockResolvedValueOnce({ rows: [mockTemplateRow] });

      await signatureTemplateService.cloneTemplate(testTemplateId, 'Clone');

      // Create should be called with is_default: false and status: 'draft'
      expect(mockQuery).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.arrayContaining([false, 'draft'])
      );
    });

    it('should return null when original template does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await signatureTemplateService.cloneTemplate('nonexistent', 'Clone');

      expect(result).toBeNull();
    });
  });

  // ==========================================
  // MERGE FIELD OPERATIONS
  // ==========================================

  describe('extractMergeFields', () => {
    it('should extract merge fields from HTML content', () => {
      const html = '<p>{{full_name}}</p><p>{{job_title}} at {{company_name}}</p>';

      const fields = signatureTemplateService.extractMergeFields(html);

      expect(fields).toContain('full_name');
      expect(fields).toContain('job_title');
      expect(fields).toContain('company_name');
      expect(fields).toHaveLength(3);
    });

    it('should handle case-insensitive field names', () => {
      const html = '<p>{{Full_Name}} {{FULL_NAME}}</p>';

      const fields = signatureTemplateService.extractMergeFields(html);

      expect(fields).toContain('full_name');
      expect(fields).toHaveLength(1); // Deduplicated
    });

    it('should return empty array when no fields found', () => {
      const html = '<p>Hello World</p>';

      const fields = signatureTemplateService.extractMergeFields(html);

      expect(fields).toHaveLength(0);
    });

    it('should handle malformed merge fields gracefully', () => {
      const html = '<p>{{valid_field}} {incomplete} {{also_valid}}</p>';

      const fields = signatureTemplateService.extractMergeFields(html);

      expect(fields).toContain('valid_field');
      expect(fields).toContain('also_valid');
      expect(fields).not.toContain('incomplete');
    });
  });

  describe('validateMergeFields', () => {
    it('should return empty array for valid fields', () => {
      const validFields = ['full_name', 'email', 'job_title'];

      const invalid = signatureTemplateService.validateMergeFields(validFields);

      expect(invalid).toHaveLength(0);
    });

    it('should return invalid field names', () => {
      const fields = ['full_name', 'invalid_field', 'another_invalid'];

      const invalid = signatureTemplateService.validateMergeFields(fields);

      expect(invalid).toContain('invalid_field');
      expect(invalid).toContain('another_invalid');
      expect(invalid).not.toContain('full_name');
    });
  });

  describe('getAvailableMergeFields', () => {
    it('should return merge fields grouped by category', () => {
      const grouped = signatureTemplateService.getAvailableMergeFields();

      // Categories use capitalized names
      expect(grouped).toHaveProperty('Personal');
      expect(grouped).toHaveProperty('Professional');
      expect(grouped).toHaveProperty('Contact');
      expect(grouped).toHaveProperty('Organization');
      expect(grouped).toHaveProperty('Social');
    });

    it('should include all defined merge fields', () => {
      const grouped = signatureTemplateService.getAvailableMergeFields();
      const allFields = Object.values(grouped).flat();

      expect(allFields.length).toBe(MERGE_FIELDS.length);
    });
  });

  // ==========================================
  // TEMPLATE RENDERING
  // ==========================================

  describe('previewTemplate', () => {
    it('should render template with sample data when no user specified', async () => {
      const html = '<p>{{full_name}}</p><p>{{email}}</p>';

      const result = await signatureTemplateService.previewTemplate(html);

      expect(result.html).not.toContain('{{');
      expect(result.mergeFieldsUsed).toContain('full_name');
      expect(result.mergeFieldsUsed).toContain('email');
    });

    it('should render template with real user data when user ID provided', async () => {
      const mockUserData = {
        id: testUserId,
        organization_id: testOrganizationId,
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
        preferred_name: null,
        pronouns: null,
        job_title: 'Engineer',
        work_phone: null,
        mobile_phone: null,
        location: 'NYC',
        linkedin_url: null,
        twitter_url: null,
        department_id: null,
        department_name: 'Engineering',
        manager_name: 'Jane Boss',
      };

      const mockOrgData = {
        id: testOrganizationId,
        name: 'Test Corp',
        domain: 'test.com',
        website_url: 'https://test.com',
        address: '123 Main St',
        phone: '+1 555-0100',
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockUserData] })
        .mockResolvedValueOnce({ rows: [mockOrgData] });

      const html = '<p>{{full_name}}</p><p>{{email}}</p>';
      const result = await signatureTemplateService.previewTemplate(html, testUserId);

      expect(result.html).toContain('John Doe');
      expect(result.html).toContain('john@example.com');
    });

    it('should track missing fields in rendered output', async () => {
      const html = '<p>{{full_name}}</p><p>{{nonexistent_field}}</p>';

      const result = await signatureTemplateService.previewTemplate(html);

      expect(result.missingFields).toContain('nonexistent_field');
    });

    it('should throw error when user not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        signatureTemplateService.previewTemplate('<p>test</p>', 'nonexistent')
      ).rejects.toThrow('User not found');
    });
  });

  describe('renderTemplate', () => {
    it('should render a template for a specific user', async () => {
      const mockUserData = {
        id: testUserId,
        organization_id: testOrganizationId,
        email: 'jane@example.com',
        first_name: 'Jane',
        last_name: 'Smith',
        preferred_name: null,
        pronouns: 'she/her',
        job_title: 'Manager',
        work_phone: '+1 555-0101',
        mobile_phone: null,
        location: 'SF',
        linkedin_url: 'https://linkedin.com/in/jane',
        twitter_url: null,
        department_id: 'dept-1',
        department_name: 'Sales',
        manager_name: null,
      };

      const mockOrgData = {
        id: testOrganizationId,
        name: 'Acme Inc',
        domain: 'acme.com',
        website_url: 'https://acme.com',
        address: null,
        phone: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] }) // getTemplate
        .mockResolvedValueOnce({ rows: [mockUserData] }) // getUserData
        .mockResolvedValueOnce({ rows: [mockOrgData] }); // getOrganizationData

      const result = await signatureTemplateService.renderTemplate(testTemplateId, testUserId);

      expect(result.html).toContain('Jane Smith');
      expect(result.html).toContain('Manager');
      expect(result.html).toContain('Sales');
    });

    it('should throw error when template not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        signatureTemplateService.renderTemplate('nonexistent', testUserId)
      ).rejects.toThrow('Template not found');
    });

    it('should throw error when user not found', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        signatureTemplateService.renderTemplate(testTemplateId, 'nonexistent')
      ).rejects.toThrow('User not found');
    });
  });

  describe('renderTemplateWithBanner', () => {
    it('should append banner to signature when provided', async () => {
      const mockUserData = {
        id: testUserId,
        organization_id: testOrganizationId,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        preferred_name: null,
        pronouns: null,
        job_title: 'Dev',
        work_phone: null,
        mobile_phone: null,
        location: null,
        linkedin_url: null,
        twitter_url: null,
        department_id: null,
        department_name: 'Tech',
        manager_name: null,
      };

      const mockOrgData = {
        id: testOrganizationId,
        name: 'Test',
        domain: null,
        website_url: null,
        address: null,
        phone: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] })
        .mockResolvedValueOnce({ rows: [mockUserData] })
        .mockResolvedValueOnce({ rows: [mockOrgData] });

      const result = await signatureTemplateService.renderTemplateWithBanner(
        testTemplateId,
        testUserId,
        {
          url: 'https://example.com/banner.png',
          link: 'https://example.com/promo',
          altText: 'Promotion Banner',
        }
      );

      expect(result.html).toContain('banner.png');
      expect(result.html).toContain('href="https://example.com/promo"');
      expect(result.html).toContain('alt="Promotion Banner"');
    });

    it('should not add banner when not provided', async () => {
      const mockUserData = {
        id: testUserId,
        organization_id: testOrganizationId,
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'User',
        preferred_name: null,
        pronouns: null,
        job_title: 'Dev',
        work_phone: null,
        mobile_phone: null,
        location: null,
        linkedin_url: null,
        twitter_url: null,
        department_id: null,
        department_name: null,
        manager_name: null,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockTemplateRow] })
        .mockResolvedValueOnce({ rows: [mockUserData] })
        .mockResolvedValueOnce({ rows: [{ id: testOrganizationId, name: 'Test', domain: null, website_url: null, address: null, phone: null }] });

      const result = await signatureTemplateService.renderTemplateWithBanner(
        testTemplateId,
        testUserId
      );

      expect(result.html).not.toContain('Campaign Banner');
    });
  });
});
