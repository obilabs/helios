import { db } from '../../../database/connection.js';
import { logger } from '../../../utils/logger.js';

/**
 * Group data returned from queries
 */
export interface GroupQueryResult {
  id: string;
  name: string;
  description?: string;
  email?: string;
  memberCount: number;
  groupType: string;
  source: 'helios' | 'google' | 'microsoft';
  createdAt: string;
  members?: GroupMember[];
}

/**
 * Group member information
 */
export interface GroupMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
}

/**
 * Group comparison result
 */
export interface GroupComparison {
  group1: { id: string; name: string; memberCount: number };
  group2: { id: string; name: string; memberCount: number };
  inBoth: GroupMember[];
  onlyInGroup1: GroupMember[];
  onlyInGroup2: GroupMember[];
  overlapPercentage: number;
}

// Tool Definitions for MCP

/**
 * List groups tool
 */
export const listGroupsToolDefinition = {
  name: 'list_groups',
  description: 'List groups in the organization with optional filters. Returns group details including name, member count, and type.',
  parameters: {
    type: 'object',
    properties: {
      search: {
        type: 'string',
        description: 'Search by group name or email'
      },
      groupType: {
        type: 'string',
        enum: ['static', 'dynamic', 'all'],
        description: 'Filter by group type (default: all)'
      },
      source: {
        type: 'string',
        enum: ['helios', 'google', 'microsoft', 'all'],
        description: 'Filter by group source (default: all)'
      },
      includeMembers: {
        type: 'boolean',
        description: 'Include member list (default: false)',
        default: false
      },
      limit: {
        type: 'number',
        description: 'Maximum number of groups to return (default: 50)',
        default: 50
      },
      offset: {
        type: 'number',
        description: 'Number of groups to skip for pagination',
        default: 0
      }
    },
    required: [] as string[]
  }
};

/**
 * Get group details tool
 */
export const getGroupToolDefinition = {
  name: 'get_group',
  description: 'Get detailed information about a specific group including its members.',
  parameters: {
    type: 'object',
    properties: {
      groupId: {
        type: 'string',
        description: 'Group ID to look up'
      },
      groupName: {
        type: 'string',
        description: 'Group name to look up (alternative to groupId)'
      },
      includeMembers: {
        type: 'boolean',
        description: 'Include member list (default: true)',
        default: true
      }
    },
    required: [] as string[]
  }
};

/**
 * Compare groups tool
 */
export const compareGroupsToolDefinition = {
  name: 'compare_groups',
  description: 'Compare two groups to show overlap and differences in membership.',
  parameters: {
    type: 'object',
    properties: {
      group1Id: {
        type: 'string',
        description: 'First group ID or name'
      },
      group2Id: {
        type: 'string',
        description: 'Second group ID or name'
      }
    },
    required: ['group1Id', 'group2Id']
  }
};

// Tool Implementations

/**
 * List groups with optional filters
 */
