/**
 * MCP Tool: list_commands
 *
 * Lists all available Developer Console commands, optionally filtered by category.
 * Use this to discover what commands exist before using search_knowledge.
 */

import { listCommands } from '../search.js';

/**
 * Tool definition for MCP/OpenAI function calling
 */
export const listCommandsToolDefinition = {
  name: 'list_commands',
  description: `List all available Developer Console commands.

Use this to:
- Discover what commands are available
- See commands grouped by category
- Find command names before getting detailed info

Optional category filter: "google-workspace", "microsoft-365", "api", "system"`,
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['all', 'google-workspace', 'microsoft-365', 'api', 'system'],
        description: 'Filter by category. Defaults to "all"'
      }
    },
    required: [] as string[]
  }
};

/**
 * Execute the list_commands tool
 */
export async function executeListCommands(params: {
  category?: string;
} = {}): Promise<string> {
  const { category = 'all' } = params;

  const commands = listCommands(category === 'all' ? undefined : category);

  if (commands.length === 0) {
    return `No commands found for category "${category}".\n\nAvailable categories: google-workspace, microsoft-365, api, system`;
  }

  // Group commands by subcategory
  const grouped: Record<string, typeof commands> = {};
  for (const cmd of commands) {
    const group = cmd.subcategory || cmd.category;
    if (!grouped[group]) {
      grouped[group] = [];
    }
    grouped[group].push(cmd);
  }

  // Format output
  let output = `# Available Commands`;
  if (category !== 'all') {
    output += ` (${category})`;
  }
  output += `\n\nTotal: ${commands.length} commands\n\n`;

  for (const [group, cmds] of Object.entries(grouped)) {
    output += `## ${formatGroupName(group)}\n\n`;

    for (const cmd of cmds) {
      output += `- **${cmd.title}** - ${cmd.summary}\n`;
    }
    output += '\n';
  }

  output += `---\n\nUse \`get_command({ name: "command name" })\` for detailed info on a specific command.\n`;
  output += `Use \`search_knowledge({ query: "what you want to do" })\` to find commands by task.`;

  return output;
}

/**
 * Format group name for display
 */
function formatGroupName(group: string): string {
  const names: Record<string, string> = {
    'google-workspace': 'Google Workspace',
    'microsoft-365': 'Microsoft 365',
    'api': 'API Endpoints',
    'system': 'System Commands',
    'developer-console': 'Developer Console'
  };
  return names[group] || group.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
