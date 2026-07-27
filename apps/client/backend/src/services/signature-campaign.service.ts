/**
 * Signature Campaign Service
 *
 * Handles CRUD operations for signature campaigns,
 * campaign scheduling, audience resolution, and tracking.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

// ==========================================
// TYPES
// ==========================================

export type CampaignStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'completed' | 'cancelled';

export interface SignatureCampaign {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  templateId: string;
  bannerUrl?: string;
  bannerLink?: string;
  bannerAltText?: string;
  startDate: Date;
  endDate: Date;
  timezone: string;
  trackingEnabled: boolean;
  trackingOptions: {
    opens: boolean;
    unique: boolean;
    geo: boolean;
  };
  status: CampaignStatus;
  autoRevert: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
  launchedAt?: Date;
  completedAt?: Date;
}

export interface CampaignWithDetails extends SignatureCampaign {
  templateName: string;
  templateStatus: string;
  createdByName?: string;
  createdByEmail?: string;
  assignmentCount: number;
  enrolledUserCount: number;
}

export interface CreateCampaignDTO {
  name: string;
  description?: string;
  templateId: string;
  bannerUrl?: string;
  bannerLink?: string;
  bannerAltText?: string;
  startDate: Date | string;
  endDate: Date | string;
  timezone?: string;
  trackingEnabled?: boolean;
  trackingOptions?: {
    opens?: boolean;
    unique?: boolean;
    geo?: boolean;
  };
  autoRevert?: boolean;
}

export interface UpdateCampaignDTO {
  name?: string;
  description?: string;
  templateId?: string;
  bannerUrl?: string;
  bannerLink?: string;
  bannerAltText?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  timezone?: string;
  trackingEnabled?: boolean;
  trackingOptions?: {
    opens?: boolean;
    unique?: boolean;
    geo?: boolean;
  };
  status?: CampaignStatus;
  autoRevert?: boolean;
}

export interface CampaignAssignment {
  id: string;
  campaignId: string;
  assignmentType: 'user' | 'group' | 'dynamic_group' | 'department' | 'ou' | 'organization';
  targetId?: string;
  targetValue?: string;
  createdAt: Date;
}

export interface CampaignStats {
  totalOpens: number;
  uniqueOpens: number;
  uniqueRecipients: number;
  topPerformerUserId?: string;
  topPerformerOpens?: number;
}

interface CampaignRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  template_id: string;
  banner_url: string | null;
  banner_link: string | null;
  banner_alt_text: string | null;
  start_date: Date;
  end_date: Date;
  timezone: string;
  tracking_enabled: boolean;
  tracking_options: Record<string, boolean>;
  status: CampaignStatus;
  auto_revert: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  launched_at: Date | null;
  completed_at: Date | null;
}

interface CampaignRowWithDetails extends CampaignRow {
  template_name: string;
  template_status: string;
  created_by_name: string | null;
  created_by_email: string | null;
  assignment_count: number;
  enrolled_user_count: number;
}

// ==========================================
// SERVICE CLASS
// ==========================================

class SignatureCampaignService {
  // ==========================================
  // CAMPAIGN CRUD OPERATIONS
  // ==========================================

  /**
   * Get all campaigns for an organization
   */
  async getCampaigns(
    organizationId: string,
    options: {
      status?: CampaignStatus | CampaignStatus[];
      templateId?: string;
      includeDetails?: boolean;
    } = {}
  ): Promise<SignatureCampaign[] | CampaignWithDetails[]> {
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    let query: string;

    if (options.includeDetails) {
      query = `
        SELECT
          sc.*,
          st.name AS template_name,
          st.status AS template_status,
          u.first_name || ' ' || u.last_name AS created_by_name,
          u.email AS created_by_email,
          (SELECT COUNT(*) FROM campaign_assignments ca WHERE ca.campaign_id = sc.id)::integer AS assignment_count,
          (SELECT COUNT(*) FROM signature_tracking_pixels stp WHERE stp.campaign_id = sc.id)::integer AS enrolled_user_count
        FROM signature_campaigns sc
        JOIN signature_templates st ON st.id = sc.template_id
        LEFT JOIN organization_users u ON u.id = sc.created_by
        WHERE sc.organization_id = $1
      `;
    } else {
      query = `
        SELECT sc.*
        FROM signature_campaigns sc
        WHERE sc.organization_id = $1
      `;
    }

    // Filter by status
    if (options.status) {
      if (Array.isArray(options.status)) {
        query += ` AND sc.status = ANY($${paramIndex}::text[])`;
        values.push(options.status);
      } else {
        query += ` AND sc.status = $${paramIndex}`;
        values.push(options.status);
      }
      paramIndex++;
    }

    // Filter by template
    if (options.templateId) {
      query += ` AND sc.template_id = $${paramIndex}`;
      values.push(options.templateId);
      paramIndex++;
    }

    query += ` ORDER BY sc.start_date DESC, sc.created_at DESC`;

    const result = await db.query(query, values);

    if (options.includeDetails) {
      return result.rows.map((row: CampaignRowWithDetails) =>
        this.mapRowToCampaignWithDetails(row)
      );
    }

    return result.rows.map((row: CampaignRow) => this.mapRowToCampaign(row));
  }

  /**
   * Get a single campaign by ID
   */
  async getCampaign(
    id: string,
    includeDetails: boolean = false
  ): Promise<SignatureCampaign | CampaignWithDetails | null> {
    let query: string;

    if (includeDetails) {
      query = `
        SELECT
          sc.*,
          st.name AS template_name,
          st.status AS template_status,
          u.first_name || ' ' || u.last_name AS created_by_name,
          u.email AS created_by_email,
          (SELECT COUNT(*) FROM campaign_assignments ca WHERE ca.campaign_id = sc.id)::integer AS assignment_count,
          (SELECT COUNT(*) FROM signature_tracking_pixels stp WHERE stp.campaign_id = sc.id)::integer AS enrolled_user_count
        FROM signature_campaigns sc
        JOIN signature_templates st ON st.id = sc.template_id
        LEFT JOIN organization_users u ON u.id = sc.created_by
        WHERE sc.id = $1
      `;
    } else {
      query = 'SELECT * FROM signature_campaigns WHERE id = $1';
    }

    const result = await db.query(query, [id]);

    if (result.rows.length === 0) return null;

    if (includeDetails) {
      return this.mapRowToCampaignWithDetails(result.rows[0]);
    }

    return this.mapRowToCampaign(result.rows[0]);
  }

  /**
   * Create a new campaign
   */
  async createCampaign(
    organizationId: string,
    data: CreateCampaignDTO,
    createdBy?: string
  ): Promise<SignatureCampaign> {
    // Validate dates
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (endDate <= startDate) {
      throw new Error('End date must be after start date');
    }

    // Validate template exists
    const templateCheck = await db.query(
      'SELECT id FROM signature_templates WHERE id = $1 AND organization_id = $2',
      [data.templateId, organizationId]
    );

    if (templateCheck.rows.length === 0) {
      throw new Error('Template not found');
    }

    // Determine initial status based on start date
    const now = new Date();
    let status: CampaignStatus = 'draft';
    if (startDate <= now && endDate > now) {
      status = 'scheduled'; // Will be activated by scheduler
    } else if (startDate > now) {
      status = 'scheduled';
    }

    const trackingOptions = {
      opens: data.trackingOptions?.opens ?? true,
      unique: data.trackingOptions?.unique ?? true,
      geo: data.trackingOptions?.geo ?? true,
    };

    const result = await db.query(
      `INSERT INTO signature_campaigns (
        organization_id,
        name,
        description,
        template_id,
        banner_url,
        banner_link,
        banner_alt_text,
        start_date,
        end_date,
        timezone,
        tracking_enabled,
        tracking_options,
        status,
        auto_revert,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        organizationId,
        data.name,
        data.description || null,
        data.templateId,
        data.bannerUrl || null,
        data.bannerLink || null,
        data.bannerAltText || null,
        startDate,
        endDate,
        data.timezone || 'UTC',
        data.trackingEnabled ?? true,
        JSON.stringify(trackingOptions),
        status,
        data.autoRevert ?? true,
        createdBy || null,
      ]
    );

    const campaign = this.mapRowToCampaign(result.rows[0]);

    logger.info('Created signature campaign', {
      campaignId: campaign.id,
      name: campaign.name,
      templateId: data.templateId,
      organizationId,
    });

    return campaign;
  }

  /**
   * Update an existing campaign
   */
  async updateCampaign(
    id: string,
    data: UpdateCampaignDTO
  ): Promise<SignatureCampaign | null> {
    const existing = await this.getCampaign(id);
    if (!existing) return null;

    // Validate dates if provided
    if (data.startDate || data.endDate) {
      const startDate = new Date(data.startDate || existing.startDate);
      const endDate = new Date(data.endDate || existing.endDate);

      if (endDate <= startDate) {
        throw new Error('End date must be after start date');
      }
    }

    // Validate template if provided
    if (data.templateId) {
      const templateCheck = await db.query(
        'SELECT id FROM signature_templates WHERE id = $1 AND organization_id = $2',
        [data.templateId, existing.organizationId]
      );

      if (templateCheck.rows.length === 0) {
        throw new Error('Template not found');
      }
    }

    // Build dynamic update query
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
    if (data.templateId !== undefined) {
      updates.push(`template_id = $${paramIndex++}`);
      values.push(data.templateId);
    }
    if (data.bannerUrl !== undefined) {
      updates.push(`banner_url = $${paramIndex++}`);
      values.push(data.bannerUrl);
    }
    if (data.bannerLink !== undefined) {
      updates.push(`banner_link = $${paramIndex++}`);
      values.push(data.bannerLink);
    }
    if (data.bannerAltText !== undefined) {
      updates.push(`banner_alt_text = $${paramIndex++}`);
      values.push(data.bannerAltText);
    }
    if (data.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(new Date(data.startDate));
    }
    if (data.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(new Date(data.endDate));
    }
    if (data.timezone !== undefined) {
      updates.push(`timezone = $${paramIndex++}`);
      values.push(data.timezone);
    }
    if (data.trackingEnabled !== undefined) {
      updates.push(`tracking_enabled = $${paramIndex++}`);
      values.push(data.trackingEnabled);
    }
    if (data.trackingOptions !== undefined) {
      updates.push(`tracking_options = $${paramIndex++}`);
      values.push(JSON.stringify({
        opens: data.trackingOptions.opens ?? existing.trackingOptions.opens,
        unique: data.trackingOptions.unique ?? existing.trackingOptions.unique,
        geo: data.trackingOptions.geo ?? existing.trackingOptions.geo,
      }));
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.autoRevert !== undefined) {
      updates.push(`auto_revert = $${paramIndex++}`);
      values.push(data.autoRevert);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);
    const result = await db.query(
      `UPDATE signature_campaigns SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return null;

    const campaign = this.mapRowToCampaign(result.rows[0]);

    logger.info('Updated signature campaign', {
      campaignId: id,
      updates: Object.keys(data),
    });

    return campaign;
  }

  /**
   * Delete a campaign
   */
  async deleteCampaign(id: string): Promise<boolean> {
    const existing = await this.getCampaign(id);
    if (!existing) return false;

    // Can't delete active campaigns - must cancel first
    if (existing.status === 'active') {
      throw new Error('Cannot delete active campaign. Cancel it first.');
    }

    const result = await db.query(
      'DELETE FROM signature_campaigns WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length > 0) {
      logger.info('Deleted signature campaign', { campaignId: id });
      return true;
    }

    return false;
  }

  // ==========================================
  // CAMPAIGN LIFECYCLE OPERATIONS
  // ==========================================

  /**
   * Launch a campaign (transition from scheduled to active)
   */
  async launchCampaign(id: string): Promise<SignatureCampaign | null> {
    const campaign = await this.getCampaign(id);
    if (!campaign) return null;

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new Error(`Cannot launch campaign with status '${campaign.status}'`);
    }

    const result = await db.query(
      `UPDATE signature_campaigns
       SET status = 'active', launched_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) return null;

    logger.info('Launched signature campaign', { campaignId: id });

    return this.mapRowToCampaign(result.rows[0]);
  }

  /**
   * Pause an active campaign
   */
  async pauseCampaign(id: string): Promise<SignatureCampaign | null> {
    const campaign = await this.getCampaign(id);
    if (!campaign) return null;

    if (campaign.status !== 'active') {
      throw new Error('Can only pause active campaigns');
    }

    const result = await db.query(
      `UPDATE signature_campaigns SET status = 'paused' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) return null;

    logger.info('Paused signature campaign', { campaignId: id });

    return this.mapRowToCampaign(result.rows[0]);
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(id: string): Promise<SignatureCampaign | null> {
    const campaign = await this.getCampaign(id);
    if (!campaign) return null;

    if (campaign.status !== 'paused') {
      throw new Error('Can only resume paused campaigns');
    }

    // Check if still within date range
    const now = new Date();
    if (campaign.endDate <= now) {
      throw new Error('Campaign has already ended. Cannot resume.');
    }

    const result = await db.query(
      `UPDATE signature_campaigns SET status = 'active' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) return null;

    logger.info('Resumed signature campaign', { campaignId: id });

    return this.mapRowToCampaign(result.rows[0]);
  }

  /**
   * Cancel a campaign
   */
  async cancelCampaign(id: string): Promise<SignatureCampaign | null> {
    const campaign = await this.getCampaign(id);
    if (!campaign) return null;

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new Error(`Campaign already ${campaign.status}`);
    }

    const result = await db.query(
      `UPDATE signature_campaigns
       SET status = 'cancelled', completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) return null;

    logger.info('Cancelled signature campaign', { campaignId: id });

    return this.mapRowToCampaign(result.rows[0]);
  }

  /**
   * Complete a campaign (called when end date is reached)
   */
  async completeCampaign(id: string): Promise<SignatureCampaign | null> {
    const result = await db.query(
      `UPDATE signature_campaigns
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1 AND status = 'active'
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) return null;

    logger.info('Completed signature campaign', { campaignId: id });

    return this.mapRowToCampaign(result.rows[0]);
  }

  // ==========================================
  // CAMPAIGN ASSIGNMENTS
  // ==========================================

  /**
   * Get assignments for a campaign
   */
  async getCampaignAssignments(campaignId: string): Promise<CampaignAssignment[]> {
    const result = await db.query(
      'SELECT * FROM campaign_assignments WHERE campaign_id = $1',
      [campaignId]
    );

    return result.rows.map((row: {
      id: string;
      campaign_id: string;
      assignment_type: CampaignAssignment['assignmentType'];
      target_id: string | null;
      target_value: string | null;
      created_at: Date;
    }) => ({
      id: row.id,
      campaignId: row.campaign_id,
      assignmentType: row.assignment_type,
      targetId: row.target_id || undefined,
      targetValue: row.target_value || undefined,
      createdAt: row.created_at,
    }));
  }

  /**
   * Add assignment to a campaign
   */
  async addCampaignAssignment(
    campaignId: string,
    assignmentType: CampaignAssignment['assignmentType'],
    targetId?: string,
    targetValue?: string
  ): Promise<CampaignAssignment> {
    // Validate campaign exists and is not active/completed
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      throw new Error('Cannot add assignments to completed or cancelled campaigns');
    }

    const result = await db.query(
      `INSERT INTO campaign_assignments (campaign_id, assignment_type, target_id, target_value)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING *`,
      [campaignId, assignmentType, targetId || null, targetValue || null]
    );

    if (result.rows.length === 0) {
      throw new Error('Assignment already exists');
    }

    const row = result.rows[0];
    return {
      id: row.id,
      campaignId: row.campaign_id,
      assignmentType: row.assignment_type,
      targetId: row.target_id || undefined,
      targetValue: row.target_value || undefined,
      createdAt: row.created_at,
    };
  }

  /**
   * Remove assignment from a campaign
   */
  async removeCampaignAssignment(assignmentId: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM campaign_assignments WHERE id = $1 RETURNING id',
      [assignmentId]
    );

    return result.rows.length > 0;
  }

  /**
   * Get users affected by a campaign (based on assignments)
   */
  async getCampaignAffectedUsers(
    campaignId: string
  ): Promise<{ userId: string; email: string; firstName: string; lastName: string }[]> {
    const campaign = await this.getCampaign(campaignId) as SignatureCampaign;
    if (!campaign) return [];

    const assignments = await this.getCampaignAssignments(campaignId);
    if (assignments.length === 0) return [];

    const userIds = new Set<string>();
    const users: { userId: string; email: string; firstName: string; lastName: string }[] = [];

    for (const assignment of assignments) {
      const affectedUsers = await this.getAffectedUsersForAssignment(
        campaign.organizationId,
        assignment.assignmentType,
        assignment.targetId,
        assignment.targetValue
      );

      for (const user of affectedUsers) {
        if (!userIds.has(user.userId)) {
          userIds.add(user.userId);
          users.push(user);
        }
      }
    }

    return users;
  }

  private async getAffectedUsersForAssignment(
    organizationId: string,
    assignmentType: CampaignAssignment['assignmentType'],
    targetId?: string,
    targetValue?: string
  ): Promise<{ userId: string; email: string; firstName: string; lastName: string }[]> {
    let query: string;
    const values: unknown[] = [organizationId];

    switch (assignmentType) {
      case 'user':
        if (!targetId) return [];
        query = `
          SELECT id AS user_id, email, first_name, last_name
          FROM organization_users
          WHERE id = $2 AND organization_id = $1 AND is_active = true
        `;
        values.push(targetId);
        break;

      case 'group':
      case 'dynamic_group':
        if (!targetId) return [];
        query = `
          SELECT ou.id AS user_id, ou.email, ou.first_name, ou.last_name
          FROM organization_users ou
          JOIN access_group_members agm ON agm.user_id = ou.id AND agm.is_active = true
          WHERE agm.access_group_id = $2 AND ou.organization_id = $1 AND ou.is_active = true
        `;
        values.push(targetId);
        break;

      case 'department':
        if (!targetId) return [];
        query = `
          SELECT id AS user_id, email, first_name, last_name
          FROM organization_users
          WHERE department_id = $2 AND organization_id = $1 AND is_active = true
        `;
        values.push(targetId);
        break;

      case 'ou':
        if (!targetValue) return [];
        query = `
          SELECT ou.id AS user_id, ou.email, ou.first_name, ou.last_name
          FROM organization_users ou
          JOIN gw_synced_users gsu ON gsu.email = ou.email AND gsu.organization_id = ou.organization_id
          WHERE gsu.org_unit_path = $2 AND ou.organization_id = $1 AND ou.is_active = true
        `;
        values.push(targetValue);
        break;

      case 'organization':
        query = `
          SELECT id AS user_id, email, first_name, last_name
          FROM organization_users
          WHERE organization_id = $1 AND is_active = true
        `;
        break;

      default:
        return [];
    }

    const result = await db.query(query, values);
    return result.rows.map((row: {
      user_id: string;
      email: string;
      first_name: string;
      last_name: string;
    }) => ({
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
    }));
  }

  // ==========================================
  // CAMPAIGN ANALYTICS
  // ==========================================

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    const result = await db.query(
      'SELECT * FROM get_campaign_stats($1)',
      [campaignId]
    );

    const row = result.rows[0] || {};
    return {
      totalOpens: row.total_opens || 0,
      uniqueOpens: row.unique_opens || 0,
      uniqueRecipients: row.unique_recipients || 0,
      topPerformerUserId: row.top_performer_user_id,
      topPerformerOpens: row.top_performer_opens,
    };
  }

  /**
   * Get opens by day for a campaign
   */
  async getCampaignOpensByDay(
    campaignId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ day: Date; totalOpens: number; uniqueOpens: number }[]> {
    const result = await db.query(
      'SELECT * FROM get_campaign_opens_by_day($1, $2, $3)',
      [campaignId, startDate || null, endDate || null]
    );

    return result.rows.map((row: {
      day: Date;
      total_opens: number;
      unique_opens: number;
    }) => ({
      day: row.day,
      totalOpens: row.total_opens,
      uniqueOpens: row.unique_opens,
    }));
  }

  /**
   * Get geographic distribution for a campaign
   */
  async getCampaignGeoDistribution(
    campaignId: string
  ): Promise<{ countryCode: string; opens: number; percentage: number }[]> {
    const result = await db.query(
      'SELECT * FROM get_campaign_geo_distribution($1)',
      [campaignId]
    );

    return result.rows.map((row: {
      country_code: string;
      opens: number;
      percentage: number;
    }) => ({
      countryCode: row.country_code,
      opens: row.opens,
      percentage: row.percentage,
    }));
  }

  // ==========================================
  // SCHEDULER HELPERS
  // ==========================================

  /**
   * Get campaigns that should be activated (start date reached)
   */
  async getCampaignsToActivate(): Promise<SignatureCampaign[]> {
    const result = await db.query(
      `SELECT * FROM signature_campaigns
       WHERE status = 'scheduled'
         AND start_date <= NOW()
         AND end_date > NOW()`
    );

    return result.rows.map((row: CampaignRow) => this.mapRowToCampaign(row));
  }

  /**
   * Get campaigns that should be completed (end date reached)
   */
  async getCampaignsToComplete(): Promise<SignatureCampaign[]> {
    const result = await db.query(
      `SELECT * FROM signature_campaigns
       WHERE status = 'active'
         AND end_date <= NOW()`
    );

    return result.rows.map((row: CampaignRow) => this.mapRowToCampaign(row));
  }

  // ==========================================
  // ACTIVE CAMPAIGN RESOLUTION
  // ==========================================

  /**
   * Get the active campaign for a user (if any)
   */
  async getActiveCampaignForUser(
    userId: string,
    organizationId: string
  ): Promise<SignatureCampaign | null> {
    // Get active campaigns for the organization
    const campaigns = await this.getCampaigns(organizationId, { status: 'active' }) as SignatureCampaign[];

    for (const campaign of campaigns) {
      const assignments = await this.getCampaignAssignments(campaign.id);

      // Check if user matches any assignment
      for (const assignment of assignments) {
        const matches = await this.userMatchesAssignment(userId, organizationId, assignment);
        if (matches) {
          return campaign;
        }
      }
    }

    return null;
  }

  private async userMatchesAssignment(
    userId: string,
    _organizationId: string,
    assignment: CampaignAssignment
  ): Promise<boolean> {
    switch (assignment.assignmentType) {
      case 'user':
        return assignment.targetId === userId;

      case 'group':
      case 'dynamic_group':
        if (!assignment.targetId) return false;
        const groupResult = await db.query(
          `SELECT 1 FROM access_group_members
           WHERE access_group_id = $1 AND user_id = $2 AND is_active = true`,
          [assignment.targetId, userId]
        );
        return groupResult.rows.length > 0;

      case 'department':
        if (!assignment.targetId) return false;
        const deptResult = await db.query(
          `SELECT 1 FROM organization_users
           WHERE id = $1 AND department_id = $2`,
          [userId, assignment.targetId]
        );
        return deptResult.rows.length > 0;

      case 'ou':
        if (!assignment.targetValue) return false;
        const ouResult = await db.query(
          `SELECT 1 FROM organization_users ou
           JOIN gw_synced_users gsu ON gsu.email = ou.email AND gsu.organization_id = ou.organization_id
           WHERE ou.id = $1 AND gsu.org_unit_path = $2`,
          [userId, assignment.targetValue]
        );
        return ouResult.rows.length > 0;

      case 'organization':
        // Organization assignment matches all users
        return true;

      default:
        return false;
    }
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private mapRowToCampaign(row: CampaignRow): SignatureCampaign {
    return {
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      description: row.description || undefined,
      templateId: row.template_id,
      bannerUrl: row.banner_url || undefined,
      bannerLink: row.banner_link || undefined,
      bannerAltText: row.banner_alt_text || undefined,
      startDate: row.start_date,
      endDate: row.end_date,
      timezone: row.timezone,
      trackingEnabled: row.tracking_enabled,
      trackingOptions: {
        opens: row.tracking_options?.opens ?? true,
        unique: row.tracking_options?.unique ?? true,
        geo: row.tracking_options?.geo ?? true,
      },
      status: row.status,
      autoRevert: row.auto_revert,
      createdBy: row.created_by || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      launchedAt: row.launched_at || undefined,
      completedAt: row.completed_at || undefined,
    };
  }

  private mapRowToCampaignWithDetails(row: CampaignRowWithDetails): CampaignWithDetails {
    return {
      ...this.mapRowToCampaign(row),
      templateName: row.template_name,
      templateStatus: row.template_status,
      createdByName: row.created_by_name || undefined,
      createdByEmail: row.created_by_email || undefined,
      assignmentCount: row.assignment_count,
      enrolledUserCount: row.enrolled_user_count,
    };
  }
}

export const signatureCampaignService = new SignatureCampaignService();
export default signatureCampaignService;
