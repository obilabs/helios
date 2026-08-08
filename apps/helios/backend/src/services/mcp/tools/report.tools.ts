import { db } from '../../../database/connection.js';
import { logger } from '../../../utils/logger.js';
import { listUsers, UserQueryResult } from './user.tools.js';
import { listGroups, GroupQueryResult } from './group.tools.js';

/**
 * Dashboard stats summary
 */
export interface DashboardStats {
  users: {
    total: number;
    active: number;
    suspended: number;
    deleted: number;
    guests: number;
    admins: number;
  };
  groups: {
    total: number;
    static: number;
    dynamic: number;
  };
  integrations: {
    googleWorkspace: { connected: boolean; usersSynced: number; lastSync?: string };
    microsoft365: { connected: boolean; usersSynced: number; lastSync?: string };
  };
  activity: {
    loginsLast24h: number;
    loginsLast7d: number;
    usersNeverLoggedIn: number;
  };
}

/**
 * Report format options
 */
export type ReportFormat = 'table' | 'csv' | 'json' | 'markdown';

/**
 * Report types available
 */
export type ReportType = 'user_list' | 'inactive_users' | 'group_membership' | 'license_usage' | 'audit_summary';

// Tool Definitions for MCP

/**
 * Generate report tool
 */
export const generateReportToolDefinition = {
  name: 'generate_report',
  description: 'Generate a formatted report on users, groups, or organization data. Returns data in table, CSV, JSON, or markdown format.',
  parameters: {
    type: 'object',
    properties: {
      reportType: {
        type: 'string',
        enum: ['user_list', 'inactive_users', 'group_membership', 'license_usage', 'audit_summary'],
        description: 'Type of report to generate'
      },
      format: {
        type: 'string',
        enum: ['table', 'csv', 'json', 'markdown'],
        description: 'Output format (default: table)'
      },
      filters: {
        type: 'object',
        description: 'Optional filters for the report',
        properties: {
          department: { type: 'string' },
          status: { type: 'string' },
          dateRange: { type: 'number', description: 'Number of days to include' }
        }
      },
      limit: {
        type: 'number',
        description: 'Maximum rows in report (default: 100)',
        default: 100
      }
    },
    required: ['reportType']
  }
};

/**
 * Get dashboard stats tool
 */
export const getDashboardStatsToolDefinition = {
  name: 'get_dashboard_stats',
  description: 'Get summary statistics for the organization dashboard including user counts, group counts, and integration status.',
  parameters: {
    type: 'object',
    properties: {},
    required: [] as string[]
  }
};

// Tool Implementations

/**
 * Get dashboard statistics
 */
