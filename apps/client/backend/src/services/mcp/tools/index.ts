/**
 * MCP Tools - Read-only query tools for AI Assistant
 *
 * These tools provide read-only access to Helios data for the AI assistant.
 * The AI can query users, groups, and generate reports, but cannot modify data.
 * It can also generate commands/scripts for users to execute themselves.
 */

// Help Search Tool
export {
  helpSearchToolDefinition,
  searchHelp,
  HelpSearchResult
} from './help-search.tool.js';

// User Tools
export {
  listUsersToolDefinition,
  getUserToolDefinition,
  getUserActivityToolDefinition,
  listUsers,
  getUser,
  getUserActivity,
  formatUsersForLLM,
  formatUserForLLM,
  formatActivityForLLM,
  UserQueryResult,
  UserActivityRecord
} from './user.tools.js';

// Group Tools
export {
  listGroupsToolDefinition,
  getGroupToolDefinition,
  compareGroupsToolDefinition,
  listGroups,
  getGroup,
  compareGroups,
  formatGroupsForLLM,
  formatGroupForLLM,
  formatComparisonForLLM,
  GroupQueryResult,
  GroupMember,
  GroupComparison
} from './group.tools.js';

// Report Tools
export {
  generateReportToolDefinition,
  getDashboardStatsToolDefinition,
  generateReport,
  getDashboardStats,
  formatDashboardStatsForLLM,
  DashboardStats,
  ReportFormat,
  ReportType
} from './report.tools.js';

// Command Generation Tools
export {
  generateApiCommandToolDefinition,
  generateBulkScriptToolDefinition,
  generateApiCommand,
  generateBulkScript,
  formatCommandForLLM,
  formatScriptForLLM,
  CommandFormat,
  CommandAction,
  GeneratedCommand,
  GeneratedScript
} from './command.tools.js';

/**
 * All tool definitions for registration with MCP server
 */
export const allToolDefinitions = [
  // Help
  'helpSearchToolDefinition',
  // Users
  'listUsersToolDefinition',
  'getUserToolDefinition',
  'getUserActivityToolDefinition',
  // Groups
  'listGroupsToolDefinition',
  'getGroupToolDefinition',
  'compareGroupsToolDefinition',
  // Reports
  'generateReportToolDefinition',
  'getDashboardStatsToolDefinition',
  // Commands
  'generateApiCommandToolDefinition',
  'generateBulkScriptToolDefinition'
];
