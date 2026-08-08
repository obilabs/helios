/**
 * Signature Template Service
 *
 * Handles CRUD operations for email signature templates,
 * merge field parsing, and template rendering.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import {
  SignatureTemplate,
  CreateSignatureTemplateDTO,
  UpdateSignatureTemplateDTO,
  SignatureTemplateStatus,
  TemplateWithAssignmentCount,
  RenderedSignature,
  MERGE_FIELDS,
  getMergeField,
} from '../types/signatures.js';
import { userTrackingService } from './user-tracking.service.js';

// Tracking settings interface
interface TrackingSettings {
  userTrackingEnabled: boolean;
  campaignTrackingEnabled: boolean;
}

// Database row type
interface TemplateRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  html_content: string;
  plain_text_content: string | null;
  merge_fields: string[];
  is_default: boolean;
  is_campaign_template: boolean;
  status: SignatureTemplateStatus;
  version: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface UserDataRow {
  id: string;
  organization_id: string;
  email: string;
  first_name: string;
  last_name: string;
  preferred_name: string | null;
  pronouns: string | null;
  job_title: string | null;
  work_phone: string | null;
  mobile_phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  department_id: string | null;
  department_name?: string | null;
  manager_name?: string | null;
}

interface OrganizationRow {
  id: string;
  name: string;
  domain: string | null;
  website_url: string | null;
  address: string | null;
  phone: string | null;
}

class SignatureTemplateService {
  // ==========================================
  // TEMPLATE CRUD OPERATIONS
  // ==========================================

  /**
   * Get all templates for an organization
   */
  async getTemplates(
    organizationId: string,
    options: {
      status?: SignatureTemplateStatus;
      isCampaignTemplate?: boolean;
      includeAssignmentCounts?: boolean;
    } = {}
  ): Promise<SignatureTemplate[] | TemplateWithAssignmentCount[]> {
    let query: string;
    const values: (string | boolean)[] = [organizationId];
    let paramIndex = 2;

    if (options.includeAssignmentCounts) {
      query = `
        SELECT
          st.*,
          COALESCE(ac.assignment_count, 0)::integer AS assignment_count,
          COALESCE(uc.affected_users, 0)::integer AS affected_users
        FROM signature_templates st
        LEFT JOIN (
          SELECT template_id, COUNT(*) AS assignment_count
          FROM signature_assignments
          WHERE is_active = true
          GROUP BY template_id
        ) ac ON ac.template_id = st.id
        LEFT JOIN (
          SELECT ues.template_id, COUNT(*) AS affected_users
          FROM user_effective_signatures ues
          GROUP BY ues.template_id
        ) uc ON uc.template_id = st.id
        WHERE st.organization_id = $1
      `;
    } else {
      query = `
        SELECT * FROM signature_templates
        WHERE organization_id = $1
      `;
    }

    if (options.status) {
      query += ` AND status = $${paramIndex}`;
      values.push(options.status);
      paramIndex++;
    }

    if (options.isCampaignTemplate !== undefined) {
      query += ` AND is_campaign_template = $${paramIndex}`;
      values.push(options.isCampaignTemplate);
      paramIndex++;
    }

    query += ` ORDER BY is_default DESC, name ASC`;

    const result = await db.query(query, values);

    if (options.includeAssignmentCounts) {
      return result.rows.map((row: TemplateRow & { assignment_count: number; affected_users: number }) =>
        this.mapRowToTemplateWithCounts(row)
      );
    }

    return result.rows.map((row: TemplateRow) => this.mapRowToTemplate(row));
  }

  /**
   * Get a single template by ID
   */
  async getTemplate(id: string): Promise<SignatureTemplate | null> {
    const result = await db.query(
      'SELECT * FROM signature_templates WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Get the default template for an organization
   */
  async getDefaultTemplate(organizationId: string): Promise<SignatureTemplate | null> {
    const result = await db.query(
      `SELECT * FROM signature_templates
       WHERE organization_id = $1 AND is_default = true AND status = 'active'`,
      [organizationId]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Create a new template
   */
  async createTemplate(
    organizationId: string,
    data: CreateSignatureTemplateDTO,
    createdBy?: string
  ): Promise<SignatureTemplate> {
    // Extract merge fields from content
    const mergeFields = data.mergeFields || this.extractMergeFields(data.htmlContent);

    // Generate plain text if not provided
    const plainTextContent = data.plainTextContent || this.htmlToPlainText(data.htmlContent);

    const result = await db.query(
      `INSERT INTO signature_templates (
        organization_id,
        name,
        description,
        html_content,
        plain_text_content,
        merge_fields,
        is_default,
        is_campaign_template,
        status,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        organizationId,
        data.name,
        data.description || null,
        data.htmlContent,
        plainTextContent,
        JSON.stringify(mergeFields),
        data.isDefault || false,
        data.isCampaignTemplate || false,
        data.status || 'draft',
        createdBy || null,
      ]
    );

    logger.info('Created signature template', {
      templateId: result.rows[0].id,
      name: data.name,
      organizationId,
    });

    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Update an existing template
   */
  async updateTemplate(
    id: string,
    data: UpdateSignatureTemplateDTO
  ): Promise<SignatureTemplate | null> {
    // Get existing template
    const existing = await this.getTemplate(id);
    if (!existing) return null;

    // Build update query dynamically
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(data.description);
    }
    if (data.htmlContent !== undefined) {
      updates.push(`html_content = $${paramIndex++}`);
      values.push(data.htmlContent);

      // Re-extract merge fields if content changed
      const mergeFields = data.mergeFields || this.extractMergeFields(data.htmlContent);
      updates.push(`merge_fields = $${paramIndex++}`);
      values.push(JSON.stringify(mergeFields));

      // Update plain text if not explicitly provided
      if (data.plainTextContent === undefined) {
        updates.push(`plain_text_content = $${paramIndex++}`);
        values.push(this.htmlToPlainText(data.htmlContent));
      }
    }
    if (data.plainTextContent !== undefined) {
      updates.push(`plain_text_content = $${paramIndex++}`);
      values.push(data.plainTextContent);
    }
    if (data.mergeFields !== undefined && data.htmlContent === undefined) {
      updates.push(`merge_fields = $${paramIndex++}`);
      values.push(JSON.stringify(data.mergeFields));
    }
    if (data.isDefault !== undefined) {
      updates.push(`is_default = $${paramIndex++}`);
      values.push(data.isDefault);
    }
    if (data.isCampaignTemplate !== undefined) {
      updates.push(`is_campaign_template = $${paramIndex++}`);
      values.push(data.isCampaignTemplate);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    // Increment version
    updates.push(`version = version + 1`);

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);
    const result = await db.query(
      `UPDATE signature_templates SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return null;

    logger.info('Updated signature template', {
      templateId: id,
      updates: Object.keys(data),
    });

    return this.mapRowToTemplate(result.rows[0]);
  }

  /**
   * Delete a template
   */
  async deleteTemplate(id: string): Promise<boolean> {
    // Check for active assignments
    const assignments = await db.query(
      'SELECT COUNT(*) FROM signature_assignments WHERE template_id = $1 AND is_active = true',
      [id]
    );

    if (parseInt(assignments.rows[0].count) > 0) {
      throw new Error('Cannot delete template with active assignments. Remove assignments first or archive the template.');
    }

    const result = await db.query(
      'DELETE FROM signature_templates WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length > 0) {
      logger.info('Deleted signature template', { templateId: id });
      return true;
    }

    return false;
  }

  /**
   * Clone a template
   */
  async cloneTemplate(id: string, newName: string, createdBy?: string): Promise<SignatureTemplate | null> {
    const original = await this.getTemplate(id);
    if (!original) return null;

    return this.createTemplate(
      original.organizationId,
      {
        name: newName,
        description: original.description || undefined,
        htmlContent: original.htmlContent,
        plainTextContent: original.plainTextContent || undefined,
        mergeFields: original.mergeFields,
        isDefault: false,  // Never clone as default
        isCampaignTemplate: original.isCampaignTemplate,
        status: 'draft',  // Always start clones as draft
      },
      createdBy
    );
  }

  // ==========================================
  // MERGE FIELD OPERATIONS
  // ==========================================

  /**
   * Extract merge fields from HTML content
   * Looks for patterns like {{field_name}}
   */
  extractMergeFields(htmlContent: string): string[] {
    const pattern = /\{\{([a-z_]+)\}\}/gi;
    const matches = htmlContent.matchAll(pattern);
    const fields = new Set<string>();

    for (const match of matches) {
      fields.add(match[1].toLowerCase());
    }

    return Array.from(fields);
  }

  /**
   * Validate merge fields in a template
   * Returns list of invalid/unknown field names
   */
  validateMergeFields(mergeFields: string[]): string[] {
    const validKeys = MERGE_FIELDS.map(f => f.key);
    return mergeFields.filter(field => !validKeys.includes(field));
  }

  /**
   * Get available merge fields grouped by category
   */
  getAvailableMergeFields(): Record<string, typeof MERGE_FIELDS> {
    const grouped: Record<string, typeof MERGE_FIELDS> = {};

    for (const field of MERGE_FIELDS) {
      if (!grouped[field.category]) {
        grouped[field.category] = [];
      }
      grouped[field.category].push(field);
    }

    return grouped;
  }

  // ==========================================
  // TEMPLATE RENDERING
  // ==========================================

  /**
   * Render a template with user data
   */
  async renderTemplate(
    templateId: string,
    userId: string
  ): Promise<RenderedSignature> {
    // Get template
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Get user data with department and manager
    const userData = await this.getUserData(userId);
    if (!userData) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get organization data
    const orgData = await this.getOrganizationData(userData.organization_id);

    // Build merge data
    const mergeData = this.buildMergeData(userData, orgData);

    // Render HTML
    const { rendered: html, missingFields } = this.renderContent(template.htmlContent, mergeData);

    // Render plain text
    const { rendered: plainText } = this.renderContent(
      template.plainTextContent || this.htmlToPlainText(template.htmlContent),
      mergeData
    );

    return {
      html,
      plainText,
      mergeFieldsUsed: template.mergeFields,
      missingFields,
    };
  }

  /**
   * Render a template with user data and optional campaign banner overlay
   */
  async renderTemplateWithBanner(
    templateId: string,
    userId: string,
    banner?: {
      url?: string | null;
      link?: string | null;
      altText?: string | null;
    }
  ): Promise<RenderedSignature> {
    // Get base signature
    const signature = await this.renderTemplate(templateId, userId);

    // Add campaign banner if provided
    if (banner?.url) {
      const bannerHtml = this.generateBannerHtml(banner.url, banner.link, banner.altText);
      // Append banner below signature (standard position)
      signature.html = signature.html + bannerHtml;
    }

    return signature;
  }

  /**
   * Generate HTML for campaign banner
   */
  private generateBannerHtml(
    imageUrl: string,
    linkUrl?: string | null,
    altText?: string | null
  ): string {
    const alt = altText || 'Campaign Banner';
    const imgTag = `<img src="${imageUrl}" alt="${alt}" style="max-width: 100%; height: auto; display: block; margin-top: 16px;" />`;

    if (linkUrl) {
      return `<a href="${linkUrl}" target="_blank" rel="noopener noreferrer">${imgTag}</a>`;
    }

    return imgTag;
  }

  /**
   * Preview a template with sample or selected user data
   */
  async previewTemplate(
    htmlContent: string,
    userId?: string
  ): Promise<RenderedSignature> {
    let mergeData: Record<string, string>;

    if (userId) {
      // Use real user data
      const userData = await this.getUserData(userId);
      if (!userData) {
        throw new Error(`User not found: ${userId}`);
      }
      const orgData = await this.getOrganizationData(userData.organization_id);
      mergeData = this.buildMergeData(userData, orgData);
    } else {
      // Use sample data
      mergeData = this.getSampleMergeData();
    }

    const mergeFields = this.extractMergeFields(htmlContent);
    const { rendered: html, missingFields } = this.renderContent(htmlContent, mergeData);
    const { rendered: plainText } = this.renderContent(this.htmlToPlainText(htmlContent), mergeData);

    return {
      html,
      plainText,
      mergeFieldsUsed: mergeFields,
      missingFields,
    };
  }

  // ==========================================
  // USER TRACKING INTEGRATION
  // ==========================================

  /**
   * Get tracking settings for an organization
   */
  private async getTrackingSettings(organizationId: string): Promise<TrackingSettings> {
    const result = await db.query(
      `SELECT key, value FROM organization_settings
       WHERE organization_id = $1
       AND key IN ('tracking_user_enabled', 'tracking_campaign_enabled')`,
      [organizationId]
    );

    const settings: TrackingSettings = {
      userTrackingEnabled: true,  // Default enabled
      campaignTrackingEnabled: true,
    };

    result.rows.forEach((row: { key: string; value: string }) => {
      if (row.key === 'tracking_user_enabled') {
        settings.userTrackingEnabled = row.value === 'true';
      } else if (row.key === 'tracking_campaign_enabled') {
        settings.campaignTrackingEnabled = row.value === 'true';
      }
    });

    return settings;
  }

  /**
   * Generate HTML for user tracking pixel
   * Returns empty string if tracking is disabled or token not found
   */
  private async generateUserTrackingPixel(userId: string, organizationId: string): Promise<string> {
    try {
      // Check if user tracking is enabled
      const settings = await this.getTrackingSettings(organizationId);
      if (!settings.userTrackingEnabled) {
        return '';
      }

      // Get user's tracking token
      const token = await userTrackingService.getTokenForUser(userId);
      if (!token || !token.isActive) {
        return '';
      }

      // Build pixel URL
      const baseUrl = process.env['PUBLIC_URL'] || process.env['BACKEND_URL'] || 'http://localhost:3001';
      const pixelUrl = `${baseUrl}/api/t/u/${token.pixelToken}.gif`;

      // Return hidden 1x1 tracking pixel
      return `<!-- User engagement tracking -->
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />`;
    } catch (error: any) {
      logger.warn('Failed to generate user tracking pixel', {
        userId,
        organizationId,
        error: error.message,
      });
      return '';
    }
  }

  /**
   * Render a template with user data and user tracking pixel
   * This is the main method to use for deploying signatures to users
   */
  async renderTemplateWithTracking(
    templateId: string,
    userId: string,
    options?: {
      includeCampaignBanner?: {
        url?: string | null;
        link?: string | null;
        altText?: string | null;
      };
      skipUserTracking?: boolean;
    }
  ): Promise<RenderedSignature & { hasUserTracking: boolean }> {
    // Get template
    const template = await this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Get user data with department and manager
    const userData = await this.getUserData(userId);
    if (!userData) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get organization data
    const orgData = await this.getOrganizationData(userData.organization_id);

    // Build merge data
    const mergeData = this.buildMergeData(userData, orgData);

    // Render HTML
    let { rendered: html, missingFields } = this.renderContent(template.htmlContent, mergeData);

    // Render plain text
    const { rendered: plainText } = this.renderContent(
      template.plainTextContent || this.htmlToPlainText(template.htmlContent),
      mergeData
    );

    // Add campaign banner if provided
    if (options?.includeCampaignBanner?.url) {
      const bannerHtml = this.generateBannerHtml(
        options.includeCampaignBanner.url,
        options.includeCampaignBanner.link,
        options.includeCampaignBanner.altText
      );
      html = html + bannerHtml;
    }

    // Add user tracking pixel if not skipped
    let hasUserTracking = false;
    if (!options?.skipUserTracking) {
      const trackingPixel = await this.generateUserTrackingPixel(userId, userData.organization_id);
      if (trackingPixel) {
        html = html + '\n' + trackingPixel;
        hasUserTracking = true;
      }
    }

    return {
      html,
      plainText,
      mergeFieldsUsed: template.mergeFields,
      missingFields,
      hasUserTracking,
    };
  }

  /**
   * Check if user tracking is enabled for a user's organization
   */
  async isUserTrackingEnabled(userId: string): Promise<boolean> {
    const userData = await this.getUserData(userId);
    if (!userData) {
      return false;
    }

    const settings = await this.getTrackingSettings(userData.organization_id);
    return settings.userTrackingEnabled;
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private mapRowToTemplate(row: TemplateRow): SignatureTemplate {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description,
      htmlContent: row.html_content,
      plainTextContent: row.plain_text_content,
      mergeFields: row.merge_fields || [],
      isDefault: row.is_default,
      isCampaignTemplate: row.is_campaign_template,
      status: row.status,
      version: row.version,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToTemplateWithCounts(
    row: TemplateRow & { assignment_count: number; affected_users: number }
  ): TemplateWithAssignmentCount {
    return {
      ...this.mapRowToTemplate(row),
      assignmentCount: row.assignment_count,
      affectedUsers: row.affected_users,
    };
  }

  private async getUserData(userId: string): Promise<UserDataRow | null> {
    const result = await db.query(
      `SELECT
        ou.*,
        d.name AS department_name,
        CONCAT(m.first_name, ' ', m.last_name) AS manager_name
      FROM organization_users ou
      LEFT JOIN departments d ON d.id = ou.department_id
      LEFT JOIN organization_users m ON m.id = ou.reporting_manager_id
      WHERE ou.id = $1`,
      [userId]
    );

    return result.rows[0] || null;
  }

  private async getOrganizationData(organizationId: string): Promise<OrganizationRow | null> {
    const result = await db.query(
      'SELECT * FROM organizations WHERE id = $1',
      [organizationId]
    );

    return result.rows[0] || null;
  }

  private buildMergeData(
    user: UserDataRow,
    org: OrganizationRow | null
  ): Record<string, string> {
    return {
      // Personal
      full_name: `${user.first_name} ${user.last_name}`.trim(),
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      preferred_name: user.preferred_name || user.first_name || '',
      pronouns: user.pronouns || '',

      // Professional
      job_title: user.job_title || '',
      department: user.department_name || '',
      manager_name: user.manager_name || '',

      // Contact
      email: user.email || '',
      work_phone: user.work_phone || '',
      mobile_phone: user.mobile_phone || '',
      location: user.location || '',

      // Organization
      company_name: org?.name || '',
      company_website: org?.website_url || '',
      company_address: org?.address || '',
      company_phone: org?.phone || '',

      // Social
      linkedin_url: user.linkedin_url || '',
      twitter_url: user.twitter_url || '',
    };
  }

  private getSampleMergeData(): Record<string, string> {
    const data: Record<string, string> = {};
    for (const field of MERGE_FIELDS) {
      data[field.key] = field.example;
    }
    return data;
  }

  private renderContent(
    content: string,
    mergeData: Record<string, string>
  ): { rendered: string; missingFields: string[] } {
    const missingFields: string[] = [];

    const rendered = content.replace(/\{\{([a-z_]+)\}\}/gi, (match, fieldKey) => {
      const key = fieldKey.toLowerCase();
      const value = mergeData[key];

      if (value === undefined || value === '') {
        missingFields.push(key);
        return '';  // Remove empty merge fields
      }

      return value;
    });

    return { rendered, missingFields };
  }

  private htmlToPlainText(html: string): string {
    return html
      // Remove HTML tags
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

export const signatureTemplateService = new SignatureTemplateService();
export default signatureTemplateService;
