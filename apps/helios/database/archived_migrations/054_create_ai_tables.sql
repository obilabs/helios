-- Migration: 054_create_ai_tables.sql
-- Description: Create AI configuration and usage tracking tables
-- Created: 2025-12-16

-- AI Configuration table
-- Stores LLM endpoint configuration for the AI Assistant feature
CREATE TABLE IF NOT EXISTS ai_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Primary endpoint (required)
    primary_endpoint_url VARCHAR(500) NOT NULL,
    primary_api_key_encrypted TEXT,  -- AES encrypted, nullable for local models
    primary_model VARCHAR(100) NOT NULL,

    -- Fallback endpoint (optional)
    fallback_endpoint_url VARCHAR(500),
    fallback_api_key_encrypted TEXT,
    fallback_model VARCHAR(100),

    -- Optional specialized model for tool calls
    tool_call_model VARCHAR(100),

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

    CONSTRAINT ai_config_organization_unique UNIQUE(organization_id)
);

-- AI Usage Log table
-- Tracks all AI interactions for usage monitoring and debugging
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

    -- Request details
    endpoint_used VARCHAR(50),  -- 'primary' or 'fallback'
    model_used VARCHAR(100),
    request_type VARCHAR(50),  -- 'chat', 'tool_call', 'completion'

    -- Token usage
    prompt_tokens INT,
    completion_tokens INT,
    total_tokens INT,

    -- Performance
    latency_ms INT,

    -- Tool usage
    was_tool_call BOOLEAN DEFAULT false,
    tools_invoked TEXT[],  -- Array of tool names used

    -- Error tracking
    was_successful BOOLEAN DEFAULT true,
    error_message TEXT,
    error_code VARCHAR(50),

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Chat History table
-- Stores conversation history for multi-turn interactions
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,  -- Groups messages in a conversation

    -- Message content
    role VARCHAR(20) NOT NULL,  -- 'user', 'assistant', 'system', 'tool'
    content TEXT NOT NULL,

    -- Tool call details (if role is 'assistant' with tool calls or 'tool')
    tool_calls JSONB,  -- For assistant messages with tool calls
    tool_call_id VARCHAR(100),  -- For tool response messages
    tool_name VARCHAR(100),  -- For tool response messages

    -- Context
    page_context VARCHAR(255),  -- Which page the user was on

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_usage_org_date ON ai_usage_log(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model ON ai_usage_log(model_used, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_chat_session ON ai_chat_history(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_chat_user ON ai_chat_history(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_chat_org ON ai_chat_history(organization_id, created_at);

-- Add updated_at trigger for ai_config
CREATE OR REPLACE FUNCTION update_ai_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_ai_config_updated_at ON ai_config;
DROP TRIGGER IF EXISTS trigger_ai_config_updated_at ON PLACEHOLDER;
CREATE TRIGGER trigger_ai_config_updated_at
    BEFORE UPDATE ON ai_config
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_config_updated_at();

-- Comments for documentation
COMMENT ON TABLE ai_config IS 'AI Assistant configuration per organization - LLM endpoints, models, rate limits';
COMMENT ON TABLE ai_usage_log IS 'AI Assistant usage tracking - tokens, latency, errors for monitoring and billing';
COMMENT ON TABLE ai_chat_history IS 'AI Assistant conversation history - supports multi-turn interactions';

COMMENT ON COLUMN ai_config.primary_api_key_encrypted IS 'AES-256 encrypted API key, null for local models like Ollama';
COMMENT ON COLUMN ai_config.tool_call_model IS 'Optional separate model for function/tool calls if primary has poor tool support';
COMMENT ON COLUMN ai_usage_log.tools_invoked IS 'Array of MCP tool names called during this request';
