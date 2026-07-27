/**
 * MCP Tool: search_knowledge
 *
 * Searches the Helios knowledge base for commands, API endpoints,
 * guides, and documentation. AI should ALWAYS use this before
 * answering questions about how to do something.
 */

import { searchKnowledge, getSuggestions } from '../search.js';
import { KnowledgeType } from '../types.js';

/**
 * Tool definition for MCP/OpenAI function calling
 */
export const searchKnowledgeToolDefinition = {
  name: 'search_knowledge',
  description: `Search Helios knowledge base for commands, API endpoints, guides, and documentation.

IMPORTANT: ALWAYS use this tool BEFORE answering questions about:
- How to do something in Helios
- What commands are available
- API endpoints and their usage
- Feature configuration

Returns relevant documentation with exact commands and syntax.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What you want to find. Examples: "list users", "create group", "sync google", "api endpoints"'
      },
      type: {
        type: 'string',
        enum: ['all', 'command', 'api', 'guide', 'feature', 'troubleshooting', 'setting'],
        description: 'Filter by content type. Use "command" when looking for Developer Console commands.'
      },
      category: {
        type: 'string',
        description: 'Filter by category. Examples: "google-workspace", "microsoft-365", "developer-console"'
      },
      limit: {
        type: 'number',
        description: 'Maximum results to return (default: 5, max: 10)'
      }
    },
    required: ['query']
  }
};

/**
 * Execute the search_knowledge tool
 */
export async function executeSearchKnowledge(params: {
  query: string;
  type?: KnowledgeType | 'all';
  category?: string;
  limit?: number;
}): Promise<string> {
  const { query, type, category, limit = 5 } = params;

  // Cap limit at 10
  const effectiveLimit = Math.min(limit, 10);

  const response = searchKnowledge(query, {
    type: type as KnowledgeType | 'all',
    category,
    limit: effectiveLimit
  });

  if (response.results.length === 0) {
    const suggestions = getSuggestions(query);
    let message = `No results found for "${query}".`;

    if (suggestions.length > 0) {
      message += '\n\nSuggestions:\n' + suggestions.map(s => `- ${s}`).join('\n');
    }

    message += '\n\nTry using list_commands to see all available commands.';
    return message;
  }

  // Format results
  let output = `Found ${response.results.length} result(s) for "${query}"`;
  if (response.totalFound > response.results.length) {
    output += ` (showing top ${response.results.length} of ${response.totalFound})`;
  }
  output += ':\n\n';

  for (const result of response.results) {
    const { entry, matchedOn } = result;

    output += `## ${entry.title}\n`;
    output += `**Type:** ${entry.type} | **Category:** ${entry.subcategory || entry.category}\n\n`;

    // Show summary first
    output += `${entry.summary}\n\n`;

    // Show full content for commands, truncate for others
    if (entry.type === 'command') {
      output += entry.content + '\n\n';
    } else {
      // Truncate long content
      const maxLength = 500;
      if (entry.content.length > maxLength) {
        output += entry.content.substring(0, maxLength) + '...\n\n';
      } else {
        output += entry.content + '\n\n';
      }
    }

    // Show first example if available
    if (entry.examples && entry.examples.length > 0) {
      const ex = entry.examples[0];
      output += `**Example:** ${ex.description}\n`;
      output += '```\n' + ex.code + '\n```\n\n';
    }

    // Show related entries
    if (entry.relatedIds && entry.relatedIds.length > 0) {
      output += `**Related:** ${entry.relatedIds.slice(0, 3).join(', ')}\n\n`;
    }

    output += '---\n\n';
  }

  return output;
}
