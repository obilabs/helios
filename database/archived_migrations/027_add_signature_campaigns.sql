-- Migration: Add Email Signature Campaigns System
-- Purpose: Enable marketing teams to use email signatures as a communication channel

-- =====================================================
-- SIGNATURE TEMPLATES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS signature_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Basic Info
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Template Content
    html_template TEXT NOT NULL, -- HTML template with variables like {{name}}, {{title}}
    text_template TEXT, -- Plain text fallback

    -- Template Variables (JSON array of available variables)
    available_variables JSONB DEFAULT '["name", "email", "title", "department", "phone", "company"]'::jsonb,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Status
    is_active BOOLEAN DEFAULT true,

    UNIQUE(organization_id, name)
);

-- =====================================================
-- SIGNATURE CAMPAIGNS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS signature_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Campaign Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE RESTRICT,

    -- Campaign Content (Additional content to append)
    campaign_banner_html TEXT, -- Marketing banner/CTA to append
    campaign_banner_position VARCHAR(20) DEFAULT 'bottom', -- top, bottom

    -- Targeting
    target_type VARCHAR(50) NOT NULL, -- 'all', 'users', 'groups', 'departments', 'org_units', 'rules'
    target_ids UUID[], -- Array of target IDs based on target_type
    target_rules JSONB, -- Complex rules for targeting (e.g., {"title": {"contains": "Sales"}})

    -- Priority (higher number = higher priority)
    priority INTEGER DEFAULT 50,

    -- Schedule
    start_date TIMESTAMP,
    end_date TIMESTAMP,

    -- Status
    status VARCHAR(20) DEFAULT 'draft', -- draft, pending_approval, approved, active, paused, completed

    -- Approval
    requires_approval BOOLEAN DEFAULT true,
    approved_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    approval_notes TEXT,

    -- Analytics
    impressions_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    UNIQUE(organization_id, name)
);

-- =====================================================
-- USER SIGNATURE ASSIGNMENTS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_signature_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,

    -- Assignment Details
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_applied_at TIMESTAMP,
    apply_status VARCHAR(20) DEFAULT 'pending', -- pending, applied, failed, opted_out
    apply_error TEXT,

    -- User Override
    user_opted_out BOOLEAN DEFAULT false,
    opt_out_reason TEXT,

    -- Gmail Details
    gmail_signature_id VARCHAR(255), -- Gmail's signature ID for tracking

    UNIQUE(user_id, campaign_id)
);

-- =====================================================
-- SIGNATURE CAMPAIGN PERMISSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS signature_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Who gets the permission
    user_id UUID REFERENCES organization_users(id) ON DELETE CASCADE,
    group_id UUID, -- Could reference access_groups if needed
    department VARCHAR(255),

    -- What they can do
    can_create_templates BOOLEAN DEFAULT false,
    can_create_campaigns BOOLEAN DEFAULT false,
    can_approve_campaigns BOOLEAN DEFAULT false,
    can_view_analytics BOOLEAN DEFAULT true,
    can_manage_all BOOLEAN DEFAULT false, -- Super admin for signatures

    -- Constraints
    max_campaigns_per_month INTEGER,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Ensure at least one target is specified
    CHECK (user_id IS NOT NULL OR group_id IS NOT NULL OR department IS NOT NULL)
);

-- =====================================================
-- SIGNATURE SYNC LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS signature_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Sync Details
    sync_type VARCHAR(20) NOT NULL, -- 'scheduled', 'manual', 'campaign_launch'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,

    -- Results
    users_processed INTEGER DEFAULT 0,
    users_succeeded INTEGER DEFAULT 0,
    users_failed INTEGER DEFAULT 0,
    users_skipped INTEGER DEFAULT 0,

    -- Errors
    error_summary TEXT,
    detailed_errors JSONB,

    -- Triggered By
    triggered_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES signature_campaigns(id) ON DELETE SET NULL
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_signature_templates_org ON signature_templates(organization_id);
CREATE INDEX idx_signature_templates_active ON signature_templates(is_active);

CREATE INDEX idx_signature_campaigns_org ON signature_campaigns(organization_id);
CREATE INDEX idx_signature_campaigns_status ON signature_campaigns(status);
CREATE INDEX idx_signature_campaigns_dates ON signature_campaigns(start_date, end_date);
CREATE INDEX idx_signature_campaigns_priority ON signature_campaigns(priority DESC);

CREATE INDEX idx_user_assignments_user ON user_signature_assignments(user_id);
CREATE INDEX idx_user_assignments_campaign ON user_signature_assignments(campaign_id);
CREATE INDEX idx_user_assignments_status ON user_signature_assignments(apply_status);

CREATE INDEX idx_signature_permissions_user ON signature_permissions(user_id);
CREATE INDEX idx_signature_permissions_org ON signature_permissions(organization_id);

