-- Migration: 073_create_initial_passwords
-- Description: Create table for storing initial passwords that admins can reveal
-- Created: 2024

-- Create table for storing initial passwords
CREATE TABLE IF NOT EXISTS user_initial_passwords (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_email VARCHAR(255) NOT NULL,
    encrypted_password TEXT NOT NULL,
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revealed_at TIMESTAMPTZ,
    revealed_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    cleared_at TIMESTAMPTZ,
    cleared_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Ensure one active password per user email per org
    CONSTRAINT unique_active_initial_password
        UNIQUE (organization_id, user_email)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_initial_passwords_org_email
    ON user_initial_passwords(organization_id, user_email);

CREATE INDEX IF NOT EXISTS idx_initial_passwords_org
    ON user_initial_passwords(organization_id);

-- Comment
COMMENT ON TABLE user_initial_passwords IS 'Stores initial passwords for newly created users that admins can reveal. Cleared when user changes password.';
