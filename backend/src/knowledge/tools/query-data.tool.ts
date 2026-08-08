/**
 * AI Data Query Tools (Read-Only)
 *
 * These tools allow the AI to query actual data from Google Workspace
 * and Microsoft 365. They are READ-ONLY and cannot modify any data.
 */

import { googleWorkspaceService } from '../../services/google-workspace.service.js';
import { microsoftGraphService } from '../../services/microsoft-graph.service.js';
import { db } from '../../database/connection.js';
import { logger } from '../../utils/logger.js';

/**
 * Tool definition for querying Google Workspace users
 */
export const queryGwUsersToolDefinition = {
  name: 'query_gw_users',
  description: `Query Google Workspace users from the synced database.

Use this to answer questions like:
- "How many users do we have?"
- "How many admins are there?"
- "Who are the suspended users?"
- "List users in the Sales department"

Returns actual user data from your organization.`,
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter users: "all", "active", "suspended", "admin"'
      },
      department: {
        type: 'string',
        description: 'Filter by department name (optional)'
      },
      search: {
        type: 'string',
        description: 'Search by name or email (optional)'
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 10, max: 50)'
      },
      countOnly: {
        type: 'boolean',
        description: 'If true, only return counts, not user details'
      }
    },
    required: [] as string[]
  }
};

/**
 * Tool definition for querying Google Workspace groups
 */
export const queryGwGroupsToolDefinition = {
  name: 'query_gw_groups',
  description: `Query Google Workspace groups from the synced database.

Use this to answer questions like:
- "How many groups do we have?"
- "List all distribution groups"
- "Who is in the Engineering group?"

Returns actual group data from your organization.`,
  parameters: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search by group name or email (optional)'
      },
      includeMembers: {
        type: 'boolean',
        description: 'Include member list (default: false)'
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 10, max: 50)'
      },
      countOnly: {
        type: 'boolean',
        description: 'If true, only return count'
      }
    },
    required: [] as string[]
  }
};

/**
 * Tool definition for querying Microsoft 365 users
 */
export const queryMs365UsersToolDefinition = {
  name: 'query_ms365_users',
  description: `Query Microsoft 365 users from the synced database.

Use this to answer questions about Microsoft 365 / Entra ID users.
Returns actual user data from your organization.`,
  parameters: {
    type: 'object',
    properties: {
      filter: {
        type: 'string',
        description: 'Filter users: "all", "active", "disabled"'
      },
      search: {
        type: 'string',
        description: 'Search by name or email (optional)'
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 10, max: 50)'
      },
      countOnly: {
        type: 'boolean',
        description: 'If true, only return count'
      }
    },
    required: [] as string[]
  }
};

/**
 * Tool definition for getting sync status
 */
export const getSyncStatusToolDefinition = {
  name: 'get_sync_status',
  description: `Get the synchronization status for Google Workspace and Microsoft 365.

Use this to answer questions like:
- "When was the last sync?"
- "Is sync working?"
- "How many users are synced?"`,
  parameters: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        enum: ['google', 'microsoft', 'all'],
        description: 'Which platform to check (default: all)'
      }
    },
    required: [] as string[]
  }
};

/**
 * Execute query_gw_users tool
 */
