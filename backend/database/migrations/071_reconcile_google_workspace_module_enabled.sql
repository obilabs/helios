-- 071_reconcile_google_workspace_module_enabled.sql
--
-- Heal installs where Google Workspace setup COMPLETED — valid credentials in
-- gw_credentials, users pulled into gw_synced_users — but Settings > Modules is
-- still stuck on "Disabled" and clicking Enable re-opens the whole setup wizard
-- demanding the service-account key again.
--
-- Root cause: the module is seeded into `modules` with the slug
-- 'google_workspace' (underscore), but the setup path looked it up by
-- 'google-workspace' (hyphen). `SELECT id FROM modules WHERE slug =
-- 'google-workspace'` returned zero rows, the `if (rows.length > 0)` guard fell
-- through, and the organization_modules enable-row was NEVER written — while
-- storeServiceAccountCredentials still returned success. A textbook silent
-- split-brain: credentials + synced users present, enable-row absent.
--
-- The code fix (google-workspace.service.ts markModuleEnabled + underscore slug
-- everywhere) stops this for FUTURE setups. This migration repairs orgs that
-- already fell into the trap, since re-running setup would otherwise be the only
-- way out — the exact re-upload the fix is meant to eliminate.
--
-- Idempotent: ON CONFLICT DO NOTHING throughout; tracked in schema_migrations.

BEGIN;

-- 1. Ensure the canonical Google Workspace module row exists (underscore slug).
--    Covers databases where `modules` was never seeded at all (the setup-wizard
--    onboarding path does not run seedDefaultAdmin, the only seeder of modules).
INSERT INTO public.modules (name, slug, description, version, config_schema)
VALUES ('Google Workspace', 'google_workspace',
        'Sync users and groups from Google Workspace', '1.0.0', '{}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- 2. Write the enabled + configured row for every org that has valid stored
--    credentials but no organization_modules row for the module.
--
--    ON CONFLICT DO NOTHING is deliberate: an org that has EXPLICITLY disabled
--    the module keeps a row with is_enabled = false, which we must not clobber.
--    Only the ABSENT case (setup completed, enable-write skipped) is healed.
INSERT INTO public.organization_modules
    (organization_id, module_id, is_enabled, is_configured, config, sync_status, last_sync_at, updated_at)
SELECT
    c.organization_id,
    m.id,
    true,
    true,
    jsonb_build_object('domain', c.domain, 'adminEmail', c.admin_email),
    'success',
    (SELECT MAX(u.last_sync_at) FROM public.gw_synced_users u WHERE u.organization_id = c.organization_id),
    NOW()
FROM public.gw_credentials c
CROSS JOIN LATERAL (SELECT id FROM public.modules WHERE slug = 'google_workspace' LIMIT 1) m
WHERE c.is_valid = true
ON CONFLICT (organization_id, module_id) DO NOTHING;

COMMIT;
