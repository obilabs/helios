/**
 * Helios MCP Server
 *
 * Model Context Protocol server for AI assistant integration.
 * Exposes Helios API endpoints as MCP tools that can be called by AI models.
 *
 * Features:
 * - Auto-generates tools from OpenAPI specification
 * - Supports API key authentication
 * - Provides resources for reading organization data
 *
 * @see https://github.com/modelcontextprotocol/typescript-sdk
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { openApiToMcpTools, getToolDefinitions, McpToolDefinition, OpenApiSpec } from './openapi-converter.js';
import { logger } from '../utils/logger.js';

/**
 * MCP Server configuration
 */
interface McpServerConfig {
  /** OpenAPI spec object */
  openApiSpec: OpenApiSpec;
  /** Base URL for API calls */
  baseUrl: string;
  /** Function to get current API key (from request context) */
  getApiKey: () => string | null;
}

/**
 * Initialize and configure the MCP server
 */
export function createMcpServer(config: McpServerConfig): Server {
  const server = new Server(
    {
      name: 'helios',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  );

  // Generate tools from OpenAPI spec
  const tools = openApiToMcpTools(
    config.openApiSpec,
    config.baseUrl,
    config.getApiKey
  );

  // Create a map for quick tool lookup
  const toolMap = new Map<string, McpToolDefinition>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  /**
   * List available tools
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug('MCP: Listing tools', { count: tools.length });

    return {
      tools: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object' as const,
          properties: {},
          required: [] as string[],
        },
      })),
    };
  });

  /**
   * Execute a tool
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    logger.info('MCP: Tool call', { tool: name, args: Object.keys(args || {}) });

    const tool = toolMap.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }

    try {
      // Validate input against schema
      const validatedInput = tool.inputSchema.parse(args);

      // Execute the tool
      const result = await tool.handler(validatedInput);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('MCP: Tool execution failed', {
        tool: name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              message: error instanceof Error ? error.message : 'Tool execution failed',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  /**
   * List available resources
   */
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    logger.debug('MCP: Listing resources');

    return {
      resources: [
        {
          uri: 'helios://organization',
          name: 'Organization Info',
          description: 'Current organization details and settings',
          mimeType: 'application/json',
        },
        {
          uri: 'helios://users',
          name: 'Users List',
          description: 'All users in the organization',
          mimeType: 'application/json',
        },
        {
          uri: 'helios://groups',
          name: 'Groups List',
          description: 'All groups in the organization',
          mimeType: 'application/json',
        },
        {
          uri: 'helios://departments',
          name: 'Departments List',
          description: 'All departments in the organization',
          mimeType: 'application/json',
        },
        {
          uri: 'helios://api-schema',
          name: 'API Schema',
          description: 'OpenAPI specification for all endpoints',
          mimeType: 'application/json',
        },
      ],
    };
  });

  /**
   * Read a resource
   */
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;

    logger.info('MCP: Resource read', { uri });

    const authToken = config.getApiKey();
    if (!authToken) {
      throw new Error('Authentication required');
    }

    try {
      let data: unknown;

      switch (uri) {
        case 'helios://organization': {
          const response = await fetch(`${config.baseUrl}/api/v1/organization`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          data = await response.json();
          break;
        }

        case 'helios://users': {
          const response = await fetch(`${config.baseUrl}/api/v1/organization/users?limit=1000`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          data = await response.json();
          break;
        }

        case 'helios://groups': {
          const response = await fetch(`${config.baseUrl}/api/v1/organization/access-groups`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          data = await response.json();
          break;
        }

        case 'helios://departments': {
          const response = await fetch(`${config.baseUrl}/api/v1/organization/departments`, {
            headers: { Authorization: `Bearer ${authToken}` },
          });
          data = await response.json();
          break;
        }

        case 'helios://api-schema': {
          data = config.openApiSpec;
          break;
        }

        default:
          throw new Error(`Unknown resource: ${uri}`);
      }

      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(data, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error('MCP: Resource read failed', {
        uri,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });

  return server;
}

/**
 * Get a summary of available tools for documentation
 */
export function getToolsSummary(openApiSpec: OpenApiSpec): string[] {
  const tools = getToolDefinitions(openApiSpec);
  return tools.map(t => `${t.name}: ${t.description.split('\n')[0]}`);
}

export default { createMcpServer, getToolsSummary };
