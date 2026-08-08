-- 007_add_system_settings.sql
--
-- Install-level key/value settings, keyed by `key` alone (NOT org-scoped).
--
-- Why a new table: `instance_id` identifies the whole Helios INSTALL to the
-- control plane, not an organization. It must be stable across the install's
-- lifetime and must NOT vanish if the org row is deleted. `organization_settings`
-- is the wrong home — it is UNIQUE(organization_id, key) with organization_id
-- NOT NULL and FK ... ON DELETE CASCADE, so an org-less instance id cannot be
-- written there and would be cascade-deleted with the org. This is the table the
-- (previously dead) license.service already assumed existed.
--
-- Idempotent: the migration runner re-runs every file on each invocation and
-- does not track applied migrations, so every statement here is guarded.
CREATE TABLE IF NOT EXISTS public.system_settings (
    key         character varying(255) PRIMARY KEY,
    value       text,
    created_at  timestamp with time zone DEFAULT now(),
    updated_at  timestamp with time zone DEFAULT now()
);
