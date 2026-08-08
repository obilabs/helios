# Fix AI Tool Calling - Implementation Tasks

## Overview

Fix the AI tool calling system to properly support function calling with compatible models and gracefully handle incompatible models.

**Ollama Endpoint:** The user's Ollama instance is accessible - agent should discover the endpoint from AI config in database or use default `http://localhost:11434`

**Available Models (user confirmed):**
- `granite4:micro-h` - IBM Granite 4 micro
- `qwen2.5-coder:latest` - Recommended for tool calling
- `qwen3-vl:8b` - Vision-language model
- `llama3.2:3b` - Current model, does NOT support tools

---

## TASK-TOOL-001: Add Ollama Model Discovery

**Priority:** P0
**Status:** COMPLETED
**Files:** `backend/src/routes/ai.routes.ts`, `backend/src/services/llm-gateway.service.ts`

### Backend Service Method

Add to `llm-gateway.service.ts`:

```typescript
/**
 * List available models from Ollama
 */
async listModels(endpoint?: string): Promise<OllamaModel[]> {
  // Use provided endpoint or extract from config
  const baseUrl = endpoint || this.getOllamaBaseUrl();

  // Call Ollama API: GET /api/tags
  const response = await fetch(`${baseUrl}/api/tags`);
  const data = await response.json();

  return data.models.map((m: any) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at,
    digest: m.digest,
    // Estimate tool support based on model family
    estimatedToolSupport: this.estimateToolSupport(m.name)
  }));
}

/**
 * Estimate if a model likely supports tool calling based on name
 */
private estimateToolSupport(modelName: string): 'likely' | 'unlikely' | 'unknown' {
  const name = modelName.toLowerCase();

  // Models known to support tools
  if (name.includes('llama3.1') || name.includes('llama-3.1')) return 'likely';
  if (name.includes('qwen2.5') || name.includes('qwen-2.5')) return 'likely';
  if (name.includes('granite3') || name.includes('granite4')) return 'likely';
  if (name.includes('mistral-nemo')) return 'likely';
  if (name.includes('command-r')) return 'likely';

  // Models known NOT to support tools well
  if (name.includes('llama3.2:1b') || name.includes('llama3.2:3b')) return 'unlikely';
  if (name.includes('phi3')) return 'unlikely';
  if (name.includes('tinyllama')) return 'unlikely';

  return 'unknown';
}
```

### API Endpoint

Add to `ai.routes.ts`:

```typescript
/**
 * GET /api/v1/ai/models
 * List available models from configured Ollama endpoint
 */
router.get('/models', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const config = await llmGatewayService.getConfig(organizationId);

    // Extract base URL from endpoint (remove /v1/chat/completions)
    const endpoint = config?.primaryEndpointUrl?.replace(/\/v1\/chat\/completions\/?$/, '')
      || 'http://localhost:11434';

    const models = await llmGatewayService.listModels(endpoint);
    successResponse(res, { models, endpoint });
  } catch (error: any) {
    logger.error('Failed to list models', { error: error.message });
    errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list models: ' + error.message);
  }
});
```

**Acceptance Criteria:**
- [x] GET /api/v1/ai/models returns list of available Ollama models
- [x] Each model includes name, size, and estimated tool support
- [x] Works with user's Ollama endpoint

---

## TASK-TOOL-002: Add Tool Calling Test Endpoint

**Priority:** P0
**Status:** COMPLETED
**Files:** `backend/src/routes/ai.routes.ts`, `backend/src/services/llm-gateway.service.ts`

### Test Method

Add to `llm-gateway.service.ts`:

```typescript
/**
 * Test if a model supports tool/function calling
 */
async testToolSupport(endpoint: string, apiKey: string | undefined, model: string): Promise<{
  supportsTools: boolean;
  testResult: 'success' | 'no_tool_call' | 'parse_error' | 'error';
  details: string;
  rawResponse?: any;
}> {
  const testTool = {
    type: 'function',
    function: {
      name: 'get_current_time',
      description: 'Get the current time',
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: 'Timezone name' }
        },
        required: []
      }
    }
  };

  const messages = [
    { role: 'system', content: 'You are a helpful assistant. Use the get_current_time tool to answer time questions.' },
    { role: 'user', content: 'What time is it?' }
  ];

  try {
    const response = await this.sendRequest(endpoint, apiKey, {
      model,
      messages,
      tools: [testTool],
      tool_choice: 'auto'
    });

    // Check if response has tool_calls
    if (response.choices?.[0]?.message?.tool_calls?.length > 0) {
      return {
        supportsTools: true,
        testResult: 'success',
        details: `Model called tool: ${response.choices[0].message.tool_calls[0].function.name}`
      };
    }

    // Check if model output tool name as text (common failure mode)
    const content = response.choices?.[0]?.message?.content || '';
    if (content.includes('get_current_time') || content.includes('tool')) {
      return {
        supportsTools: false,
        testResult: 'no_tool_call',
        details: 'Model mentioned tool but did not make structured call. Model may not support function calling.',
        rawResponse: response
      };
    }

    return {
      supportsTools: false,
      testResult: 'no_tool_call',
      details: 'Model responded without using tools. May not support function calling.',
      rawResponse: response
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
```

