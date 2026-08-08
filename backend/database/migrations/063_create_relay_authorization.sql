-- Migration 063: API Relay Authorization storage (OpenSpec: secure-api-relay-authorization)
-- Purpose: persist per-organization relay config (dark-launch toggles) and the
-- allow/deny rules the policy engine (src/services/relay/policy.ts) evaluates.
--
-- NOTE: the migration runner re-executes every file on boot, so everything in
-- here must be idempotent (IF NOT EXISTS / ON CONFLICT).

-- Per-organization relay configuration. A missing row means CLOSED:
-- relay disabled, writes disabled (deny-by-default holds with no setup at all).
CREATE TABLE IF NOT EXISTS relay_config (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    -- Per-org opt-in. Enabling the relay does NOT enable writes (design §7).
    relay_enabled BOOLEAN NOT NULL DEFAULT false,
    -- Separate toggle for write/delete operations.
    writes_enabled BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Relay allow/deny rules. Deny rules are organization-wide and absolute
-- (the kill switch); allow rules are additive and may later be scoped to an
-- access group (access_group_id) by the admin UI. Rule authoring/UI is a later
-- phase — this table is the storage the policy engine loads from.
CREATE TABLE IF NOT EXISTS relay_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    effect VARCHAR(10) NOT NULL CHECK (effect IN ('allow', 'deny')),
    -- Match pattern `resource:METHOD` with wildcards, e.g.
    -- 'admin.directory.users:GET', 'admin.directory.*:GET', '*'.
    match_pattern VARCHAR(255) NOT NULL,
    -- Optional group scoping for allow rules (NULL = org-wide). Deny rules are
    -- always org-wide regardless of this column.
    access_group_id UUID REFERENCES access_groups(id) ON DELETE CASCADE,
    -- Subject constraints (design §10). A rule must EXPLICITLY opt in to acting
    -- on privileged subjects; default is no.
    subject_allow_privileged BOOLEAN NOT NULL DEFAULT false,
    -- JSON array of OU paths the subject must be in; NULL = no OU scoping.
    subject_org_units JSONB,
    -- Optional expiry (design §11 — time-boxed grants). NULL = no expiry.
    expires_at TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_relay_rules_org ON relay_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_relay_rules_org_effect ON relay_rules(organization_id, effect);

-- Global dark-launch feature flag: OFF by default. When off, the transparent
-- proxy behaves exactly as before (passthrough, no enforcement). ON CONFLICT
-- DO NOTHING so a restart never resets an admin's choice.
INSERT INTO feature_flags (feature_key, name, description, is_enabled, category)
VALUES (
    'api_relay',
    'API Relay Authorization',
    'Enforce deny-by-default authorization rules on the transparent Google API proxy. When disabled, the proxy passes requests through unchanged (legacy behavior).',
    false,
    'security'
)
ON CONFLICT (feature_key) DO NOTHING;
