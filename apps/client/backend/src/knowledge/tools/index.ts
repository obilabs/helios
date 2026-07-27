/**
 * Knowledge Base MCP Tools
 *
 * Export all tool definitions and executors for AI integration.
 */

// Tool definitions (for OpenAI/MCP function schemas)
export { searchKnowledgeToolDefinition, executeSearchKnowledge } from './search-knowledge.tool.js';
export { getCommandToolDefinition, executeGetCommand } from './get-command.tool.js';
export { listCommandsToolDefinition, executeListCommands } from './list-commands.tool.js';

// Data query tools (read-only access to actual data)
export {
  queryGwUsersToolDefinition,
  queryGwGroupsToolDefinition,
  queryMs365UsersToolDefinition,
  getSyncStatusToolDefinition,
  dataQueryTools,
  executeDataQueryTool
} from './query-data.tool.js';

// Import tool definitions for the array
import { searchKnowledgeToolDefinition } from './search-knowledge.tool.js';
import { getCommandToolDefinition } from './get-command.tool.js';
import { listCommandsToolDefinition } from './list-commands.tool.js';

/**
 * All knowledge tool definitions (documentation search)
 */
export const knowledgeTools = [
  searchKnowledgeToolDefinition,
  getCommandToolDefinition,
  listCommandsToolDefinition
];

/**
 * Execute a knowledge tool by name
 */
export async function executeKnowledgeTool(
  toolName: string,
  params: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case 'search_knowledge':
      const { executeSearchKnowledge: execSearch } = await import('./search-knowledge.tool.js');
      return execSearch(params as Parameters<typeof execSearch>[0]);

    case 'get_command':
      const { executeGetCommand: execCmd } = await import('./get-command.tool.js');
      return execCmd(params as { name: string });

    case 'list_commands':
      const { executeListCommands: execList } = await import('./list-commands.tool.js');
      return execList(params as { category?: string });

    default:
      return `Unknown tool: ${toolName}. Available tools: search_knowledge, get_command, list_commands`;
  }
}
