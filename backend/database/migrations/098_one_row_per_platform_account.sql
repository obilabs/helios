-- 098_one_row_per_platform_account.sql
--
-- One Helios row per Google account and per Microsoft account.
--
-- Nothing enforced it. Before helios #126 the syncs matched on email alone, so an
-- address released in one platform and reused in another could leave two live rows
-- carrying the same Microsoft id (found on the obilabs.dev trial, 2026-09-11: a
-- renamed Google person and the Microsoft account that took the old address). The
-- reconcile then updated whichever row the database returned first, so the other
-- never changed again.
--
-- Repair: where two live rows share a platform id, keep the link on the row whose
-- email is the platform account's address (else the most recently updated row) and
-- clear it on the others. Nothing is deleted; the unlinked row stays as it was, now
-- without that platform link. Then make it impossible to recur.

-- Microsoft
WITH ranked AS (
  SELECT ou.id,
         row_number() OVER (
           PARTITION BY ou.organization_id, ou.microsoft_365_id
           ORDER BY (lower(ou.email) = lower(COALESCE(m.email, m.upn, ''))) DESC, ou.updated_at DESC NULLS LAST, ou.id
         ) AS rn
    FROM organization_users ou
    LEFT JOIN ms_synced_users m
      ON m.organization_id = ou.organization_id AND m.ms_id = ou.microsoft_365_id
   WHERE ou.microsoft_365_id IS NOT NULL AND ou.deleted_at IS NULL
)
UPDATE organization_users ou
   SET microsoft_365_id = NULL, microsoft_365_upn = NULL,
       microsoft_365_sync_status = NULL, updated_at = NOW()
  FROM ranked
 WHERE ranked.id = ou.id AND ranked.rn > 1;

-- Google
WITH ranked AS (
  SELECT ou.id,
         row_number() OVER (
           PARTITION BY ou.organization_id, ou.google_workspace_id
           ORDER BY (lower(ou.email) = lower(COALESCE(g.email, ''))) DESC, ou.updated_at DESC NULLS LAST, ou.id
         ) AS rn
    FROM organization_users ou
    LEFT JOIN gw_synced_users g
      ON g.organization_id = ou.organization_id AND g.google_id = ou.google_workspace_id
   WHERE ou.google_workspace_id IS NOT NULL AND ou.deleted_at IS NULL
)
UPDATE organization_users ou
   SET google_workspace_id = NULL, updated_at = NOW()
  FROM ranked
 WHERE ranked.id = ou.id AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_users_live_microsoft_account
  ON organization_users (organization_id, microsoft_365_id)
  WHERE microsoft_365_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_users_live_google_account
  ON organization_users (organization_id, google_workspace_id)
  WHERE google_workspace_id IS NOT NULL AND deleted_at IS NULL;
