/**
 * Signature Permissions Service
 *
 * Handles permission management for email signature features.
 * Permission levels: admin, designer, campaign_manager, helpdesk, viewer
 */

import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import {
  SignaturePermission,
  CreatePermissionDTO,
  PermissionLevel,
  hasCapability,
} from '../types/signatures.js';

// Database row type
interface PermissionRow {
  id: string;
  organization_id: string;
  user_id: string;
  permission_level: PermissionLevel;
  granted_by: string | null;
  granted_at: Date;
  expires_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PermissionWithUserRow extends PermissionRow {
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  granter_email?: string | null;
  granter_name?: string | null;
}

interface UserPermissionSummary {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  effectivePermission: PermissionLevel;
  explicitPermission: PermissionLevel | null;
  grantedBy: string | null;
  granterName: string | null;
  grantedAt: Date | null;
  expiresAt: Date | null;
  notes: string | null;
  isOrgAdmin: boolean;
}

interface AuditLogEntry {
  id: string;
  organizationId: string;
  targetUserId: string;
  action: 'grant' | 'revoke' | 'update';
  oldPermissionLevel: PermissionLevel | null;
  newPermissionLevel: PermissionLevel | null;
  performedBy: string | null;
  performerName: string | null;
  performerEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  reason: string | null;
  createdAt: Date;
}

class SignaturePermissionsService {
  // ==========================================
  // PERMISSION QUERIES
  // ==========================================

  /**
   * Get all users with their signature permissions for an organization
   */
  async getOrganizationPermissions(
    organizationId: string,
    options: {
      includeInactive?: boolean;
      permissionLevel?: PermissionLevel;
    } = {}
  ): Promise<UserPermissionSummary[]> {
    const { includeInactive = false, permissionLevel } = options;

    let query = `
      SELECT
        ou.id AS user_id,
        ou.email,
        ou.first_name,
        ou.last_name,
        ou.role,
        ou.is_active,
        COALESCE(
          CASE WHEN ou.role = 'admin' THEN 'admin' END,
          sp.permission_level,
          'viewer'
        )::varchar AS effective_permission,
        sp.permission_level AS explicit_permission,
        sp.granted_by,
        gb.first_name || ' ' || gb.last_name AS granter_name,
        sp.granted_at,
        sp.expires_at,
        sp.notes,
        ou.role = 'admin' AS is_org_admin
      FROM organization_users ou
      LEFT JOIN signature_permissions sp ON sp.user_id = ou.id
        AND (sp.expires_at IS NULL OR sp.expires_at > NOW())
      LEFT JOIN organization_users gb ON gb.id = sp.granted_by
      WHERE ou.organization_id = $1
        AND ou.deleted_at IS NULL
    `;

    const values: (string | boolean)[] = [organizationId];
    let paramIndex = 2;

    if (!includeInactive) {
      query += ` AND ou.is_active = true`;
    }

    if (permissionLevel) {
      query += ` AND (
        CASE WHEN ou.role = 'admin' THEN 'admin'
        ELSE COALESCE(sp.permission_level, 'viewer') END
      ) = $${paramIndex}`;
      values.push(permissionLevel);
      paramIndex++;
    }

    query += ` ORDER BY
      CASE effective_permission
        WHEN 'admin' THEN 1
        WHEN 'designer' THEN 2
        WHEN 'campaign_manager' THEN 3
        WHEN 'helpdesk' THEN 4
        ELSE 5
      END,
      ou.last_name, ou.first_name`;

    const result = await db.query(query, values);

    return result.rows.map((row: any) => ({
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isActive: row.is_active,
      effectivePermission: row.effective_permission,
      explicitPermission: row.explicit_permission,
      grantedBy: row.granted_by,
      granterName: row.granter_name,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
      notes: row.notes,
      isOrgAdmin: row.is_org_admin,
    }));
  }