export async function executeQueryGwUsers(
  organizationId: string,
  params: {
    filter?: string;
    department?: string;
    search?: string;
    limit?: number;
    countOnly?: boolean;
  }
): Promise<string> {
  try {
    const { filter = 'all', department, search, limit = 10, countOnly = false } = params;
    const effectiveLimit = Math.min(limit, 50);

    // Build query
    let query = `
      SELECT
        id, email, given_name, family_name,
        department, is_admin, is_suspended,
        creation_time, last_login_time
      FROM gw_synced_users
      WHERE organization_id = $1
    `;
    const queryParams: any[] = [organizationId];
    let paramIndex = 2;

    // Apply filters
    if (filter === 'active') {
      query += ` AND is_suspended = false`;
    } else if (filter === 'suspended') {
      query += ` AND is_suspended = true`;
    } else if (filter === 'admin') {
      query += ` AND is_admin = true`;
    }

    if (department) {
      query += ` AND LOWER(department) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${department}%`);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        LOWER(email) LIKE LOWER($${paramIndex}) OR
        LOWER(given_name) LIKE LOWER($${paramIndex}) OR
        LOWER(family_name) LIKE LOWER($${paramIndex})
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Get counts
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as count FROM');
    const countResult = await db.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0]?.count || '0');

    // Get counts by status
    const statsQuery = `
      SELECT
        COUNT(*) FILTER (WHERE is_suspended = false) as active_count,
        COUNT(*) FILTER (WHERE is_suspended = true) as suspended_count,
        COUNT(*) FILTER (WHERE is_admin = true) as admin_count,
        COUNT(*) as total_count
      FROM gw_synced_users
      WHERE organization_id = $1
    `;
    const statsResult = await db.query(statsQuery, [organizationId]);
    const stats = statsResult.rows[0];

    if (countOnly) {
      let output = `## Google Workspace User Statistics\n\n`;
      output += `- **Total Users:** ${stats.total_count}\n`;
      output += `- **Active Users:** ${stats.active_count}\n`;
      output += `- **Suspended Users:** ${stats.suspended_count}\n`;
      output += `- **Admin Users:** ${stats.admin_count}\n`;

      if (filter !== 'all' || department || search) {
        output += `\n**Filtered Result:** ${totalCount} user(s) match your criteria`;
      }

      return output;
    }

    // Get user list
    query += ` ORDER BY email LIMIT $${paramIndex}`;
    queryParams.push(effectiveLimit);

    const result = await db.query(query, queryParams);

    let output = `## Google Workspace Users\n\n`;
    output += `**Summary:** ${stats.total_count} total users (${stats.active_count} active, ${stats.suspended_count} suspended, ${stats.admin_count} admins)\n\n`;

    if (result.rows.length === 0) {
      output += `No users found matching your criteria.`;
      return output;
    }

    output += `**Showing ${result.rows.length} of ${totalCount} matching users:**\n\n`;

    for (const user of result.rows) {
      const name = `${user.given_name || ''} ${user.family_name || ''}`.trim() || 'No name';
      const status = user.is_suspended ? '(Suspended)' : '';
      const admin = user.is_admin ? '[Admin]' : '';
      const dept = user.department ? `| ${user.department}` : '';

      output += `- **${name}** ${admin} ${status}\n`;
      output += `  ${user.email} ${dept}\n`;
    }

    if (totalCount > effectiveLimit) {
      output += `\n*...and ${totalCount - effectiveLimit} more*`;
    }

    return output;
  } catch (error: any) {
    logger.error('Error querying GW users:', error);
    return `Error querying users: ${error.message}. Make sure Google Workspace is configured and synced.`;
  }
}

/**
 * Execute query_gw_groups tool
 */
export async function executeQueryGwGroups(
  organizationId: string,
  params: {
    search?: string;
    includeMembers?: boolean;
    limit?: number;
    countOnly?: boolean;
  }
): Promise<string> {
  try {
    const { search, includeMembers = false, limit = 10, countOnly = false } = params;
    const effectiveLimit = Math.min(limit, 50);

    // Build query
    let query = `
      SELECT
        id, email, name, description, member_count
      FROM gw_synced_groups
      WHERE organization_id = $1
    `;
    const queryParams: any[] = [organizationId];
    let paramIndex = 2;

    if (search) {
      query += ` AND (
        LOWER(email) LIKE LOWER($${paramIndex}) OR
        LOWER(name) LIKE LOWER($${paramIndex})
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Get count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as count FROM');
    const countResult = await db.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0]?.count || '0');

    if (countOnly) {
      return `## Google Workspace Groups\n\n**Total Groups:** ${totalCount}`;
    }

    // Get group list
    query += ` ORDER BY name LIMIT $${paramIndex}`;
    queryParams.push(effectiveLimit);

    const result = await db.query(query, queryParams);

    let output = `## Google Workspace Groups\n\n`;
    output += `**Total:** ${totalCount} groups\n\n`;

    if (result.rows.length === 0) {
      output += `No groups found.`;
      return output;
    }

    for (const group of result.rows) {
      output += `### ${group.name || group.email}\n`;
      output += `- **Email:** ${group.email}\n`;
      output += `- **Members:** ${group.member_count || 0}\n`;
      if (group.description) {
        output += `- **Description:** ${group.description}\n`;
      }

      if (includeMembers && group.id) {
        try {
          const membersResult = await db.query(
            `SELECT email, role FROM gw_group_members WHERE group_id = $1 LIMIT 10`,
            [group.id]
          );
          if (membersResult.rows.length > 0) {
            output += `- **Members:** ${membersResult.rows.map((m: any) => m.email).join(', ')}`;
            if (group.member_count > 10) {
              output += ` *(+${group.member_count - 10} more)*`;
            }
            output += '\n';
          }
        } catch {
          // Members table might not exist or be empty
        }
      }
      output += '\n';
    }

    return output;
  } catch (error: any) {
    logger.error('Error querying GW groups:', error);
    return `Error querying groups: ${error.message}. Make sure Google Workspace is configured and synced.`;
  }
}

