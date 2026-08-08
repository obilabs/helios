# AI Assistant - Technical Design

## LLM Gateway Implementation

### Request Flow

```
User Input → Command Bar → /api/v1/ai/chat → LLM Gateway → Primary Endpoint
                                                    ↓ (on failure)
                                              Fallback Endpoint
                                                    ↓
                                              MCP Tool Execution
                                                    ↓
                                              Response Stream
```

### OpenAI-Compatible Request Format

All endpoints must support this format:

```typescript
// Request
POST /v1/chat/completions
{
  "model": "gpt-4o",
  "messages": [
    {"role": "system", "content": "You are a helpful IT admin assistant..."},
    {"role": "user", "content": "Show me users without licenses"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "list_users",
        "description": "List users with optional filters",
        "parameters": {
          "type": "object",
          "properties": {
            "filter": {
              "type": "object",
              "properties": {
                "has_license": {"type": "boolean"}
              }
            }
          }
        }
      }
    }
  ],
  "tool_choice": "auto",
  "stream": true
}

// Response (streaming)
data: {"id":"...","choices":[{"delta":{"tool_calls":[{"function":{"name":"list_users"}}]}}]}
data: {"id":"...","choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\"filter\":{\"has_license\":false}}"}}]}}]}
data: [DONE]
```

### Gateway Service Interface

```typescript
// backend/src/services/llm-gateway.service.ts

import { Readable } from 'stream';

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface Tool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface CompletionOptions {
  organizationId: string;
  userId: string;
  messages: Message[];
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

interface CompletionResponse {
  content: string | null;
  toolCalls: ToolCall[] | null;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  endpoint: 'primary' | 'fallback';
}

class LLMGatewayService {
  async complete(options: CompletionOptions): Promise<CompletionResponse>;
  async completeStream(options: CompletionOptions): AsyncGenerator<string>;
  async testConnection(endpoint: string, apiKey: string | null, model: string): Promise<TestResult>;
}
```

### Fallback Logic

```typescript
async complete(options: CompletionOptions): Promise<CompletionResponse> {
  const config = await this.getConfig(options.organizationId);

  try {
    // Try primary
    const response = await this.callEndpoint({
      url: config.primaryEndpointUrl,
      apiKey: config.primaryApiKey,
      model: this.selectModel(config, options.tools),
      ...options
    });

    await this.logUsage(options, response, 'primary');
    return response;

  } catch (primaryError) {
    // Log primary failure
    console.error('Primary endpoint failed:', primaryError);

    if (!config.fallbackEndpointUrl) {
      throw primaryError;
    }

    try {
      // Try fallback
      const response = await this.callEndpoint({
        url: config.fallbackEndpointUrl,
        apiKey: config.fallbackApiKey,
        model: config.fallbackModel,
        ...options
      });

      await this.logUsage(options, response, 'fallback');
      return response;

    } catch (fallbackError) {
      // Both failed
      console.error('Fallback endpoint failed:', fallbackError);
      throw new Error('All LLM endpoints failed');
    }
  }
}

private selectModel(config: AIConfig, tools?: Tool[]): string {
  // Use tool-specific model if configured and tools are present
  if (tools?.length && config.toolCallModel) {
    return config.toolCallModel;
  }
  return config.primaryModel;
}
```

---

## MCP Server Design

### Tool Registration

```typescript
// backend/src/services/mcp/mcp-server.ts

import { Tool, ToolResult } from './types';

class MCPServer {
  private tools: Map<string, ToolHandler> = new Map();

  registerTool(tool: ToolDefinition, handler: ToolHandler): void {
    this.tools.set(tool.name, {
      definition: tool,
      handler
    });
  }

  getToolDefinitions(): Tool[] {
    return Array.from(this.tools.values()).map(t => ({
      type: 'function',
      function: {
        name: t.definition.name,
        description: t.definition.description,
        parameters: t.definition.parameters
      }
    }));
  }

  async invokeTool(
    name: string,
    args: Record<string, any>,
    context: ToolContext
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { error: `Unknown tool: ${name}` };
    }

    // Check permissions
    if (tool.definition.adminOnly && !context.userIsAdmin) {
      return { error: 'This action requires admin privileges' };
    }

    try {
      const result = await tool.handler(args, context);
      return { success: true, data: result };
    } catch (error) {
      return { error: error.message };
    }
  }
}

interface ToolContext {
  organizationId: string;
  userId: string;
  userIsAdmin: boolean;
  userEmail: string;
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  adminOnly?: boolean;
  requiresConfirmation?: boolean;
}

type ToolHandler = (args: any, context: ToolContext) => Promise<any>;
```

