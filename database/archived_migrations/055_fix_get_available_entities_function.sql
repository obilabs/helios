-- Migration: 055_fix_get_available_entities_function.sql
-- Created: 2025-12-16
-- Description: Fix get_available_entities function to use correct table name (modules instead of available_modules)

-- The function was referencing 'available_modules' which doesn't exist.
-- The correct table is 'modules' with 'slug' column (not 'module_key').

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
    -- Core entities always available
    SELECT DISTINCT
      mep.entity_canonical_name,
      ARRAY['core']::VARCHAR[] as providers
    FROM module_entity_providers mep
    WHERE mep.module_key = 'core'
  ),
  module_entities AS (
    -- Entities from enabled modules
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

COMMENT ON FUNCTION public.get_available_entities(uuid) IS 'Returns available entities and their providers based on enabled modules for an organization. Fixed in migration 055 to use modules table instead of non-existent available_modules.';
