-- 077_reconcile_seed_drift_dashboard_ai_labels.sql
--
-- Same class as 076: the seed (schema_organization.sql) predates archived
-- migrations 036 / 055 / 057 / 058 that the running code was written against.
-- On a fresh install each of these produced a 500 on every page load
-- (found 2026-09-07 during the Google Workspace end-to-end UI run):
--   dashboard widgets  -> column "widget_id" does not exist
--   AI config          -> column "mcp_tools" does not exist
--   labels             -> function get_available_entities(uuid) does not exist
-- Additive and idempotent. Nothing renamed or dropped.

-- user_dashboard_widgets: the seed calls the column widget_type; the code
-- (dashboard.routes.ts) reads and writes widget_id and upserts on (user_id, widget_id).
ALTER TABLE user_dashboard_widgets
  ADD COLUMN IF NOT EXISTS widget_id VARCHAR(100);
UPDATE user_dashboard_widgets SET widget_id = widget_type WHERE widget_id IS NULL;
ALTER TABLE user_dashboard_widgets ALTER COLUMN widget_type DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_dashboard_widgets_user_id_widget_id_key'
  ) THEN
    ALTER TABLE user_dashboard_widgets
      ADD CONSTRAINT user_dashboard_widgets_user_id_widget_id_key UNIQUE (user_id, widget_id);
  END IF;
END $$;

-- ai_config: archived 057 + 058
ALTER TABLE ai_config
  ADD COLUMN IF NOT EXISTS mcp_tools JSONB DEFAULT '{"help":true,"users":true,"groups":true,"reports":true,"commands":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS use_custom_prompt BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_system_prompt TEXT,
  ADD COLUMN IF NOT EXISTS ai_role VARCHAR(20) DEFAULT 'viewer';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_config_ai_role_check') THEN
    ALTER TABLE ai_config
      ADD CONSTRAINT ai_config_ai_role_check CHECK (ai_role IN ('viewer', 'operator', 'admin'));
  END IF;
END $$;
UPDATE ai_config SET ai_role = 'viewer' WHERE ai_role IS NULL;

-- labels: archived 055 (uses modules.slug, not the never-existing available_modules)
CREATE OR REPLACE FUNCTION public.get_available_entities(org_id uuid)
 RETURNS TABLE(canonical_name character varying, provided_by character varying[])
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH enabled_modules AS (
    SELECT m.slug as module_key
    FROM organization_modules om
    JOIN modules m ON m.id = om.module_id
    WHERE om.organization_id = org_id AND om.is_enabled = true
  ),
  core_entities AS (
    SELECT DISTINCT
      mep.entity_canonical_name,
      ARRAY['core']::VARCHAR[] as providers
    FROM module_entity_providers mep
    WHERE mep.module_key = 'core'
  ),
  module_entities AS (
    SELECT
      mep.entity_canonical_name,
      array_agg(mep.module_key) as providers
    FROM module_entity_providers mep
    WHERE mep.module_key IN (SELECT module_key FROM enabled_modules)
    GROUP BY mep.entity_canonical_name
  )
  SELECT
    COALESCE(c.entity_canonical_name, m.entity_canonical_name) as canonical_name,
    COALESCE(c.providers, ARRAY[]::VARCHAR[]) || COALESCE(m.providers, ARRAY[]::VARCHAR[]) as provided_by
  FROM core_entities c
  FULL OUTER JOIN module_entities m ON c.entity_canonical_name = m.entity_canonical_name;
END;
$function$;
