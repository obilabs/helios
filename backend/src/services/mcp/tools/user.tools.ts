import { db } from '../../../database/connection.js';
import { logger } from '../../../utils/logger.js';

/**
 * User data returned from queries
 */
export interface UserQueryResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  department?: string;
  jobTitle?: string;
  location?: string;
  status: string;
  role: string;
  lastLogin?: string;
  createdAt: string;
  source: 'helios' | 'google' | 'microsoft';
  groups?: string[];
}

/**
 * User activity record
 */
export interface UserActivityRecord {
  timestamp: string;
  action: string;
  details?: string;
  ipAddress?: string;
}

// Tool Definitions for MCP

/**
 * List users tool - query users with filters
 */
export const listUsersToolDefinition = {
  name: 'list_users',
  description: 'List users in the organization with optional filters. Returns user details including name, email, department, status, and role.',
  parameters: {
    type: 'object',
    properties: {
      department: {
        type: 'string',
        description: 'Filter by department name'
      },
      status: {
        type: 'string',
        enum: ['active', 'suspended', 'deleted', 'all'],
        description: 'Filter by user status (default: active)'
      },
      role: {
        type: 'string',
        enum: ['admin', 'manager', 'user', 'all'],
        description: 'Filter by role'
      },
      search: {
        type: 'string',
        description: 'Search by name or email'
      },
      source: {
        type: 'string',
        enum: ['helios', 'google', 'microsoft', 'all'],
        description: 'Filter by user source (default: all)'
      },
      limit: {
        type: 'number',
        description: 'Maximum number of users to return (default: 50, max: 200)',
        default: 50
      },
      offset: {
        type: 'number',
        description: 'Number of users to skip for pagination',
        default: 0
      }
    },
    required: [] as string[]
  }
};

/**
 * Get user details tool
 */
export const getUserToolDefinition = {
  name: 'get_user',
  description: 'Get detailed information about a specific user including their groups, recent activity, and profile details.',
  parameters: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'User ID to look up'
      },
      email: {
        type: 'string',
        description: 'User email to look up (alternative to userId)'
      },
      includeGroups: {
        type: 'boolean',
        description: 'Include group memberships (default: true)',
        default: true
      },
      includeActivity: {
        type: 'boolean',
        description: 'Include recent activity (default: false)',
        default: false
      }
    },
    required: [] as string[]
  }
};

/**
 * Get user activity tool
 */
export const getUserActivityToolDefinition = {
  name: 'get_user_activity',
  description: 'Get login history and recent activity for a user.',
  parameters: {
    type: 'object',
    properties: {
      userId: {
        type: 'string',
        description: 'User ID to get activity for'
      },
      email: {
        type: 'string',
        description: 'User email to get activity for (alternative to userId)'
      },
      days: {
        type: 'number',
        description: 'Number of days of activity to return (default: 30)',
        default: 30
      },
      limit: {
        type: 'number',
        description: 'Maximum number of activity records (default: 50)',
        default: 50
      }
    },
    required: [] as string[]
  }
};

// Tool Implementations

/**
 * List users with optional filters
 */
