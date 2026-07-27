-- Migration: 057_add_ai_mcp_and_prompt_config.sql
-- Description: Add MCP server configuration and custom system prompt fields to ai_config
-- Created: 2025-12-17

-- Add MCP Server configuration
ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS mcp_enabled BOOLEAN DEFAULT false;
ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS mcp_tools JSONB DEFAULT '{"help":true,"users":true,"groups":true,"reports":true,"commands":true}'::jsonb;

-- Add custom system prompt configuration
ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS use_custom_prompt BOOLEAN DEFAULT false;
ALTER TABLE ai_config ADD COLUMN IF NOT EXISTS custom_system_prompt TEXT;

-- Comments for documentation
COMMENT ON COLUMN ai_config.mcp_enabled IS 'Enable MCP (Model Context Protocol) server for AI tool access';
COMMENT ON COLUMN ai_config.mcp_tools IS 'JSON object specifying which MCP tools are enabled (help, users, groups, reports, commands)';
COMMENT ON COLUMN ai_config.use_custom_prompt IS 'Whether to use a custom system prompt instead of the default Helios prompt';
COMMENT ON COLUMN ai_config.custom_system_prompt IS 'Custom system prompt text when use_custom_prompt is true';