  /**
   * Get a specific user's permission
   */
  async getUserPermission(
    userId: string,
    organizationId: string
  ): Promise<UserPermissionSummary | null> {
    const result = await db.query(
      `
      SELECT
        ou.id AS user_id,
        ou.email,
        ou.first_name,
        ou.last_name,
        ou.role,
        ou.is_active,
        COALESCE(
          CASE WHEN ou.role = 'admin' THEN 'admin' END,
          sp.permission_level,
          'viewer'
        )::varchar AS effective_permission,
        sp.permission_level AS explicit_permission,
        sp.granted_by,
        gb.first_name || ' ' || gb.last_name AS granter_name,
        sp.granted_at,
        sp.expires_at,
        sp.notes,
        ou.role = 'admin' AS is_org_admin
      FROM organization_users ou
      LEFT JOIN signature_permissions sp ON sp.user_id = ou.id
        AND (sp.expires_at IS NULL OR sp.expires_at > NOW())
      LEFT JOIN organization_users gb ON gb.id = sp.granted_by
      WHERE ou.id = $1
        AND ou.organization_id = $2
        AND ou.deleted_at IS NULL
      `,
      [userId, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      userId: row.user_id,
      email: row.email,
      firstName: row.first_name,
      lastName: row.last_name,
      role: row.role,
      isActive: row.is_active,
      effectivePermission: row.effective_permission,
      explicitPermission: row.explicit_permission,
      grantedBy: row.granted_by,
      granterName: row.granter_name,
      grantedAt: row.granted_at,
      expiresAt: row.expires_at,
      notes: row.notes,
      isOrgAdmin: row.is_org_admin,
    };
  }

  /**
   * Get effective permission level for a user (uses database function)
   */
  async getEffectivePermissionLevel(userId: string): Promise<PermissionLevel> {
    const result = await db.query(
      `SELECT get_user_signature_permission_level($1) AS level`,
      [userId]
    );
    return result.rows[0]?.level || 'viewer';
  }

  /**
   * Check if user has at least the required permission level
   */
  async hasPermission(
    userId: string,
    requiredLevel: PermissionLevel
  ): Promise<boolean> {
    const result = await db.query(
      `SELECT user_has_signature_permission($1, $2) AS has_permission`,
      [userId, requiredLevel]
    );
    return result.rows[0]?.has_permission || false;
  }

  /**
   * Check if user has a specific capability
   */
  async hasCapabilityForUser(
    userId: string,
    capability: string
  ): Promise<boolean> {
    const level = await this.getEffectivePermissionLevel(userId);
    return hasCapability(level, capability);
  }

  // ==========================================
  // PERMISSION MANAGEMENT
  // ==========================================

  /**
   * Grant or update permission for a user
   */
  async grantPermission(
    organizationId: string,
    data: CreatePermissionDTO & {
      expiresAt?: Date | null;
      notes?: string;
    },
    grantedBy: string
  ): Promise<SignaturePermission> {
    const { userId, permissionLevel, expiresAt, notes } = data;

    // Verify user exists and belongs to organization
    const userCheck = await db.query(
      `SELECT id, role FROM organization_users
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [userId, organizationId]
    );

    if (userCheck.rows.length === 0) {
      throw new Error('User not found in organization');
    }

    // Warn if user is already org admin (they already have full access)
    if (userCheck.rows[0].role === 'admin') {
      logger.info('Setting explicit permission for org admin (redundant)', {
        userId,
        permissionLevel,
        organizationId,
      });
    }

    // Upsert permission
    const result = await db.query(
      `
      INSERT INTO signature_permissions (
        organization_id, user_id, permission_level,
        granted_by, expires_at, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET
        permission_level = EXCLUDED.permission_level,
        granted_by = EXCLUDED.granted_by,
        expires_at = EXCLUDED.expires_at,
        notes = COALESCE(EXCLUDED.notes, signature_permissions.notes),
        updated_at = NOW()
      RETURNING *
      `,
      [organizationId, userId, permissionLevel, grantedBy, expiresAt || null, notes || null]
    );

    logger.info('Signature permission granted', {
      userId,
      permissionLevel,
      grantedBy,
      organizationId,
    });

    return this.mapRowToPermission(result.rows[0]);
  }

  /**
   * Revoke permission for a user (deletes the record, user falls back to 'viewer')
   */
  async revokePermission(
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    const result = await db.query(
      `DELETE FROM signature_permissions
       WHERE organization_id = $1 AND user_id = $2
       RETURNING id`,
      [organizationId, userId]
    );

    if (result.rows.length > 0) {
      logger.info('Signature permission revoked', {
        userId,
        organizationId,
      });
      return true;
    }

    return false;
  }

  /**
   * Bulk grant permissions (for initial setup or mass assignment)
   */
  async bulkGrantPermissions(
    organizationId: string,
    permissions: Array<CreatePermissionDTO & { expiresAt?: Date | null }>,
    grantedBy: string
  ): Promise<{ granted: number; failed: string[] }> {
    const results = {
      granted: 0,
      failed: [] as string[],
    };

    for (const perm of permissions) {
      try {
        await this.grantPermission(organizationId, perm, grantedBy);
        results.granted++;
      } catch (error) {
        logger.error('Failed to grant permission', {
          userId: perm.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.failed.push(perm.userId);
      }
    }

    return results;
  }

  // ==========================================
  // AUDIT LOG
  // ==========================================

  /**
   * Get audit log for signature permission changes
   */
  async getAuditLog(
    organizationId: string,
    options: {
      userId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const { userId, limit = 50, offset = 0 } = options;

    let countQuery = `
      SELECT COUNT(*) as count
      FROM signature_permission_audit spa
      WHERE spa.organization_id = $1
    `;

    let query = `
      SELECT
        spa.*,
        pb.first_name || ' ' || pb.last_name AS performer_name,
        pb.email AS performer_email
      FROM signature_permission_audit spa
      LEFT JOIN organization_users pb ON pb.id = spa.performed_by
      WHERE spa.organization_id = $1
    `;

    const countValues: string[] = [organizationId];
    const values: (string | number)[] = [organizationId];
    let paramIndex = 2;

    if (userId) {
      countQuery += ` AND spa.target_user_id = $${paramIndex}`;
      query += ` AND spa.target_user_id = $${paramIndex}`;
      countValues.push(userId);
      values.push(userId);
      paramIndex++;
    }

    query += ` ORDER BY spa.created_at DESC`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    values.push(limit, offset);

    const [countResult, dataResult] = await Promise.all([
      db.query(countQuery, countValues),
      db.query(query, values),
    ]);

    return {
      entries: dataResult.rows.map((row: any) => ({
        id: row.id,
        organizationId: row.organization_id,
        targetUserId: row.target_user_id,
        action: row.action,
        oldPermissionLevel: row.old_permission_level,
        newPermissionLevel: row.new_permission_level,
        performedBy: row.performed_by,
        performerName: row.performer_name,
        performerEmail: row.performer_email,
        ipAddress: row.ip_address,
        userAgent: row.user_agent,
        reason: row.reason,
        createdAt: row.created_at,
      })),
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  // ==========================================
  // STATISTICS
  // ==========================================

  /**
   * Get permission statistics for an organization
   */
  async getPermissionStats(organizationId: string): Promise<{
    total: number;
    byLevel: Record<PermissionLevel, number>;
    withExplicit: number;
    orgAdmins: number;
  }> {
    const result = await db.query(
      `
      SELECT
        COUNT(*) FILTER (WHERE is_active) AS total,
        COUNT(*) FILTER (WHERE role = 'admin' AND is_active) AS org_admins,
        COUNT(*) FILTER (WHERE explicit_permission IS NOT NULL AND is_active) AS with_explicit,
        COUNT(*) FILTER (WHERE effective_permission = 'admin' AND is_active) AS level_admin,
        COUNT(*) FILTER (WHERE effective_permission = 'designer' AND is_active) AS level_designer,
        COUNT(*) FILTER (WHERE effective_permission = 'campaign_manager' AND is_active) AS level_campaign_manager,
        COUNT(*) FILTER (WHERE effective_permission = 'helpdesk' AND is_active) AS level_helpdesk,
        COUNT(*) FILTER (WHERE effective_permission = 'viewer' AND is_active) AS level_viewer
      FROM user_signature_permissions
      WHERE organization_id = $1
      `,
      [organizationId]
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total, 10),
      byLevel: {
        admin: parseInt(row.level_admin, 10),
        designer: parseInt(row.level_designer, 10),
        campaign_manager: parseInt(row.level_campaign_manager, 10),
        helpdesk: parseInt(row.level_helpdesk, 10),
        viewer: parseInt(row.level_viewer, 10),
      },
      withExplicit: parseInt(row.with_explicit, 10),
      orgAdmins: parseInt(row.org_admins, 10),
    };
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private mapRowToPermission(row: PermissionRow): SignaturePermission {
    return {
      id: row.id,
      organizationId: row.organization_id,
      userId: row.user_id,
      permissionLevel: row.permission_level,
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
      updatedAt: row.updated_at,
    };
  }
}

// Export singleton instance
export const signaturePermissionsService = new SignaturePermissionsService();
