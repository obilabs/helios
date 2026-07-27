-- Helios Platform Database Schema
-- Clean implementation for production

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create enum types
CREATE TYPE user_role AS ENUM ('platform_owner', 'tenant_admin', 'tenant_user');
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'login', 'logout', 'switch_tenant');

-- Platform settings table (global configuration)
CREATE TABLE platform_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tenants table (organizations/clients)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE NOT NULL,
    logo TEXT, -- URL or base64 encoded image
    primary_color VARCHAR(7), -- hex color code
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (platform owners, tenant admins, tenant users)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    is_active BOOLEAN DEFAULT true,
    email_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP WITH TIME ZONE,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP WITH TIME ZONE,
    email_verification_token VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Constraints
    CONSTRAINT platform_owner_no_tenant CHECK (
        (role = 'platform_owner' AND tenant_id IS NULL) OR
        (role != 'platform_owner' AND tenant_id IS NOT NULL)
    )
);

-- Plugins table (system plugins like Google Workspace)
CREATE TABLE plugins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    is_enabled BOOLEAN DEFAULT false,
    config_schema JSONB, -- JSON schema for plugin configuration
    dependencies TEXT[], -- array of plugin names this depends on
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Plugin configurations per tenant
CREATE TABLE plugin_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plugin_id UUID NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(plugin_id, tenant_id)
);

-- Sessions table for JWT refresh tokens and session management
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Audit log for all significant actions
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES tenants(id),
    action audit_action NOT NULL,
    resource VARCHAR(255) NOT NULL, -- table or resource name
    resource_id UUID, -- specific record ID
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Google Workspace plugin specific tables
CREATE TABLE google_workspace_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    client_id VARCHAR(255),
    client_secret_encrypted TEXT, -- encrypted with platform key
    redirect_uri TEXT,
    domain VARCHAR(255),
    is_connected BOOLEAN DEFAULT false,
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    sync_errors TEXT[], -- array of recent sync error messages
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_active ON tenants(is_active);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_plugin_configs_tenant ON plugin_configs(tenant_id);
CREATE INDEX idx_platform_settings_key ON platform_settings(key);

-- Create RLS (Row Level Security) policies for multi-tenancy
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_workspace_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies will be created by the application based on JWT context
-- For now, disable RLS for setup (will be enabled after platform owner is created)

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_platform_settings_updated_at
    BEFORE UPDATE ON platform_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_plugins_updated_at
    BEFORE UPDATE ON plugins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_plugin_configs_updated_at
    BEFORE UPDATE ON plugin_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_google_workspace_configs_updated_at
    BEFORE UPDATE ON google_workspace_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default platform settings
INSERT INTO platform_settings (key, value, description, is_public) VALUES
('platform_name', 'Helios', 'The name of the platform', true),
('platform_version', '1.0.0', 'Current platform version', true),
('setup_complete', 'false', 'Whether initial platform setup is complete', false),
('max_tenants', '100', 'Maximum number of tenants allowed', false),
('default_tenant_logo', '', 'Default logo for new tenants', true),
('require_email_verification', 'true', 'Whether to require email verification for new users', false),
('session_timeout_hours', '24', 'Number of hours before sessions expire', false);

-- Insert default plugins
INSERT INTO plugins (name, description, version, is_enabled, config_schema) VALUES
('google_workspace', 'Google Workspace Management Integration', '1.0.0', false, '{
    "type": "object",
    "required": ["client_id", "client_secret", "domain"],
    "properties": {
        "client_id": {"type": "string", "title": "Google Client ID"},
        "client_secret": {"type": "string", "title": "Google Client Secret"},
        "domain": {"type": "string", "title": "Google Workspace Domain"},
        "auto_sync": {"type": "boolean", "title": "Enable automatic synchronization", "default": true},
        "sync_interval_hours": {"type": "number", "title": "Sync interval in hours", "default": 24, "minimum": 1}
    }
}');

-- Create view for platform overview
CREATE VIEW platform_overview AS
SELECT
    (SELECT COUNT(*) FROM tenants WHERE is_active = true) as active_tenants,
    (SELECT COUNT(*) FROM users WHERE is_active = true AND role != 'platform_owner') as total_users,
    (SELECT COUNT(*) FROM plugins WHERE is_enabled = true) as active_plugins,
    (SELECT value FROM platform_settings WHERE key = 'setup_complete') as setup_complete,
    (SELECT value FROM platform_settings WHERE key = 'platform_name') as platform_name;

-- Function to check if platform setup is complete
CREATE OR REPLACE FUNCTION is_platform_setup_complete()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        SELECT value::boolean
        FROM platform_settings
        WHERE key = 'setup_complete'
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get or create platform setting
CREATE OR REPLACE FUNCTION get_platform_setting(setting_key TEXT, default_value TEXT DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    SELECT value INTO result FROM platform_settings WHERE key = setting_key;

    IF NOT FOUND AND default_value IS NOT NULL THEN
        INSERT INTO platform_settings (key, value, is_public)
        VALUES (setting_key, default_value, false)
        ON CONFLICT (key) DO NOTHING;
        RETURN default_value;
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql;