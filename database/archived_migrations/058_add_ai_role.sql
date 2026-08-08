-- Migration: Add AI role configuration
-- This allows configuring what the AI assistant can do

-- Add ai_role column to ai_config table
-- Roles:
--   viewer   = Read-only, can query data but cannot execute commands (default, safest)
--   operator = Can execute safe operations like sync, list commands
--   admin    = Full access to all operations including create/delete

ALTER TABLE ai_config
ADD COLUMN IF NOT EXISTS ai_role VARCHAR(20) DEFAULT 'viewer'
CHECK (ai_role IN ('viewer', 'operator', 'admin'));

-- Add comment explaining the roles
COMMENT ON COLUMN ai_config.ai_role IS 'AI permission level: viewer (read-only), operator (safe ops), admin (full access)';

-- Update existing rows to have viewer role (safest default)
UPDATE ai_config SET ai_role = 'viewer' WHERE ai_role IS NULL;
