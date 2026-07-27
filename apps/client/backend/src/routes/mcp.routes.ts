/**
 * MCP (Model Context Protocol) Routes
 *
 * Provides endpoints for AI assistant integration:
 * - GET /api/v1/mcp/tools - List available MCP tools
 * - POST /api/v1/mcp/tools/:name - Execute a tool
 * - GET /api/v1/mcp/resources - List available resources
 * - GET /api/v1/mcp/resources/:uri - Read a resource
 *
 * Authentication: Requires Bearer token (user JWT or API key)
 *
 * Note: This is a simplified HTTP-based MCP interface.
 * For full MCP protocol support (stdio, WebSocket), see /mcp endpoint.
 *
 * @openapi
 * tags:
 *   - name: MCP
 *     description: Model Context Protocol integration for AI assistants
 */

import { Router, Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { openApiToMcpTools, getToolDefinitions, OpenApiSpec } from '../mcp/openapi-converter.js';
import { getToolsSummary } from '../mcp/server.js';
import { swaggerSpec } from '../config/swagger.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Use the already-generated OpenAPI spec from swagger config
function getOpenApiSpec(): OpenApiSpec {
  return swaggerSpec as unknown as OpenApiSpec;
}

/**
 * @openapi
 * /api/v1/mcp/info:
 *   get:
 *     summary: Get MCP server information
 *     description: |
 *       Returns information about the Helios MCP server including
 *       available tools count and resources.
 *     tags: [MCP]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: MCP server information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: helios
 *                     version:
 *                       type: string
 *                       example: "1.0.0"
 *                     protocol:
 *                       type: string
 *                       example: "MCP/1.0"
 *                     capabilities:
 *                       type: object
 *                       properties:
 *                         tools:
 *                           type: integer
 *                           description: Number of available tools
 *                         resources:
 *                           type: integer
 *                           description: Number of available resources
 *                     description:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/info', authenticateToken, async (req: Request, res: Response) => {
  try {
    const spec = getOpenApiSpec();
    const tools = getToolDefinitions(spec as Parameters<typeof getToolDefinitions>[0]);

    res.json({
      success: true,
      data: {
        name: 'helios',
        version: '1.0.0',
        protocol: 'MCP/1.0',
        capabilities: {
          tools: tools.length,
          resources: 5,
        },
        description: 'Helios MCP server for AI-assisted organization management',
        documentation: 'https://docs.helios.io/mcp',
      },
      meta: {
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error('MCP info error', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: {
        code: 'MCP_ERROR',
        message: 'Failed to get MCP info',
      },
      meta: { requestId: req.requestId },
    });
  }
});

/**
 * @openapi
 * /api/v1/mcp/tools:
 *   get:
 *     summary: List available MCP tools
 *     description: |
 *       Returns a list of all available MCP tools that can be executed.
 *       Tools are auto-generated from the OpenAPI specification.
 *
 *       Tool naming convention:
 *       - All tools are prefixed with `helios_`
 *       - Uses snake_case: `helios_list_users`, `helios_create_group`
 *       - Common actions: list, get, create, update, delete
 *     tags: [MCP]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by tool category (e.g., users, groups, signatures)
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [full, summary]
 *           default: summary
 *         description: Response detail level
 *     responses:
 *       200:
 *         description: List of available tools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     tools:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                             example: helios_list_users
 *                           description:
 *                             type: string
 *                             example: List all users in the organization
 *                           inputSchema:
 *                             type: object
 *                             description: JSON Schema for tool input
 *                     total:
 *                       type: integer
 *                       example: 150
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/tools', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { category, format = 'summary' } = req.query;
    const spec = getOpenApiSpec();
    const tools = getToolDefinitions(spec as Parameters<typeof getToolDefinitions>[0]);

    let filteredTools = tools;

    // Filter by category if provided
    if (category) {
      const categoryStr = String(category).toLowerCase();
      filteredTools = tools.filter(t => t.name.includes(categoryStr));
    }

    // Return summary or full details
    const toolList = format === 'full'
      ? filteredTools
      : filteredTools.map(t => ({
          name: t.name,
          description: t.description.split('\n')[0],
        }));

    res.json({
      success: true,
      data: {
        tools: toolList,
        total: filteredTools.length,
      },
      meta: {
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error('MCP tools list error', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: {
        code: 'MCP_ERROR',
        message: 'Failed to list tools',
      },
      meta: { requestId: req.requestId },
    });
  }
});

/**
 * @openapi
 * /api/v1/mcp/tools/{name}:
 *   post:
 *     summary: Execute an MCP tool
 *     description: |
 *       Execute a specific MCP tool with the provided arguments.
 *       The tool must exist in the list returned by GET /api/v1/mcp/tools.
 *
 *       Example:
 *       ```json
 *       POST /api/v1/mcp/tools/helios_list_users
 *       {
 *         "limit": 10,
 *         "offset": 0,
 *         "search": "john"
 *       }
 *       ```
 *     tags: [MCP]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Tool name (e.g., helios_list_users)
 *         example: helios_list_users
 *     requestBody:
 *       description: Tool arguments (varies by tool)
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: true
 *           example:
 *             limit: 10
 *             offset: 0
 *     responses:
 *       200:
 *         description: Tool execution result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Tool result (varies by tool)
 *       400:
 *         description: Invalid tool arguments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Tool not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/tools/:name', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const args = req.body || {};

    const spec = getOpenApiSpec();
    const baseUrl = `http://localhost:${process.env.PORT || 3001}`;

    // Get the auth token from request
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const tools = openApiToMcpTools(
      spec as Parameters<typeof openApiToMcpTools>[0],
      baseUrl,
      () => token
    );

    const tool = tools.find(t => t.name === name);
    if (!tool) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool not found: ${name}`,
          availableTools: tools.slice(0, 10).map(t => t.name),
        },
        meta: { requestId: req.requestId },
      });
    }

    logger.info('MCP tool execution', { tool: name, args: Object.keys(args) });

    // Execute the tool
    const result = await tool.handler(args);

    res.json({
      success: true,
      data: result,
      meta: {
        requestId: req.requestId,
        tool: name,
      },
    });
  } catch (error) {
    logger.error('MCP tool execution error', {
      tool: req.params.name,
      error: error instanceof Error ? error.message : error,
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'TOOL_EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Tool execution failed',
      },
      meta: { requestId: req.requestId },
    });
  }
});

/**
 * @openapi
 * /api/v1/mcp/resources:
 *   get:
 *     summary: List available MCP resources
 *     description: |
 *       Returns a list of available resources that can be read by AI assistants.
 *       Resources are read-only data sources like users, groups, and organization info.
 *     tags: [MCP]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of available resources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     resources:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           uri:
 *                             type: string
 *                             example: helios://users
 *                           name:
 *                             type: string
 *                             example: Users List
 *                           description:
 *                             type: string
 *                             example: All users in the organization
 *                           mimeType:
 *                             type: string
 *                             example: application/json
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/resources', authenticateToken, async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
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
      },
      meta: {
        requestId: req.requestId,
      },
    });
  } catch (error) {
    logger.error('MCP resources list error', { error: error instanceof Error ? error.message : error });
    res.status(500).json({
      success: false,
      error: {
        code: 'MCP_ERROR',
        message: 'Failed to list resources',
      },
      meta: { requestId: req.requestId },
    });
  }
});

/**
 * @openapi
 * /api/v1/mcp/resources/{uri}:
 *   get:
 *     summary: Read an MCP resource
 *     description: |
 *       Read the contents of a specific resource.
 *       The URI must match one from the resources list.
 *
 *       Available resources:
 *       - `helios://organization` - Organization info
 *       - `helios://users` - All users
 *       - `helios://groups` - All groups
 *       - `helios://departments` - All departments
 *       - `helios://api-schema` - OpenAPI spec
 *     tags: [MCP]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: uri
 *         required: true
 *         schema:
 *           type: string
 *         description: Resource URI (URL encoded)
 *         example: helios://users
 *     responses:
 *       200:
 *         description: Resource contents
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   description: Resource contents (varies by resource)
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Resource not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/resources/:uri(*)', authenticateToken, async (req: Request, res: Response) => {
  try {
    const uri = decodeURIComponent(req.params.uri);
    const baseUrl = `http://localhost:${process.env.PORT || 3001}`;

    // Get the auth token from request
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
        meta: { requestId: req.requestId },
      });
    }

    let data: unknown;

    switch (uri) {
      case 'helios://organization': {
        const response = await fetch(`${baseUrl}/api/v1/organization`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        data = await response.json();
        break;
      }

      case 'helios://users': {
        const response = await fetch(`${baseUrl}/api/v1/organization/users?limit=1000`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        data = await response.json();
        break;
      }

      case 'helios://groups': {
        const response = await fetch(`${baseUrl}/api/v1/organization/access-groups`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        data = await response.json();
        break;
      }

      case 'helios://departments': {
        const response = await fetch(`${baseUrl}/api/v1/organization/departments`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        data = await response.json();
        break;
      }

      case 'helios://api-schema': {
        data = getOpenApiSpec();
        break;
      }

      default:
        return res.status(404).json({
          success: false,
          error: {
            code: 'RESOURCE_NOT_FOUND',
            message: `Resource not found: ${uri}`,
          },
          meta: { requestId: req.requestId },
        });
    }

    res.json({
      success: true,
      data,
      meta: {
        requestId: req.requestId,
        resource: uri,
      },
    });
  } catch (error) {
    logger.error('MCP resource read error', {
      uri: req.params.uri,
      error: error instanceof Error ? error.message : error,
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'RESOURCE_READ_ERROR',
        message: error instanceof Error ? error.message : 'Resource read failed',
      },
      meta: { requestId: req.requestId },
    });
  }
});

export default router;