CREATE INDEX idx_signature_sync_logs_org ON signature_sync_logs(organization_id);
CREATE INDEX idx_signature_sync_logs_campaign ON signature_sync_logs(campaign_id);

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to get active campaign for a user (highest priority wins)
CREATE OR REPLACE FUNCTION get_user_active_campaign(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_campaign_id UUID;
    v_user_dept VARCHAR(255);
    v_user_groups UUID[];
BEGIN
    -- Get user's department
    SELECT department INTO v_user_dept
    FROM organization_users
    WHERE id = p_user_id;

    -- Get user's groups (if we have a user_groups table)
    -- For now, we'll skip this as groups structure may vary

    -- Find highest priority active campaign that targets this user
    SELECT c.id INTO v_campaign_id
    FROM signature_campaigns c
    LEFT JOIN user_signature_assignments usa ON c.id = usa.campaign_id AND usa.user_id = p_user_id
    WHERE c.status = 'active'
        AND (c.start_date IS NULL OR c.start_date <= CURRENT_TIMESTAMP)
        AND (c.end_date IS NULL OR c.end_date >= CURRENT_TIMESTAMP)
        AND (usa.user_opted_out IS NULL OR usa.user_opted_out = false)
        AND (
            c.target_type = 'all'
            OR (c.target_type = 'users' AND p_user_id = ANY(c.target_ids))
            OR (c.target_type = 'departments' AND v_user_dept IS NOT NULL
                AND v_user_dept = ANY(SELECT jsonb_array_elements_text(c.target_rules->'departments')))
            -- Add more targeting logic as needed
        )
    ORDER BY c.priority DESC, c.created_at DESC
    LIMIT 1;

    RETURN v_campaign_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has signature permission
CREATE OR REPLACE FUNCTION user_has_signature_permission(
    p_user_id UUID,
    p_permission VARCHAR(50)
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_permission BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1
        FROM signature_permissions sp
        JOIN organization_users ou ON ou.id = p_user_id
        WHERE (
            sp.user_id = p_user_id
            OR sp.department = ou.department
            -- Add group check when available
        )
        AND (
            sp.can_manage_all = true
            OR (p_permission = 'create_templates' AND sp.can_create_templates = true)
            OR (p_permission = 'create_campaigns' AND sp.can_create_campaigns = true)
            OR (p_permission = 'approve_campaigns' AND sp.can_approve_campaigns = true)
            OR (p_permission = 'view_analytics' AND sp.can_view_analytics = true)
        )
    ) INTO v_has_permission;

    RETURN v_has_permission;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_signature_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS signature_templates_updated_at ON PLACEHOLDER;
CREATE TRIGGER signature_templates_updated_at
    BEFORE UPDATE ON signature_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_signature_updated_at();

DROP TRIGGER IF EXISTS signature_campaigns_updated_at ON PLACEHOLDER;
CREATE TRIGGER signature_campaigns_updated_at
    BEFORE UPDATE ON signature_campaigns
    FOR EACH ROW
    EXECUTE FUNCTION update_signature_updated_at();

-- =====================================================
-- DEFAULT TEMPLATES
-- =====================================================
DO $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get the first organization ID
    SELECT id INTO v_org_id FROM organizations LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        -- Insert default templates
        INSERT INTO signature_templates (
            organization_id,
            name,
            description,
            html_template,
            text_template
        ) VALUES
        (
            v_org_id,
            'Professional Standard',
            'Clean, professional signature for all employees',
            '<div style="font-family: Arial, sans-serif; color: #333; font-size: 14px;">
                <div style="margin-bottom: 8px;">
                    <strong style="color: #1f2937; font-size: 16px;">{{name}}</strong><br>
                    <span style="color: #6b7280;">{{title}}</span><br>
                    <span style="color: #6b7280;">{{department}}</span>
                </div>
                <div style="margin-top: 12px; padding-top: 12px; border-top: 2px solid #8b5cf6;">
                    <strong style="color: #8b5cf6;">{{company}}</strong><br>
                    <span style="color: #6b7280;">📧 {{email}}</span><br>
                    {{#if phone}}<span style="color: #6b7280;">📱 {{phone}}</span><br>{{/if}}
                </div>
            </div>',
            '{{name}}
{{title}}
{{department}}

{{company}}
Email: {{email}}
{{#if phone}}Phone: {{phone}}{{/if}}'
        ),
        (
            v_org_id,
            'Executive Signature',
            'Premium signature template for executives',
            '<div style="font-family: Georgia, serif; color: #1f2937; font-size: 14px;">
                <div style="margin-bottom: 10px;">
                    <strong style="font-size: 18px; color: #111827;">{{name}}</strong><br>
                    <em style="color: #4b5563; font-size: 14px;">{{title}}</em><br>
                    <span style="color: #6b7280;">{{department}}</span>
                </div>
                <div style="margin: 16px 0; padding: 12px; background: linear-gradient(90deg, #8b5cf6 0%, #7c3aed 100%); border-radius: 4px;">
                    <strong style="color: white; font-size: 16px;">{{company}}</strong>
                </div>
                <div style="color: #6b7280;">
                    <span>{{email}} | {{phone}}</span><br>
                    <a href="{{calendar_link}}" style="color: #8b5cf6; text-decoration: none;">📅 Schedule a Meeting</a>
                </div>
            </div>',
            NULL
        ),
        (
            v_org_id,
            'Marketing Campaign',
            'Template with space for marketing banners',
            '<div style="font-family: Arial, sans-serif; color: #333;">
                <div style="margin-bottom: 8px;">
                    <strong>{{name}}</strong> | {{title}}<br>
                    {{company}} | {{email}}
                </div>
                <!-- Campaign banner will be inserted here -->
            </div>',
            NULL
        )
        ON CONFLICT (organization_id, name) DO NOTHING;

        -- Grant default permissions to admins
        INSERT INTO signature_permissions (
            organization_id,
            user_id,
            can_create_templates,
            can_create_campaigns,
            can_approve_campaigns,
            can_view_analytics,
            can_manage_all
        )
        SELECT
            v_org_id,
            id,
            true,
            true,
            true,
            true,
            true
        FROM organization_users
        WHERE organization_id = v_org_id
            AND role = 'admin'
            AND is_active = true
        ON CONFLICT DO NOTHING;
    END IF;
END $$;