# AI Assistant - Implementation Tasks

## Phase 1: Foundation (MVP) - COMPLETED 2025-12-16

### TASK-AI-001: Create AI configuration database schema
**Priority:** P0
**Status:** COMPLETED
**File:** `database/migrations/054_create_ai_tables.sql`

```sql
-- AI configuration table
CREATE TABLE ai_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Primary endpoint (required)
    primary_endpoint_url VARCHAR(500) NOT NULL,
    primary_api_key_encrypted TEXT,
    primary_model VARCHAR(100) NOT NULL,

    -- Fallback endpoint (optional)
    fallback_endpoint_url VARCHAR(500),
    fallback_api_key_encrypted TEXT,
    fallback_model VARCHAR(100),

    -- Optional specialized model
    tool_call_model VARCHAR(100),

    -- Settings
    is_enabled BOOLEAN DEFAULT false,
    max_tokens_per_request INT DEFAULT 4096,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    requests_per_minute_limit INT DEFAULT 20,
    tokens_per_day_limit INT DEFAULT 100000,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id)
);

-- Usage tracking
CREATE TABLE ai_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    user_id UUID NOT NULL REFERENCES organization_users(id),
    endpoint_used VARCHAR(50),
    model_used VARCHAR(100),
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,
    latency_ms INT,
    was_tool_call BOOLEAN DEFAULT false,
    tools_invoked TEXT[],
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_usage_org_date ON ai_usage_log(organization_id, created_at);
CREATE INDEX idx_ai_usage_user ON ai_usage_log(user_id, created_at);
```

**Acceptance Criteria:**
- [x] Migration runs without errors
- [x] Tables created with correct schema
- [x] Foreign keys work correctly

---

### TASK-AI-002: Create LLM Gateway service
**Priority:** P0
**Status:** COMPLETED
**File:** `backend/src/services/llm-gateway.service.ts`

**Core functionality:**
```typescript
interface LLMGatewayService {
  // Test connection to an endpoint
  testConnection(endpoint: string, apiKey?: string, model: string): Promise<{success: boolean, error?: string}>;

  // Send a completion request (with automatic fallback)
  complete(options: {
    messages: Message[];
    tools?: Tool[];
    temperature?: number;
    maxTokens?: number;
  }): Promise<CompletionResponse>;

  // Get current config for organization
  getConfig(organizationId: string): Promise<AIConfig | null>;

  // Save/update config
  saveConfig(organizationId: string, config: Partial<AIConfig>): Promise<void>;
}
```

**Requirements:**
- OpenAI-compatible API format
- Automatic retry on failure
- Fallback to secondary endpoint if primary fails
- Request/response logging
- Rate limiting enforcement

**Acceptance Criteria:**
- [x] Can connect to OpenAI API
- [x] Can connect to Ollama local endpoint
- [x] Fallback works when primary fails
- [x] Rate limits enforced
- [x] Usage logged to database

---

### TASK-AI-003: Create AI configuration API routes
**Priority:** P0
**Status:** COMPLETED
**File:** `backend/src/routes/ai.routes.ts`

**Endpoints:**
```
GET  /api/v1/ai/config           - Get current AI configuration
PUT  /api/v1/ai/config           - Save AI configuration
POST /api/v1/ai/test-connection  - Test endpoint connection
GET  /api/v1/ai/usage            - Get usage statistics
POST /api/v1/ai/chat             - Send chat message (main interaction endpoint)
```

**Acceptance Criteria:**
- [x] Config endpoints work (CRUD)
- [x] Test connection validates endpoint
- [x] Chat endpoint returns responses
- [x] Admin-only access for config
- [x] All users can use chat (if enabled)

---

### TASK-AI-004: Create AI Settings UI
**Priority:** P0
**Status:** COMPLETED
**File:** `frontend/src/components/settings/AISettings.tsx`

**Features:**
- Enable/disable toggle
- Primary endpoint configuration (URL, API key, model)
- Fallback endpoint configuration (optional)
- Tool call model override (optional)
- Test connection buttons
- Usage limits configuration

