import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { llmGatewayService, ChatMessage, Tool, ToolCall, AIRole, OllamaModel, ToolTestResult } from '../services/llm-gateway.service.js';
import { logger } from '../utils/logger.js';
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import { v4 as uuidv4 } from 'uuid';
import {
  searchKnowledgeToolDefinition,
  getCommandToolDefinition,
  listCommandsToolDefinition,
  executeKnowledgeTool,
  dataQueryTools,
  executeDataQueryTool
} from '../knowledge/tools/index.js';

const router = Router();

// All AI routes require authentication
router.use(authenticateToken);

/**
 * @openapi
 * /ai/config:
 *   get:
 *     summary: Get AI Assistant configuration
 *     description: Returns the current AI Assistant configuration for the organization. API keys are masked.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: AI configuration (API keys masked)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isConfigured:
 *                       type: boolean
 *                     isEnabled:
 *                       type: boolean
 *                     primaryEndpointUrl:
 *                       type: string
 *                     primaryModel:
 *                       type: string
 *                     hasPrimaryApiKey:
 *                       type: boolean
 *                     fallbackEndpointUrl:
 *                       type: string
 *                     fallbackModel:
 *                       type: string
 *                     hasFallbackApiKey:
 *                       type: boolean
 *                     toolCallModel:
 *                       type: string
 *                     maxTokensPerRequest:
 *                       type: integer
 *                     temperature:
 *                       type: number
 *                     requestsPerMinuteLimit:
 *                       type: integer
 *                     tokensPerDayLimit:
 *                       type: integer
 */
router.get('/config', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const config = await llmGatewayService.getConfig(organizationId);

    if (!config) {
      successResponse(res, {
        isConfigured: false,
        isEnabled: false
      });
      return;
    }

    // Return config with masked API keys
    successResponse(res, {
      isConfigured: true,
      isEnabled: config.isEnabled,
      primaryEndpointUrl: config.primaryEndpointUrl,
      primaryModel: config.primaryModel,
      hasPrimaryApiKey: !!config.primaryApiKey,
      fallbackEndpointUrl: config.fallbackEndpointUrl || null,
      fallbackModel: config.fallbackModel || null,
      hasFallbackApiKey: !!config.fallbackApiKey,
      toolCallModel: config.toolCallModel || null,
      maxTokensPerRequest: config.maxTokensPerRequest,
      temperature: config.temperature,
      contextWindowTokens: config.contextWindowTokens,
      requestsPerMinuteLimit: config.requestsPerMinuteLimit,
      tokensPerDayLimit: config.tokensPerDayLimit,
      // MCP configuration
      mcpEnabled: config.mcpEnabled,
      mcpTools: config.mcpTools,
      // Custom prompt configuration
      useCustomPrompt: config.useCustomPrompt,
      customSystemPrompt: config.customSystemPrompt || '',
      // AI Role
      aiRole: config.aiRole || 'viewer'
    });
  } catch (error: any) {
    logger.error('Failed to get AI config', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get AI configuration');
  }
});

/**
 * @openapi
 * /ai/config:
 *   put:
 *     summary: Update AI Assistant configuration
 *     description: Save or update AI Assistant configuration. Admin only.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               primaryEndpointUrl:
 *                 type: string
 *                 description: Primary LLM endpoint URL (e.g., https://api.openai.com/v1)
 *               primaryApiKey:
 *                 type: string
 *                 description: API key for primary endpoint (optional for local models)
 *               primaryModel:
 *                 type: string
 *                 description: Model name (e.g., gpt-4o, claude-3-opus)
 *               fallbackEndpointUrl:
 *                 type: string
 *               fallbackApiKey:
 *                 type: string
 *               fallbackModel:
 *                 type: string
 *               toolCallModel:
 *                 type: string
 *                 description: Optional separate model for tool/function calls
 *               isEnabled:
 *                 type: boolean
 *               maxTokensPerRequest:
 *                 type: integer
 *               temperature:
 *                 type: number
 *               requestsPerMinuteLimit:
 *                 type: integer
 *               tokensPerDayLimit:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Configuration saved successfully
 */