### API Endpoint

```typescript
/**
 * POST /api/v1/ai/test-tools
 * Test if a model supports tool calling
 */
router.post('/test-tools', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { endpoint, apiKey, model } = req.body;

    if (!endpoint || !model) {
      validationErrorResponse(res, [
        !endpoint && { field: 'endpoint', message: 'Endpoint is required' },
        !model && { field: 'model', message: 'Model is required' }
      ].filter(Boolean));
      return;
    }

    const result = await llmGatewayService.testToolSupport(endpoint, apiKey, model);
    successResponse(res, result);
  } catch (error: any) {
    errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message);
  }
});
```

**Acceptance Criteria:**
- [x] POST /api/v1/ai/test-tools tests tool support for a model
- [x] Returns clear result: success, no_tool_call, parse_error, or error
- [x] Can identify models that output tool names as text

---

## TASK-TOOL-003: Fix JSON Parsing Error Handling

**Priority:** P0
**Status:** COMPLETED
**Files:** `backend/src/services/llm-gateway.service.ts`

### Problem

When a model doesn't support tools properly, it may return malformed JSON or include tool names in plain text, causing "Unexpected token" errors.

### Solution

Update the `complete()` method to handle parsing errors gracefully:

```typescript
// In the response parsing section:
try {
  const data = await response.json();
  // ... process normally
} catch (parseError: any) {
  // Try to get raw text for debugging
  const rawText = await response.text().catch(() => 'Unable to read response');

  logger.warn('Failed to parse LLM response as JSON', {
    error: parseError.message,
    rawText: rawText.substring(0, 500),
    model: modelToUse
  });

  // Check if it looks like the model tried to output tool calls as text
  if (rawText.includes('function') || rawText.includes('tool_call')) {
    throw new Error(
      `Model "${modelToUse}" appears to not support function calling properly. ` +
      `It output tool information as text instead of structured calls. ` +
      `Try a different model like qwen2.5-coder or llama3.1.`
    );
  }

  throw new Error(`Failed to parse response from ${modelToUse}: ${parseError.message}`);
}
```

Also add detection in the chat flow for when model outputs tool names as plain text:

```typescript
// After getting response, before checking tool_calls:
const content = response.message.content || '';
const toolNames = ['search_knowledge', 'query_gw_users', 'query_gw_groups', 'get_command'];

// Check if model mentioned tool names in text instead of calling them
const mentionedTools = toolNames.filter(t => content.toLowerCase().includes(t.toLowerCase()));
if (mentionedTools.length > 0 && !response.message.tool_calls?.length) {
  logger.warn('Model mentioned tools in text but did not call them', {
    mentionedTools,
    model: response.model
  });

  // Append a note to the response
  response.message.content = content +
    '\n\n---\n*Note: Your AI model may not support function calling. ' +
    'Consider switching to qwen2.5-coder or llama3.1 for data query features.*';
}
```

**Acceptance Criteria:**
- [x] No more "Unexpected token" errors shown to user
- [x] Clear error message when model doesn't support tools
- [x] Warning appended when model mentions but doesn't call tools

---

## TASK-TOOL-004: Update AI Settings UI with Model Selector

**Priority:** P1
**Status:** COMPLETED
**Files:** `frontend/src/components/settings/AISettings.tsx`, `frontend/src/components/settings/AISettings.css`

### Features to Add

1. **"Discover Models" button** next to model input
2. **Model dropdown** populated from /api/v1/ai/models
3. **Tool support indicator** showing likely/unlikely/unknown
4. **"Test Tool Support" button** to verify selected model
5. **Warning banner** if selected model unlikely to support tools

### UI Implementation

