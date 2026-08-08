-- Migration: 044_create_signature_tables.sql
-- Description: Create core signature management tables
-- Author: Helios Autonomous Agent
-- Created: 2025-12-09

-- =====================================================
-- SIGNATURE TEMPLATES TABLE
-- =====================================================
-- Stores reusable email signature templates with HTML content and merge fields

CREATE TABLE IF NOT EXISTS signature_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    html_content TEXT NOT NULL,
    plain_text_content TEXT,  -- Fallback for plain text emails
    merge_fields JSONB DEFAULT '[]'::jsonb,  -- List of fields used in template
    is_default BOOLEAN DEFAULT false,
    is_campaign_template BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
    version INTEGER DEFAULT 1,
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure only one default template per organization
CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_templates_default
    ON signature_templates(organization_id)
    WHERE is_default = true;

-- Index for organization lookups
CREATE INDEX IF NOT EXISTS idx_signature_templates_org
    ON signature_templates(organization_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_signature_templates_status
    ON signature_templates(organization_id, status);


-- =====================================================
-- SIGNATURE ASSIGNMENTS TABLE
-- =====================================================
-- Links templates to users/groups/departments/OUs with priority

CREATE TABLE IF NOT EXISTS signature_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,
    assignment_type VARCHAR(30) NOT NULL CHECK (assignment_type IN (
        'user', 'group', 'dynamic_group', 'department', 'ou', 'organization'
    )),
    target_id UUID,  -- user_id, group_id, department_id (NULL for 'organization')
    target_value VARCHAR(500),  -- For OU path strings or other text-based targets
    priority INTEGER DEFAULT 100,  -- Lower = higher priority
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent duplicate assignments
CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_assignments_unique
    ON signature_assignments(organization_id, template_id, assignment_type, target_id)
    WHERE target_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_assignments_unique_value
    ON signature_assignments(organization_id, template_id, assignment_type, target_value)
    WHERE target_value IS NOT NULL AND target_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_signature_assignments_unique_org
    ON signature_assignments(organization_id, template_id, assignment_type)
    WHERE assignment_type = 'organization';

-- Index for priority resolution queries
CREATE INDEX IF NOT EXISTS idx_signature_assignments_priority
    ON signature_assignments(organization_id, is_active, priority);

-- Index for template lookups
CREATE INDEX IF NOT EXISTS idx_signature_assignments_template
    ON signature_assignments(template_id);


-- =====================================================
-- USER SIGNATURE STATUS TABLE
-- =====================================================
-- Tracks current signature state for each user

CREATE TABLE IF NOT EXISTS user_signature_status (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    current_template_id UUID REFERENCES signature_templates(id) ON DELETE SET NULL,
    active_campaign_id UUID,  -- FK added later when campaigns table exists
    assignment_source VARCHAR(50),  -- 'direct', 'group', 'dynamic_group', 'department', 'ou', 'organization'
    assignment_id UUID REFERENCES signature_assignments(id) ON DELETE SET NULL,
    rendered_html TEXT,  -- Cached rendered signature
    last_synced_at TIMESTAMPTZ,
    sync_status VARCHAR(20) DEFAULT 'pending' CHECK (sync_status IN (
        'pending', 'syncing', 'synced', 'failed', 'error', 'skipped'
    )),
    sync_error TEXT,
    google_signature_hash VARCHAR(64),  -- SHA256 to detect external changes
    sync_attempts INTEGER DEFAULT 0,
    last_sync_attempt_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT user_signature_status_user_unique UNIQUE(user_id)
);

-- Index for organization-wide status queries
CREATE INDEX IF NOT EXISTS idx_user_signature_status_org
    ON user_signature_status(organization_id);

-- Index for sync status queries
CREATE INDEX IF NOT EXISTS idx_user_signature_status_sync
    ON user_signature_status(organization_id, sync_status);

-- Partial index for pending syncs (for background job)
CREATE INDEX IF NOT EXISTS idx_user_signature_status_pending
    ON user_signature_status(organization_id, last_sync_attempt_at)
    WHERE sync_status = 'pending';


-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update updated_at for signature_templates
DROP TRIGGER IF EXISTS trg_signature_templates_updated_at ON signature_templates;
DROP TRIGGER IF EXISTS trg_signature_templates_updated_at ON PLACEHOLDER;
CREATE TRIGGER trg_signature_templates_updated_at
    BEFORE UPDATE ON signature_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for signature_assignments
DROP TRIGGER IF EXISTS trg_signature_assignments_updated_at ON signature_assignments;
DROP TRIGGER IF EXISTS trg_signature_assignments_updated_at ON PLACEHOLDER;
CREATE TRIGGER trg_signature_assignments_updated_at
    BEFORE UPDATE ON signature_assignments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Auto-update updated_at for user_signature_status
DROP TRIGGER IF EXISTS trg_user_signature_status_updated_at ON user_signature_status;
DROP TRIGGER IF EXISTS trg_user_signature_status_updated_at ON PLACEHOLDER;
CREATE TRIGGER trg_user_signature_status_updated_at
    BEFORE UPDATE ON user_signature_status
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();


-- =====================================================
-- ENSURE SINGLE DEFAULT TEMPLATE
-- =====================================================
-- Function to ensure only one default template per organization

CREATE OR REPLACE FUNCTION ensure_single_default_signature_template()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default = true THEN
        UPDATE signature_templates
        SET is_default = false
        WHERE organization_id = NEW.organization_id
        AND id != NEW.id
        AND is_default = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ensure_single_default_signature ON signature_templates;
DROP TRIGGER IF EXISTS trg_ensure_single_default_signature ON PLACEHOLDER;
CREATE TRIGGER trg_ensure_single_default_signature
    BEFORE INSERT OR UPDATE OF is_default ON signature_templates
    FOR EACH ROW
    WHEN (NEW.is_default = true)
    EXECUTE FUNCTION ensure_single_default_signature_template();


-- =====================================================
-- HELPER VIEWS
-- =====================================================

-- View to get effective template for each user (respects priority)
CREATE OR REPLACE VIEW user_effective_signatures AS
WITH ranked_assignments AS (
    SELECT
        ou.id AS user_id,
        ou.organization_id,
        sa.id AS assignment_id,
        sa.template_id,
        sa.assignment_type,
        sa.priority,
        CASE sa.assignment_type
            WHEN 'user' THEN 1
            WHEN 'dynamic_group' THEN 2
            WHEN 'group' THEN 3
            WHEN 'department' THEN 4
            WHEN 'ou' THEN 5
            WHEN 'organization' THEN 6
        END AS type_priority,
        ROW_NUMBER() OVER (
            PARTITION BY ou.id
            ORDER BY
                CASE sa.assignment_type
                    WHEN 'user' THEN 1
                    WHEN 'dynamic_group' THEN 2
                    WHEN 'group' THEN 3
                    WHEN 'department' THEN 4
                    WHEN 'ou' THEN 5
                    WHEN 'organization' THEN 6
                END,
                sa.priority
        ) AS rank
    FROM organization_users ou
    JOIN signature_assignments sa ON sa.organization_id = ou.organization_id
    JOIN signature_templates st ON st.id = sa.template_id AND st.status = 'active'
    WHERE sa.is_active = true
    AND (
        -- Direct user assignment
        (sa.assignment_type = 'user' AND sa.target_id = ou.id)
        -- Group membership (static groups)
        OR (sa.assignment_type = 'group' AND EXISTS (
            SELECT 1 FROM access_group_members agm
            WHERE agm.access_group_id = sa.target_id AND agm.user_id = ou.id AND agm.is_active = true
        ))
        -- Department assignment
        OR (sa.assignment_type = 'department' AND sa.target_id = ou.department_id)
        -- Organization default
        OR (sa.assignment_type = 'organization')
    )
)
SELECT
    user_id,
    organization_id,
    assignment_id,
    template_id,
    assignment_type AS source
FROM ranked_assignments
WHERE rank = 1;


-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE signature_templates IS 'Email signature templates with HTML content and merge fields';
COMMENT ON TABLE signature_assignments IS 'Links signature templates to users/groups/departments with priority';
COMMENT ON TABLE user_signature_status IS 'Tracks current signature state and sync status for each user';
COMMENT ON COLUMN signature_templates.merge_fields IS 'JSON array of merge field names used in template, e.g. ["full_name", "job_title"]';
COMMENT ON COLUMN signature_assignments.priority IS 'Lower number = higher priority. Used when same type has multiple assignments';
COMMENT ON COLUMN user_signature_status.google_signature_hash IS 'SHA256 hash of signature from Google to detect external changes';