router.put('/config', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const {
      primaryEndpointUrl,
      primaryApiKey,
      primaryModel,
      fallbackEndpointUrl,
      fallbackApiKey,
      fallbackModel,
      toolCallModel,
      isEnabled,
      maxTokensPerRequest,
      temperature,
      contextWindowTokens,
      requestsPerMinuteLimit,
      tokensPerDayLimit,
      // MCP configuration
      mcpEnabled,
      mcpTools,
      // Custom prompt configuration
      useCustomPrompt,
      customSystemPrompt,
      // AI Role
      aiRole
    } = req.body;

    // Validate required fields for new config
    const existingConfig = await llmGatewayService.getConfig(organizationId);
    if (!existingConfig && (!primaryEndpointUrl || !primaryModel)) {
      validationErrorResponse(res, [
        { field: 'primaryEndpointUrl', message: 'Primary endpoint URL is required' },
        { field: 'primaryModel', message: 'Primary model is required' }
      ]);
      return;
    }

    await llmGatewayService.saveConfig(organizationId, {
      primaryEndpointUrl,
      primaryApiKey,
      primaryModel,
      fallbackEndpointUrl: fallbackEndpointUrl || undefined,
      fallbackApiKey: fallbackApiKey || undefined,
      fallbackModel: fallbackModel || undefined,
      toolCallModel: toolCallModel || undefined,
      isEnabled,
      maxTokensPerRequest,
      temperature,
      contextWindowTokens,
      requestsPerMinuteLimit,
      tokensPerDayLimit,
      // MCP configuration
      mcpEnabled,
      mcpTools,
      // Custom prompt configuration
      useCustomPrompt,
      customSystemPrompt: customSystemPrompt || undefined,
      // AI Role
      aiRole: aiRole || undefined
    });

    successResponse(res, { message: 'AI configuration saved successfully' });
  } catch (error: any) {
    logger.error('Failed to save AI config', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to save AI configuration');
  }
});

/**
 * @openapi
 * /ai/test-connection:
 *   post:
 *     summary: Test LLM endpoint connection
 *     description: Test connection to an LLM endpoint. Admin only.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - model
 *             properties:
 *               endpoint:
 *                 type: string
 *                 description: LLM endpoint URL
 *               apiKey:
 *                 type: string
 *                 description: API key (optional for local models)
 *               model:
 *                 type: string
 *                 description: Model name to test
 *     responses:
 *       200:
 *         description: Connection test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     modelInfo:
 *                       type: object
 *                       properties:
 *                         model:
 *                           type: string
 *                         responseTime:
 *                           type: integer
 *                     error:
 *                       type: string
 */
router.post('/test-connection', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, apiKey, model } = req.body;

    if (!endpoint || !model) {
      validationErrorResponse(res, [
        !endpoint && { field: 'endpoint', message: 'Endpoint URL is required' },
        !model && { field: 'model', message: 'Model name is required' }
      ].filter(Boolean) as Array<{ field: string; message: string }>);
      return;
    }

    const result = await llmGatewayService.testConnection(endpoint, apiKey, model);
    successResponse(res, result);
  } catch (error: any) {
    logger.error('Connection test failed', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Connection test failed');
  }
});

/**
 * @openapi
 * /ai/models:
 *   get:
 *     summary: List available models from Ollama
 *     description: Returns a list of available models from the configured Ollama endpoint. Admin only.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of available models
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     models:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           size:
 *                             type: number
 *                           sizeFormatted:
 *                             type: string
 *                           estimatedToolSupport:
 *                             type: string
 *                             enum: [likely, unlikely, unknown]
 *                     endpoint:
 *                       type: string
 */