```tsx
// State
const [availableModels, setAvailableModels] = useState<OllamaModel[]>([]);
const [loadingModels, setLoadingModels] = useState(false);
const [toolTestResult, setToolTestResult] = useState<ToolTestResult | null>(null);
const [testingTools, setTestingTools] = useState(false);

// Fetch models
const discoverModels = async () => {
  setLoadingModels(true);
  try {
    const res = await fetch('/api/v1/ai/models', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      setAvailableModels(data.data.models);
    }
  } finally {
    setLoadingModels(false);
  }
};

// Test tool support
const testToolSupport = async () => {
  setTestingTools(true);
  try {
    const res = await fetch('/api/v1/ai/test-tools', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        endpoint: primaryEndpoint,
        apiKey: primaryApiKey,
        model: primaryModel
      })
    });
    const data = await res.json();
    setToolTestResult(data.data);
  } finally {
    setTestingTools(false);
  }
};
```

### UI Layout

```tsx
<div className="form-group">
  <label>Primary Model</label>
  <div className="model-selector">
    <input
      type="text"
      value={primaryModel}
      onChange={(e) => setPrimaryModel(e.target.value)}
      list="model-list"
    />
    <datalist id="model-list">
      {availableModels.map(m => (
        <option key={m.name} value={m.name}>
          {m.name} ({formatBytes(m.size)}) - Tools: {m.estimatedToolSupport}
        </option>
      ))}
    </datalist>
    <button
      type="button"
      onClick={discoverModels}
      disabled={loadingModels}
      className="discover-btn"
    >
      {loadingModels ? <Loader2 className="spin" /> : <RefreshCw />}
      Discover
    </button>
  </div>

  {/* Tool support indicator */}
  {primaryModel && (
    <div className="tool-support-section">
      <button
        type="button"
        onClick={testToolSupport}
        disabled={testingTools || !primaryEndpoint}
        className="test-tools-btn"
      >
        {testingTools ? 'Testing...' : 'Test Tool Support'}
      </button>

      {toolTestResult && (
        <div className={`tool-test-result ${toolTestResult.supportsTools ? 'success' : 'warning'}`}>
          {toolTestResult.supportsTools ? (
            <><CheckCircle /> Model supports tool calling</>
          ) : (
            <><AlertTriangle /> {toolTestResult.details}</>
          )}
        </div>
      )}
    </div>
  )}
</div>
```

**Acceptance Criteria:**
- [x] "Discover" button fetches and displays available models
- [x] Model dropdown shows models with size and tool support estimate
- [x] "Test Tool Support" button verifies tool calling works
- [x] Clear feedback on tool support status

---

## TASK-TOOL-005: End-to-End Testing

**Priority:** P1
**Status:** COMPLETED
**Files:** `openspec/testing/tests/ai-tool-calling.test.ts`

### Test Cases

1. **Model Discovery**
   - Navigate to Settings > AI Assistant
   - Click "Discover" - should show available models
   - Verify models include tool support estimate

2. **Tool Support Testing**
   - Select `qwen2.5-coder:latest`
   - Click "Test Tool Support"
   - Should show "Model supports tool calling"

3. **Tool Calling with Compatible Model**
   - Configure AI with `qwen2.5-coder:latest`
   - Open AI chat
   - Ask "How many users are in my organization?"
   - Should execute `query_gw_users` tool and return real data

4. **Graceful Fallback with Incompatible Model**
   - Configure AI with `llama3.2:3b`
   - Open AI chat
   - Ask "How many users are in my organization?"
   - Should NOT crash with "unexpected token"
   - Should show warning about tool support

**Acceptance Criteria:**
- [x] All test cases pass
- [x] No crashes or unhandled errors
- [x] Clear user feedback in all scenarios

---

## Summary

| Task | Priority | Description |
|------|----------|-------------|
| TOOL-001 | P0 | Model discovery endpoint |
| TOOL-002 | P0 | Tool support test endpoint |
| TOOL-003 | P0 | Fix JSON parsing errors |
| TOOL-004 | P1 | UI model selector with discovery |
| TOOL-005 | P1 | End-to-end testing |

**Agent Instructions:**
1. Start with TASK-TOOL-003 to fix the immediate error
2. Implement TOOL-001 and TOOL-002 for model discovery/testing
3. Update UI in TOOL-004
4. Run manual tests per TOOL-005

**User's Ollama Endpoint:** Check AI config in database, likely `http://localhost:11434/v1/chat/completions` or similar