export async function getDashboardStats(organizationId: string): Promise<DashboardStats> {
  try {
    // User counts
    const userCountsQuery = `
      SELECT
        COUNT(*) FILTER (WHERE user_status != 'deleted') as total,
        COUNT(*) FILTER (WHERE user_status = 'active') as active,
        COUNT(*) FILTER (WHERE user_status = 'suspended') as suspended,
        COUNT(*) FILTER (WHERE user_status = 'deleted') as deleted,
        COUNT(*) FILTER (WHERE employee_type = 'guest') as guests,
        COUNT(*) FILTER (WHERE role = 'admin') as admins
      FROM organization_users
      WHERE organization_id = $1
    `;
    const userCounts = await db.query(userCountsQuery, [organizationId]);

    // Group counts
    const groupCountsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE group_type = 'static' OR group_type IS NULL) as static,
        COUNT(*) FILTER (WHERE group_type = 'dynamic') as dynamic
      FROM access_groups
      WHERE organization_id = $1
    `;
    const groupCounts = await db.query(groupCountsQuery, [organizationId]);

    // Google Workspace integration status
    const gwQuery = `
      SELECT
        (SELECT COUNT(*) FROM gw_synced_users WHERE organization_id = $1) as users_synced,
        (SELECT last_sync_at FROM gw_credentials WHERE organization_id = $1) as last_sync
    `;
    const gwResult = await db.query(gwQuery, [organizationId]);

    // Microsoft 365 integration status
    const msQuery = `
      SELECT
        (SELECT COUNT(*) FROM ms_synced_users WHERE organization_id = $1) as users_synced,
        (SELECT last_sync_at FROM ms_credentials WHERE organization_id = $1) as last_sync
    `;
    let msResult;
    try {
      msResult = await db.query(msQuery, [organizationId]);
    } catch {
      // Table may not exist
      msResult = { rows: [{ users_synced: 0, last_sync: null }] };
    }

    // Activity stats
    const activityQuery = `
      SELECT
        COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '24 hours') as logins_24h,
        COUNT(*) FILTER (WHERE last_login_at >= NOW() - INTERVAL '7 days') as logins_7d,
        COUNT(*) FILTER (WHERE last_login_at IS NULL) as never_logged_in
      FROM organization_users
      WHERE organization_id = $1 AND user_status = 'active'
    `;
    const activity = await db.query(activityQuery, [organizationId]);

    const uc = userCounts.rows[0];
    const gc = groupCounts.rows[0];
    const gw = gwResult.rows[0] || { users_synced: 0, last_sync: null };
    const ms = msResult.rows[0] || { users_synced: 0, last_sync: null };
    const act = activity.rows[0];

    return {
      users: {
        total: parseInt(uc.total || '0', 10),
        active: parseInt(uc.active || '0', 10),
        suspended: parseInt(uc.suspended || '0', 10),
        deleted: parseInt(uc.deleted || '0', 10),
        guests: parseInt(uc.guests || '0', 10),
        admins: parseInt(uc.admins || '0', 10)
      },
      groups: {
        total: parseInt(gc.total || '0', 10),
        static: parseInt(gc.static || '0', 10),
        dynamic: parseInt(gc.dynamic || '0', 10)
      },
      integrations: {
        googleWorkspace: {
          connected: parseInt(gw.users_synced || '0', 10) > 0,
          usersSynced: parseInt(gw.users_synced || '0', 10),
          lastSync: gw.last_sync ? new Date(gw.last_sync).toISOString() : undefined
        },
        microsoft365: {
          connected: parseInt(ms.users_synced || '0', 10) > 0,
          usersSynced: parseInt(ms.users_synced || '0', 10),
          lastSync: ms.last_sync ? new Date(ms.last_sync).toISOString() : undefined
        }
      },
      activity: {
        loginsLast24h: parseInt(act.logins_24h || '0', 10),
        loginsLast7d: parseInt(act.logins_7d || '0', 10),
        usersNeverLoggedIn: parseInt(act.never_logged_in || '0', 10)
      }
    };
  } catch (error: any) {
    logger.error('Failed to get dashboard stats for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to get dashboard stats: ${error.message}`);
  }
}

/**
 * Generate a report
 */
export async function generateReport(
  organizationId: string,
  params: {
    reportType: ReportType;
    format?: ReportFormat;
    filters?: {
      department?: string;
      status?: string;
      dateRange?: number;
    };
    limit?: number;
  }
): Promise<string> {
  try {
    const { reportType, format = 'table', filters = {}, limit = 100 } = params;

    switch (reportType) {
      case 'user_list':
        return generateUserListReport(organizationId, format, filters, limit);
      case 'inactive_users':
        return generateInactiveUsersReport(organizationId, format, filters.dateRange || 30, limit);
      case 'group_membership':
        return generateGroupMembershipReport(organizationId, format, limit);
      case 'audit_summary':
        return generateAuditSummaryReport(organizationId, format, filters.dateRange || 7, limit);
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }
  } catch (error: any) {
    logger.error('Failed to generate report for AI tool', { error: error.message, organizationId });
    throw new Error(`Failed to generate report: ${error.message}`);
  }
}

/**
 * Generate user list report
 */