**Acceptance Criteria:**
- [x] Form validates inputs
- [x] Test connection shows result
- [x] Settings persist on save
- [x] API key shown as dots (masked)
- [x] Clear error messages on failure

---

### TASK-AI-005: Create Command Bar component (Cmd+K)
**Priority:** P0
**Status:** COMPLETED
**File:** `frontend/src/components/ai/CommandBar.tsx`

**Features:**
- Global keyboard shortcut (Cmd+K / Ctrl+K)
- Modal overlay with search input
- Recent queries section
- Quick actions section
- AI response area
- Loading states

**Acceptance Criteria:**
- [x] Opens on Cmd+K / Ctrl+K
- [x] Closes on Escape or click outside
- [x] Input is auto-focused
- [x] Recent queries shown
- [x] Quick actions navigate correctly
- [x] AI responses display properly
- [x] Loading spinner during request

---

### TASK-AI-006: Implement basic help search tool
**Priority:** P0
**Status:** COMPLETED
**File:** `backend/src/services/mcp/tools/help-search.tool.ts`

**Tool definition:**
```typescript
{
  name: "search_help",
  description: "Search Helios documentation and guides",
  parameters: {
    query: { type: "string", required: true },
    category: { type: "string", enum: ["setup", "users", "groups", "integrations"] }
  }
}
```

**Searches:**
- In-app help content (markdown files)
- Feature descriptions
- Troubleshooting guides

**Acceptance Criteria:**
- [x] Returns relevant help content
- [x] Supports category filtering
- [x] Returns formatted markdown
- [x] Handles no results gracefully

---

## Phase 2: Query Tools (Read-Only)

### TASK-AI-007: Implement user query tools
**Priority:** P1
**Status:** COMPLETED
**File:** `backend/src/services/mcp/tools/user.tools.ts`

**Tools (all read-only):**
- `list_users` - List with filters (department, status, license, last login)
- `get_user` - Get user details including groups and licenses
- `get_user_activity` - Get login history and recent activity

**Acceptance Criteria:**
- [x] Query Helios users (organization_users table)
- [x] Filters work correctly (department, status, role, search)
- [x] Results formatted for LLM context
- Note: Google/Microsoft direct API queries can be added later

---

### TASK-AI-008: Implement group query tools
**Priority:** P1
**Status:** COMPLETED
**File:** `backend/src/services/mcp/tools/group.tools.ts`

**Tools (all read-only):**
- `list_groups` - List with filters
- `get_group` - Get group details with member list
- `compare_groups` - Show overlap/difference between two groups

**Acceptance Criteria:**
- [x] Query Helios groups (access_groups table)
- [x] Member list included when requested
- [x] Comparison shows overlap correctly
- Note: Google/Microsoft direct API queries can be added later

---

### TASK-AI-009: Implement license query tools
**Priority:** P1
**Status:** DEFERRED
**File:** `backend/src/services/mcp/tools/license.tools.ts`

**Tools (all read-only):**
- `list_licenses` - List available licenses with usage stats
- `get_license_usage` - Breakdown by department/location
- `find_unused_licenses` - Users with license but inactive

**Acceptance Criteria:**
- [ ] Shows all available SKUs dynamically
- [ ] Usage percentages accurate
- [ ] Department breakdown works
- [ ] Inactive user detection works

*Deferred: Requires direct Google/Microsoft API integration for license data*

---

### TASK-AI-010: Implement report generation tools
**Priority:** P1
**Status:** COMPLETED
**File:** `backend/src/services/mcp/tools/report.tools.ts`

**Tools:**
- `generate_report` - Generate formatted reports (table, CSV, JSON)
- `get_dashboard_stats` - Summary statistics

**Report Types:**
- User list with filters
- ~~License utilization~~ (deferred)
- Group membership matrix
- Inactive users
- Audit summary

**Acceptance Criteria:**
- [x] Reports generate correctly (table, CSV, JSON, markdown)
- [x] CSV export works
- [x] JSON format correct
- [x] Dashboard stats match actual data

---

