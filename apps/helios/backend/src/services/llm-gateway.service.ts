import { db } from '../database/connection.js';
import { encryptionService } from './encryption.service.js';
import { logger } from '../utils/logger.js';

/**
 * Message format for chat completions (OpenAI-compatible)
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string; // For tool responses
}

/**
 * Tool/function definition
 */
export interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

/**
 * Tool call from assistant response
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/**
 * Completion request options
 */
export interface CompletionOptions {
  messages: ChatMessage[];
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

/**
 * Completion response
 */
export interface CompletionResponse {
  id: string;
  model: string;
  message: ChatMessage;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
  endpointUsed: 'primary' | 'fallback';
}

/**
 * MCP Tools configuration
 */
export interface MCPToolsConfig {
  help: boolean;
  users: boolean;
  groups: boolean;
  reports: boolean;
  commands: boolean;
}

/**
 * AI Role - determines what the AI can do
 * - viewer: Read-only, can query data but cannot execute commands (safest)
 * - operator: Can execute safe operations like sync, list commands
 * - admin: Full access to all operations including create/delete
 */
export type AIRole = 'viewer' | 'operator' | 'admin';

/**
 * AI configuration stored in database
 */
export interface AIConfig {
  id: string;
  organizationId: string;
  primaryEndpointUrl: string;
  primaryApiKey?: string; // Decrypted, will be null if not set
  primaryModel: string;
  fallbackEndpointUrl?: string;
  fallbackApiKey?: string;
  fallbackModel?: string;
  toolCallModel?: string;
  isEnabled: boolean;
  maxTokensPerRequest: number;
  temperature: number;
  contextWindowTokens: number;
  requestsPerMinuteLimit: number;
  tokensPerDayLimit: number;
  // MCP Server configuration
  mcpEnabled: boolean;
  mcpTools: MCPToolsConfig;
  // Custom system prompt
  useCustomPrompt: boolean;
  customSystemPrompt?: string;
  // AI Role (permission level)
  aiRole: AIRole;
}

/**
 * Connection test result
 */
export interface ConnectionTestResult {
  success: boolean;
  message: string;
  modelInfo?: {
    model: string;
    responseTime: number;
  };
  error?: string;
}

/**
 * Rate limiter state per organization
 */
interface RateLimiterState {
  requestCount: number;
  tokenCount: number;
  windowStart: number;
  dayStart: number;
}

/**
 * LLM Gateway Service
 *
 * Handles communication with OpenAI-compatible LLM endpoints.
 * Supports primary/fallback endpoints, rate limiting, and usage logging.
 */
class LLMGatewayService {
  private rateLimiters: Map<string, RateLimiterState> = new Map();

