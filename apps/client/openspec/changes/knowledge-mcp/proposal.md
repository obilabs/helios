# OpenSpec Proposal: Knowledge MCP - AI Knowledge Base

**ID:** knowledge-mcp
**Status:** 100% COMPLETE ✅
**Priority:** P1 (Enables AI reliability)
**Author:** Claude
**Created:** 2025-12-17
**Updated:** 2025-12-21
**Completed:** 2025-12-21

## Current Status

All implementation complete:
- ✅ Knowledge Base types, search, and synonyms
- ✅ MCP tool definitions (search_knowledge, get_command, list_commands)
- ✅ Tool execution wired to AI chat endpoint
- ✅ 38 developer console commands documented
- ✅ System prompt updated to use tools
- ✅ 12 guides documented (guides.json)
- ✅ 16 features documented (features.json)
- ✅ 11 settings documented (settings.json)
- ✅ Unit tests for search written (search.test.ts)
- ✅ Integration tests for tools written (tools.test.ts)

**Total Knowledge Base: 77 entries across 4 categories**

## Summary

Create a unified Knowledge Base that serves as the single source of truth for all Helios documentation. The AI queries this via MCP tools rather than having documentation embedded in the system prompt. This prevents hallucination, reduces maintenance burden, and works with custom prompts.

## Problem Statement

### Current Issues