### TASK-AI-011: Implement command generation tools
**Priority:** P1
**Status:** COMPLETED
**File:** `backend/src/services/mcp/tools/command.tools.ts`

**Tools:**
- `generate_api_command` - Generate curl/PowerShell/Python/JavaScript for an action
- `generate_bulk_script` - Generate script for bulk operations

**Supported Actions:**
- Create user
- Update user
- Disable user
- Add/remove from group
- Get user/group
- List users/groups
- Trigger sync (Google/Microsoft)

**Bulk Actions:**
- disable_users
- add_users_to_group
- remove_users_from_group
- export_users
- export_groups

**Acceptance Criteria:**
- [x] curl commands are valid
- [x] PowerShell scripts work
- [x] Python code is correct
- [x] JavaScript/fetch code correct
- [x] Commands include auth headers

---

### TASK-AI-012: Implement MCP server wrapper
**Priority:** P1
**Status:** COMPLETED
**File:** `backend/src/mcp/server.ts`

**Responsibilities:**
- Register all tools from OpenAPI spec
- Handle tool invocation requests
- Format tool results for LLM
- Error handling and logging

**Also Implemented:**
- HTTP routes at `/api/v1/mcp/*` in `backend/src/routes/mcp.routes.ts`
- OpenAPI to MCP converter in `backend/src/mcp/openapi-converter.ts`

**Acceptance Criteria:**
- [x] All tools registered (auto-generated from OpenAPI)
- [x] Tool invocation routing works
- [x] Results formatted correctly
- [x] Errors handled gracefully

---

### TASK-AI-013: Add fallback endpoint support
**Priority:** P1
**Status:** COMPLETED
**File:** `backend/src/services/llm-gateway.service.ts`

**Logic:**
1. Try primary endpoint
2. If fails (timeout, 5xx, rate limit), try fallback
3. Log which endpoint was used
4. Track failure rates

**Implementation:**
- `complete()` method loops through primary then fallback endpoints
- Each failure is logged to `ai_usage_log` with error message
- Success includes `endpointUsed: 'primary' | 'fallback'`
- Rate limits checked before requests

**Acceptance Criteria:**
- [x] Automatic failover works
- [x] Failover logged
- [x] Usage statistics include endpoint breakdown
- [x] Failure rate tracking in usage stats

---

## Phase 3: Advanced Features

### TASK-AI-014: Create expandable chat panel
**Priority:** P2
**Status:** COMPLETED
**File:** `frontend/src/components/ai/ChatPanel.tsx`

**Features:**
- Slide-in panel from right
- Multi-turn conversation
- Message history
- Tool results displayed inline
- Copy buttons for generated commands

**Implementation (2025-12-16):**
- Created `ChatPanel.tsx` component with:
  - Slide-in animation from right
  - Expandable/minimize toggle
  - Multi-turn conversation with session persistence
  - Local storage for chat history
  - Code block rendering with syntax highlighting
  - Copy-to-clipboard for messages and code blocks
  - Typing indicator during loading
  - Empty state with suggested prompts
  - Error handling with dismissible alerts
- Created `ChatPanel.css` with professional styling following design system
- Integrated into `App.tsx`:
  - Added state for panel visibility
  - Added MessageSquare button in header (shown when AI is enabled)
  - Purple styling to indicate AI feature

**Acceptance Criteria:**
- [x] Panel slides smoothly
- [x] Conversation persists during session
- [x] Tool results shown inline (code blocks rendered)
- [x] Copy-to-clipboard works

---

### TASK-AI-015: Create contextual help widget
**Priority:** P2
**Status:** COMPLETED
**File:** `frontend/src/components/ai/HelpWidget.tsx`

**Features:**
- Floating (?) button on each page
- Context-aware suggestions based on current page
- Quick questions relevant to page
- Expandable to full chat

**Implementation (2025-12-16):**
- Created `HelpWidget.tsx` component with:
  - Floating purple (?) button in bottom-right corner
  - Keyboard shortcut (?) to toggle
  - Context-aware suggestions for 15+ page types
  - Three suggestion categories: Quick, How-to, Explain
  - Quick answer feature for brief responses
  - Expand to full ChatPanel integration
  - Disabled state when AI not configured