  /**
   * Get AI configuration for an organization
   */
  async getConfig(organizationId: string): Promise<AIConfig | null> {
    try {
      const result = await db.query(
        `SELECT
          id,
          organization_id,
          primary_endpoint_url,
          primary_api_key_encrypted,
          primary_model,
          fallback_endpoint_url,
          fallback_api_key_encrypted,
          fallback_model,
          tool_call_model,
          is_enabled,
          max_tokens_per_request,
          temperature,
          context_window_tokens,
          requests_per_minute_limit,
          tokens_per_day_limit,
          mcp_enabled,
          mcp_tools,
          use_custom_prompt,
          custom_system_prompt,
          ai_role
        FROM ai_config
        WHERE organization_id = $1`,
        [organizationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      const defaultMcpTools: MCPToolsConfig = { help: true, users: true, groups: true, reports: true, commands: true };

      return {
        id: row.id,
        organizationId: row.organization_id,
        primaryEndpointUrl: row.primary_endpoint_url,
        primaryApiKey: row.primary_api_key_encrypted
          ? encryptionService.decrypt(row.primary_api_key_encrypted)
          : undefined,
        primaryModel: row.primary_model,
        fallbackEndpointUrl: row.fallback_endpoint_url || undefined,
        fallbackApiKey: row.fallback_api_key_encrypted
          ? encryptionService.decrypt(row.fallback_api_key_encrypted)
          : undefined,
        fallbackModel: row.fallback_model || undefined,
        toolCallModel: row.tool_call_model || undefined,
        isEnabled: row.is_enabled,
        maxTokensPerRequest: row.max_tokens_per_request,
        temperature: parseFloat(row.temperature),
        contextWindowTokens: row.context_window_tokens,
        requestsPerMinuteLimit: row.requests_per_minute_limit,
        tokensPerDayLimit: row.tokens_per_day_limit,
        mcpEnabled: row.mcp_enabled ?? false,
        mcpTools: row.mcp_tools ?? defaultMcpTools,
        useCustomPrompt: row.use_custom_prompt ?? false,
        customSystemPrompt: row.custom_system_prompt || undefined,
        aiRole: row.ai_role || 'viewer'
      };
    } catch (error) {
      logger.error('Error getting AI config:', error);
      throw error;
    }
  }

  /**
   * Save or update AI configuration
   */
  async saveConfig(organizationId: string, config: Partial<AIConfig>): Promise<void> {
    try {
      const encryptedPrimaryKey = config.primaryApiKey
        ? encryptionService.encrypt(config.primaryApiKey)
        : null;
      const encryptedFallbackKey = config.fallbackApiKey
        ? encryptionService.encrypt(config.fallbackApiKey)
        : null;

      const defaultMcpTools: MCPToolsConfig = { help: true, users: true, groups: true, reports: true, commands: true };

      await db.query(
        `INSERT INTO ai_config (
          organization_id,
          primary_endpoint_url,
          primary_api_key_encrypted,
          primary_model,
          fallback_endpoint_url,
          fallback_api_key_encrypted,
          fallback_model,
          tool_call_model,
          is_enabled,
          max_tokens_per_request,
          temperature,
          context_window_tokens,
          requests_per_minute_limit,
          tokens_per_day_limit,
          mcp_enabled,
          mcp_tools,
          use_custom_prompt,
          custom_system_prompt,
          ai_role
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        ON CONFLICT (organization_id) DO UPDATE SET
          primary_endpoint_url = COALESCE(EXCLUDED.primary_endpoint_url, ai_config.primary_endpoint_url),
          primary_api_key_encrypted = CASE
            WHEN EXCLUDED.primary_api_key_encrypted IS NOT NULL THEN EXCLUDED.primary_api_key_encrypted
            ELSE ai_config.primary_api_key_encrypted
          END,
          primary_model = COALESCE(EXCLUDED.primary_model, ai_config.primary_model),
          fallback_endpoint_url = EXCLUDED.fallback_endpoint_url,
          fallback_api_key_encrypted = EXCLUDED.fallback_api_key_encrypted,
          fallback_model = EXCLUDED.fallback_model,
          tool_call_model = EXCLUDED.tool_call_model,
          is_enabled = COALESCE(EXCLUDED.is_enabled, ai_config.is_enabled),
          max_tokens_per_request = COALESCE(EXCLUDED.max_tokens_per_request, ai_config.max_tokens_per_request),
          temperature = COALESCE(EXCLUDED.temperature, ai_config.temperature),
          context_window_tokens = COALESCE(EXCLUDED.context_window_tokens, ai_config.context_window_tokens),
          requests_per_minute_limit = COALESCE(EXCLUDED.requests_per_minute_limit, ai_config.requests_per_minute_limit),
          tokens_per_day_limit = COALESCE(EXCLUDED.tokens_per_day_limit, ai_config.tokens_per_day_limit),
          mcp_enabled = COALESCE(EXCLUDED.mcp_enabled, ai_config.mcp_enabled),
          mcp_tools = COALESCE(EXCLUDED.mcp_tools, ai_config.mcp_tools),
          use_custom_prompt = COALESCE(EXCLUDED.use_custom_prompt, ai_config.use_custom_prompt),
          custom_system_prompt = EXCLUDED.custom_system_prompt,
          ai_role = COALESCE(EXCLUDED.ai_role, ai_config.ai_role),
          updated_at = NOW()`,
        [
          organizationId,
          config.primaryEndpointUrl || 'https://api.openai.com/v1',
          encryptedPrimaryKey,
          config.primaryModel || 'gpt-4o',
          config.fallbackEndpointUrl || null,
          encryptedFallbackKey,
          config.fallbackModel || null,
          config.toolCallModel || null,
          config.isEnabled ?? false,
          config.maxTokensPerRequest ?? 4096,
          config.temperature ?? 0.7,
          config.contextWindowTokens ?? 8000,
          config.requestsPerMinuteLimit ?? 20,
          config.tokensPerDayLimit ?? 100000,
          config.mcpEnabled ?? false,
          JSON.stringify(config.mcpTools ?? defaultMcpTools),
          config.useCustomPrompt ?? false,
          config.customSystemPrompt || null,
          config.aiRole || 'viewer'
        ]
      );
    } catch (error) {
      logger.error('Error saving AI config:', error);
      throw error;
    }
  }

  /**
   * Test connection to an LLM endpoint
   */
  async testConnection(
    endpoint: string,
    apiKey: string | undefined,
    model: string
  ): Promise<ConnectionTestResult> {
    const startTime = Date.now();

    try {
      const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'user', content: 'Hello' }
          ],
          max_tokens: 5
        })
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `HTTP ${response.status}`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error?.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        return {
          success: false,
          message: 'Connection failed',
          error: errorMessage
        };
      }