router.get('/models', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    // Use endpoint from query param if provided, otherwise use saved config
    let endpoint: string;
    if (req.query.endpoint && typeof req.query.endpoint === 'string') {
      endpoint = req.query.endpoint;
    } else {
      const config = await llmGatewayService.getConfig(organizationId);
      endpoint = config?.primaryEndpointUrl || 'http://localhost:11434/v1';
    }

    // Clean up the endpoint to get the base Ollama URL (remove /v1/chat/completions)
    endpoint = endpoint.replace(/\/v1(\/chat\/completions)?\/?$/, '');

    const models = await llmGatewayService.listModels(endpoint);
    successResponse(res, { models, endpoint });
  } catch (error: any) {
    logger.error('Failed to list models', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list models: ' + error.message);
  }
});

/**
 * @openapi
 * /ai/test-tools:
 *   post:
 *     summary: Test if a model supports tool/function calling
 *     description: Sends a test prompt with a tool definition to verify the model can make structured tool calls. Admin only.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - endpoint
 *               - model
 *             properties:
 *               endpoint:
 *                 type: string
 *                 description: LLM endpoint URL
 *               apiKey:
 *                 type: string
 *                 description: API key (optional for local models)
 *               model:
 *                 type: string
 *                 description: Model name to test
 *     responses:
 *       200:
 *         description: Tool support test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     supportsTools:
 *                       type: boolean
 *                     testResult:
 *                       type: string
 *                       enum: [success, no_tool_call, parse_error, error]
 *                     details:
 *                       type: string
 */
router.post('/test-tools', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const { endpoint, apiKey, model } = req.body;

    if (!endpoint || !model) {
      validationErrorResponse(res, [
        !endpoint && { field: 'endpoint', message: 'Endpoint is required' },
        !model && { field: 'model', message: 'Model is required' }
      ].filter(Boolean) as Array<{ field: string; message: string }>);
      return;
    }

    const result = await llmGatewayService.testToolSupport(endpoint, apiKey, model);
    successResponse(res, result);
  } catch (error: any) {
    logger.error('Tool support test failed', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message);
  }
});

/**
 * @openapi
 * /ai/chat:
 *   post:
 *     summary: Send a chat message to the AI Assistant
 *     description: Send a message and receive an AI response. Supports multi-turn conversations via sessionId.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: User message
 *               sessionId:
 *                 type: string
 *                 format: uuid
 *                 description: Session ID for multi-turn conversations
 *               pageContext:
 *                 type: string
 *                 description: Current page/route the user is on
 *               includeHistory:
 *                 type: boolean
 *                 default: true
 *                 description: Include conversation history from session
 *     responses:
 *       200:
 *         description: AI response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessionId:
 *                       type: string
 *                       format: uuid
 *                     message:
 *                       type: string
 *                     model:
 *                       type: string
 *                     usage:
 *                       type: object
 *                       properties:
 *                         promptTokens:
 *                           type: integer
 *                         completionTokens:
 *                           type: integer
 *                         totalTokens:
 *                           type: integer
 */
