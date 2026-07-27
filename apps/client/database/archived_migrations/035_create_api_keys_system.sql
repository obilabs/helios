-- Migration: 035_create_api_keys_system.sql
-- Description: Create API key management system for machine-to-machine authentication
-- Date: 2025-12-08

-- API Keys table for storing hashed keys
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Key identification
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Key type: 'service' for automation, 'vendor' for human operators
    key_type VARCHAR(20) NOT NULL CHECK (key_type IN ('service', 'vendor')),

    -- Security: Never store plaintext - hash like passwords
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(20) NOT NULL,  -- For UI display (e.g., "helios_prod_a9k3...")

    -- Permissions as JSON array of scopes
    permissions JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Lifecycle
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Usage tracking
    last_used_at TIMESTAMPTZ,
    use_count INTEGER DEFAULT 0,

    -- Service-specific configuration
    -- { systemName: string, automationRules?: object }
    service_config JSONB,

    -- Vendor-specific configuration
    -- { vendorName: string, vendorContact: string, requiresActor: boolean,
    --   allowedActors?: array, requiresClientReference?: boolean }
    vendor_config JSONB,

    -- Security options
    -- Array of IP addresses or CIDR ranges, null means no restriction
    ip_whitelist JSONB,

    -- Rate limiting configuration
    -- { requestsPerHour: number, requestsPerDay?: number }
    rate_limit_config JSONB,

    -- Organization-scoped unique name
    UNIQUE(organization_id, name)
);

-- API Key usage/audit logs
CREATE TABLE IF NOT EXISTS api_key_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Timestamp
    timestamp TIMESTAMPTZ DEFAULT NOW(),

    -- The action performed
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failure', 'denied')),
    error_message TEXT,

    -- Actor context (for vendor keys)
    actor_type VARCHAR(20) CHECK (actor_type IN ('human', 'automation', 'system')),
    actor_name VARCHAR(255),
    actor_email VARCHAR(255),
    actor_id VARCHAR(255),
    client_reference VARCHAR(255),

    -- Request context
    ip_address INET NOT NULL,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path VARCHAR(500),
    request_duration INTEGER,  -- milliseconds

    -- Additional metadata
    metadata JSONB
);

-- Indexes for performance
CREATE INDEX idx_api_keys_org ON api_keys(organization_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(organization_id, is_active) WHERE is_active = true;
CREATE INDEX idx_api_keys_type ON api_keys(organization_id, key_type);
CREATE INDEX idx_api_keys_expires ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_api_usage_key ON api_key_usage_logs(api_key_id, timestamp DESC);
CREATE INDEX idx_api_usage_org ON api_key_usage_logs(organization_id, timestamp DESC);
CREATE INDEX idx_api_usage_actor ON api_key_usage_logs(actor_email, timestamp DESC) WHERE actor_email IS NOT NULL;
CREATE INDEX idx_api_usage_result ON api_key_usage_logs(api_key_id, result, timestamp DESC);

-- Partitioning hint for large installations (optional, applied manually if needed)
-- Consider partitioning api_key_usage_logs by timestamp for very large datasets

-- Down migration (for rollback)
-- DROP INDEX IF EXISTS idx_api_usage_result;
-- DROP INDEX IF EXISTS idx_api_usage_actor;
-- DROP INDEX IF EXISTS idx_api_usage_org;
-- DROP INDEX IF EXISTS idx_api_usage_key;
-- DROP INDEX IF EXISTS idx_api_keys_expires;
-- DROP INDEX IF EXISTS idx_api_keys_type;
-- DROP INDEX IF EXISTS idx_api_keys_active;
-- DROP INDEX IF EXISTS idx_api_keys_hash;
-- DROP INDEX IF EXISTS idx_api_keys_org;
-- DROP TABLE IF EXISTS api_key_usage_logs;
-- DROP TABLE IF EXISTS api_keys;