### Tool Implementation Example

```typescript
// backend/src/services/mcp/tools/user.tools.ts

export function registerUserTools(mcp: MCPServer, services: Services): void {

  // List users tool
  mcp.registerTool({
    name: 'list_users',
    description: 'List users from Google Workspace or Microsoft 365 with optional filters. Returns name, email, department, and status.',
    parameters: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['google', 'microsoft', 'all'],
          description: 'Which directory to query'
        },
        filter: {
          type: 'object',
          properties: {
            department: { type: 'string' },
            is_active: { type: 'boolean' },
            has_license: { type: 'boolean' },
            last_login_before: { type: 'string', format: 'date' },
            search: { type: 'string', description: 'Search in name or email' }
          }
        },
        limit: { type: 'number', default: 20, maximum: 100 }
      }
    }
  }, async (args, context) => {
    const { source = 'all', filter = {}, limit = 20 } = args;

    let users = [];

    if (source === 'google' || source === 'all') {
      const gwUsers = await services.googleWorkspace.listUsers(
        context.organizationId,
        filter
      );
      users.push(...gwUsers.map(u => ({ ...u, source: 'google' })));
    }

    if (source === 'microsoft' || source === 'all') {
      const msUsers = await services.microsoft365.listUsers(
        context.organizationId,
        filter
      );
      users.push(...msUsers.map(u => ({ ...u, source: 'microsoft' })));
    }

    // Format for LLM context
    return {
      total: users.length,
      users: users.slice(0, limit).map(u => ({
        name: u.displayName,
        email: u.email,
        department: u.department || 'Not set',
        status: u.isActive ? 'Active' : 'Suspended',
        source: u.source
      }))
    };
  });

  // Offboard user tool (requires confirmation)
  mcp.registerTool({
    name: 'offboard_user',
    description: 'Perform user offboarding: disable account, remove from groups, revoke licenses. This is a destructive action that requires confirmation.',
    parameters: {
      type: 'object',
      required: ['user_email'],
      properties: {
        user_email: { type: 'string', format: 'email' },
        disable_account: { type: 'boolean', default: true },
        remove_from_groups: { type: 'boolean', default: true },
        revoke_licenses: { type: 'boolean', default: true },
        transfer_files_to: { type: 'string', format: 'email' }
      }
    },
    adminOnly: true,
    requiresConfirmation: true
  }, async (args, context) => {
    // Implementation would call lifecycle service
    const result = await services.lifecycle.offboardUser({
      organizationId: context.organizationId,
      userEmail: args.user_email,
      options: args,
      performedBy: context.userEmail
    });

    return {
      success: true,
      actions_taken: result.actionsPerformed,
      user: args.user_email
    };
  });
}
```

---

## System Prompt Design

```typescript
const SYSTEM_PROMPT = `You are Helios AI, an intelligent assistant for the Helios Admin Portal.

## Your Role
Help IT administrators manage users, groups, and licenses across Google Workspace and Microsoft 365.

## Capabilities
You have access to tools that can:
- List, search, and get details about users
- Manage group memberships
- View and assign licenses
- Trigger directory syncs
- Search help documentation

## Guidelines

1. **Be Concise**: Admins are busy. Give direct answers.

2. **Show Data Clearly**: When listing users/groups, format as tables or bullet points.

3. **Confirm Destructive Actions**: Before disabling users, removing licenses, or offboarding, always ask for confirmation and show what will happen.

4. **Respect Permissions**: Some actions require admin privileges. If the user isn't an admin, explain what they can't do.

5. **Provide Context**: When showing data, include relevant details (source, last sync time, etc.)

6. **Suggest Next Steps**: After completing a task, suggest related actions if helpful.

## Current Context
- Organization: {{organizationName}}
- User: {{userEmail}} ({{userRole}})
- Connected Platforms: {{connectedPlatforms}}
- Current Page: {{currentPage}}

## Tool Usage
Use the available tools to fetch real data. Never make up user information or statistics.
If a tool fails, explain the error clearly and suggest alternatives.
`;
```

---

## Frontend Components

### Command Bar State Management

