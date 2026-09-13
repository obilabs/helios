-- 099_google_sync_outcome.sql
--
-- Record whether the last Google sync actually worked.
--
-- Microsoft has recorded this since its integration was built (ms_credentials
-- carries last_sync_at, sync_status and sync_error) and Google never has. The
-- consequence was found live on 2026-09-13: the trial workspace was deleted, every
-- Google sync failed with `invalid_grant: Invalid email or User ID`, the failure was
-- logged by the server — and the admin screen kept showing "synced 21m ago" with no
-- hint of trouble. A manual sync answered HTTP 200 with success:false in the body,
-- and the only error the UI could show lived in component state that vanished on
-- reload.
--
-- A connection that is permanently broken must not look identical to a healthy one.

ALTER TABLE gw_credentials
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

COMMENT ON COLUMN gw_credentials.sync_status IS
  'Outcome of the last Google sync attempt: pending, syncing, completed or failed. Mirrors ms_credentials so both platforms report the same way.';
COMMENT ON COLUMN gw_credentials.sync_error IS
  'Why the last Google sync failed, shown to the admin. Cleared on the next success.';

-- Existing installs have synced successfully before this column existed; seed from the
-- cache so a working connection does not read as "never synced".
UPDATE gw_credentials c
   SET last_sync_at = s.last_sync,
       sync_status = 'completed'
  FROM (SELECT organization_id, MAX(last_sync_at) AS last_sync FROM gw_synced_users GROUP BY organization_id) s
 WHERE s.organization_id = c.organization_id
   AND c.last_sync_at IS NULL;