export async function listUsers(
  organizationId: string,
  params: {
    department?: string;
    status?: string;
    role?: string;
    search?: string;
    source?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ users: UserQueryResult[]; total: number; hasMore: boolean }> {
  try {
    const {
      department,
      status = 'active',
      role,
      search,
      source = 'all',
      limit = 50,
      offset = 0
    } = params;

    // Cap limit at 200
    const effectiveLimit = Math.min(limit, 200);

    // Build the query dynamically
    let query = `
      SELECT
        ou.id,
        ou.email,
        ou.first_name as "firstName",
        ou.last_name as "lastName",
        ou.department,
        ou.job_title as "jobTitle",
        ou.location,
        ou.user_status as status,
        ou.role,
        ou.last_login_at as "lastLogin",
        ou.created_at as "createdAt",
        'helios' as source
      FROM organization_users ou
      WHERE ou.organization_id = $1
    `;

    const queryParams: any[] = [organizationId];
    let paramIndex = 2;

    // Add filters
    if (department) {
      query += ` AND LOWER(ou.department) LIKE LOWER($${paramIndex})`;
      queryParams.push(`%${department}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      query += ` AND ou.user_status = $${paramIndex}`;
      queryParams.push(status);
      paramIndex++;
    }

    if (role && role !== 'all') {
      query += ` AND ou.role = $${paramIndex}`;
      queryParams.push(role);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        LOWER(ou.email) LIKE LOWER($${paramIndex}) OR
        LOWER(ou.first_name) LIKE LOWER($${paramIndex}) OR
        LOWER(ou.last_name) LIKE LOWER($${paramIndex}) OR
        LOWER(CONCAT(ou.first_name, ' ', ou.last_name)) LIKE LOWER($${paramIndex})
      )`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]+FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Add ordering and pagination
    query += ` ORDER BY ou.last_name, ou.first_name`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(effectiveLimit, offset);

    const result = await db.query(query, queryParams);

    const users: UserQueryResult[] = result.rows.map((row: any) => ({
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      department: row.department,
      jobTitle: row.jobTitle,
      location: row.location,
      status: row.status || 'active',
      role: row.role,
      lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : undefined,
      createdAt: new Date(row.createdAt).toISOString(),
      source: row.source
    }));

    return {
      users,
      total,
      hasMore: offset + users.length < total
    };
  } catch (error: any) {
    logger.error('Failed to list users for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to list users: ${error.message}`);
  }
}

/**
 * Get detailed user information
 */
export async function getUser(
  organizationId: string,
  params: {
    userId?: string;
    email?: string;
    includeGroups?: boolean;
    includeActivity?: boolean;
  }
): Promise<UserQueryResult | null> {
  try {
    const { userId, email, includeGroups = true, includeActivity = false } = params;

    if (!userId && !email) {
      throw new Error('Either userId or email must be provided');
    }

    // Get user details
    let query = `
      SELECT
        ou.id,
        ou.email,
        ou.first_name as "firstName",
        ou.last_name as "lastName",
        ou.department,
        ou.job_title as "jobTitle",
        ou.location,
        ou.user_status as status,
        ou.role,
        ou.last_login_at as "lastLogin",
        ou.created_at as "createdAt",
        ou.phone,
        ou.mobile_phone as "mobilePhone",
        ou.employee_type as "employeeType",
        ou.cost_center as "costCenter",
        'helios' as source
      FROM organization_users ou
      WHERE ou.organization_id = $1
    `;

    const queryParams: any[] = [organizationId];

    if (userId) {
      query += ` AND ou.id = $2`;
      queryParams.push(userId);
    } else if (email) {
      query += ` AND LOWER(ou.email) = LOWER($2)`;
      queryParams.push(email);
    }

    const result = await db.query(query, queryParams);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const user: UserQueryResult = {
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      department: row.department,
      jobTitle: row.jobTitle,
      location: row.location,
      status: row.status || 'active',
      role: row.role,
      lastLogin: row.lastLogin ? new Date(row.lastLogin).toISOString() : undefined,
      createdAt: new Date(row.createdAt).toISOString(),
      source: row.source
    };

    // Get group memberships if requested
    if (includeGroups) {
      const groupsQuery = `
        SELECT ag.name
        FROM access_groups ag
        JOIN access_group_members agm ON ag.id = agm.group_id
        WHERE agm.user_id = $1 AND ag.organization_id = $2
        ORDER BY ag.name
      `;
      const groupsResult = await db.query(groupsQuery, [row.id, organizationId]);
      user.groups = groupsResult.rows.map((g: any) => g.name);
    }

    return user;
  } catch (error: any) {
    logger.error('Failed to get user for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to get user: ${error.message}`);
  }
}

/**
 * Get user activity/audit logs
 */
export async function getUserActivity(
  organizationId: string,
  params: {
    userId?: string;
    email?: string;
    days?: number;
    limit?: number;
  }
): Promise<UserActivityRecord[]> {
  try {
    const { userId, email, days = 30, limit = 50 } = params;

    if (!userId && !email) {
      throw new Error('Either userId or email must be provided');
    }

    // First resolve email to userId if needed
    let resolvedUserId = userId;
    if (!resolvedUserId && email) {
      const userQuery = `
        SELECT id FROM organization_users
        WHERE organization_id = $1 AND LOWER(email) = LOWER($2)
      `;
      const userResult = await db.query(userQuery, [organizationId, email]);
      if (userResult.rows.length === 0) {
        return [];
      }
      resolvedUserId = userResult.rows[0].id;
    }

    // Query audit logs for the user
    const query = `
      SELECT
        al.action,
        al.details,
        al.ip_address as "ipAddress",
        al.created_at as timestamp
      FROM audit_logs al
      WHERE al.organization_id = $1
        AND al.user_id = $2
        AND al.created_at >= NOW() - INTERVAL '${days} days'
      ORDER BY al.created_at DESC
      LIMIT $3
    `;

    const result = await db.query(query, [organizationId, resolvedUserId, limit]);

    return result.rows.map((row: any) => ({
      timestamp: new Date(row.timestamp).toISOString(),
      action: row.action,
      details: row.details,
      ipAddress: row.ipAddress
    }));
  } catch (error: any) {
    logger.error('Failed to get user activity for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to get user activity: ${error.message}`);
  }
}

/**
 * Format user list for LLM context
 */
export function formatUsersForLLM(users: UserQueryResult[], total: number): string {
  if (users.length === 0) {
    return 'No users found matching the criteria.';
  }

  let result = `Found ${total} user(s)${users.length < total ? ` (showing ${users.length})` : ''}:\n\n`;

  users.forEach((user, index) => {
    result += `${index + 1}. **${user.firstName} ${user.lastName}** (${user.email})\n`;
    result += `   - Status: ${user.status}\n`;
    result += `   - Role: ${user.role}\n`;
    if (user.department) result += `   - Department: ${user.department}\n`;
    if (user.jobTitle) result += `   - Job Title: ${user.jobTitle}\n`;
    if (user.lastLogin) result += `   - Last Login: ${user.lastLogin}\n`;
    if (user.groups && user.groups.length > 0) {
      result += `   - Groups: ${user.groups.join(', ')}\n`;
    }
    result += '\n';
  });

  return result;
}

/**
 * Format single user for LLM context
 */
export function formatUserForLLM(user: UserQueryResult): string {
  let result = `**${user.firstName} ${user.lastName}**\n\n`;
  result += `- Email: ${user.email}\n`;
  result += `- Status: ${user.status}\n`;
  result += `- Role: ${user.role}\n`;
  if (user.department) result += `- Department: ${user.department}\n`;
  if (user.jobTitle) result += `- Job Title: ${user.jobTitle}\n`;
  if (user.location) result += `- Location: ${user.location}\n`;
  if (user.lastLogin) result += `- Last Login: ${user.lastLogin}\n`;
  result += `- Created: ${user.createdAt}\n`;
  if (user.groups && user.groups.length > 0) {
    result += `- Groups: ${user.groups.join(', ')}\n`;
  }
  return result;
}

/**
 * Format activity for LLM context
 */
export function formatActivityForLLM(activity: UserActivityRecord[]): string {
  if (activity.length === 0) {
    return 'No recent activity found for this user.';
  }

  let result = `Recent activity (${activity.length} records):\n\n`;

  activity.forEach((record, index) => {
    result += `${index + 1}. ${record.timestamp} - ${record.action}\n`;
    if (record.details) result += `   Details: ${record.details}\n`;
    if (record.ipAddress) result += `   IP: ${record.ipAddress}\n`;
  });

  return result;
}
