# Fix AI Tool Calling

## Problem Statement

The AI Assistant's tool calling feature is not working correctly:

1. **Unexpected token error** - JSON parsing fails when processing tool call responses from certain models
2. **Model compatibility** - Small models like `llama3.2:3b` don't support function calling and output tool names as plain text instead of structured calls
3. **No model discovery** - Cannot see which models are available on the Ollama instance
4. **No model testing** - No way to test if a model supports tool calling before configuring it

## Current Behavior

When asking "show me users who haven't logged in recently":
- Model outputs: `search_knowledge query_gw_users inactive` (plain text)
- Expected: Structured tool_calls array in response
- Error: "Unexpected token" when parsing malformed JSON

## Proposed Solution

### 1. Add Ollama Model Discovery Endpoint

Create `/api/v1/ai/models` endpoint that:
- Connects to Ollama API at configured endpoint
- Lists available models with their details
- Returns model capabilities (size, supports_tools, etc.)

### 2. Add Model Testing Endpoint

Create `/api/v1/ai/test-tools` endpoint that:
- Sends a test prompt with a simple tool definition
- Checks if model returns proper tool_calls structure
- Returns compatibility assessment

### 3. Improve Error Handling

Update `llm-gateway.service.ts` to:
- Gracefully handle models that don't support tools
- Detect when model outputs tool names as text instead of calling them
- Fall back to non-tool mode if tool calling fails
- Better JSON parsing error handling with detailed logging

### 4. Add UI for Model Selection

Update AI Settings to:
- Show dropdown of available models from Ollama
- Display model capabilities (size, tool support status)
- Allow testing tool support before saving
- Show warning if selected model doesn't support tools

## Files to Modify

- `backend/src/routes/ai.routes.ts` - Add model discovery and test endpoints
- `backend/src/services/llm-gateway.service.ts` - Improve error handling, add model fetching
- `frontend/src/components/settings/AISettings.tsx` - Add model selector with discovery

## Success Criteria

- [ ] Can list available Ollama models in UI
- [ ] Can test if a model supports tool calling
- [ ] Tool calling works with compatible models (qwen2.5-coder, granite4)
- [ ] Graceful fallback when model doesn't support tools
- [ ] Clear error messages instead of "unexpected token"

## Testing

1. Configure Helios AI with `qwen2.5-coder:latest`
2. Ask "how many users are admins?"
3. Verify tool is called and real data is returned
4. Test with non-tool model and verify graceful fallback
