-- Migration: 031 - Add Dynamic Groups Support
-- Description: Adds dynamic group rules for automatic membership based on user attributes
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-07

-- =====================================================
-- 1. EXTEND ACCESS_GROUPS TABLE
-- =====================================================

-- Add columns for dynamic group configuration
ALTER TABLE access_groups
ADD COLUMN IF NOT EXISTS membership_type VARCHAR(20) DEFAULT 'static'
    CHECK (membership_type IN ('static', 'dynamic'));

ALTER TABLE access_groups
ADD COLUMN IF NOT EXISTS rule_logic VARCHAR(10) DEFAULT 'AND'
    CHECK (rule_logic IN ('AND', 'OR'));

ALTER TABLE access_groups
ADD COLUMN IF NOT EXISTS refresh_interval INTEGER DEFAULT 0; -- Minutes, 0 = manual only

ALTER TABLE access_groups
ADD COLUMN IF NOT EXISTS last_rule_evaluation TIMESTAMPTZ;

-- Indexes for dynamic group queries
CREATE INDEX IF NOT EXISTS idx_access_groups_membership_type
    ON access_groups(membership_type);

CREATE INDEX IF NOT EXISTS idx_access_groups_dynamic
    ON access_groups(organization_id, membership_type)
    WHERE membership_type = 'dynamic';

-- Comments
COMMENT ON COLUMN access_groups.membership_type IS 'static = manual membership, dynamic = rule-based automatic membership';
COMMENT ON COLUMN access_groups.rule_logic IS 'How rules combine: AND = all rules must match, OR = any rule must match';
COMMENT ON COLUMN access_groups.refresh_interval IS 'Minutes between automatic rule re-evaluation. 0 = manual refresh only';
COMMENT ON COLUMN access_groups.last_rule_evaluation IS 'Last time the dynamic membership rules were evaluated';

-- =====================================================
-- 2. CREATE DYNAMIC_GROUP_RULES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS dynamic_group_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_group_id UUID NOT NULL REFERENCES access_groups(id) ON DELETE CASCADE,

    -- Rule definition
    field VARCHAR(50) NOT NULL,  -- 'department', 'location', 'job_title', 'reports_to', 'org_unit_path', etc.
    operator VARCHAR(20) NOT NULL,  -- 'equals', 'not_equals', 'contains', 'starts_with', etc.
    value TEXT NOT NULL,  -- The value to match against

    -- Rule options
    case_sensitive BOOLEAN DEFAULT false,
    include_nested BOOLEAN DEFAULT false,  -- For hierarchical fields like reports_to, department

    -- Ordering
    sort_order INTEGER DEFAULT 0,

    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Ensure valid operator
    CHECK (operator IN (
        'equals', 'not_equals',
        'contains', 'not_contains',
        'starts_with', 'ends_with',
        'regex',
        'in_list', 'not_in_list',
        'is_empty', 'is_not_empty',
        'is_under', 'is_not_under'  -- For hierarchical fields
    )),

    -- Ensure valid field
    CHECK (field IN (
        'department', 'department_id',
        'location', 'location_id',
        'job_title',
        'reports_to', 'manager_id',
        'org_unit_path',
        'employee_type', 'user_type',
        'cost_center',
        'email',
        'custom_field'
    ))
);

-- Indexes for rule queries
CREATE INDEX idx_dynamic_rules_group ON dynamic_group_rules(access_group_id);
CREATE INDEX idx_dynamic_rules_field ON dynamic_group_rules(field);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_dynamic_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_dynamic_rules_updated_at ON dynamic_group_rules;
DROP TRIGGER IF EXISTS trigger_dynamic_rules_updated_at ON PLACEHOLDER;
CREATE TRIGGER trigger_dynamic_rules_updated_at
    BEFORE UPDATE ON dynamic_group_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_dynamic_rules_updated_at();

-- Comments
COMMENT ON TABLE dynamic_group_rules IS 'Rules for dynamic group membership - users matching rules are automatically added';
COMMENT ON COLUMN dynamic_group_rules.field IS 'User attribute to match: department, location, job_title, reports_to, etc.';
COMMENT ON COLUMN dynamic_group_rules.operator IS 'Comparison operator: equals, contains, starts_with, is_under (for hierarchy)';
COMMENT ON COLUMN dynamic_group_rules.value IS 'Value to match against. For in_list operator, use comma-separated values';
COMMENT ON COLUMN dynamic_group_rules.include_nested IS 'For hierarchical fields, include nested items (e.g., all reports under a manager)';

-- =====================================================
-- 3. DYNAMIC MEMBERSHIP TRACKING
-- =====================================================

-- Add column to track if membership is from dynamic rules
ALTER TABLE access_group_members
ADD COLUMN IF NOT EXISTS membership_source VARCHAR(20) DEFAULT 'manual'
    CHECK (membership_source IN ('manual', 'dynamic', 'sync'));