      const data = await response.json() as { model?: string };
      return {
        success: true,
        message: 'Connection successful',
        modelInfo: {
          model: data.model || model,
          responseTime
        }
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Connection failed',
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Check rate limits for an organization
   */
  private checkRateLimits(organizationId: string, config: AIConfig): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const oneMinute = 60 * 1000;
    const oneDay = 24 * 60 * 60 * 1000;

    let state = this.rateLimiters.get(organizationId);

    if (!state) {
      state = {
        requestCount: 0,
        tokenCount: 0,
        windowStart: now,
        dayStart: now
      };
      this.rateLimiters.set(organizationId, state);
    }

    // Reset minute window if expired
    if (now - state.windowStart > oneMinute) {
      state.requestCount = 0;
      state.windowStart = now;
    }

    // Reset day window if expired
    if (now - state.dayStart > oneDay) {
      state.tokenCount = 0;
      state.dayStart = now;
    }

    // Check request rate
    if (state.requestCount >= config.requestsPerMinuteLimit) {
      return { allowed: false, reason: 'Rate limit exceeded. Please wait a moment.' };
    }

    // Check daily token budget
    if (state.tokenCount >= config.tokensPerDayLimit) {
      return { allowed: false, reason: 'Daily token limit exceeded. Please try again tomorrow.' };
    }

    return { allowed: true };
  }

  /**
   * Update rate limiter state after request
   */
  private updateRateLimits(organizationId: string, tokensUsed: number): void {
    const state = this.rateLimiters.get(organizationId);
    if (state) {
      state.requestCount++;
      state.tokenCount += tokensUsed;
    }
  }