```typescript
// frontend/src/components/ai/useCommandBar.ts

import { create } from 'zustand';

interface CommandBarState {
  isOpen: boolean;
  query: string;
  isLoading: boolean;
  messages: Message[];
  recentQueries: string[];

  open: () => void;
  close: () => void;
  setQuery: (query: string) => void;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
}

export const useCommandBar = create<CommandBarState>((set, get) => ({
  isOpen: false,
  query: '',
  isLoading: false,
  messages: [],
  recentQueries: JSON.parse(localStorage.getItem('ai_recent_queries') || '[]'),

  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false, query: '' }),
  setQuery: (query) => set({ query }),

  sendMessage: async (message) => {
    set({ isLoading: true });

    // Add user message
    const userMessage = { role: 'user', content: message };
    set(state => ({ messages: [...state.messages, userMessage] }));

    // Save to recent
    const recent = [message, ...get().recentQueries.filter(q => q !== message)].slice(0, 5);
    localStorage.setItem('ai_recent_queries', JSON.stringify(recent));
    set({ recentQueries: recent });

    try {
      const response = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('helios_token')}`
        },
        body: JSON.stringify({
          messages: [...get().messages, userMessage]
        })
      });

      const reader = response.body?.getReader();
      let assistantMessage = '';

      // Stream response
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        assistantMessage += chunk;

        set(state => ({
          messages: [
            ...state.messages.slice(0, -1),
            { role: 'assistant', content: assistantMessage }
          ]
        }));
      }

    } catch (error) {
      set(state => ({
        messages: [
          ...state.messages,
          { role: 'assistant', content: `Error: ${error.message}` }
        ]
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  clearMessages: () => set({ messages: [] })
}));
```

### Keyboard Shortcut Hook

```typescript
// frontend/src/hooks/useGlobalKeyboard.ts

import { useEffect } from 'react';
import { useCommandBar } from '../components/ai/useCommandBar';

export function useGlobalKeyboard() {
  const { open, isOpen, close } = useCommandBar();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) {
          close();
        } else {
          open();
        }
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        close();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, open, close]);
}
```

---

## Security Implementation

### Permission Checking

```typescript
// backend/src/middleware/ai-permissions.ts

export function checkToolPermissions(
  tool: ToolDefinition,
  context: ToolContext
): { allowed: boolean; reason?: string } {

  // Admin-only tools
  if (tool.adminOnly && !context.userIsAdmin) {
    return {
      allowed: false,
      reason: 'This action requires administrator privileges'
    };
  }

  // User can only query their own data (unless admin)
  if (tool.name.startsWith('get_user') && !context.userIsAdmin) {
    // Check if querying self
    const targetEmail = tool.args?.identifier || tool.args?.user_email;
    if (targetEmail && targetEmail !== context.userEmail) {
      return {
        allowed: false,
        reason: 'You can only view your own user information'
      };
    }
  }

  return { allowed: true };
}
```

### Rate Limiting

```typescript
// backend/src/middleware/ai-rate-limit.ts

import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiters = new Map<string, RateLimiterMemory>();

export async function checkRateLimit(
  organizationId: string,
  userId: string,
  config: AIConfig
): Promise<{ allowed: boolean; retryAfter?: number }> {

  const key = `${organizationId}:${userId}`;

  if (!rateLimiters.has(key)) {
    rateLimiters.set(key, new RateLimiterMemory({
      points: config.requestsPerMinuteLimit,
      duration: 60
    }));
  }

  try {
    await rateLimiters.get(key)!.consume(1);
    return { allowed: true };
  } catch (rejection) {
    return {
      allowed: false,
      retryAfter: Math.ceil(rejection.msBeforeNext / 1000)
    };
  }
}
```

---

## API Encryption

```typescript
// backend/src/utils/encryption.ts

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(process.env.AI_ENCRYPTION_KEY!, 'hex'); // 32 bytes

export function encryptApiKey(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decryptApiKey(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
```

---

## Environment Variables

```bash
# .env additions for AI Assistant

# Encryption key for API keys (generate with: openssl rand -hex 32)
AI_ENCRYPTION_KEY=your-32-byte-hex-key

# Default rate limits (can be overridden per-org)
AI_DEFAULT_RPM_LIMIT=20
AI_DEFAULT_DAILY_TOKEN_LIMIT=100000

# Feature flag
AI_ASSISTANT_ENABLED=true
```
