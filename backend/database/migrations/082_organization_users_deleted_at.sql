-- 082_organization_users_deleted_at.sql
--
-- Restore (PATCH users/:id/restore) and the transparent proxy's mirror read
-- and write organization_users.deleted_at; the seed never had the column
-- (found 2026-09-08 while restoring a Google-deleted user: 42703).
-- Additive, idempotent. Backfills nothing: rows deleted before this migration
-- simply show no deletion date.

ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
