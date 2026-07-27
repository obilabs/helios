/**
 * Signature Assignment Service
 *
 * Handles CRUD operations for signature assignments,
 * effective template resolution, and affected user preview.
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import {
  SignatureAssignment,
  CreateSignatureAssignmentDTO,
  UpdateSignatureAssignmentDTO,
  AssignmentType,
  UserEffectiveSignature,
} from '../types/signatures.js';

// Database row types
interface AssignmentRow {
  id: string;
  organization_id: string;
  template_id: string;
  assignment_type: AssignmentType;
  target_id: string | null;
  target_value: string | null;
  priority: number;
  is_active: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
}

interface AssignmentWithDetails extends AssignmentRow {
  template_name: string;
  template_status: string;
  target_name: string | null;
  affected_users: number;
}

interface AffectedUser {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
}

interface EffectiveSignatureRow {
  user_id: string;
  organization_id: string;
  assignment_id: string;
  template_id: string;
  source: string;  // Can be AssignmentType or 'campaign'
  banner_url: string | null;
  banner_link: string | null;
  banner_alt_text: string | null;
}

class SignatureAssignmentService {
  // ==========================================
  // ASSIGNMENT CRUD OPERATIONS
  // ==========================================

  /**
   * Get all assignments for an organization
   */
  async getAssignments(
    organizationId: string,
    options: {
      templateId?: string;
      assignmentType?: AssignmentType;
      isActive?: boolean;
      includeDetails?: boolean;
    } = {}
  ): Promise<SignatureAssignment[]> {
    const values: unknown[] = [organizationId];
    let paramIndex = 2;

    let query: string;

    if (options.includeDetails) {
      query = `
        SELECT
          sa.*,
          st.name AS template_name,
          st.status AS template_status,
          CASE sa.assignment_type
            WHEN 'user' THEN (SELECT CONCAT(first_name, ' ', last_name) FROM organization_users WHERE id = sa.target_id)
            WHEN 'group' THEN (SELECT name FROM access_groups WHERE id = sa.target_id)
            WHEN 'dynamic_group' THEN (SELECT name FROM access_groups WHERE id = sa.target_id)
            WHEN 'department' THEN (SELECT name FROM departments WHERE id = sa.target_id)
            WHEN 'ou' THEN sa.target_value
            WHEN 'organization' THEN 'All Users'
          END AS target_name,
          (
            SELECT COUNT(*)::integer
            FROM user_effective_signatures ues
            WHERE ues.assignment_id = sa.id
          ) AS affected_users
        FROM signature_assignments sa
        JOIN signature_templates st ON st.id = sa.template_id
        WHERE sa.organization_id = $1
      `;
    } else {
      query = `
        SELECT sa.*
        FROM signature_assignments sa
        WHERE sa.organization_id = $1
      `;
    }

    if (options.templateId) {
      query += ` AND sa.template_id = $${paramIndex}`;
      values.push(options.templateId);
      paramIndex++;
    }

    if (options.assignmentType) {
      query += ` AND sa.assignment_type = $${paramIndex}`;
      values.push(options.assignmentType);
      paramIndex++;
    }

    if (options.isActive !== undefined) {
      query += ` AND sa.is_active = $${paramIndex}`;
      values.push(options.isActive);
      paramIndex++;
    }

    query += ` ORDER BY sa.priority ASC, sa.created_at DESC`;

    const result = await db.query(query, values);

    if (options.includeDetails) {
      return result.rows.map((row: AssignmentWithDetails) =>
        this.mapRowToAssignmentWithDetails(row)
      );
    }

    return result.rows.map((row: AssignmentRow) => this.mapRowToAssignment(row));
  }

  /**
   * Get a single assignment by ID
   */
  async getAssignment(id: string): Promise<SignatureAssignment | null> {
    const result = await db.query(
      'SELECT * FROM signature_assignments WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRowToAssignment(result.rows[0]);
  }

  /**
   * Get assignments for a specific template
   */
  async getAssignmentsForTemplate(
    templateId: string
  ): Promise<SignatureAssignment[]> {
    const result = await db.query(
      `SELECT * FROM signature_assignments
       WHERE template_id = $1 AND is_active = true
       ORDER BY priority ASC`,
      [templateId]
    );

    return result.rows.map((row: AssignmentRow) => this.mapRowToAssignment(row));
  }

  /**
   * Create a new assignment
   */
  async createAssignment(
    organizationId: string,
    data: CreateSignatureAssignmentDTO,
    createdBy?: string
  ): Promise<SignatureAssignment> {
    // Validate the assignment target exists
    await this.validateTarget(organizationId, data.assignmentType, data.targetId, data.targetValue);

    // Check for duplicate assignment
    const duplicate = await this.checkDuplicateAssignment(
      organizationId,
      data.templateId,
      data.assignmentType,
      data.targetId,
      data.targetValue
    );

    if (duplicate) {
      throw new Error('An assignment with this template and target already exists');
    }

    // Default priority based on assignment type
    const priority = data.priority ?? this.getDefaultPriority(data.assignmentType);

    const result = await db.query(
      `INSERT INTO signature_assignments (
        organization_id,
        template_id,
        assignment_type,
        target_id,
        target_value,
        priority,
        is_active,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        organizationId,
        data.templateId,
        data.assignmentType,
        data.targetId || null,
        data.targetValue || null,
        priority,
        data.isActive ?? true,
        createdBy || null,
      ]
    );

    const assignment = this.mapRowToAssignment(result.rows[0]);

    logger.info('Created signature assignment', {
      assignmentId: assignment.id,
      templateId: data.templateId,
      assignmentType: data.assignmentType,
      targetId: data.targetId,
      organizationId,
    });

    // Mark affected users' signatures as pending sync
    await this.markAffectedUsersPending(organizationId, assignment);

    return assignment;
  }

  /**
   * Update an existing assignment
   */
  async updateAssignment(
    id: string,
    data: UpdateSignatureAssignmentDTO
  ): Promise<SignatureAssignment | null> {
    const existing = await this.getAssignment(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      values.push(data.priority);
    }

    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(data.isActive);
    }

    if (updates.length === 0) {
      return existing;
    }

    values.push(id);
    const result = await db.query(
      `UPDATE signature_assignments SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return null;

    const assignment = this.mapRowToAssignment(result.rows[0]);

    logger.info('Updated signature assignment', {
      assignmentId: id,
      updates: Object.keys(data),
    });

    // If assignment was activated/deactivated, mark affected users as pending
    if (data.isActive !== undefined) {
      await this.markAffectedUsersPending(existing.organizationId, assignment);
    }

    return assignment;
  }

  /**
   * Delete an assignment
   */
  async deleteAssignment(id: string): Promise<boolean> {
    const existing = await this.getAssignment(id);
    if (!existing) return false;

    const result = await db.query(
      'DELETE FROM signature_assignments WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length > 0) {
      logger.info('Deleted signature assignment', { assignmentId: id });

      // Mark affected users as pending (they may now get a different template)
      await this.markAffectedUsersPending(existing.organizationId, existing);

      return true;
    }

    return false;
  }

  // ==========================================
  // EFFECTIVE SIGNATURE RESOLUTION
  // ==========================================

  /**
   * Get the effective signature template for a user
   * This resolves the priority chain: campaign > user > dynamic_group > group > department > ou > organization
   * Campaigns always take highest priority when active.
   */
  async getEffectiveSignature(userId: string): Promise<UserEffectiveSignature | null> {
    // Use the database view for consistent priority resolution
    const result = await db.query(
      `SELECT * FROM user_effective_signatures WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as EffectiveSignatureRow;
    return {
      userId: row.user_id,
      organizationId: row.organization_id,
      assignmentId: row.assignment_id,
      templateId: row.template_id,
      source: row.source as UserEffectiveSignature['source'],
      bannerUrl: row.banner_url,
      bannerLink: row.banner_link,
      bannerAltText: row.banner_alt_text,
    };
  }

  /**
   * Get effective signatures for all users in an organization
   */
  async getAllEffectiveSignatures(
    organizationId: string
  ): Promise<UserEffectiveSignature[]> {
    const result = await db.query(
      `SELECT * FROM user_effective_signatures WHERE organization_id = $1`,
      [organizationId]
    );

    return result.rows.map((row: EffectiveSignatureRow) => ({
      userId: row.user_id,
      organizationId: row.organization_id,
      assignmentId: row.assignment_id,
      templateId: row.template_id,
      source: row.source as UserEffectiveSignature['source'],
      bannerUrl: row.banner_url,
      bannerLink: row.banner_link,
      bannerAltText: row.banner_alt_text,
    }));
  }

  /**
   * Get users who would be affected by an assignment
   * (without actually creating the assignment)
   */
  async previewAffectedUsers(
    organizationId: string,
    assignmentType: AssignmentType,
    targetId?: string,
    targetValue?: string
  ): Promise<AffectedUser[]> {
    let query: string;
    const values: unknown[] = [organizationId];

    switch (assignmentType) {
      case 'user':
        if (!targetId) return [];
        query = `
          SELECT ou.id AS user_id, ou.email, ou.first_name, ou.last_name, d.name AS department
          FROM organization_users ou
          LEFT JOIN departments d ON d.id = ou.department_id
          WHERE ou.id = $2 AND ou.organization_id = $1 AND ou.is_active = true
        `;
        values.push(targetId);
        break;

      case 'group':
      case 'dynamic_group':
        if (!targetId) return [];
        query = `
          SELECT ou.id AS user_id, ou.email, ou.first_name, ou.last_name, d.name AS department
          FROM organization_users ou
          JOIN access_group_members agm ON agm.user_id = ou.id AND agm.is_active = true
          LEFT JOIN departments d ON d.id = ou.department_id
          WHERE agm.access_group_id = $2 AND ou.organization_id = $1 AND ou.is_active = true
        `;
        values.push(targetId);
        break;

      case 'department':
        if (!targetId) return [];
        query = `
          SELECT ou.id AS user_id, ou.email, ou.first_name, ou.last_name, d.name AS department
          FROM organization_users ou
          LEFT JOIN departments d ON d.id = ou.department_id
          WHERE ou.department_id = $2 AND ou.organization_id = $1 AND ou.is_active = true
        `;
        values.push(targetId);
        break;

      case 'ou':
        // OU assignment would need to query Google Workspace OU path
        // For now, return users who have the OU path stored
        if (!targetValue) return [];
        query = `
          SELECT ou.id AS user_id, ou.email, ou.first_name, ou.last_name, d.name AS department
          FROM organization_users ou
          LEFT JOIN departments d ON d.id = ou.department_id
          LEFT JOIN gw_synced_users gsu ON gsu.email = ou.email AND gsu.organization_id = ou.organization_id
          WHERE gsu.org_unit_path = $2 AND ou.organization_id = $1 AND ou.is_active = true
        `;
        values.push(targetValue);
        break;

      case 'organization':
        // All active users in the organization
        query = `
          SELECT ou.id AS user_id, ou.email, ou.first_name, ou.last_name, d.name AS department
          FROM organization_users ou
          LEFT JOIN departments d ON d.id = ou.department_id
          WHERE ou.organization_id = $1 AND ou.is_active = true
        `;
        break;

      default:
        return [];
    }

    query += ' ORDER BY ou.last_name, ou.first_name';

    const result = await db.query(query, values);

    return result.rows.map((row: { user_id: string; email: string; first_name: string; last_name: string; department?: string }) => ({
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      department: row.department,
    }));
  }

  // ==========================================
  // ASSIGNMENT TARGETS
  // ==========================================

  /**
   * Get available assignment targets (users, groups, departments)
   */
  async getAvailableTargets(
    organizationId: string,
    type: AssignmentType
  ): Promise<{ id: string; name: string; count?: number }[]> {
    let query: string;

    switch (type) {
      case 'user':
        query = `
          SELECT id, CONCAT(first_name, ' ', last_name) AS name
          FROM organization_users
          WHERE organization_id = $1 AND is_active = true
          ORDER BY last_name, first_name
        `;
        break;

      case 'group':
        query = `
          SELECT ag.id, ag.name, COUNT(agm.id)::integer AS count
          FROM access_groups ag
          LEFT JOIN access_group_members agm ON agm.access_group_id = ag.id AND agm.is_active = true
          WHERE ag.organization_id = $1 AND ag.is_active = true AND ag.membership_type = 'static'
          GROUP BY ag.id, ag.name
          ORDER BY ag.name
        `;
        break;

      case 'dynamic_group':
        query = `
          SELECT ag.id, ag.name, COUNT(agm.id)::integer AS count
          FROM access_groups ag
          LEFT JOIN access_group_members agm ON agm.access_group_id = ag.id AND agm.is_active = true
          WHERE ag.organization_id = $1 AND ag.is_active = true AND ag.membership_type = 'dynamic'
          GROUP BY ag.id, ag.name
          ORDER BY ag.name
        `;
        break;

      case 'department':
        query = `
          SELECT d.id, d.name, COUNT(ou.id)::integer AS count
          FROM departments d
          LEFT JOIN organization_users ou ON ou.department_id = d.id AND ou.is_active = true
          WHERE d.organization_id = $1 AND d.is_active = true
          GROUP BY d.id, d.name
          ORDER BY d.name
        `;
        break;

      case 'ou':
        // Get unique OU paths from synced users
        query = `
          SELECT DISTINCT org_unit_path AS id, org_unit_path AS name, COUNT(*)::integer AS count
          FROM gw_synced_users
          WHERE organization_id = $1 AND org_unit_path IS NOT NULL
          GROUP BY org_unit_path
          ORDER BY org_unit_path
        `;
        break;

      case 'organization':
        // Single option representing all users
        return [{
          id: organizationId,
          name: 'All Users (Organization Default)',
          count: await this.getOrganizationUserCount(organizationId),
        }];

      default:
        return [];
    }

    const result = await db.query(query, [organizationId]);
    return result.rows.map((row: { id: string; name: string; count?: number }) => ({
      id: row.id,
      name: row.name,
      count: row.count,
    }));
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  private mapRowToAssignment(row: AssignmentRow): SignatureAssignment {
    return {
      id: row.id,
      organizationId: row.organization_id,
      templateId: row.template_id,
      assignmentType: row.assignment_type,
      targetId: row.target_id,
      targetValue: row.target_value,
      priority: row.priority,
      isActive: row.is_active,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapRowToAssignmentWithDetails(row: AssignmentWithDetails): SignatureAssignment & {
    templateName: string;
    templateStatus: string;
    targetName: string | null;
    affectedUsers: number;
  } {
    return {
      ...this.mapRowToAssignment(row),
      templateName: row.template_name,
      templateStatus: row.template_status,
      targetName: row.target_name,
      affectedUsers: row.affected_users,
    };
  }

  private async validateTarget(
    organizationId: string,
    assignmentType: AssignmentType,
    targetId?: string,
    targetValue?: string
  ): Promise<void> {
    if (assignmentType === 'organization') {
      // No target needed for organization-level assignment
      return;
    }

    if (assignmentType === 'ou') {
      if (!targetValue) {
        throw new Error('OU path is required for ou assignment type');
      }
      return;
    }

    if (!targetId) {
      throw new Error(`Target ID is required for ${assignmentType} assignment type`);
    }

    let exists = false;

    switch (assignmentType) {
      case 'user':
        const userResult = await db.query(
          'SELECT id FROM organization_users WHERE id = $1 AND organization_id = $2',
          [targetId, organizationId]
        );
        exists = userResult.rows.length > 0;
        break;

      case 'group':
      case 'dynamic_group':
        const groupResult = await db.query(
          'SELECT id FROM access_groups WHERE id = $1 AND organization_id = $2',
          [targetId, organizationId]
        );
        exists = groupResult.rows.length > 0;
        break;

      case 'department':
        const deptResult = await db.query(
          'SELECT id FROM departments WHERE id = $1 AND organization_id = $2',
          [targetId, organizationId]
        );
        exists = deptResult.rows.length > 0;
        break;
    }

    if (!exists) {
      throw new Error(`Target ${assignmentType} with ID ${targetId} not found`);
    }
  }

  private async checkDuplicateAssignment(
    organizationId: string,
    templateId: string,
    assignmentType: AssignmentType,
    targetId?: string,
    targetValue?: string
  ): Promise<boolean> {
    let query: string;
    const values: unknown[] = [organizationId, templateId, assignmentType];

    if (assignmentType === 'organization') {
      query = `
        SELECT id FROM signature_assignments
        WHERE organization_id = $1 AND template_id = $2 AND assignment_type = $3
      `;
    } else if (targetValue && !targetId) {
      query = `
        SELECT id FROM signature_assignments
        WHERE organization_id = $1 AND template_id = $2 AND assignment_type = $3 AND target_value = $4
      `;
      values.push(targetValue);
    } else {
      query = `
        SELECT id FROM signature_assignments
        WHERE organization_id = $1 AND template_id = $2 AND assignment_type = $3 AND target_id = $4
      `;
      values.push(targetId);
    }

    const result = await db.query(query, values);
    return result.rows.length > 0;
  }

  private getDefaultPriority(assignmentType: AssignmentType): number {
    // Default priorities based on type hierarchy
    // Lower number = higher priority
    switch (assignmentType) {
      case 'user':
        return 10;
      case 'dynamic_group':
        return 20;
      case 'group':
        return 30;
      case 'department':
        return 40;
      case 'ou':
        return 50;
      case 'organization':
        return 100;
      default:
        return 100;
    }
  }

  private async markAffectedUsersPending(
    organizationId: string,
    assignment: SignatureAssignment
  ): Promise<void> {
    // Get affected users
    const affectedUsers = await this.previewAffectedUsers(
      organizationId,
      assignment.assignmentType,
      assignment.targetId || undefined,
      assignment.targetValue || undefined
    );

    if (affectedUsers.length === 0) return;

    const userIds = affectedUsers.map(u => u.userId);

    // Update or insert user_signature_status records
    for (const userId of userIds) {
      await db.query(
        `INSERT INTO user_signature_status (
          user_id,
          organization_id,
          sync_status
        ) VALUES ($1, $2, 'pending')
        ON CONFLICT (user_id) DO UPDATE SET
          sync_status = 'pending',
          updated_at = NOW()`,
        [userId, organizationId]
      );
    }

    logger.info('Marked users for signature sync', {
      assignmentId: assignment.id,
      userCount: userIds.length,
    });
  }

  private async getOrganizationUserCount(organizationId: string): Promise<number> {
    const result = await db.query(
      'SELECT COUNT(*)::integer AS count FROM organization_users WHERE organization_id = $1 AND is_active = true',
      [organizationId]
    );
    return result.rows[0]?.count || 0;
  }
}

export const signatureAssignmentService = new SignatureAssignmentService();
export default signatureAssignmentService;
