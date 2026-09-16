-- 101_group_scenarios.sql
--
-- Group scenarios (D-048). Built-in scenarios are defined in code
-- (backend/src/config/group-scenarios.ts) and are never copied into SQL. The
-- database holds only:
--
--   group_scenario_builtin_state  an organization's choice to disable a built-in
--                                 (disable, never delete)
--   group_scenarios               admin-defined scenarios, from a built-in base or
--                                 from scratch
--
-- Additive only: two new tables, nothing altered or dropped. Idempotent.

CREATE TABLE IF NOT EXISTS group_scenario_builtin_state (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    builtin_key VARCHAR(100) NOT NULL,
    is_disabled BOOLEAN NOT NULL DEFAULT false,
    updated_by UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (organization_id, builtin_key)
);

COMMENT ON TABLE group_scenario_builtin_state IS
  'Per-organization state of code-defined group scenarios. A row only records a choice; a missing row means enabled.';

CREATE TABLE IF NOT EXISTS group_scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    scenario_key VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    -- The built-in this scenario was copied from, if any. Informational: the
    -- settings below are a full copy, so a later change to the built-in does not
    -- silently change what this scenario applies.
    base_builtin_key VARCHAR(100),
    user_story TEXT NOT NULL DEFAULT '',
    what_happens JSONB NOT NULL DEFAULT '[]'::jsonb,
    outside_senders_see TEXT NOT NULL DEFAULT '',
    members_see TEXT NOT NULL DEFAULT '',
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    member_delivery JSONB NOT NULL DEFAULT '{}'::jsonb,
    suggested_aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
    manual_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    email_checklist JSONB NOT NULL DEFAULT '[]'::jsonb,
    accepts_external_mail BOOLEAN NOT NULL DEFAULT false,
    is_disabled BOOLEAN NOT NULL DEFAULT false,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT group_scenarios_org_key_unique UNIQUE (organization_id, scenario_key)
);

CREATE INDEX IF NOT EXISTS idx_group_scenarios_org ON group_scenarios (organization_id);

COMMENT ON TABLE group_scenarios IS
  'Admin-defined group scenarios. Keys must not collide with a built-in key (enforced in the service).';