/**
 * Execute query_ms365_users tool
 */
export async function executeQueryMs365Users(
  organizationId: string,
  params: {
    filter?: string;
    search?: string;
    limit?: number;
    countOnly?: boolean;
  }
): Promise<string> {
  try {
    const { filter = 'all', search, limit = 10, countOnly = false } = params;
    const effectiveLimit = Math.min(limit, 50);

    // Build query
    let query = `
      SELECT
        id, user_principal_name, display_name,
        mail, department, job_title,
        account_enabled
      FROM microsoft_users
      WHERE organization_id = $1
    `;
    const queryParams: any[] = [organizationId];
    let paramIndex = 2;

    if (filter === 'active') {
      query += ` AND account_enabled = true`;
    } else if (filter === 'disabled') {
      query += ` AND account_enabled = false`;
    }

    if (search) {
      query += ` AND (
        LOWER(user_principal_name) LIKE LOWER($${paramIndex}) OR
        LOWER(display_name) LIKE LOWER($${paramIndex}) OR
        LOWER(mail) LIKE LOWER($${paramIndex})
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Get count
    const countQuery = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) as count FROM');
    const countResult = await db.query(countQuery, queryParams);
    const totalCount = parseInt(countResult.rows[0]?.count || '0');

    if (countOnly) {
      // Get stats
      const statsQuery = `
        SELECT
          COUNT(*) FILTER (WHERE account_enabled = true) as active_count,
          COUNT(*) FILTER (WHERE account_enabled = false) as disabled_count,
          COUNT(*) as total_count
        FROM microsoft_users
        WHERE organization_id = $1
      `;
      const statsResult = await db.query(statsQuery, [organizationId]);
      const stats = statsResult.rows[0];

      let output = `## Microsoft 365 User Statistics\n\n`;
      output += `- **Total Users:** ${stats.total_count}\n`;
      output += `- **Active Users:** ${stats.active_count}\n`;
      output += `- **Disabled Users:** ${stats.disabled_count}\n`;

      return output;
    }

    // Get user list
    query += ` ORDER BY display_name LIMIT $${paramIndex}`;
    queryParams.push(effectiveLimit);

    const result = await db.query(query, queryParams);

    let output = `## Microsoft 365 Users\n\n`;

    if (result.rows.length === 0) {
      output += `No users found. Make sure Microsoft 365 is configured and synced.`;
      return output;
    }

    output += `**Showing ${result.rows.length} of ${totalCount} users:**\n\n`;

    for (const user of result.rows) {
      const status = user.account_enabled ? '' : '(Disabled)';
      const dept = user.department ? `| ${user.department}` : '';

      output += `- **${user.display_name || user.user_principal_name}** ${status}\n`;
      output += `  ${user.mail || user.user_principal_name} ${dept}\n`;
    }

    return output;
  } catch (error: any) {
    logger.error('Error querying MS365 users:', error);
    return `Error querying Microsoft 365 users: ${error.message}. Make sure Microsoft 365 is configured and synced.`;
  }
}