ALTER TABLE access_group_members
ADD COLUMN IF NOT EXISTS rule_matched_at TIMESTAMPTZ;

-- Index for membership source
CREATE INDEX IF NOT EXISTS idx_access_group_members_source
    ON access_group_members(membership_source);

COMMENT ON COLUMN access_group_members.membership_source IS 'How the member was added: manual, dynamic (rule), or sync (platform)';
COMMENT ON COLUMN access_group_members.rule_matched_at IS 'When the dynamic rule last matched this user';

-- =====================================================
-- 4. HELPER FUNCTION: Evaluate Dynamic Group Rules
-- =====================================================

-- Function to evaluate a single rule against organization users
CREATE OR REPLACE FUNCTION evaluate_dynamic_rule(
    p_rule_id UUID
) RETURNS TABLE(user_id UUID) AS $$
DECLARE
    v_rule RECORD;
    v_query TEXT;
BEGIN
    -- Get rule details
    SELECT
        dgr.*,
        ag.organization_id
    INTO v_rule
    FROM dynamic_group_rules dgr
    JOIN access_groups ag ON ag.id = dgr.access_group_id
    WHERE dgr.id = p_rule_id;

    IF v_rule IS NULL THEN
        RETURN;
    END IF;

    -- Build dynamic query based on field and operator
    v_query := 'SELECT ou.id FROM organization_users ou WHERE ou.organization_id = $1 AND ou.status = ''active''';

    -- Add field condition based on operator
    CASE v_rule.operator
        WHEN 'equals' THEN
            IF v_rule.case_sensitive THEN
                v_query := v_query || ' AND ou.' || v_rule.field || ' = $2';
            ELSE
                v_query := v_query || ' AND LOWER(ou.' || v_rule.field || ') = LOWER($2)';
            END IF;
        WHEN 'not_equals' THEN
            IF v_rule.case_sensitive THEN
                v_query := v_query || ' AND (ou.' || v_rule.field || ' IS NULL OR ou.' || v_rule.field || ' != $2)';
            ELSE
                v_query := v_query || ' AND (ou.' || v_rule.field || ' IS NULL OR LOWER(ou.' || v_rule.field || ') != LOWER($2))';
            END IF;
        WHEN 'contains' THEN
            IF v_rule.case_sensitive THEN
                v_query := v_query || ' AND ou.' || v_rule.field || ' LIKE ''%'' || $2 || ''%''';
            ELSE
                v_query := v_query || ' AND LOWER(ou.' || v_rule.field || ') LIKE ''%'' || LOWER($2) || ''%''';
            END IF;
        WHEN 'starts_with' THEN
            IF v_rule.case_sensitive THEN
                v_query := v_query || ' AND ou.' || v_rule.field || ' LIKE $2 || ''%''';
            ELSE
                v_query := v_query || ' AND LOWER(ou.' || v_rule.field || ') LIKE LOWER($2) || ''%''';
            END IF;
        WHEN 'ends_with' THEN
            IF v_rule.case_sensitive THEN
                v_query := v_query || ' AND ou.' || v_rule.field || ' LIKE ''%'' || $2';
            ELSE
                v_query := v_query || ' AND LOWER(ou.' || v_rule.field || ') LIKE ''%'' || LOWER($2)';
            END IF;
        WHEN 'is_empty' THEN
            v_query := v_query || ' AND (ou.' || v_rule.field || ' IS NULL OR ou.' || v_rule.field || ' = '''')';
        WHEN 'is_not_empty' THEN
            v_query := v_query || ' AND ou.' || v_rule.field || ' IS NOT NULL AND ou.' || v_rule.field || ' != ''''';
        WHEN 'in_list' THEN
            v_query := v_query || ' AND ou.' || v_rule.field || ' = ANY(string_to_array($2, '',''))';
        ELSE
            -- Default to equals
            v_query := v_query || ' AND LOWER(ou.' || v_rule.field || ') = LOWER($2)';
    END CASE;

    RETURN QUERY EXECUTE v_query USING v_rule.organization_id, v_rule.value;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Migration 031 completed successfully!';
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Added to access_groups:';
    RAISE NOTICE '  - membership_type (static/dynamic)';
    RAISE NOTICE '  - rule_logic (AND/OR)';
    RAISE NOTICE '  - refresh_interval';
    RAISE NOTICE '  - last_rule_evaluation';
    RAISE NOTICE '';
    RAISE NOTICE 'Created tables:';
    RAISE NOTICE '  - dynamic_group_rules';
    RAISE NOTICE '';
    RAISE NOTICE 'Added to access_group_members:';
    RAISE NOTICE '  - membership_source';
    RAISE NOTICE '  - rule_matched_at';
    RAISE NOTICE '=========================================';
END $$;
