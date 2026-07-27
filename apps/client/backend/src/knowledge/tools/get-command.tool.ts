/**
 * MCP Tool: get_command
 *
 * Gets detailed information about a specific Developer Console command.
 * Use when you know the command name and need full syntax/examples.
 */

import { getCommandByName } from '../search.js';

/**
 * Tool definition for MCP/OpenAI function calling
 */
export const getCommandToolDefinition = {
  name: 'get_command',
  description: `Get detailed information about a specific Developer Console command.

Use this when you know the exact command name and need:
- Full syntax and parameters
- Usage examples
- Related commands

Example names: "gw users list", "gw groups create", "ms users list"`,
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The command name (e.g., "gw users list", "gw groups create")'
      }
    },
    required: ['name']
  }
};

/**
 * Execute the get_command tool
 */
export async function executeGetCommand(params: {
  name: string;
}): Promise<string> {
  const { name } = params;

  const command = getCommandByName(name);

  if (!command) {
    return `Command "${name}" not found.

To see available commands, use list_commands().

Common command patterns:
- gw users list - List Google Workspace users
- gw groups list - List Google Workspace groups
- ms users list - List Microsoft 365 users
- api GET /users - API endpoint call`;
  }

  // Format detailed command info
  let output = `# ${command.title}\n\n`;
  output += `**Category:** ${command.subcategory || command.category}\n`;
  output += `**Type:** ${command.type}\n\n`;

  output += `## Description\n${command.summary}\n\n`;

  output += `## Details\n${command.content}\n\n`;

  // Show all examples
  if (command.examples && command.examples.length > 0) {
    output += `## Examples\n\n`;
    for (const ex of command.examples) {
      output += `### ${ex.description}\n`;
      output += '```\n' + ex.code + '\n```\n';
      if (ex.output) {
        output += `Output:\n\`\`\`\n${ex.output}\n\`\`\`\n`;
      }
      output += '\n';
    }
  }

  // Show aliases
  if (command.aliases && command.aliases.length > 0) {
    output += `## Aliases\n`;
    output += command.aliases.map(a => `- \`${a}\``).join('\n') + '\n\n';
  }

  // Show related commands
  if (command.relatedIds && command.relatedIds.length > 0) {
    output += `## Related Commands\n`;
    output += command.relatedIds.map(id => `- ${id}`).join('\n') + '\n';
  }

  return output;
}
