-- Migration: 070_create_rules_engine.sql
-- Description: Create tables for unified rules engine with named conditions
-- Author: AI Assistant
-- Date: 2024-12-28

-- Named/Saved Conditions for reuse across rules
-- These act as reusable building blocks that can be referenced by name
CREATE TABLE IF NOT EXISTS named_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Identification
    name VARCHAR(100) NOT NULL,           -- Machine-readable slug: 'is_senior_engineer'
    display_name VARCHAR(255) NOT NULL,   -- Human-readable: 'Senior Engineer'
    description TEXT,                     -- Optional explanation of what this condition matches

    -- The actual condition definition (json-rules-engine format)
    -- Example: {"all": [{"fact": "department", "operator": "equal", "value": "Engineering"}, {"fact": "level", "operator": "greaterThanInclusive", "value": 3}]}
    conditions JSONB NOT NULL,

    -- Metadata for nesting validation
    -- Track how deep this condition goes (0 = flat, 1 = one level of nesting, etc.)
    nesting_depth INTEGER DEFAULT 0,
    -- Track which other named conditions this one references
    references_conditions UUID[] DEFAULT '{}',

    -- Usage tracking (updated by trigger)
    usage_count INTEGER DEFAULT 0,

    -- Audit fields
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Unique name per organization
    UNIQUE(organization_id, name)
);

-- Automation Rules table
-- Unified rule storage for dynamic groups, template matching, training assignment, etc.
CREATE TABLE IF NOT EXISTS automation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Rule identification
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Rule type determines where this rule is used
    -- 'dynamic_group' - Membership rules for dynamic groups
    -- 'template_match' - Auto-select onboarding/offboarding templates
    -- 'training_assign' - Automatic training assignment
    -- 'notification' - Trigger notifications based on conditions
    -- 'workflow' - Trigger workflow actions
    rule_type VARCHAR(50) NOT NULL,

    -- The condition definition (json-rules-engine format)
    -- Can reference named_conditions via: {"condition": "named_condition_name"}
    conditions JSONB NOT NULL,

    -- Priority for rules of the same type (higher = evaluated first)
    priority INTEGER DEFAULT 0,

    -- Rule status
    is_enabled BOOLEAN DEFAULT true,

    -- Metadata for nesting validation
    nesting_depth INTEGER DEFAULT 0,
    condition_count INTEGER DEFAULT 0,
    references_conditions UUID[] DEFAULT '{}',

    -- Type-specific configuration stored here
    -- For template_match: {"template_id": "uuid", "template_type": "onboarding"}
    -- For training_assign: {"training_ids": ["uuid"], "due_offset_days": 30}
    -- For dynamic_group: {"group_id": "uuid"}
    config JSONB DEFAULT '{}',

    -- Last time this rule was evaluated (for debugging)
    last_evaluated_at TIMESTAMPTZ,
    last_match_count INTEGER DEFAULT 0,

    -- Audit fields
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rule evaluation history for debugging and audit
CREATE TABLE IF NOT EXISTS rule_evaluation_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES automation_rules(id) ON DELETE SET NULL,

    -- What was evaluated
    rule_type VARCHAR(50) NOT NULL,
    facts JSONB NOT NULL,           -- The input facts

    -- Result
    matched BOOLEAN NOT NULL,
    result JSONB,                   -- Full evaluation result

    -- Context
    triggered_by VARCHAR(100),      -- 'manual', 'sync', 'event:user_created', etc.
    user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Timing
    evaluation_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_named_conditions_org
    ON named_conditions(organization_id);
CREATE INDEX IF NOT EXISTS idx_named_conditions_name
    ON named_conditions(organization_id, name);

CREATE INDEX IF NOT EXISTS idx_automation_rules_org
    ON automation_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_type
    ON automation_rules(organization_id, rule_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_enabled
    ON automation_rules(organization_id, is_enabled, rule_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_priority
    ON automation_rules(organization_id, rule_type, priority DESC);

CREATE INDEX IF NOT EXISTS idx_rule_eval_log_org
    ON rule_evaluation_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rule_eval_log_rule
    ON rule_evaluation_log(rule_id, created_at DESC);

-- Trigger to update usage_count on named_conditions when rules reference them
CREATE OR REPLACE FUNCTION update_named_condition_usage()
RETURNS TRIGGER AS $$
BEGIN
    -- When a rule is created or updated, update usage counts
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        -- Decrement old references if update
        IF TG_OP = 'UPDATE' AND OLD.references_conditions IS NOT NULL THEN
            UPDATE named_conditions
            SET usage_count = usage_count - 1
            WHERE id = ANY(OLD.references_conditions);
        END IF;

        -- Increment new references
        IF NEW.references_conditions IS NOT NULL THEN
            UPDATE named_conditions
            SET usage_count = usage_count + 1
            WHERE id = ANY(NEW.references_conditions);
        END IF;
    END IF;

    -- When a rule is deleted, decrement usage counts
    IF TG_OP = 'DELETE' THEN
        IF OLD.references_conditions IS NOT NULL THEN
            UPDATE named_conditions
            SET usage_count = usage_count - 1
            WHERE id = ANY(OLD.references_conditions);
        END IF;
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_condition_usage
AFTER INSERT OR UPDATE OR DELETE ON automation_rules
FOR EACH ROW EXECUTE FUNCTION update_named_condition_usage();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_named_conditions_updated_at
BEFORE UPDATE ON named_conditions
FOR EACH ROW EXECUTE FUNCTION update_rules_updated_at();

CREATE TRIGGER trigger_automation_rules_updated_at
BEFORE UPDATE ON automation_rules
FOR EACH ROW EXECUTE FUNCTION update_rules_updated_at();

-- Add some example named conditions as seed data (commented out - uncomment for testing)
-- INSERT INTO named_conditions (organization_id, name, display_name, description, conditions, nesting_depth)
-- SELECT
--     id,
--     'is_engineering',
--     'Engineering Department',
--     'Matches users in the Engineering department',
--     '{"all": [{"fact": "department", "operator": "equal", "value": "Engineering"}]}'::jsonb,
--     0
-- FROM organizations LIMIT 1;

COMMENT ON TABLE named_conditions IS 'Reusable condition blocks that can be referenced by automation rules';
COMMENT ON TABLE automation_rules IS 'Unified rules for dynamic groups, template matching, training assignment, etc.';
COMMENT ON TABLE rule_evaluation_log IS 'Audit log of rule evaluations for debugging';
COMMENT ON COLUMN named_conditions.nesting_depth IS 'How deep the condition nesting goes (max 3 allowed)';
COMMENT ON COLUMN automation_rules.rule_type IS 'Type: dynamic_group, template_match, training_assign, notification, workflow';
