-- Migration: 046_create_signature_permissions.sql
-- Description: Create signature permission tables for role-based access
-- Author: Helios Autonomous Agent
-- Created: 2025-12-09

-- =====================================================
-- SIGNATURE PERMISSIONS TABLE
-- =====================================================
-- Fine-grained permission control for signature management

CREATE TABLE IF NOT EXISTS signature_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    permission_level VARCHAR(30) NOT NULL CHECK (permission_level IN (
        'admin',           -- Full control: templates, assignments, campaigns, deploy, analytics
        'designer',        -- Create/edit templates, preview, no deploy
        'campaign_manager',-- Create/manage campaigns, view analytics
        'helpdesk',        -- View status, re-sync individual users
        'viewer'           -- View own signature only
    )),
    granted_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,  -- Optional expiration
    notes TEXT,  -- Why this permission was granted
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT signature_permissions_unique UNIQUE(organization_id, user_id)
);

-- Index for user permission lookups
CREATE INDEX IF NOT EXISTS idx_signature_permissions_user
    ON signature_permissions(user_id);

-- Index for organization permission listings
CREATE INDEX IF NOT EXISTS idx_signature_permissions_org
    ON signature_permissions(organization_id, permission_level);

-- Note: Cannot use partial index with NOW() - use query filter instead
-- CREATE INDEX IF NOT EXISTS idx_signature_permissions_active
--     ON signature_permissions(organization_id, user_id)
--     WHERE expires_at IS NULL;

-- Index for expiration queries
CREATE INDEX IF NOT EXISTS idx_signature_permissions_expires
    ON signature_permissions(expires_at)
    WHERE expires_at IS NOT NULL;


-- =====================================================
-- SIGNATURE PERMISSION AUDIT LOG
-- =====================================================
-- Track all permission changes

CREATE TABLE IF NOT EXISTS signature_permission_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    target_user_id UUID NOT NULL,  -- User whose permission changed
    action VARCHAR(20) NOT NULL CHECK (action IN ('grant', 'revoke', 'update')),
    old_permission_level VARCHAR(30),
    new_permission_level VARCHAR(30),
    performed_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_signature_permission_audit_org
    ON signature_permission_audit(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signature_permission_audit_user
    ON signature_permission_audit(target_user_id, created_at DESC);


-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_signature_permissions_updated_at ON signature_permissions;
DROP TRIGGER IF EXISTS trg_signature_permissions_updated_at ON PLACEHOLDER;
CREATE TRIGGER trg_signature_permissions_updated_at
    BEFORE UPDATE ON signature_permissions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Audit trigger function
CREATE OR REPLACE FUNCTION audit_signature_permission_change()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO signature_permission_audit (
            organization_id, target_user_id, action,
            old_permission_level, new_permission_level, performed_by
        ) VALUES (
            NEW.organization_id, NEW.user_id, 'grant',
            NULL, NEW.permission_level, NEW.granted_by
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.permission_level != NEW.permission_level THEN
            INSERT INTO signature_permission_audit (
                organization_id, target_user_id, action,
                old_permission_level, new_permission_level, performed_by
            ) VALUES (
                NEW.organization_id, NEW.user_id, 'update',
                OLD.permission_level, NEW.permission_level, NEW.granted_by
            );
        END IF;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO signature_permission_audit (
            organization_id, target_user_id, action,
            old_permission_level, new_permission_level, performed_by
        ) VALUES (
            OLD.organization_id, OLD.user_id, 'revoke',
            OLD.permission_level, NULL, NULL
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_signature_permissions ON signature_permissions;
DROP TRIGGER IF EXISTS trg_audit_signature_permissions ON PLACEHOLDER;
CREATE TRIGGER trg_audit_signature_permissions
    AFTER INSERT OR UPDATE OR DELETE ON signature_permissions
    FOR EACH ROW
    EXECUTE FUNCTION audit_signature_permission_change();


-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Check if user has at least the specified permission level
CREATE OR REPLACE FUNCTION user_has_signature_permission(
    p_user_id UUID,
    p_required_level VARCHAR(30)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_permission_level VARCHAR(30);
    v_is_org_admin BOOLEAN;
BEGIN
    -- Check if user is org admin (always has full access)
    SELECT EXISTS (
        SELECT 1 FROM organization_users
        WHERE id = p_user_id AND role = 'admin'
    ) INTO v_is_org_admin;

    IF v_is_org_admin THEN
        RETURN true;
    END IF;

    -- Get user's signature permission level
    SELECT permission_level INTO v_permission_level
    FROM signature_permissions
    WHERE user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW());

    IF v_permission_level IS NULL THEN
        RETURN false;
    END IF;

    -- Permission hierarchy
    RETURN CASE
        WHEN p_required_level = 'viewer' THEN true
        WHEN p_required_level = 'helpdesk' THEN
            v_permission_level IN ('admin', 'helpdesk')
        WHEN p_required_level = 'campaign_manager' THEN
            v_permission_level IN ('admin', 'campaign_manager')
        WHEN p_required_level = 'designer' THEN
            v_permission_level IN ('admin', 'designer')
        WHEN p_required_level = 'admin' THEN
            v_permission_level = 'admin'
        ELSE false
    END;
END;
$$ LANGUAGE plpgsql STABLE;


-- Get effective permission level for a user
CREATE OR REPLACE FUNCTION get_user_signature_permission_level(p_user_id UUID)
RETURNS VARCHAR(30) AS $$
DECLARE
    v_permission_level VARCHAR(30);
    v_is_org_admin BOOLEAN;
BEGIN
    -- Check if user is org admin
    SELECT EXISTS (
        SELECT 1 FROM organization_users
        WHERE id = p_user_id AND role = 'admin'
    ) INTO v_is_org_admin;

    IF v_is_org_admin THEN
        RETURN 'admin';
    END IF;

    -- Get explicit permission
    SELECT permission_level INTO v_permission_level
    FROM signature_permissions
    WHERE user_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW());

    RETURN COALESCE(v_permission_level, 'viewer');
END;
$$ LANGUAGE plpgsql STABLE;


-- =====================================================
-- DEFAULT PERMISSIONS VIEW
-- =====================================================

CREATE OR REPLACE VIEW user_signature_permissions AS
SELECT
    ou.id AS user_id,
    ou.organization_id,
    ou.email,
    ou.first_name,
    ou.last_name,
    COALESCE(
        CASE WHEN ou.role = 'admin' THEN 'admin' END,
        sp.permission_level,
        'viewer'
    ) AS effective_permission,
    sp.permission_level AS explicit_permission,
    sp.granted_by,
    sp.granted_at,
    sp.expires_at,
    ou.role = 'admin' AS is_org_admin
FROM organization_users ou
LEFT JOIN signature_permissions sp ON sp.user_id = ou.id
    AND (sp.expires_at IS NULL OR sp.expires_at > NOW());


-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE signature_permissions IS 'Fine-grained permissions for signature management features';
COMMENT ON TABLE signature_permission_audit IS 'Audit log of all permission changes';
COMMENT ON COLUMN signature_permissions.permission_level IS 'Permission level: admin, designer, campaign_manager, helpdesk, viewer';
COMMENT ON COLUMN signature_permissions.expires_at IS 'Optional expiration date for temporary permissions';
COMMENT ON FUNCTION user_has_signature_permission IS 'Check if user has at least the required permission level';
COMMENT ON FUNCTION get_user_signature_permission_level IS 'Get effective permission level for a user';
