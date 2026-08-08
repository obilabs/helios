# Helios AI Assistant - Proposal

## Overview

Add an embedded AI assistant to Helios Client Portal that solves real admin problems through natural language interaction. The assistant uses MCP (Model Context Protocol) for tool integration and supports any OpenAI-compatible endpoint.

## Design Philosophy: Read-Only + Command Generation

**The AI can query and report, but cannot execute changes.**

This approach:
- **Safe**: No risk of AI misunderstanding and modifying wrong data
- **Trustworthy**: Enterprise customers will actually enable it
- **Auditable**: Humans initiate every change, clear accountability
- **Fast to ship**: No confirmation dialogs or rollback mechanisms needed

| AI Can Do | AI Cannot Do |
|-----------|--------------|
| Query users, groups, licenses | Create/delete/modify users |
| Generate reports and exports | Change group memberships |
| Answer documentation questions | Assign/remove licenses |
| Show sync status | Trigger syncs or modifications |
| **Generate commands for user to execute** | **Execute those commands** |

---

## Real Problems This Solves

### 1. Complex Query Navigation
**Problem:** Admins dig through multiple pages to find information.
**Solution:** Natural language queries like:
- "Show me all users who haven't logged in for 30 days"
- "Which groups does john@company.com belong to?"
- "What licenses are assigned to the marketing department?"

### 2. Multi-Step Admin Tasks
**Problem:** Tasks require clicking through many screens.
**Solution:** AI prepares everything, user executes:
- "Prepare offboarding for sarah@company.com" → Shows checklist + links to each action
- "What's needed to create a user in Engineering?" → Shows form with pre-filled values
- "Show me how to add Sales team to CRM group" → Step-by-step with direct links

### 3. Troubleshooting & Diagnostics
**Problem:** Identifying why something isn't working takes time.
**Solution:** Contextual diagnosis:
- "Why can't jane@company.com access shared drives?" → Checks permissions, group membership, license status
- "Which users have sync errors?" → Lists users with issues and suggested fixes
- "Show me the last 10 failed login attempts" → Formatted audit log

### 4. Reporting Without SQL
**Problem:** Custom reports require technical knowledge.
**Solution:** Natural language analytics:
- "How many users were added this month?" → Count with trend
- "Show license utilization by department" → Table/chart
- "Export all external contractors to CSV" → Generated file download

### 5. Contextual Help
**Problem:** Documentation search is slow and disconnected.
**Solution:** In-context assistance:
- "How do I set up Google Workspace sync?"
- "What permissions does Microsoft 365 integration need?"
- "Explain the difference between groups and OUs"

