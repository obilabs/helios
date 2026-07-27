-- Migration: 018 - Create API Keys System
-- Description: Adds dual-tier API key authentication (Service and Vendor keys)
-- Author: Claude
-- Date: 2025-11-01

-- Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Basic information
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('service', 'vendor')),

  -- Security: Never store plaintext - hash like passwords
  key_hash VARCHAR(255) NOT NULL UNIQUE,
  key_prefix VARCHAR(30) NOT NULL,  -- For UI display (e.g., "helios_prod_a9k3...")

  -- Permissions (JSONB array of scopes)
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMP,

  -- Service-specific configuration
  service_config JSONB,
  -- Example: { "systemName": "Helios MTP Sync", "automationRules": {...} }

  -- Vendor-specific configuration
  vendor_config JSONB,
  -- Example: {
  --   "vendorName": "GridWorx MSP",
  --   "vendorContact": "support@gridworx.io",
  --   "requiresActor": true,
  --   "allowedActors": ["john@msp.com", "sarah@msp.com"],
  --   "requiresClientReference": false
  -- }

  -- Security features
  ip_whitelist JSONB,  -- Array of IP addresses or CIDR blocks
  rate_limit_config JSONB,  -- { "requestsPerHour": 1000, "burstLimit": 100 }

  -- Constraints
  CONSTRAINT unique_org_key_name UNIQUE(organization_id, name)
);

-- Create api_key_usage_logs table
CREATE TABLE IF NOT EXISTS api_key_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  timestamp TIMESTAMP DEFAULT NOW(),

  -- The action performed
  action VARCHAR(100) NOT NULL,  -- e.g., "create_user", "update_group", "list_users"
  resource_type VARCHAR(50) NOT NULL,  -- e.g., "user", "group", "setting"
  resource_id VARCHAR(255),  -- ID of the affected resource
  result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failure', 'error')),

  -- Actor context (for vendor keys)
  actor_type VARCHAR(20),  -- "human", "automation", "system"
  actor_name VARCHAR(255),
  actor_email VARCHAR(255),
  actor_id VARCHAR(255),  -- External ID from vendor system
  client_reference VARCHAR(255),  -- Ticket number, work order, etc.

  -- Request context
  ip_address INET NOT NULL,
  user_agent TEXT,
  request_duration INTEGER,  -- milliseconds
  http_method VARCHAR(10),
  http_path TEXT,
  http_status INTEGER,

  -- Error information (if result = 'failure' or 'error')
  error_message TEXT,
  error_code VARCHAR(50),

  -- Additional metadata
  metadata JSONB
);

-- Indexes for api_keys table
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(organization_id, is_active) WHERE is_active = true;
CREATE INDEX idx_api_keys_type ON api_keys(organization_id, type);
CREATE INDEX idx_api_keys_expiration ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- Indexes for api_key_usage_logs table
CREATE INDEX idx_api_usage_key_timestamp ON api_key_usage_logs(api_key_id, timestamp DESC);
CREATE INDEX idx_api_usage_actor_email ON api_key_usage_logs(actor_email, timestamp DESC) WHERE actor_email IS NOT NULL;
CREATE INDEX idx_api_usage_timestamp ON api_key_usage_logs(timestamp DESC);
CREATE INDEX idx_api_usage_result ON api_key_usage_logs(result, timestamp DESC);

-- Add comment to tables
COMMENT ON TABLE api_keys IS 'API keys for programmatic access. Supports Service (automation) and Vendor (human operators) types.';
COMMENT ON TABLE api_key_usage_logs IS 'Audit log of all API calls made with API keys. Tracks actor attribution for vendor keys.';

-- Add comments to key columns
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the API key. Plaintext key is never stored.';
COMMENT ON COLUMN api_keys.key_prefix IS 'First ~20 characters of key for display in UI (e.g., helios_prod_a9k3...)';
COMMENT ON COLUMN api_keys.type IS 'Service (automation, no actor) or Vendor (human operators, requires actor headers)';
COMMENT ON COLUMN api_keys.permissions IS 'Array of permission scopes (e.g., ["read:users", "write:groups"])';
COMMENT ON COLUMN api_keys.vendor_config IS 'Vendor-specific config including actor requirements and allowed actors list';
COMMENT ON COLUMN api_key_usage_logs.actor_email IS 'Email of human operator (required for vendor keys)';
COMMENT ON COLUMN api_key_usage_logs.client_reference IS 'Ticket number or reference from vendor system';
