-- 093_repair_platform_users_typed_local.sql
--
-- 'local' means a Helios-only account with no platform identity. Until this change,
-- every user Helios created inside the organization's Google or Microsoft tenant kept
-- the column default 'local' even though it had a platform id, and syncs never
-- corrected it. The create paths are fixed in the same change as this migration. Found live on 2026-09-11: six users created through the Users page
-- all ended up 'local', including ones that had been through a sync.
--
-- A row with a platform id and user_type 'local' is a contradiction by definition,
-- so repair it to 'staff'. Guests are untouched: the sync sets 'guest' from the
-- platform's own guest flag, and a guest never reaches this branch because Helios
-- cannot create guest accounts. Soft-deleted rows are repaired too, so history and
-- restore behave consistently.

UPDATE organization_users
   SET user_type = 'staff',
       updated_at = now()
 WHERE user_type = 'local'
   AND (google_workspace_id IS NOT NULL OR microsoft_365_id IS NOT NULL);