### 6. Command/Script Generation
**Problem:** API calls and bulk operations require technical knowledge.
**Solution:** AI generates ready-to-use commands:
- "Generate curl command to list all disabled users"
- "Create a PowerShell script to export group memberships"
- "Show me the API call to trigger a sync"

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HELIOS FRONTEND                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Command Bar  │  │ Help Widget  │  │ Chat Panel (expandable)  │  │
│  │  (Cmd+K)     │  │   (?)        │  │                          │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │
│         │                 │                        │                │
│         └─────────────────┴────────────────────────┘                │
│                           │                                         │
│                    ┌──────▼──────┐                                  │
│                    │  AI Context │  (current page, selected items,  │
│                    │   Manager   │   user role, permissions)        │
│                    └──────┬──────┘                                  │
└───────────────────────────┼─────────────────────────────────────────┘
                            │
                    ┌───────▼───────┐
                    │  Backend API  │
                    │ /api/v1/ai/*  │
                    └───────┬───────┘
                            │
┌───────────────────────────┼─────────────────────────────────────────┐
│                     AI SERVICE LAYER                                │
├───────────────────────────┼─────────────────────────────────────────┤
│                           │                                         │
│  ┌────────────────────────▼────────────────────────────────────┐   │
│  │                    LLM Gateway                               │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │   │
│  │  │  Primary    │  │  Fallback   │  │ Model Router        │  │   │
│  │  │  Endpoint   │──│  Endpoint   │──│ (tool vs generic)   │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │   │
│  └─────────────────────────┬───────────────────────────────────┘   │
│                            │                                        │
│  ┌─────────────────────────▼───────────────────────────────────┐   │
│  │                    MCP Server                                │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │ User Tools   │ │ Group Tools  │ │ License Tools        │ │   │
│  │  │ - list       │ │ - list       │ │ - list_available     │ │   │
│  │  │ - get        │ │ - get        │ │ - assign             │ │   │
│  │  │ - create     │ │ - create     │ │ - remove             │ │   │
│  │  │ - update     │ │ - add_member │ │ - get_user_licenses  │ │   │
│  │  │ - disable    │ │ - remove_mem │ │                      │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │ Sync Tools   │ │ Audit Tools  │ │ Help/Docs Tools      │ │   │
│  │  │ - trigger    │ │ - get_logs   │ │ - search_docs        │ │   │
│  │  │ - status     │ │ - get_events │ │ - get_guide          │ │   │
│  │  │ - history    │ │ - export     │ │ - explain_feature    │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## LLM Configuration

### Database Schema

```sql
CREATE TABLE ai_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Primary endpoint (required)
    primary_endpoint_url VARCHAR(500) NOT NULL,      -- e.g., https://api.openai.com/v1
    primary_api_key_encrypted TEXT,                   -- AES encrypted, nullable for local models
    primary_model VARCHAR(100) NOT NULL,             -- e.g., gpt-4o, claude-3-opus

    -- Fallback endpoint (optional)
    fallback_endpoint_url VARCHAR(500),
    fallback_api_key_encrypted TEXT,
    fallback_model VARCHAR(100),

    -- Model routing (optional specialization)
    tool_call_model VARCHAR(100),                    -- Model for function/tool calls
    -- If null, uses primary_model for everything

    -- Behavior settings
    is_enabled BOOLEAN DEFAULT false,
    max_tokens_per_request INT DEFAULT 4096,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    context_window_tokens INT DEFAULT 8000,

    -- Rate limiting
    requests_per_minute_limit INT DEFAULT 20,
    tokens_per_day_limit INT DEFAULT 100000,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(organization_id)
);

-- Usage tracking
CREATE TABLE ai_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES organization_users(id),

    endpoint_used VARCHAR(50),      -- 'primary' or 'fallback'
    model_used VARCHAR(100),
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,

    latency_ms INT,
    was_tool_call BOOLEAN DEFAULT false,
    tools_invoked TEXT[],           -- Array of tool names used

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_org_date ON ai_usage_log(organization_id, created_at);
```

### Configuration UI

```
┌─────────────────────────────────────────────────────────────────────┐
│  AI Assistant Configuration                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ☑ Enable AI Assistant                                             │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  PRIMARY MODEL (Required)                                           │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  Endpoint URL                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ https://api.openai.com/v1                               ▼   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│  Common: OpenAI, Azure OpenAI, Anthropic, Ollama, vLLM, LiteLLM    │
│                                                                     │
│  API Key (optional for local models)                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ sk-••••••••••••••••••••••••••••••••                         │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Model Name                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ gpt-4o                                                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  [Test Connection]  ✓ Connected - gpt-4o responding                │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  FALLBACK MODEL (Optional - for reliability)                        │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ☑ Enable fallback                                                 │
│                                                                     │
│  Endpoint URL                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ http://localhost:11434/v1                                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Model Name                                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ llama3.1:70b                                                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  TOOL CALLING MODEL (Optional - for function execution)             │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  ☐ Use separate model for tool calls                               │
│    (Only needed if primary model has poor tool support)            │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│  USAGE LIMITS                                                       │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  Max requests per minute: [20    ]                                 │
│  Max tokens per day:      [100000]                                 │
│                                                                     │
│                                            [Cancel] [Save Settings] │
└─────────────────────────────────────────────────────────────────────┘
```

---

## UI Entry Points

### 1. Command Bar (Cmd+K / Ctrl+K)

Primary interaction point. Spotlight-style overlay.

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍 Ask anything or type a command...                    ⌘K to open │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  RECENT                                                             │
│  ├─ "Show users without licenses"                                  │
│  ├─ "Add john to Engineering group"                                │
│  └─ "Sync Google Workspace"                                        │
│                                                                     │
│  QUICK ACTIONS                                                      │
│  ├─ ➕ Add User                          → /admin/users/new        │
│  ├─ 👥 View Groups                       → /admin/groups           │
│  ├─ 🔄 Sync Now                          → trigger sync            │
│  └─ ⚙️ Settings                          → /settings               │
│                                                                     │
│  Press Enter to ask AI, or select an action                        │
└─────────────────────────────────────────────────────────────────────┘
```

When user types a question:

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔍 Which users have Microsoft 365 E5 but no mailbox?              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  🤖 Searching users with E5 license...                             │
│                                                                     │
│  Found 3 users with Microsoft 365 E5 but no Exchange mailbox:      │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │ Name              Email                    Status          │    │
│  │ John Smith        john@company.com         Mailbox pending │    │
│  │ Sarah Connor      sarah@company.com        Sync error      │    │
│  │ Mike Johnson      mike@company.com         Not provisioned │    │
│  └────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  Would you like me to provision mailboxes for these users?         │
│                                                                     │
│  [Yes, provision all]  [Show details]  [Export list]               │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Contextual Help Button (?)

Floating button on every page. Opens context-aware help panel.

```
┌─────────────────────────────────────────────────────────────────────┐
│  Groups                                                    [?]      │
├─────────────────────────────────────────────────────────────────────┤
│  ... page content ...                                               │
└─────────────────────────────────────────────────────────────────────┘

                    ┌───────────────────────────────────────┐
                    │ 💡 Help with Groups                   │
                    ├───────────────────────────────────────┤
                    │                                       │
                    │ You're viewing Google Workspace       │
                    │ groups synced from your domain.       │
                    │                                       │
                    │ Common questions:                     │
                    │ • How do I add members?               │
                    │ • What's the difference between       │
                    │   groups and OUs?                     │
                    │ • How often do groups sync?           │
                    │                                       │
                    │ ─────────────────────────────         │
                    │ Ask a question...                     │
                    │ ┌───────────────────────────────┐     │
                    │ │                               │     │
                    │ └───────────────────────────────┘     │
                    └───────────────────────────────────────┘
```

### 3. Expandable Chat Panel

For complex multi-turn conversations. Slides in from right.

```
┌──────────────────────────────────────┬──────────────────────────────┐
│                                      │ 🤖 AI Assistant              │
│         Main App Content             ├──────────────────────────────┤
│                                      │                              │
│                                      │ You: Offboard Sarah          │
│                                      │                              │
│                                      │ AI: I'll help you offboard   │
│                                      │ sarah@company.com. This will:│
│                                      │                              │
│                                      │ 1. Disable account           │
│                                      │ 2. Remove from 5 groups      │
│                                      │ 3. Revoke Microsoft 365 E3   │
│                                      │ 4. Transfer Drive files to   │
│                                      │    manager                   │
│                                      │                              │
│                                      │ Proceed? [Confirm] [Cancel]  │
│                                      │                              │
│                                      ├──────────────────────────────┤
│                                      │ Type a message...       [➤]  │
└──────────────────────────────────────┴──────────────────────────────┘
```

---

## MCP Tools Specification

All tools are **read-only**. The AI can query data and generate commands, but cannot execute changes.

### User Query Tools

```typescript
// MCP Tool: list_users
{
  name: "list_users",
  description: "List users with optional filters",
  parameters: {
    source: "google" | "microsoft" | "all",
    filter: {
      department?: string,
      is_active?: boolean,
      has_license?: string,
      no_license?: boolean,
      last_login_before?: string,  // ISO date
      last_login_after?: string,
      search?: string              // name or email
    },
    limit?: number,
    offset?: number
  }
}

// MCP Tool: get_user
{
  name: "get_user",
  description: "Get detailed user information including groups and licenses",
  parameters: {
    identifier: string  // email or user ID
  }
}

// MCP Tool: get_user_activity
{
  name: "get_user_activity",
  description: "Get user's recent activity and login history",
  parameters: {
    identifier: string,
    days?: number  // default 30
  }
}
```

### Group Query Tools

```typescript
// MCP Tool: list_groups
{
  name: "list_groups",
  description: "List groups with filters",
  parameters: {
    source: "google" | "microsoft" | "all",
    search?: string,
    member_email?: string  // groups containing this user
  }
}

// MCP Tool: get_group
{
  name: "get_group",
  description: "Get group details including member list",
  parameters: {
    identifier: string,  // group email or ID
    include_members?: boolean
  }
}

// MCP Tool: compare_groups
{
  name: "compare_groups",
  description: "Compare membership between two groups",
  parameters: {
    group1: string,
    group2: string
  }
}
```

### License Query Tools

```typescript
// MCP Tool: list_licenses
{
  name: "list_licenses",
  description: "List available licenses with usage statistics",
  parameters: {
    source: "google" | "microsoft" | "all"
  }
}

// MCP Tool: get_license_usage
{
  name: "get_license_usage",
  description: "Get detailed license utilization by department or user",
  parameters: {
    sku?: string,  // specific license SKU
    group_by?: "department" | "location" | "job_title"
  }
}

// MCP Tool: find_unused_licenses
{
  name: "find_unused_licenses",
  description: "Find users with licenses who haven't logged in recently",
  parameters: {
    days_inactive?: number,  // default 30
    license_sku?: string
  }
}
```

### Audit & Status Tools

```typescript
// MCP Tool: get_audit_logs
{
  name: "get_audit_logs",
  description: "Get audit logs with filters",
  parameters: {
    event_type?: string,
    user_email?: string,
    date_from?: string,
    date_to?: string,
    limit?: number
  }
}

// MCP Tool: get_sync_status
{
  name: "get_sync_status",
  description: "Get sync status and history for integrations",
  parameters: {
    source: "google" | "microsoft" | "all"
  }
}

// MCP Tool: get_sync_errors
{
  name: "get_sync_errors",
  description: "Get recent sync errors and affected users",
  parameters: {
    source?: "google" | "microsoft",
    limit?: number
  }
}
```

### Report Generation Tools

```typescript
// MCP Tool: generate_report
{
  name: "generate_report",
  description: "Generate a formatted report (returns data for display or export)",
  parameters: {
    report_type: "user_list" | "license_usage" | "group_membership" | "inactive_users" | "audit_summary",
    filters?: object,
    format: "table" | "csv" | "json"
  }
}

// MCP Tool: get_dashboard_stats
{
  name: "get_dashboard_stats",
  description: "Get summary statistics for the organization",
  parameters: {}
}
```

### Documentation Tools

```typescript
// MCP Tool: search_help
{
  name: "search_help",
  description: "Search help documentation",
  parameters: {
    query: string,
    category?: "setup" | "users" | "groups" | "integrations" | "troubleshooting"
  }
}

// MCP Tool: get_feature_guide
{
  name: "get_feature_guide",
  description: "Get step-by-step guide for a feature",
  parameters: {
    feature: string  // e.g., "google-workspace-sync", "user-offboarding"
  }
}

// MCP Tool: explain_error
{
  name: "explain_error",
  description: "Explain an error message and suggest solutions",
  parameters: {
    error_message: string,
    context?: string
  }
}
```

### Command Generation Tools

```typescript
// MCP Tool: generate_api_command
{
  name: "generate_api_command",
  description: "Generate API call or script for an action (does not execute)",
  parameters: {
    action: "create_user" | "update_user" | "disable_user" | "add_to_group" | "remove_from_group" | "assign_license" | "remove_license" | "trigger_sync",
    parameters: object,
    format: "curl" | "powershell" | "python" | "javascript"
  }
}

// MCP Tool: generate_bulk_script
{
  name: "generate_bulk_script",
  description: "Generate script for bulk operations",
  parameters: {
    action: string,
    user_emails: string[],  // or criteria to select users
    format: "powershell" | "python" | "bash"
  }
}
```

---

## Security Considerations

### 1. Permission Enforcement
- All MCP tools check user's RBAC permissions before execution
- Admin-only tools (create, delete, offboard) require admin role
- Users can only query their own data unless admin

### 2. Confirmation for Destructive Actions
- Create/update/delete operations show confirmation dialog
- Offboarding shows full impact summary before proceeding
- Bulk operations require explicit user confirmation

### 3. Rate Limiting
- Per-user request limits
- Token budget per organization per day
- Automatic fallback throttling

### 4. Audit Trail
- All AI interactions logged
- Tool invocations tracked
- Export/download actions logged

### 5. Data Boundaries
- AI cannot access data outside organization
- PII handling follows existing data policies
- No data sent to LLM that user couldn't see in UI

---

## Implementation Phases

### Phase 1: Foundation (MVP)
- Database schema for AI config
- LLM gateway service with primary endpoint only
- Command bar UI (Cmd+K)
- 3 basic tools: search_help, list_users, get_sync_status
- Settings page for AI configuration

### Phase 2: Core Tools
- Full MCP server implementation
- User management tools (CRUD)
- Group management tools
- License management tools
- Fallback endpoint support

### Phase 3: Advanced Features
- Chat panel for multi-turn conversations
- Contextual help widget
- Audit logging
- Usage analytics dashboard
- Tool call model routing

### Phase 4: Intelligence
- Suggested actions based on context
- Anomaly detection ("5 users haven't synced in 3 days")
- Proactive alerts
- Custom prompt templates

---

## Endpoint Compatibility

Tested/supported endpoints:
- **OpenAI**: api.openai.com/v1
- **Azure OpenAI**: {resource}.openai.azure.com/openai/deployments/{model}
- **Anthropic** (via LiteLLM): api.anthropic.com
- **Ollama**: localhost:11434/v1
- **vLLM**: localhost:8000/v1
- **LiteLLM Proxy**: Any LiteLLM deployment
- **OpenRouter**: openrouter.ai/api/v1
- **Together AI**: api.together.xyz/v1
- **Groq**: api.groq.com/openai/v1

---

## Success Metrics

1. **Adoption**: % of admins using AI assistant weekly
2. **Task Completion**: Tasks completed via AI vs manual navigation
3. **Time Saved**: Average time to complete common tasks
4. **Query Success**: % of queries that return useful results
5. **Error Rate**: Failed tool invocations / total invocations

---

## Research Sources

- [Model Context Protocol Specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Best Practices](https://oshea00.github.io/posts/mcp-practices/)
- [Anthropic MCP Introduction](https://www.anthropic.com/news/model-context-protocol)
- [LiteLLM OpenAI-Compatible Endpoints](https://docs.litellm.ai/docs/providers/openai_compatible)
- [Best LLM Gateways 2025](https://www.getmaxim.ai/articles/best-llm-gateways-in-2025-features-benchmarks-and-builders-guide/)
- [LiteLLM Fallbacks](https://docs.litellm.ai/docs/tutorials/fallbacks)
- [LangChain Fallbacks](https://python.langchain.com/v0.1/docs/guides/productionization/fallbacks/)
- [Command Palette UX Patterns](https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1)
- [Embedded LLMs in SaaS](https://yellow.systems/blog/embedded-llms-in-saas)
- [Copilot in Microsoft 365 Admin Centers](https://learn.microsoft.com/en-us/copilot/microsoft-365/copilot-for-microsoft-365-admin)
- [Function Calling with LLMs](https://www.promptingguide.ai/applications/function_calling)