1. **Hallucination Risk**: AI makes up commands like "helios get-users" (doesn't exist)
2. **Hardcoded Prompt**: 60+ lines of commands embedded in system prompt
3. **Maintenance Burden**: Update commands in 3 places (code, prompt, docs)
4. **Custom Prompts Break**: User's custom prompt loses all command knowledge
5. **Context Waste**: Every request includes full command list (~2000 tokens)
6. **Static Content**: Help articles are hardcoded in `help-search.tool.ts`

### Current Architecture (Bad)

```
┌─────────────────────────────────────────┐
│  System Prompt (2000+ tokens)           │
│  - All commands embedded                │
│  - All help content referenced          │
│  - Updated manually                     │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  AI Response                            │
│  - May hallucinate if not in prompt     │
│  - No way to verify accuracy            │
└─────────────────────────────────────────┘
```

### Proposed Architecture (Good)

```
┌─────────────────────────────────────────┐
│  Minimal System Prompt (~200 tokens)    │
│  "Use search_knowledge tool first"      │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  AI recognizes need for info            │
│  Calls: search_knowledge("list users")  │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Knowledge MCP                          │
│  - Searches indexed knowledge base      │
│  - Returns relevant, accurate info      │
│  - Single source of truth               │
└─────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  AI Response (grounded in KB)           │
│  - Uses exact command from KB           │
│  - Cannot make things up                │
└─────────────────────────────────────────┘
```

## Knowledge Base Structure

### Directory Layout

```
backend/src/knowledge/
├── index.ts                    # Main KB loader and search
├── types.ts                    # TypeScript interfaces
├── search.ts                   # Search implementation
├── generators/
│   ├── commands.generator.ts   # Auto-generate from DeveloperConsole.tsx
│   ├── api.generator.ts        # Auto-generate from OpenAPI spec
│   └── index.ts
└── content/
    ├── commands.json           # Generated: CLI commands
    ├── api-endpoints.json      # Generated: API reference
    ├── guides.json             # Manual: Setup guides
    ├── features.json           # Manual: Feature docs
    ├── troubleshooting.json    # Manual: Common issues
    └── settings.json           # Manual: Configuration options
```

### Knowledge Entry Schema

```typescript
interface KnowledgeEntry {
  id: string;                    // Unique identifier
  type: 'command' | 'api' | 'guide' | 'feature' | 'troubleshooting' | 'setting';
  title: string;                 // Short title
  category: string;              // Category for filtering
  subcategory?: string;          // Optional subcategory
  content: string;               // Full content (markdown)
  summary: string;               // Brief summary for search results
  keywords: string[];            // Search keywords
  examples?: Example[];          // Usage examples
  relatedIds?: string[];         // Related entries
  source?: string;               // Where this came from (for auto-generated)
  lastUpdated: string;           // ISO timestamp
}

interface Example {
  description: string;
  code: string;
  output?: string;
}
```

### Command Entry Example

```json
{
  "id": "cmd-gw-users-list",
  "type": "command",
  "title": "List Google Workspace Users",
  "category": "developer-console",
  "subcategory": "google-workspace",
  "content": "Lists all users synced from Google Workspace.\n\n**Syntax:**\n```\nhelios gw users list\n```\n\n**Options:**\n- No options available\n\n**Output:** Table with columns: Email, Name, Status, Department",
  "summary": "List all Google Workspace users",
  "keywords": ["users", "list", "google", "workspace", "directory"],
  "examples": [
    {
      "description": "List all users",
      "code": "helios gw users list",
      "output": "┌─────────────────────┬──────────┬─────────┐\n│ Email               │ Name     │ Status  │\n├─────────────────────┼──────────┼─────────┤\n│ john@example.com    │ John Doe │ Active  │\n└─────────────────────┴──────────┴─────────┘"
    }
  ],
  "relatedIds": ["cmd-gw-users-get", "cmd-gw-users-create"],
  "source": "auto-generated:DeveloperConsole.tsx",
  "lastUpdated": "2025-12-17T00:00:00Z"
}
```

## MCP Tools

### 1. search_knowledge

Search the knowledge base for relevant information.

```typescript
export const searchKnowledgeToolDefinition = {
  name: 'search_knowledge',
  description: 'Search Helios knowledge base for commands, API endpoints, guides, and documentation. ALWAYS use this before answering questions about how to do something.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'What you want to find (e.g., "list users command", "create group API")'
      },
      type: {
        type: 'string',
        enum: ['all', 'command', 'api', 'guide', 'feature', 'troubleshooting', 'setting'],
        description: 'Filter by content type'
      },
      category: {
        type: 'string',
        description: 'Filter by category (e.g., "google-workspace", "microsoft-365")'
      },
      limit: {
        type: 'number',
        description: 'Max results (default: 5)'
      }
    },
    required: ['query']
  }
};
```

### 2. get_command

Get details for a specific command by name.

```typescript
export const getCommandToolDefinition = {
  name: 'get_command',
  description: 'Get detailed information about a specific Developer Console command',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'The command name (e.g., "helios gw users list")'
      }
    },
    required: ['command']
  }
};
```

### 3. list_commands

List all available commands, optionally filtered.

```typescript
export const listCommandsToolDefinition = {
  name: 'list_commands',
  description: 'List all available Developer Console commands',
  parameters: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['all', 'google-workspace', 'microsoft-365', 'helios', 'api'],
        description: 'Filter by command category'
      }
    }
  }
};
```

### 4. get_api_endpoint

Get details for a specific API endpoint.

```typescript
export const getApiEndpointToolDefinition = {
  name: 'get_api_endpoint',
  description: 'Get detailed information about a specific API endpoint',
  parameters: {
    type: 'object',
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
      },
      path: {
        type: 'string',
        description: 'API path (e.g., "/api/v1/users")'
      }
    },
    required: ['path']
  }
};
```

## Auto-Generation

### Command Generator

Parses `DeveloperConsole.tsx` to extract command definitions:

```typescript
// generators/commands.generator.ts

interface ParsedCommand {
  name: string;           // Full command (e.g., "helios gw users list")
  category: string;       // google-workspace, microsoft-365, helios, api
  description: string;    // What it does
  syntax: string;         // Command syntax with placeholders
  options: Option[];      // Available flags/options
  examples: Example[];    // Usage examples
}

export async function generateCommandsKB(): Promise<KnowledgeEntry[]> {
  // 1. Read DeveloperConsole.tsx
  // 2. Parse command handlers (handleGWUsers, handleGWGroups, etc.)
  // 3. Extract command patterns and descriptions
  // 4. Generate KnowledgeEntry for each command
  // 5. Write to content/commands.json
}
```

### API Generator

Parses OpenAPI spec to extract endpoint documentation:

```typescript
// generators/api.generator.ts

export async function generateApiKB(): Promise<KnowledgeEntry[]> {
  // 1. Read OpenAPI spec from /api/v1/docs/openapi.json
  // 2. Parse each path and method
  // 3. Extract parameters, request/response schemas
  // 4. Generate KnowledgeEntry for each endpoint
  // 5. Write to content/api-endpoints.json
}
```

### Build Script

```bash
# package.json
{
  "scripts": {
    "kb:generate": "ts-node src/knowledge/generators/index.ts",
    "kb:validate": "ts-node src/knowledge/validate.ts",
    "prebuild": "npm run kb:generate"
  }
}
```

## Making AI Use Tools Correctly

### Challenge: Will AI Send the Right Query?

The AI might ask for "get all users" when the command is "list users". We handle this with:

#### 1. Forgiving Search with Synonyms

```typescript
const SYNONYMS: Record<string, string[]> = {
  'get': ['list', 'show', 'view', 'display', 'retrieve', 'fetch'],
  'create': ['add', 'new', 'make'],
  'delete': ['remove', 'destroy', 'drop'],
  'update': ['edit', 'modify', 'change'],
  'users': ['user', 'people', 'members', 'employees'],
  'groups': ['group', 'teams', 'team'],
};

// "get all users" → searches for "get", "list", "show", "all", "users", "user"
```

#### 2. Fallback to List Commands

If search returns nothing useful, the system prompt tells AI to use `list_commands`:

```
If search_knowledge returns no results:
1. Try list_commands to see all available commands
2. If still unsure, tell the user you don't have that information
```

#### 3. Command Aliases

Store multiple ways to refer to the same command:

```json
{
  "id": "cmd-gw-users-list",
  "aliases": [
    "helios gw users list",
    "list google users",
    "show all users",
    "get users",
    "display users"
  ]
}
```

#### 4. Did-You-Mean Suggestions

```typescript
// If no exact match, return close matches
{
  "results": [],
  "suggestions": [
    "Did you mean 'helios gw users list'?",
    "Did you mean 'helios users list'?"
  ]
}
```

### Making Tools the Safe Choice

The key insight: **Make it riskier to NOT use tools**

| Behavior | Outcome |
|----------|---------|
| AI guesses without tools | High risk of wrong answer → user angry |
| AI uses tools, finds answer | Correct answer → user happy |
| AI uses tools, no results | "I don't have info on that" → acceptable |

System prompt reinforces this:
```
CRITICAL: Never answer questions about commands without using search_knowledge first.
If you're unsure, SAY you're unsure. Never make up commands.
```

## Search Implementation

### Option A: Simple Keyword Search (Recommended for v1)

```typescript
// search.ts

export function searchKnowledge(
  query: string,
  options: SearchOptions = {}
): KnowledgeEntry[] {
  const { type = 'all', category, limit = 5 } = options;

  // Normalize query
  const terms = query.toLowerCase().split(/\s+/);

  // Load knowledge base
  const entries = loadKnowledgeBase();

  // Filter by type and category
  let filtered = entries;
  if (type !== 'all') {
    filtered = filtered.filter(e => e.type === type);
  }
  if (category) {
    filtered = filtered.filter(e => e.category === category);
  }

  // Score by relevance
  const scored = filtered.map(entry => ({
    entry,
    score: calculateRelevance(entry, terms)
  }));

  // Sort and limit
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.entry);
}

function calculateRelevance(entry: KnowledgeEntry, terms: string[]): number {
  let score = 0;

  // Exact command match (highest)
  if (entry.type === 'command') {
    const cmdLower = entry.title.toLowerCase();
    if (terms.some(t => cmdLower.includes(t))) {
      score += 20;
    }
  }

  // Title match (high)
  const titleLower = entry.title.toLowerCase();
  terms.forEach(term => {
    if (titleLower.includes(term)) score += 10;
  });

  // Keyword match (medium)
  entry.keywords.forEach(kw => {
    terms.forEach(term => {
      if (kw.includes(term)) score += 5;
    });
  });

  // Content match (low)
  const contentLower = entry.content.toLowerCase();
  terms.forEach(term => {
    if (contentLower.includes(term)) score += 1;
  });

  return score;
}
```

### Option B: Vector Embeddings (Future Enhancement)

For semantic search with better understanding:

```typescript
// Using a local embedding model or OpenAI embeddings
import { embed } from './embeddings';

export async function semanticSearch(
  query: string,
  options: SearchOptions = {}
): Promise<KnowledgeEntry[]> {
  // 1. Embed the query
  const queryEmbedding = await embed(query);

  // 2. Compare with pre-computed entry embeddings
  const entries = loadKnowledgeBase();

  // 3. Calculate cosine similarity
  const scored = entries.map(entry => ({
    entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));

  // 4. Return top matches
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit || 5)
    .map(s => s.entry);
}
```

## Updated System Prompt

The system prompt becomes minimal:

```typescript
function getSystemPrompt(pageContext?: string): string {
  return `You are Helios AI Assistant, helping users with the Helios Client Portal.

## CRITICAL RULES
1. ALWAYS use search_knowledge tool before answering questions about commands, API, or how to do things
2. NEVER make up commands or features - if search_knowledge returns no results, say "I don't have information about that"
3. Use get_command tool to get exact syntax when recommending commands
4. You are READ-ONLY - you cannot execute commands, only tell users what to run

## Available Tools
- search_knowledge: Find information about commands, API, guides, features
- get_command: Get details for a specific command
- list_commands: List all available commands
- get_api_endpoint: Get API endpoint details

When users ask how to do something:
1. Search the knowledge base first
2. Provide the exact command or steps from the search results
3. If no results, say you don't have that information

${pageContext ? `\nUser is on: ${pageContext}` : ''}`;
}
```

## Benefits

| Aspect | Before | After |
|--------|--------|-------|
| **Accuracy** | AI may hallucinate | Grounded in KB |
| **Maintenance** | Update 3 places | Update 1 place |
| **Custom prompts** | Lose commands | Commands via tools |
| **Context usage** | ~2000 tokens/request | ~200 tokens/request |
| **New commands** | Manual prompt update | Auto-generated |
| **API docs** | Not available | Auto-generated |

## Implementation Plan

### Phase 1: Core Infrastructure (Day 1-2)
- [ ] Create knowledge base schema and types
- [ ] Implement simple keyword search
- [ ] Create MCP tool definitions
- [ ] Wire up tools to AI chat endpoint

### Phase 2: Content Migration (Day 2-3)
- [ ] Migrate existing HELP_CONTENT to new format
- [ ] Create commands.json with all Developer Console commands
- [ ] Create guides.json from existing docs
- [ ] Add settings.json for configuration documentation

### Phase 3: Auto-Generation (Day 3-4)
- [ ] Build command generator from DeveloperConsole.tsx
- [ ] Build API generator from OpenAPI spec
- [ ] Add prebuild script to regenerate
- [ ] Validate generated content

### Phase 4: Integration (Day 4-5)
- [ ] Update system prompt to use new tools
- [ ] Update AI chat to call tools when MCP enabled
- [ ] Test with various queries
- [ ] Remove hardcoded content from system prompt

### Phase 5: Enhancement (Future)
- [ ] Add vector embeddings for semantic search
- [ ] Add feedback mechanism to improve relevance
- [ ] Add version tracking for generated content

## Testing

```typescript
describe('Knowledge MCP', () => {
  it('finds command by exact name', async () => {
    const results = await searchKnowledge('helios gw users list');
    expect(results[0].id).toBe('cmd-gw-users-list');
  });

  it('finds command by description', async () => {
    const results = await searchKnowledge('list all users');
    expect(results.some(r => r.id === 'cmd-gw-users-list')).toBe(true);
  });

  it('returns empty for unknown commands', async () => {
    const results = await searchKnowledge('helios get-users');
    expect(results.length).toBe(0);
  });

  it('provides exact syntax', async () => {
    const cmd = await getCommand('helios gw users list');
    expect(cmd.content).toContain('helios gw users list');
  });
});
```

## Success Metrics

1. **Zero hallucinations** for documented commands
2. **Single source of truth** - one place to update
3. **Works with custom prompts** - tools always available
4. **Auto-updated** - new commands appear automatically
5. **Reduced token usage** - 90% fewer prompt tokens

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| AI doesn't call tools | Strong prompt instruction + fallback to "I don't know" |
| Search returns wrong results | Improve keyword matching, add synonyms |
| Generator misses commands | Validation script, manual review |
| Performance impact | Cache KB in memory, simple search algorithm |

## Dependencies

- OpenAPI spec generation (from `pre-release-infrastructure` proposal)
- MCP tools enabled in AI config
- DeveloperConsole.tsx command structure remains consistent

## Questions for User

1. Should we include Microsoft 365 commands even though that module is optional?
2. Should API endpoints require authentication details in the KB or just reference?
3. Priority: keyword search first or invest in vector embeddings from start?