router.post('/chat', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      validationErrorResponse(res, [{ field: 'user', message: 'User not found' }]);
      return;
    }

    const { message, sessionId: providedSessionId, pageContext, includeHistory = true } = req.body;

    if (!message) {
      validationErrorResponse(res, [{ field: 'message', message: 'Message is required' }]);
      return;
    }

    // Use provided session ID or generate new one
    const sessionId = providedSessionId || uuidv4();

    // Get config to check for custom system prompt and MCP settings
    const config = await llmGatewayService.getConfig(organizationId);

    // Build messages array
    const messages: ChatMessage[] = [];

    // Get AI role (defaults to viewer for safety)
    const aiRole: AIRole = config?.aiRole || 'viewer';

    // Add system prompt - use custom if configured, otherwise use default
    // When MCP is enabled, use the tool-aware prompt with role-based permissions
    const systemPrompt = config?.useCustomPrompt && config?.customSystemPrompt
      ? config.customSystemPrompt
      : config?.mcpEnabled
        ? getRoleBasedSystemPrompt(aiRole, pageContext)
        : getSystemPrompt(pageContext);

    messages.push({
      role: 'system',
      content: systemPrompt
    });

    // Include conversation history if requested
    if (includeHistory && providedSessionId) {
      const history = await llmGatewayService.getChatHistory(organizationId, sessionId);
      messages.push(...history);
    }

    // Add current user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message
    };
    messages.push(userMessage);

    // Save user message to history
    await llmGatewayService.saveChatMessage(organizationId, userId, sessionId, userMessage, pageContext);

    // Build AI tools based on role and MCP settings
    // - MCP disabled = no tools at all (admin override to disable AI capabilities)
    // - Viewer role = knowledge/documentation tools only
    // - Operator/Admin role = knowledge tools + data query tools
    const tools: Tool[] = config?.mcpEnabled ? getToolsForRole(aiRole) : [];

    // Send to LLM with optional tools
    let response = await llmGatewayService.complete(organizationId, userId, {
      messages,
      tools: tools.length > 0 ? tools : undefined
    });

    // Handle tool calls - loop until we get a final response
    const MAX_TOOL_ITERATIONS = 5;
    let iterations = 0;

    while (response.message.tool_calls && response.message.tool_calls.length > 0 && iterations < MAX_TOOL_ITERATIONS) {
      iterations++;
      logger.debug('Processing tool calls', { iteration: iterations, toolCalls: response.message.tool_calls.map(tc => tc.function.name) });

      // Add assistant's tool call message to history
      messages.push(response.message);

      // Execute each tool call and add results
      for (const toolCall of response.message.tool_calls) {
        const toolResult = await executeToolCall(toolCall, organizationId);
        const toolMessage: ChatMessage = {
          role: 'tool',
          content: toolResult,
          tool_call_id: toolCall.id,
          name: toolCall.function.name
        };
        messages.push(toolMessage);
      }

      // Call LLM again with tool results
      response = await llmGatewayService.complete(organizationId, userId, {
        messages,
        tools: tools.length > 0 ? tools : undefined
      });
    }

    // Save assistant response to history
    await llmGatewayService.saveChatMessage(organizationId, userId, sessionId, response.message, pageContext);

    successResponse(res, {
      sessionId,
      message: response.message.content,
      model: response.model,
      usage: response.usage,
      endpointUsed: response.endpointUsed
    });
  } catch (error: any) {
    logger.error('AI chat failed', { error: error.message });

    if (error.message.includes('not configured') || error.message.includes('disabled')) {
      errorResponse(res, ErrorCode.CONFIGURATION_ERROR, error.message);
      return;
    }

    if (error.message.includes('Rate limit') || error.message.includes('token limit')) {
      errorResponse(res, ErrorCode.RATE_LIMIT_EXCEEDED, error.message);
      return;
    }

    errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message || 'AI chat failed');
  }
});

/**
 * Get knowledge tools (documentation search) - available to all roles
 */
function getKnowledgeTools(): Tool[] {
  return [
    {
      type: 'function',
      function: searchKnowledgeToolDefinition
    },
    {
      type: 'function',
      function: getCommandToolDefinition
    },
    {
      type: 'function',
      function: listCommandsToolDefinition
    }
  ];
}

/**
 * Get data query tools (read-only data access) - available to operator/admin roles
 */
function getDataQueryTools(): Tool[] {
  return dataQueryTools.map(def => ({
    type: 'function',
    function: def
  }));
}

/**
 * Get AI tools based on user role
 * - viewer: knowledge/documentation only (can ask "how do I...")
 * - operator: knowledge + data queries (can ask "how many users do I have")
 * - admin: knowledge + data queries + future action tools
 */