- Created `HelpWidget.css` with professional styling
- Integrated into App.tsx:
  - Widget hidden when ChatPanel is open
  - Passes currentPage context automatically
  - Opens ChatPanel with pre-filled question

**Acceptance Criteria:**
- [x] Shows on all pages
- [x] Suggestions relevant to page
- [x] Can expand to chat panel
- [x] Non-intrusive positioning

---

### TASK-AI-016: Create AI usage dashboard
**Priority:** P2
**Status:** COMPLETED
**File:** `frontend/src/pages/settings/AIUsage.tsx`

**Metrics:**
- Total requests today/week/month
- Token usage vs limits
- Most common queries
- Tool invocation breakdown
- Error rate

**Implementation (2025-12-16):**
- Created `AIUsage.tsx` component with:
  - Summary cards: Total Requests, Total Tokens, Avg Latency, Error Rate
  - Trend indicators comparing this week vs last week
  - Quota bars for token/request limits (when available)
  - Daily usage bar chart (last 14 days)
  - Model breakdown with percentage bars
  - Tool invocations section (when available)
  - Daily breakdown table with avg tokens/request
  - Date range selector (7/30/90 days)
  - CSV export functionality
  - Refresh button
- Created `AIUsage.css` with professional styling
- Updated `AISettings.tsx`:
  - Added "View Detailed Usage" button in usage section
  - Added `onViewUsage` callback prop

**Acceptance Criteria:**
- [x] Shows usage over time
- [x] Shows remaining quota
- [x] Export usage data
- [x] Filter by date range

---

### TASK-AI-017: Add tool call model routing
**Priority:** P2
**Status:** COMPLETED
**File:** `backend/src/services/llm-gateway.service.ts` (update)

**Logic:**
- If `tool_call_model` is set, use it for tool-calling requests
- Otherwise use primary model
- Automatically detect if request needs tools

**Implementation (2025-12-16):**
- Backend already implemented routing in llm-gateway.service.ts:
  - Lines 451-457: Checks for tools and uses toolCallModel if set
  - Lines 478-484: Fallback endpoint also respects toolCallModel
- Added UI configuration in AISettings.tsx:
  - New "Tool Call Model" section with checkbox toggle
  - Model input field with datalist suggestions
  - Explanation text for feature usage
- Added CSS for new UI elements:
  - .section-description for explanatory text
  - .checkbox-group and .checkbox-label for toggle
  - .checkbox-text styling

**Acceptance Criteria:**
- [x] Tool requests routed to tool model
- [x] Non-tool requests use primary
- [x] Config UI allows setting tool model

---

## Phase 4: Intelligence (Future)

### TASK-AI-018: Proactive insights
**Priority:** P3

Surface insights based on data patterns (read-only):
- "5 users haven't logged in for 30 days"
- "License X is 95% utilized"
- "Sync hasn't run in 24 hours"

---

### TASK-AI-019: Custom prompt templates
**Priority:** P3

Allow admins to create reusable prompts:
- "Monthly license report"
- "New hire checklist query"
- "Security audit queries"

---

## Summary

| Phase | Tasks | Priority | Focus |
|-------|-------|----------|-------|
| 1. Foundation | AI-001 to AI-006 | P0 | DB schema, LLM gateway, command bar, settings UI |
| 2. Query Tools | AI-007 to AI-013 | P1 | Read-only MCP tools, reports, command generation |
| 3. Advanced | AI-014 to AI-017 | P2 | Chat panel, help widget, usage tracking |
| 4. Intelligence | AI-018 to AI-019 | P3 | Proactive insights, templates |

**Key Design Decision: Read-Only + Command Generation**
- AI can query data and generate reports
- AI generates commands/scripts for user to copy and execute
- AI cannot directly modify users, groups, or licenses
- This approach is safer, faster to ship, and easier to trust

**Start with Phase 1 to establish the foundation.**