async function generateUserListReport(
  organizationId: string,
  format: ReportFormat,
  filters: { department?: string; status?: string },
  limit: number
): Promise<string> {
  const result = await listUsers(organizationId, {
    department: filters.department,
    status: filters.status || 'active',
    limit
  });

  const headers = ['Name', 'Email', 'Department', 'Job Title', 'Status', 'Role', 'Last Login'];
  const rows = result.users.map(u => [
    `${u.firstName} ${u.lastName}`,
    u.email,
    u.department || '',
    u.jobTitle || '',
    u.status,
    u.role,
    u.lastLogin ? new Date(u.lastLogin).toLocaleDateString() : 'Never'
  ]);

  return formatReportOutput(headers, rows, format, `User List Report (${result.total} total users)`);
}

/**
 * Generate inactive users report
 */
async function generateInactiveUsersReport(
  organizationId: string,
  format: ReportFormat,
  days: number,
  limit: number
): Promise<string> {
  const query = `
    SELECT
      first_name as "firstName",
      last_name as "lastName",
      email,
      department,
      job_title as "jobTitle",
      last_login_at as "lastLogin",
      created_at as "createdAt"
    FROM organization_users
    WHERE organization_id = $1
      AND user_status = 'active'
      AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '${days} days')
    ORDER BY last_login_at NULLS FIRST
    LIMIT $2
  `;

  const result = await db.query(query, [organizationId, limit]);

  const headers = ['Name', 'Email', 'Department', 'Last Login', 'Days Inactive'];
  const rows = result.rows.map((u: any) => {
    const lastLogin = u.lastLogin ? new Date(u.lastLogin) : null;
    const daysInactive = lastLogin
      ? Math.floor((Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24))
      : 'Never logged in';

    return [
      `${u.firstName} ${u.lastName}`,
      u.email,
      u.department || '',
      lastLogin ? lastLogin.toLocaleDateString() : 'Never',
      String(daysInactive)
    ];
  });

  return formatReportOutput(
    headers,
    rows,
    format,
    `Inactive Users Report (no login in ${days}+ days, ${result.rows.length} users)`
  );
}

/**
 * Generate group membership report
 */
async function generateGroupMembershipReport(
  organizationId: string,
  format: ReportFormat,
  limit: number
): Promise<string> {
  const result = await listGroups(organizationId, {
    includeMembers: false,
    limit
  });

  const headers = ['Group Name', 'Description', 'Type', 'Members', 'Email'];
  const rows = result.groups.map(g => [
    g.name,
    g.description || '',
    g.groupType,
    String(g.memberCount),
    g.email || ''
  ]);

  return formatReportOutput(
    headers,
    rows,
    format,
    `Group Membership Report (${result.total} groups)`
  );
}

/**
 * Generate audit summary report
 */
async function generateAuditSummaryReport(
  organizationId: string,
  format: ReportFormat,
  days: number,
  limit: number
): Promise<string> {
  const query = `
    SELECT
      action,
      COUNT(*) as count,
      MIN(created_at) as first_occurrence,
      MAX(created_at) as last_occurrence
    FROM audit_logs
    WHERE organization_id = $1
      AND created_at >= NOW() - INTERVAL '${days} days'
    GROUP BY action
    ORDER BY count DESC
    LIMIT $2
  `;

  const result = await db.query(query, [organizationId, limit]);

  const headers = ['Action', 'Count', 'First Occurrence', 'Last Occurrence'];
  const rows = result.rows.map((r: any) => [
    r.action,
    String(r.count),
    new Date(r.first_occurrence).toLocaleString(),
    new Date(r.last_occurrence).toLocaleString()
  ]);

  return formatReportOutput(
    headers,
    rows,
    format,
    `Audit Summary Report (last ${days} days)`
  );
}

/**
 * Format report output based on requested format
 */