/**
 * Execute get_sync_status tool
 */
export async function executeGetSyncStatus(
  organizationId: string,
  params: { platform?: string }
): Promise<string> {
  try {
    const { platform = 'all' } = params;
    let output = `## Sync Status\n\n`;

    if (platform === 'all' || platform === 'google') {
      // Google Workspace status
      const gwResult = await db.query(
        `SELECT
          is_enabled,
          (SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = $1) as user_count,
          (SELECT COUNT(*) FROM gw_synced_groups WHERE organization_id = $1) as group_count,
          (SELECT MAX(last_synced_at) FROM gw_synced_users WHERE organization_id = $1) as last_user_sync,
          (SELECT MAX(synced_at) FROM gw_synced_groups WHERE organization_id = $1) as last_group_sync
        FROM gw_module_status
        WHERE organization_id = $1`,
        [organizationId]
      );

      if (gwResult.rows.length > 0) {
        const gw = gwResult.rows[0];
        output += `### Google Workspace\n`;
        output += `- **Status:** ${gw.is_enabled ? 'Enabled' : 'Disabled'}\n`;
        output += `- **Users Synced:** ${gw.user_count}\n`;
        output += `- **Groups Synced:** ${gw.group_count}\n`;
        if (gw.last_user_sync) {
          output += `- **Last User Sync:** ${new Date(gw.last_user_sync).toLocaleString()}\n`;
        }
        if (gw.last_group_sync) {
          output += `- **Last Group Sync:** ${new Date(gw.last_group_sync).toLocaleString()}\n`;
        }
        output += '\n';
      } else {
        output += `### Google Workspace\n- **Status:** Not configured\n\n`;
      }
    }

    if (platform === 'all' || platform === 'microsoft') {
      // Microsoft 365 status
      const msResult = await db.query(
        `SELECT
          is_configured, is_active, last_sync_at,
          (SELECT COUNT(*) FROM microsoft_users WHERE organization_id = $1) as user_count,
          (SELECT COUNT(*) FROM microsoft_groups WHERE organization_id = $1) as group_count
        FROM microsoft_config
        WHERE organization_id = $1`,
        [organizationId]
      );

      if (msResult.rows.length > 0) {
        const ms = msResult.rows[0];
        output += `### Microsoft 365\n`;
        output += `- **Status:** ${ms.is_active ? 'Active' : (ms.is_configured ? 'Configured' : 'Disabled')}\n`;
        output += `- **Users Synced:** ${ms.user_count}\n`;
        output += `- **Groups Synced:** ${ms.group_count}\n`;
        if (ms.last_sync_at) {
          output += `- **Last Sync:** ${new Date(ms.last_sync_at).toLocaleString()}\n`;
        }
        output += '\n';
      } else {
        output += `### Microsoft 365\n- **Status:** Not configured\n\n`;
      }
    }

    return output;
  } catch (error: any) {
    logger.error('Error getting sync status:', error);
    return `Error getting sync status: ${error.message}`;
  }
}

/**
 * All data query tool definitions
 */
export const dataQueryTools = [
  queryGwUsersToolDefinition,
  queryGwGroupsToolDefinition,
  queryMs365UsersToolDefinition,
  getSyncStatusToolDefinition
];

/**
 * Execute a data query tool by name
 */
export async function executeDataQueryTool(
  toolName: string,
  organizationId: string,
  params: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case 'query_gw_users':
      return executeQueryGwUsers(organizationId, params as Parameters<typeof executeQueryGwUsers>[1]);
    case 'query_gw_groups':
      return executeQueryGwGroups(organizationId, params as Parameters<typeof executeQueryGwGroups>[1]);
    case 'query_ms365_users':
      return executeQueryMs365Users(organizationId, params as Parameters<typeof executeQueryMs365Users>[1]);
    case 'get_sync_status':
      return executeGetSyncStatus(organizationId, params as Parameters<typeof executeGetSyncStatus>[1]);
    default:
      return `Unknown data query tool: ${toolName}`;
  }
}