function getToolsForRole(role: AIRole): Tool[] {
  const tools: Tool[] = [];

  // All roles get knowledge/documentation tools
  tools.push(...getKnowledgeTools());

  // Operator and Admin get data query tools
  if (role === 'operator' || role === 'admin') {
    tools.push(...getDataQueryTools());
  }

  // Future: Admin could get action tools here
  // if (role === 'admin') {
  //   tools.push(...getActionTools());
  // }

  return tools;
}

/**
 * Get all AI tools (knowledge base + data query) - legacy function for backwards compatibility
 */
function getAllAITools(): Tool[] {
  return getToolsForRole('admin');
}

// List of data query tool names (these need organizationId)
const DATA_QUERY_TOOLS = ['query_gw_users', 'query_gw_groups', 'query_ms365_users', 'get_sync_status'];

/**
 * Execute a tool call and return the result
 */
async function executeToolCall(toolCall: ToolCall, organizationId: string): Promise<string> {
  try {
    const params = JSON.parse(toolCall.function.arguments || '{}');
    const toolName = toolCall.function.name;

    // Check if this is a data query tool (needs organizationId)
    if (DATA_QUERY_TOOLS.includes(toolName)) {
      return await executeDataQueryTool(toolName, organizationId, params);
    }

    // Otherwise it's a knowledge tool
    return await executeKnowledgeTool(toolName, params);
  } catch (error: any) {
    logger.error('Tool execution failed', { tool: toolCall.function.name, error: error.message });
    return `Error executing ${toolCall.function.name}: ${error.message}`;
  }
}

/**
 * @openapi
 * /ai/usage:
 *   get:
 *     summary: Get AI usage statistics
 *     description: Returns usage statistics for the AI Assistant. Admin only.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to include in statistics
 *     responses:
 *       200:
 *         description: Usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalRequests:
 *                       type: integer
 *                     totalTokens:
 *                       type: integer
 *                     avgLatencyMs:
 *                       type: number
 *                     errorRate:
 *                       type: number
 *                     byDay:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                           requests:
 *                             type: integer
 *                           tokens:
 *                             type: integer
 *                     byModel:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           model:
 *                             type: string
 *                           requests:
 *                             type: integer
 *                           tokens:
 *                             type: integer
 */
router.get('/usage', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const days = parseInt(req.query.days as string) || 30;
    const stats = await llmGatewayService.getUsageStats(organizationId, days);

    successResponse(res, stats);
  } catch (error: any) {
    logger.error('Failed to get AI usage stats', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to get usage statistics');
  }
});

/**
 * @openapi
 * /ai/status:
 *   get:
 *     summary: Get AI Assistant status (for all users)
 *     description: Returns whether the AI Assistant is enabled and available. For showing/hiding the AI UI.
 *     tags: [AI Assistant]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: AI status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     available:
 *                       type: boolean
 *                       description: Whether AI Assistant is enabled and configured
 */
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      validationErrorResponse(res, [{ field: 'organizationId', message: 'Organization ID not found' }]);
      return;
    }

    const config = await llmGatewayService.getConfig(organizationId);
    const available = config?.isEnabled && !!config?.primaryEndpointUrl && !!config?.primaryModel;

    successResponse(res, { available });
  } catch (error: any) {
    logger.error('Failed to get AI status', { error: error.message });
    // Default to unavailable on error
    successResponse(res, { available: false });
  }
});

/**
 * Generate system prompt based on context
 */