  /**
   * Log AI usage to database
   */
  private async logUsage(
    organizationId: string,
    userId: string,
    endpointUsed: 'primary' | 'fallback',
    model: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    latencyMs: number,
    wasToolCall: boolean,
    toolsInvoked: string[],
    wasSuccessful: boolean,
    errorMessage?: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO ai_usage_log (
          organization_id,
          user_id,
          endpoint_used,
          model_used,
          request_type,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          latency_ms,
          was_tool_call,
          tools_invoked,
          was_successful,
          error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          organizationId,
          userId,
          endpointUsed,
          model,
          wasToolCall ? 'tool_call' : 'chat',
          usage.promptTokens,
          usage.completionTokens,
          usage.totalTokens,
          latencyMs,
          wasToolCall,
          toolsInvoked.length > 0 ? toolsInvoked : null,
          wasSuccessful,
          errorMessage
        ]
      );
    } catch (error) {
      logger.error('Error logging AI usage:', error);
      // Don't throw - logging failure shouldn't break the main request
    }
  }

  /**
   * Send a completion request to the LLM
   */
  async complete(
    organizationId: string,
    userId: string,
    options: CompletionOptions
  ): Promise<CompletionResponse> {
    const config = await this.getConfig(organizationId);

    if (!config) {
      throw new Error('AI Assistant not configured');
    }

    if (!config.isEnabled) {
      throw new Error('AI Assistant is disabled');
    }

    // Check rate limits
    const rateLimitCheck = this.checkRateLimits(organizationId, config);
    if (!rateLimitCheck.allowed) {
      throw new Error(rateLimitCheck.reason);
    }

    const hasTools = options.tools && options.tools.length > 0;

    // Determine which model to use
    let model = config.primaryModel;
    if (hasTools && config.toolCallModel) {
      model = config.toolCallModel;
    }

    // Try primary endpoint first
    let lastError: Error | null = null;

    const endpoints: Array<{
      url: string;
      apiKey: string | undefined;
      model: string;
      type: 'primary' | 'fallback';
    }> = [
      {
        url: config.primaryEndpointUrl,
        apiKey: config.primaryApiKey,
        model,
        type: 'primary'
      }
    ];

    // Add fallback if configured
    if (config.fallbackEndpointUrl && config.fallbackModel) {
      endpoints.push({
        url: config.fallbackEndpointUrl,
        apiKey: config.fallbackApiKey,
        model: hasTools && config.toolCallModel ? config.toolCallModel : config.fallbackModel,
        type: 'fallback'
      });
    }

    for (const endpoint of endpoints) {
      const startTime = Date.now();

      try {
        const result = await this.callEndpoint(
          endpoint.url,
          endpoint.apiKey,
          endpoint.model,
          options,
          config
        );

        const latencyMs = Date.now() - startTime;
        const toolsInvoked = result.message.tool_calls
          ? result.message.tool_calls.map(tc => tc.function.name)
          : [];

        // Log successful usage
        await this.logUsage(
          organizationId,
          userId,
          endpoint.type,
          result.model,
          result.usage,
          latencyMs,
          hasTools && result.message.tool_calls !== undefined,
          toolsInvoked,
          true
        );

        // Update rate limiter
        this.updateRateLimits(organizationId, result.usage.totalTokens);

        return {
          ...result,
          endpointUsed: endpoint.type
        };
      } catch (error: any) {
        const latencyMs = Date.now() - startTime;
        lastError = error;

        logger.warn(`LLM endpoint ${endpoint.type} failed:`, error.message);

        // Log failed attempt
        await this.logUsage(
          organizationId,
          userId,
          endpoint.type,
          endpoint.model,
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs,
          hasTools,
          [],
          false,
          error.message
        );

        // Continue to next endpoint if available
        continue;
      }
    }

    throw lastError || new Error('All endpoints failed');
  }

  /**
   * Call a specific LLM endpoint
   */
  private async callEndpoint(
    endpoint: string,
    apiKey: string | undefined,
    model: string,
    options: CompletionOptions,
    config: AIConfig
  ): Promise<Omit<CompletionResponse, 'endpointUsed'>> {
    const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const body: Record<string, any> = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? config.temperature,
      max_tokens: options.maxTokens ?? config.maxTokensPerRequest
    };

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    interface OpenAIResponse {
      id: string;
      model: string;
      choices: Array<{
        message: {
          role: string;
          content: string | null;
          tool_calls?: ToolCall[];
        };
        finish_reason: string;
      }>;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    }

    // Parse response with robust error handling
    let data: OpenAIResponse;
    try {
      data = await response.json() as OpenAIResponse;
    } catch (parseError: any) {
      // Try to get raw text for debugging
      let rawText = '';
      try {
        rawText = await response.clone().text();
      } catch {
        rawText = 'Unable to read response';
      }

      logger.warn('Failed to parse LLM response as JSON', {
        error: parseError.message,
        rawText: rawText.substring(0, 500),
        model
      });

      // Check if it looks like the model tried to output tool calls as text
      if (rawText.includes('function') || rawText.includes('tool_call') ||
          rawText.includes('search_knowledge') || rawText.includes('query_gw')) {
        throw new Error(
          `Model "${model}" appears to not support function calling properly. ` +
          `It output tool information as text instead of structured calls. ` +
          `Try a different model like qwen2.5-coder or llama3.1.`
        );
      }

      throw new Error(`Failed to parse response from ${model}: ${parseError.message}`);
    }

    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('No response from model');
    }

    // NOTE: We removed the automatic warning detection that was triggering false positives.
    // The detection was marking normal responses as failed tool calls when the model
    // was just explaining how to use tools (e.g., "use search_knowledge({ query: ... })").
    //
    // The tool support test endpoint (/api/v1/ai/test-tools) is the proper way to detect
    // if a model supports function calling. Users should use that to test before
    // configuring a model for production use.

    return {
      id: data.id,
      model: data.model,
      message: {
        role: choice.message.role as 'assistant',
        content: choice.message.content || '',
        tool_calls: choice.message.tool_calls
      },
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0
      },
      finishReason: choice.finish_reason
    };
  }

  /**
   * Get usage statistics for an organization
   */
  async getUsageStats(
    organizationId: string,
    days: number = 30
  ): Promise<{
    totalRequests: number;
    totalTokens: number;
    avgLatencyMs: number;
    errorRate: number;
    byDay: Array<{ date: string; requests: number; tokens: number }>;
    byModel: Array<{ model: string; requests: number; tokens: number }>;
  }> {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);

      // Aggregate stats
      const statsResult = await db.query(
        `SELECT
          COUNT(*) as total_requests,
          COALESCE(SUM(total_tokens), 0) as total_tokens,
          COALESCE(AVG(latency_ms), 0) as avg_latency,
          COALESCE(AVG(CASE WHEN was_successful THEN 0 ELSE 1 END), 0) as error_rate
        FROM ai_usage_log
        WHERE organization_id = $1 AND created_at >= $2`,
        [organizationId, cutoff]
      );

      // By day
      const byDayResult = await db.query(
        `SELECT
          DATE(created_at) as date,
          COUNT(*) as requests,
          COALESCE(SUM(total_tokens), 0) as tokens
        FROM ai_usage_log
        WHERE organization_id = $1 AND created_at >= $2
        GROUP BY DATE(created_at)
        ORDER BY date DESC`,
        [organizationId, cutoff]
      );

      // By model
      const byModelResult = await db.query(
        `SELECT
          model_used as model,
          COUNT(*) as requests,
          COALESCE(SUM(total_tokens), 0) as tokens
        FROM ai_usage_log
        WHERE organization_id = $1 AND created_at >= $2
        GROUP BY model_used
        ORDER BY requests DESC`,
        [organizationId, cutoff]
      );

      const stats = statsResult.rows[0];
      return {
        totalRequests: parseInt(stats.total_requests),
        totalTokens: parseInt(stats.total_tokens),
        avgLatencyMs: Math.round(parseFloat(stats.avg_latency)),
        errorRate: parseFloat(stats.error_rate),
        byDay: byDayResult.rows.map((row: { date: Date; requests: string; tokens: string }) => ({
          date: row.date.toISOString().split('T')[0],
          requests: parseInt(row.requests),
          tokens: parseInt(row.tokens)
        })),
        byModel: byModelResult.rows.map((row: { model: string; requests: string; tokens: string }) => ({
          model: row.model,
          requests: parseInt(row.requests),
          tokens: parseInt(row.tokens)
        }))
      };
    } catch (error) {
      logger.error('Error getting usage stats:', error);
      throw error;
    }
  }

  /**
   * Save a chat message to history
   */
  async saveChatMessage(
    organizationId: string,
    userId: string,
    sessionId: string,
    message: ChatMessage,
    pageContext?: string
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO ai_chat_history (
          organization_id,
          user_id,
          session_id,
          role,
          content,
          tool_calls,
          tool_call_id,
          tool_name,
          page_context
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          organizationId,
          userId,
          sessionId,
          message.role,
          message.content,
          message.tool_calls ? JSON.stringify(message.tool_calls) : null,
          message.tool_call_id || null,
          message.name || null,
          pageContext || null
        ]
      );
    } catch (error) {
      logger.error('Error saving chat message:', error);
      // Don't throw - history save failure shouldn't break chat
    }
  }

  /**
   * Get chat history for a session
   */
  async getChatHistory(
    organizationId: string,
    sessionId: string,
    limit: number = 50
  ): Promise<ChatMessage[]> {
    try {
      const result = await db.query(
        `SELECT
          role,
          content,
          tool_calls,
          tool_call_id,
          tool_name
        FROM ai_chat_history
        WHERE organization_id = $1 AND session_id = $2
        ORDER BY created_at ASC
        LIMIT $3`,
        [organizationId, sessionId, limit]
      );

      interface ChatHistoryRow {
        role: 'system' | 'user' | 'assistant' | 'tool';
        content: string;
        tool_calls: string | null;
        tool_call_id: string | null;
        tool_name: string | null;
      }

      return result.rows.map((row: ChatHistoryRow) => ({
        role: row.role,
        content: row.content,
        tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
        tool_call_id: row.tool_call_id || undefined,
        name: row.tool_name || undefined
      }));
    } catch (error) {
      logger.error('Error getting chat history:', error);
      return [];
    }
  }

  /**
   * Extract base URL from endpoint (remove /v1/chat/completions if present)
   */
  private getOllamaBaseUrl(endpoint: string): string {
    return endpoint.replace(/\/v1(\/chat\/completions)?\/?$/, '');
  }

  /**
   * Estimate if a model likely supports tool calling based on name
   */
  private estimateToolSupport(modelName: string): 'likely' | 'unlikely' | 'unknown' {
    const name = modelName.toLowerCase();

    // Models known to support tools well
    if (name.includes('llama3.1') || name.includes('llama-3.1')) return 'likely';
    if (name.includes('llama3.3') || name.includes('llama-3.3')) return 'likely';
    if (name.includes('qwen2.5') || name.includes('qwen-2.5')) return 'likely';
    if (name.includes('qwen3')) return 'likely';
    if (name.includes('granite3') || name.includes('granite4')) return 'likely';
    if (name.includes('mistral-nemo')) return 'likely';
    if (name.includes('command-r')) return 'likely';
    if (name.includes('gpt-4') || name.includes('gpt-3.5')) return 'likely';
    if (name.includes('claude')) return 'likely';

    // Models known NOT to support tools well
    if (name.includes('llama3.2:1b') || name.includes('llama3.2:3b')) return 'unlikely';
    if (name.includes('llama3:') && !name.includes('llama3.1')) return 'unlikely';
    if (name.includes('phi3')) return 'unlikely';
    if (name.includes('tinyllama')) return 'unlikely';
    if (name.includes('gemma')) return 'unlikely';

    return 'unknown';
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * List available models from Ollama
   */
  async listModels(endpoint: string): Promise<OllamaModel[]> {
    const baseUrl = this.getOllamaBaseUrl(endpoint);

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json() as {
        models: Array<{
          name: string;
          size: number;
          modified_at: string;
          digest: string;
          details?: {
            family?: string;
            parameter_size?: string;
            quantization_level?: string;
          };
        }>;
      };

      return data.models.map((m) => ({
        name: m.name,
        size: m.size,
        sizeFormatted: this.formatBytes(m.size),
        modifiedAt: m.modified_at,
        digest: m.digest,
        family: m.details?.family,
        parameterSize: m.details?.parameter_size,
        quantization: m.details?.quantization_level,
        estimatedToolSupport: this.estimateToolSupport(m.name)
      }));
    } catch (error: any) {
      logger.error('Failed to list Ollama models', { endpoint: baseUrl, error: error.message });
      throw new Error(`Failed to list models from ${baseUrl}: ${error.message}`);
    }
  }

  /**
   * Test if a model supports tool/function calling
   */
  async testToolSupport(
    endpoint: string,
    apiKey: string | undefined,
    model: string
  ): Promise<ToolTestResult> {
    const testTool: Tool = {
      type: 'function',
      function: {
        name: 'get_current_time',
        description: 'Get the current time in a specific timezone',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: 'Timezone name (e.g., UTC, America/New_York)'
            }
          },
          required: []
        }
      }
    };

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful assistant. When asked about time, use the get_current_time tool.'
      },
      {
        role: 'user',
        content: 'What time is it right now?'
      }
    ];

    try {
      const url = `${endpoint.replace(/\/$/, '')}/chat/completions`;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          tools: [testTool],
          tool_choice: 'auto',
          max_tokens: 100
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          supportsTools: false,
          testResult: 'error',
          details: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
        };
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseError: any) {
        return {
          supportsTools: false,
          testResult: 'parse_error',
          details: 'Failed to parse model response. Model likely does not support tool calling format.'
        };
      }

      // Check if response has tool_calls
      const choice = data.choices?.[0];
      if (choice?.message?.tool_calls?.length > 0) {
        const toolCall = choice.message.tool_calls[0];
        return {
          supportsTools: true,
          testResult: 'success',
          details: `Model successfully called tool: ${toolCall.function.name}`,
          rawResponse: data
        };
      }

      // Check if model output tool name as text (common failure mode)
      const content = choice?.message?.content || '';
      if (content.toLowerCase().includes('get_current_time') ||
          content.toLowerCase().includes('tool') ||
          content.toLowerCase().includes('function')) {
        return {
          supportsTools: false,
          testResult: 'no_tool_call',
          details: 'Model mentioned the tool but did not make a structured call. Model may not support function calling.',
          rawResponse: data
        };
      }

      return {
        supportsTools: false,
        testResult: 'no_tool_call',
        details: 'Model responded without using tools. May not support function calling.',
        rawResponse: data
      };
    } catch (error: any) {
      if (error.message.includes('Unexpected token') || error.message.includes('JSON')) {
        return {
          supportsTools: false,
          testResult: 'parse_error',
          details: 'Failed to parse model response. Model likely does not support tool calling format.'
        };
      }
      return {
        supportsTools: false,
        testResult: 'error',
        details: error.message
      };
    }
  }
}

/**
 * Ollama model information
 */
export interface OllamaModel {
  name: string;
  size: number;
  sizeFormatted: string;
  modifiedAt: string;
  digest: string;
  family?: string;
  parameterSize?: string;
  quantization?: string;
  estimatedToolSupport: 'likely' | 'unlikely' | 'unknown';
}

/**
 * Tool support test result
 */
export interface ToolTestResult {
  supportsTools: boolean;
  testResult: 'success' | 'no_tool_call' | 'parse_error' | 'error';
  details: string;
  rawResponse?: any;
}

// Export singleton instance
export const llmGatewayService = new LLMGatewayService();