export async function listGroups(
  organizationId: string,
  params: {
    search?: string;
    groupType?: string;
    source?: string;
    includeMembers?: boolean;
    limit?: number;
    offset?: number;
  }
): Promise<{ groups: GroupQueryResult[]; total: number; hasMore: boolean }> {
  try {
    const {
      search,
      groupType = 'all',
      source = 'all',
      includeMembers = false,
      limit = 50,
      offset = 0
    } = params;

    const effectiveLimit = Math.min(limit, 200);

    let query = `
      SELECT
        ag.id,
        ag.name,
        ag.description,
        ag.email,
        ag.group_type as "groupType",
        ag.created_at as "createdAt",
        COALESCE(mc.member_count, 0) as "memberCount",
        'helios' as source
      FROM access_groups ag
      LEFT JOIN (
        SELECT group_id, COUNT(*) as member_count
        FROM access_group_members
        GROUP BY group_id
      ) mc ON ag.id = mc.group_id
      WHERE ag.organization_id = $1
    `;

    const queryParams: any[] = [organizationId];
    let paramIndex = 2;

    if (search) {
      query += ` AND (LOWER(ag.name) LIKE LOWER($${paramIndex}) OR LOWER(ag.email) LIKE LOWER($${paramIndex}))`;
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (groupType && groupType !== 'all') {
      query += ` AND ag.group_type = $${paramIndex}`;
      queryParams.push(groupType);
      paramIndex++;
    }

    // Get total count
    const countQuery = query.replace(/SELECT[\s\S]+FROM/, 'SELECT COUNT(*) as total FROM');
    const countResult = await db.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    // Add ordering and pagination
    query += ` ORDER BY ag.name`;
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(effectiveLimit, offset);

    const result = await db.query(query, queryParams);

    const groups: GroupQueryResult[] = [];

    for (const row of result.rows) {
      const group: GroupQueryResult = {
        id: row.id,
        name: row.name,
        description: row.description,
        email: row.email,
        memberCount: parseInt(row.memberCount, 10),
        groupType: row.groupType || 'static',
        source: row.source,
        createdAt: new Date(row.createdAt).toISOString()
      };

      if (includeMembers) {
        group.members = await getGroupMembers(row.id);
      }

      groups.push(group);
    }

    return {
      groups,
      total,
      hasMore: offset + groups.length < total
    };
  } catch (error: any) {
    logger.error('Failed to list groups for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to list groups: ${error.message}`);
  }
}

/**
 * Get group members
 */
async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const query = `
    SELECT
      ou.id,
      ou.email,
      ou.first_name as "firstName",
      ou.last_name as "lastName",
      ou.role
    FROM organization_users ou
    JOIN access_group_members agm ON ou.id = agm.user_id
    WHERE agm.group_id = $1
    ORDER BY ou.last_name, ou.first_name
  `;

  const result = await db.query(query, [groupId]);

  return result.rows.map((row: any) => ({
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role
  }));
}

/**
 * Get detailed group information
 */
export async function getGroup(
  organizationId: string,
  params: {
    groupId?: string;
    groupName?: string;
    includeMembers?: boolean;
  }
): Promise<GroupQueryResult | null> {
  try {
    const { groupId, groupName, includeMembers = true } = params;

    if (!groupId && !groupName) {
      throw new Error('Either groupId or groupName must be provided');
    }

    let query = `
      SELECT
        ag.id,
        ag.name,
        ag.description,
        ag.email,
        ag.group_type as "groupType",
        ag.created_at as "createdAt",
        COALESCE(mc.member_count, 0) as "memberCount",
        'helios' as source
      FROM access_groups ag
      LEFT JOIN (
        SELECT group_id, COUNT(*) as member_count
        FROM access_group_members
        GROUP BY group_id
      ) mc ON ag.id = mc.group_id
      WHERE ag.organization_id = $1
    `;

    const queryParams: any[] = [organizationId];

    if (groupId) {
      query += ` AND ag.id = $2`;
      queryParams.push(groupId);
    } else if (groupName) {
      query += ` AND LOWER(ag.name) = LOWER($2)`;
      queryParams.push(groupName);
    }

    const result = await db.query(query, queryParams);

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const group: GroupQueryResult = {
      id: row.id,
      name: row.name,
      description: row.description,
      email: row.email,
      memberCount: parseInt(row.memberCount, 10),
      groupType: row.groupType || 'static',
      source: row.source,
      createdAt: new Date(row.createdAt).toISOString()
    };

    if (includeMembers) {
      group.members = await getGroupMembers(row.id);
    }

    return group;
  } catch (error: any) {
    logger.error('Failed to get group for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to get group: ${error.message}`);
  }
}

/**
 * Compare two groups
 */
export async function compareGroups(
  organizationId: string,
  params: {
    group1Id: string;
    group2Id: string;
  }
): Promise<GroupComparison | null> {
  try {
    const { group1Id, group2Id } = params;

    // Get both groups with members
    const group1 = await getGroup(organizationId, { groupId: group1Id, groupName: group1Id, includeMembers: true });
    const group2 = await getGroup(organizationId, { groupId: group2Id, groupName: group2Id, includeMembers: true });

    if (!group1 || !group2) {
      return null;
    }

    const members1 = group1.members || [];
    const members2 = group2.members || [];

    const emails1 = new Set(members1.map(m => m.email.toLowerCase()));
    const emails2 = new Set(members2.map(m => m.email.toLowerCase()));

    const inBoth: GroupMember[] = [];
    const onlyInGroup1: GroupMember[] = [];
    const onlyInGroup2: GroupMember[] = [];

    for (const member of members1) {
      if (emails2.has(member.email.toLowerCase())) {
        inBoth.push(member);
      } else {
        onlyInGroup1.push(member);
      }
    }

    for (const member of members2) {
      if (!emails1.has(member.email.toLowerCase())) {
        onlyInGroup2.push(member);
      }
    }

    const totalUnique = emails1.size + emails2.size - inBoth.length;
    const overlapPercentage = totalUnique > 0 ? (inBoth.length / totalUnique) * 100 : 0;

    return {
      group1: { id: group1.id, name: group1.name, memberCount: group1.memberCount },
      group2: { id: group2.id, name: group2.name, memberCount: group2.memberCount },
      inBoth,
      onlyInGroup1,
      onlyInGroup2,
      overlapPercentage: Math.round(overlapPercentage * 10) / 10
    };
  } catch (error: any) {
    logger.error('Failed to compare groups for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to compare groups: ${error.message}`);
  }
}

/**
 * Format group list for LLM context
 */
export function formatGroupsForLLM(groups: GroupQueryResult[], total: number): string {
  if (groups.length === 0) {
    return 'No groups found matching the criteria.';
  }

  let result = `Found ${total} group(s)${groups.length < total ? ` (showing ${groups.length})` : ''}:\n\n`;

  groups.forEach((group, index) => {
    result += `${index + 1}. **${group.name}**\n`;
    if (group.description) result += `   - Description: ${group.description}\n`;
    result += `   - Members: ${group.memberCount}\n`;
    result += `   - Type: ${group.groupType}\n`;
    if (group.email) result += `   - Email: ${group.email}\n`;
    result += '\n';
  });

  return result;
}

/**
 * Format single group for LLM context
 */
export function formatGroupForLLM(group: GroupQueryResult): string {
  let result = `**${group.name}**\n\n`;
  if (group.description) result += `Description: ${group.description}\n`;
  result += `- Type: ${group.groupType}\n`;
  result += `- Members: ${group.memberCount}\n`;
  if (group.email) result += `- Email: ${group.email}\n`;
  result += `- Created: ${group.createdAt}\n\n`;

  if (group.members && group.members.length > 0) {
    result += `**Members:**\n`;
    group.members.forEach((member, index) => {
      result += `${index + 1}. ${member.firstName} ${member.lastName} (${member.email})\n`;
    });
  }

  return result;
}

/**
 * Format group comparison for LLM context
 */
export function formatComparisonForLLM(comparison: GroupComparison): string {
  let result = `**Group Comparison**\n\n`;
  result += `Group 1: ${comparison.group1.name} (${comparison.group1.memberCount} members)\n`;
  result += `Group 2: ${comparison.group2.name} (${comparison.group2.memberCount} members)\n\n`;
  result += `**Overlap:** ${comparison.overlapPercentage}% (${comparison.inBoth.length} users in both)\n\n`;

  if (comparison.inBoth.length > 0) {
    result += `**In Both Groups (${comparison.inBoth.length}):**\n`;
    comparison.inBoth.forEach(m => {
      result += `- ${m.firstName} ${m.lastName} (${m.email})\n`;
    });
    result += '\n';
  }

  if (comparison.onlyInGroup1.length > 0) {
    result += `**Only in ${comparison.group1.name} (${comparison.onlyInGroup1.length}):**\n`;
    comparison.onlyInGroup1.forEach(m => {
      result += `- ${m.firstName} ${m.lastName} (${m.email})\n`;
    });
    result += '\n';
  }

  if (comparison.onlyInGroup2.length > 0) {
    result += `**Only in ${comparison.group2.name} (${comparison.onlyInGroup2.length}):**\n`;
    comparison.onlyInGroup2.forEach(m => {
      result += `- ${m.firstName} ${m.lastName} (${m.email})\n`;
    });
  }

  return result;
}