function getSystemPrompt(pageContext?: string): string {
  let contextInfo = '';
  if (pageContext) {
    contextInfo = `\n\nThe user is currently on the ${pageContext} page.`;
  }

  return `You are Helios AI Assistant, a helpful assistant for the Helios Client Portal - a workspace management system that integrates with Google Workspace and Microsoft 365.

## CRITICAL: DO NOT MAKE THINGS UP
- NEVER invent commands, API endpoints, or features that don't exist
- If you are unsure about something, say "I'm not certain about that" instead of guessing
- Only mention features and commands documented below
- This is a PRODUCTION system - incorrect information can cause serious problems

## Your capabilities:
- Answer questions about the Helios platform features
- Help users understand Google Workspace and Microsoft 365 integrations
- Explain user management, groups, and license concepts
- Provide guidance on onboarding/offboarding workflows
- Help troubleshoot common issues
- Provide Developer Console commands (see below)

## Developer Console Commands (Available in Settings > Developer Console):

**NOTE: The "helios" prefix is optional. Use \`gw users list\` or \`users list\` directly.**

### Helios Users (\`users\`) - All organization users
- \`users list\` - List ALL users in Helios (the central source of truth)
- \`users debug\` - Show raw API response for debugging

### Google Workspace Users (\`gw users\`) - Users synced from Google
- \`gw users list\` - List users synced from Google Workspace
- \`gw users get <email>\` - Get detailed user information
- \`gw users create <email> --firstName=X --lastName=Y --password=Z\` - Create new user
- \`gw users update <email> --firstName=X --lastName=Y\` - Update user properties
- \`gw users suspend <email>\` - Suspend user account
- \`gw users restore <email>\` - Restore suspended user
- \`gw users delete <email>\` - Permanently delete user
- \`gw users move <email> --ou=/Staff/Sales\` - Move user to different OU
- \`gw users groups <email>\` - List all groups user belongs to

### Google Workspace Groups (\`gw groups\`)
- \`gw groups list\` - List all groups
- \`gw groups get <group-email>\` - Get group details
- \`gw groups create <email> --name="Name" --description="Desc"\` - Create new group
- \`gw groups update <group-email> --name="New Name"\` - Update group
- \`gw groups delete <group-email>\` - Delete group
- \`gw groups members <group-email>\` - List group members
- \`gw groups add-member <group> <user> --role=MEMBER\` - Add user to group
- \`gw groups remove-member <group> <user>\` - Remove user from group

### Organizational Units (\`gw orgunits\`)
- \`gw orgunits list\` - List all OUs with user counts
- \`gw orgunits get </Staff/Sales>\` - Get OU details
- \`gw orgunits create <parent> --name="Name"\` - Create new OU
- \`gw orgunits update </Staff/Sales> --name="New Name"\` - Update OU
- \`gw orgunits delete </Staff/Sales>\` - Delete OU

### Email Delegation (\`gw delegates\`)
- \`gw delegates list <user-email>\` - List all delegates for user
- \`gw delegates add <user> <delegate>\` - Grant email delegation access
- \`gw delegates remove <user> <delegate>\` - Revoke delegation access

### Sync Operations (\`gw sync\`)
- \`gw sync users\` - Manual sync users from Google
- \`gw sync groups\` - Manual sync groups
- \`gw sync orgunits\` - Manual sync OUs
- \`gw sync all\` - Sync everything at once

### Direct API Access (\`api\`)
- \`api GET <path>\` - Make GET requests
- \`api POST <path> '{json}'\` - Make POST requests
- \`api PATCH <path> '{json}'\` - Make PATCH requests
- \`api DELETE <path>\` - Make DELETE requests

### Console Help
- \`help\` - Show all available commands
- \`examples\` - Show practical usage examples
- \`clear\` - Clear the console

## Your limitations (READ-ONLY AI):
- You CANNOT execute commands - you can only TELL users what commands to run
- You CANNOT create, modify, or delete users, groups, or licenses
- You CANNOT trigger syncs or make configuration changes
- You can ONLY provide information and guide users

## When users ask for help:
1. First, clarify what they're trying to achieve
2. Provide the EXACT command from the list above
3. Explain what the command will do
4. If there's no command for their request, direct them to the appropriate UI page

Be concise, helpful, and professional. Use markdown formatting for clarity.${contextInfo}`;
}

/**
 * Generate role-based system prompt
 * The AI's capabilities are determined by its configured role
 */