function formatReportOutput(
  headers: string[],
  rows: string[][],
  format: ReportFormat,
  title: string
): string {
  switch (format) {
    case 'csv':
      return formatCSV(headers, rows);
    case 'json':
      return formatJSON(headers, rows);
    case 'markdown':
      return formatMarkdown(headers, rows, title);
    case 'table':
    default:
      return formatTable(headers, rows, title);
  }
}

/**
 * Format as CSV
 */
function formatCSV(headers: string[], rows: string[][]): string {
  const escapeCSV = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const csvRows = [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(','))
  ];

  return csvRows.join('\n');
}

/**
 * Format as JSON
 */
function formatJSON(headers: string[], rows: string[][]): string {
  const data = rows.map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header.toLowerCase().replace(/ /g, '_')] = row[index];
    });
    return obj;
  });

  return JSON.stringify(data, null, 2);
}

/**
 * Format as Markdown table
 */
function formatMarkdown(headers: string[], rows: string[][], title: string): string {
  let result = `## ${title}\n\n`;
  result += '| ' + headers.join(' | ') + ' |\n';
  result += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

  for (const row of rows) {
    result += '| ' + row.join(' | ') + ' |\n';
  }

  return result;
}

/**
 * Format as ASCII table
 */
function formatTable(headers: string[], rows: string[][], title: string): string {
  // Calculate column widths
  const colWidths = headers.map((header, index) => {
    const maxRowWidth = rows.reduce((max, row) => Math.max(max, (row[index] || '').length), 0);
    return Math.max(header.length, maxRowWidth, 5);
  });

  const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
  const headerRow = '| ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' | ') + ' |';

  let result = `${title}\n\n`;
  result += separator + '\n';
  result += headerRow + '\n';
  result += separator + '\n';

  for (const row of rows) {
    result += '| ' + row.map((cell, i) => (cell || '').padEnd(colWidths[i])).join(' | ') + ' |\n';
  }

  result += separator + '\n';
  result += `\n${rows.length} rows`;

  return result;
}

/**
 * Format dashboard stats for LLM context
 */
export function formatDashboardStatsForLLM(stats: DashboardStats): string {
  let result = `**Organization Dashboard Summary**\n\n`;

  result += `**Users:**\n`;
  result += `- Total: ${stats.users.total}\n`;
  result += `- Active: ${stats.users.active}\n`;
  result += `- Suspended: ${stats.users.suspended}\n`;
  result += `- Guests: ${stats.users.guests}\n`;
  result += `- Administrators: ${stats.users.admins}\n\n`;

  result += `**Groups:**\n`;
  result += `- Total: ${stats.groups.total}\n`;
  result += `- Static: ${stats.groups.static}\n`;
  result += `- Dynamic: ${stats.groups.dynamic}\n\n`;

  result += `**Integrations:**\n`;
  if (stats.integrations.googleWorkspace.connected) {
    result += `- Google Workspace: Connected (${stats.integrations.googleWorkspace.usersSynced} users synced)\n`;
    if (stats.integrations.googleWorkspace.lastSync) {
      result += `  Last sync: ${stats.integrations.googleWorkspace.lastSync}\n`;
    }
  } else {
    result += `- Google Workspace: Not connected\n`;
  }

  if (stats.integrations.microsoft365.connected) {
    result += `- Microsoft 365: Connected (${stats.integrations.microsoft365.usersSynced} users synced)\n`;
    if (stats.integrations.microsoft365.lastSync) {
      result += `  Last sync: ${stats.integrations.microsoft365.lastSync}\n`;
    }
  } else {
    result += `- Microsoft 365: Not connected\n`;
  }

  result += `\n**Recent Activity:**\n`;
  result += `- Logins (last 24h): ${stats.activity.loginsLast24h}\n`;
  result += `- Logins (last 7 days): ${stats.activity.loginsLast7d}\n`;
  result += `- Users never logged in: ${stats.activity.usersNeverLoggedIn}\n`;

  return result;
}
