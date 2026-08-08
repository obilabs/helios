-- Migration: Add Better Auth Tables
-- Date: 2025-12-18
-- Description: Creates tables required for better-auth session management and SSO

-- ============================================
-- AUTH SESSIONS TABLE
-- Stores active user sessions (replaces JWT tokens)
-- ============================================
CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);

-- ============================================
-- AUTH ACCOUNTS TABLE
-- Links users to SSO providers (Azure AD, Google, Okta)
-- ============================================
CREATE TABLE IF NOT EXISTS auth_accounts (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,           -- Provider's user ID
    provider_id TEXT NOT NULL,          -- 'azure-ad', 'google', 'okta'
    access_token TEXT,
    refresh_token TEXT,
    access_token_expires_at TIMESTAMPTZ,
    scope TEXT,
    id_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(provider_id, account_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_accounts_user_id ON auth_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_accounts_provider ON auth_accounts(provider_id);

-- ============================================
-- AUTH VERIFICATIONS TABLE
-- For email verification, password reset tokens
-- ============================================
CREATE TABLE IF NOT EXISTS auth_verifications (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,           -- email or other identifier
    value TEXT NOT NULL,                -- verification code/token
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_verifications_identifier ON auth_verifications(identifier);
CREATE INDEX IF NOT EXISTS idx_auth_verifications_expires_at ON auth_verifications(expires_at);

-- ============================================
-- SSO PROVIDERS TABLE
-- Organization-level SSO configuration
-- ============================================
CREATE TABLE IF NOT EXISTS sso_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_type TEXT NOT NULL,        -- 'oidc', 'saml'
    provider_name TEXT NOT NULL,        -- 'azure-ad', 'google', 'okta', 'custom'
    display_name TEXT,                  -- User-friendly name
    client_id TEXT,
    client_secret TEXT,                 -- Encrypted with encryptionService
    issuer TEXT,                        -- OIDC issuer URL
    authorization_url TEXT,
    token_url TEXT,
    userinfo_url TEXT,
    metadata_url TEXT,                  -- For OIDC discovery
    scopes TEXT DEFAULT 'openid profile email',
    is_enabled BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,   -- Default SSO provider for org
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, provider_name)
);

CREATE INDEX IF NOT EXISTS idx_sso_providers_org_id ON sso_providers(organization_id);
CREATE INDEX IF NOT EXISTS idx_sso_providers_enabled ON sso_providers(organization_id, is_enabled);

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE auth_sessions IS 'Active user sessions for better-auth (replaces stateless JWT)';
COMMENT ON TABLE auth_accounts IS 'Links users to SSO provider accounts';
COMMENT ON TABLE auth_verifications IS 'Email verification and password reset tokens';
COMMENT ON TABLE sso_providers IS 'Organization SSO provider configuration (OIDC/SAML)';

COMMENT ON COLUMN auth_sessions.token IS 'Session token stored in httpOnly cookie';
COMMENT ON COLUMN auth_accounts.provider_id IS 'SSO provider identifier: azure-ad, google, okta';
COMMENT ON COLUMN sso_providers.client_secret IS 'Encrypted using encryptionService';
COMMENT ON COLUMN sso_providers.is_default IS 'If true, users are automatically redirected to this SSO';

-- ============================================
-- CLEANUP OLD AUTH ARTIFACTS (if needed)
-- ============================================
-- Note: We keep the old password_setup_tokens table as it's used for onboarding
-- The organization_users.password_hash will still be used for local accounts