function getRoleBasedSystemPrompt(role: AIRole, pageContext?: string): string {
  let contextInfo = '';
  if (pageContext) {
    contextInfo = `\n\nThe user is currently on the ${pageContext} page.`;
  }

  // Role-specific capabilities and limitations
  const roleConfig = {
    viewer: {
      name: 'Viewer',
      canQuery: false,
      canExecuteCommands: false,
      capabilities: [
        'Answer questions about the Helios platform features and how to use them',
        'Search documentation and help content',
        'Explain integrations, concepts, and best practices',
        'Provide Developer Console command syntax (but cannot execute them or query data)'
      ],
      limitations: [
        'You CANNOT query actual data - you do not have access to data query tools',
        'You CANNOT execute any commands - only TELL users what commands to run',
        'You CANNOT create, modify, or delete users, groups, or licenses',
        'For questions like "how many users do I have?", tell the user to use the console command or check the UI'
      ],
      instruction: 'You are in documentation-only mode. Answer how-to questions, but for data queries, tell users to run console commands or check the UI.'
    },
    operator: {
      name: 'Operator',
      canQuery: true,
      canExecuteCommands: false,
      capabilities: [
        '**Query actual organization data** using your data query tools',
        'Answer questions like "how many users?" or "who is in the Sales group?" with REAL data',
        'Answer questions about the Helios platform features',
        'Help users understand integrations and concepts',
        'Provide Developer Console command syntax'
      ],
      limitations: [
        'You CAN query and read data using your tools (query_gw_users, query_gw_groups, etc.)',
        'You CANNOT execute commands - only TELL users what commands to run',
        'You CANNOT create, modify, or delete users, groups, or licenses',
        'You CANNOT trigger syncs or make configuration changes'
      ],
      instruction: 'You have READ access to organization data. Use your query tools to answer data questions. For write operations, tell users the command to run.'
    },
    admin: {
      name: 'Administrator',
      canQuery: true,
      canExecuteCommands: true,
      capabilities: [
        '**Full access** to query and execute operations',
        'Query actual data from Google Workspace and Microsoft 365',
        'Execute commands on behalf of the user when requested',
        'Create, modify, and delete users, groups, and settings',
        'Trigger syncs and configuration changes'
      ],
      limitations: [
        'Always confirm before executing destructive operations (delete, suspend)',
        'Log all actions for audit purposes',
        'Respect rate limits and API quotas'
      ],
      instruction: 'You have full access. Always confirm destructive actions with the user before executing.'
    }
  };

  const config = roleConfig[role];

  return `You are Helios AI Assistant (${config.name} Mode), a helpful assistant for the Helios Client Portal - a workspace management system that integrates with Google Workspace and Microsoft 365.

## YOUR ROLE: ${config.name.toUpperCase()}
${config.instruction}

## CRITICAL RULES

1. **ALWAYS USE TOOLS FOR INFORMATION**
   - Before answering questions about commands, use search_knowledge or list_commands
   - Before answering questions about data, use query_gw_users, query_gw_groups, etc.
   - NEVER guess or make up information

2. **NEVER INVENT INFORMATION**
   - Only provide information that comes from tool results
   - This is a PRODUCTION system - incorrect information causes real problems

3. **TOOL USAGE**
   - \`search_knowledge\` - Find commands and documentation
   - \`list_commands\` - See available commands
   - \`get_command\` - Get detailed command info
   - \`query_gw_users\` - Query Google Workspace users
   - \`query_gw_groups\` - Query Google Workspace groups
   - \`query_ms365_users\` - Query Microsoft 365 users
   - \`get_sync_status\` - Check synchronization status

## YOUR CAPABILITIES
${config.capabilities.map(c => `- ${c}`).join('\n')}

## YOUR LIMITATIONS
${config.limitations.map(l => `- ${l}`).join('\n')}

## COMMAND FORMAT
Commands do NOT require a "helios" prefix. Use: \`gw users list\` not \`helios gw users list\`

Be concise, helpful, and professional. Use markdown formatting.${contextInfo}`;
}

export default router;
