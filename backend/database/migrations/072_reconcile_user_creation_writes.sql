-- 072_reconcile_user_creation_writes.sql
--
-- Three schema-drift bugs found during a live create-user E2E on 2026-08-24
-- (Quick Add -> "Create in Google Workspace" against a real tenant). The user
-- was created in Google AND Helios, but three ancillary writes each threw and
-- were swallowed by their surrounding try/catch — the same silent-failure class
-- as the audit-log columns reconciled in 069/070: code references an object that
-- the seed dump (database/schema_organization.sql) captured before the column /
-- table existed, so a freshly-seeded database is one migration behind the code.
--
-- Each fix is a pure schema addition; the application code is already correct and
-- unchanged. Idempotent throughout (ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE)
-- and applied as a single transaction by the migration runner (src/database/
-- migrate.ts wraps each file in BEGIN/COMMIT), so no explicit transaction control
-- here — a nested BEGIN/COMMIT would commit the wrapper's transaction early.

-- ---------------------------------------------------------------------------
-- Bug 1: security_events is missing the actor_* columns.
--
--   error: column "actor_id" of relation "security_events" does not exist (42703)
--   effect: activityTracker.track() 42703s -> "Failed to track activity" ->
--           user.created is never recorded in the security-events feed.
--
-- The writer (services/activity-tracker.service.ts) inserts, and both of its
-- read queries (getRecentActivity / getSecurityEvents) select, actor_id /
-- actor_email / actor_name. Migration 069 already added title/user_email/details
-- and the acknowledge_* columns for the OTHER (list-page) read shape, but the
-- actor_* trio the tracker uses was never added. Source of the naming:
-- database/archived_migrations/018_create_api_keys_system.sql (actor attribution).
--
-- No foreign key on actor_id: security_events is a best-effort, append-only event
-- sink whose insert errors are swallowed, and the actor can legitimately be a
-- service/vendor/external id (see ActorType in the tracker) or a since-deleted
-- user. A FK to organization_users would re-introduce exactly the insert failure
-- this migration removes. The writer already coerces a missing actor id ('') to
-- NULL, so the column is nullable.
ALTER TABLE public.security_events
  ADD COLUMN IF NOT EXISTS actor_id uuid,
  ADD COLUMN IF NOT EXISTS actor_email character varying(255),
  ADD COLUMN IF NOT EXISTS actor_name character varying(255);

CREATE INDEX IF NOT EXISTS idx_security_events_actor
  ON public.security_events (actor_id) WHERE actor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Bug 2: password_setup_tokens is missing created_by AND used.
--
--   error: column "created_by" of relation "password_setup_tokens" does not exist (42703)
--   effect: createPasswordSetupToken() 42703s -> "Failed to create password setup
--           token" -> sendPasswordSetupEmail returns false (emailSent:false), so a
--           user created with the "Send password setup link via email" method never
--           receives the email and cannot set their password.
--
-- The reported error names created_by (first unknown column in the INSERT), but
-- `used` is a second, latent instance of the same drift on this table: the live
-- table has only used_at, while services/password-setup.service.ts reads `used`
-- (verifyToken), writes it (markTokenAsUsed: SET used = true) and filters on it
-- (cleanupExpiredTokens). Adding created_by alone would fix token creation only
-- for the failure to resurface the moment the user clicks the setup link. Both
-- columns are in the authoritative source, archived_migrations/001_add_password_
-- setup_system.sql; the seed dump predates them.
ALTER TABLE public.password_setup_tokens
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.organization_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS used boolean DEFAULT false;

-- ---------------------------------------------------------------------------
-- Bug 3: the user_effective_signatures view does not exist.
--
--   error: relation "user_effective_signatures" does not exist (42P01)
--   effect: signatureAssignmentService.getEffectiveSignature() 42P01s, so the
--           signature-sync job (syncOrganizationSignatures) throws for every user.
--
-- The view resolves each user's effective signature template through the priority
-- chain campaign > user > dynamic_group > group > department > ou > organization.
-- It was defined only in database/archived_migrations/ (044 created it, 047 added
-- campaign support) — neither was carried into the active migration set, and the
-- seed dump never captured it. This recreates the 047 shape, whose output columns
-- (user_id, organization_id, assignment_id, template_id, source, banner_url,
-- banner_link, banner_alt_text) are exactly what EffectiveSignatureRow reads. The
-- two helper functions 047 also defined (user_has_active_campaign,
-- get_user_campaign_banner) are omitted: nothing in backend/src calls them.
--
-- CREATE OR REPLACE (not DROP ... CASCADE as in 047) because the view is absent
-- here and nothing depends on it; replace-in-place is the idempotent form.
CREATE OR REPLACE VIEW public.user_effective_signatures AS
WITH
-- Active campaigns matching each user (highest priority).
user_campaigns AS (
    SELECT DISTINCT
        ou.id AS user_id,
        ou.organization_id,
        sc.id AS campaign_id,
        sc.template_id,
        sc.banner_url,
        sc.banner_link,
        sc.banner_alt_text,
        sc.start_date,
        'campaign'::text AS source_type,
        0 AS type_priority
    FROM organization_users ou
    CROSS JOIN signature_campaigns sc
    LEFT JOIN campaign_assignments ca ON ca.campaign_id = sc.id
    WHERE sc.organization_id = ou.organization_id
      AND sc.status = 'active'
      AND sc.start_date <= NOW()
      AND sc.end_date > NOW()
      AND ou.is_active = true
      AND (
          ca.id IS NULL
          OR ca.assignment_type = 'organization'
          OR (ca.assignment_type = 'user' AND ca.target_id = ou.id)
          OR (ca.assignment_type IN ('group', 'dynamic_group') AND EXISTS (
              SELECT 1 FROM access_group_members agm
              WHERE agm.access_group_id = ca.target_id
                AND agm.user_id = ou.id
                AND agm.is_active = true
          ))
          OR (ca.assignment_type = 'department' AND ca.target_id = ou.department_id)
          OR (ca.assignment_type = 'ou' AND EXISTS (
              SELECT 1 FROM gw_synced_users gsu
              WHERE gsu.email = ou.email
                AND gsu.organization_id = ou.organization_id
                AND gsu.org_unit_path = ca.target_value
          ))
      )
),
-- Regular signature assignments, ranked within each user by type then priority.
ranked_assignments AS (
    SELECT
        ou.id AS user_id,
        ou.organization_id,
        sa.id AS assignment_id,
        sa.template_id,
        NULL::text AS banner_url,
        NULL::text AS banner_link,
        NULL::text AS banner_alt_text,
        sa.created_at AS effective_date,
        sa.assignment_type AS source_type,
        CASE sa.assignment_type
            WHEN 'user' THEN 1
            WHEN 'dynamic_group' THEN 2
            WHEN 'group' THEN 3
            WHEN 'department' THEN 4
            WHEN 'ou' THEN 5
            WHEN 'organization' THEN 6
            ELSE 99
        END AS type_priority,
        sa.priority,
        ROW_NUMBER() OVER (
            PARTITION BY ou.id
            ORDER BY
                CASE sa.assignment_type
                    WHEN 'user' THEN 1
                    WHEN 'dynamic_group' THEN 2
                    WHEN 'group' THEN 3
                    WHEN 'department' THEN 4
                    WHEN 'ou' THEN 5
                    WHEN 'organization' THEN 6
                    ELSE 99
                END,
                sa.priority
        ) AS rank
    FROM organization_users ou
    JOIN signature_assignments sa ON sa.organization_id = ou.organization_id
    JOIN signature_templates st ON st.id = sa.template_id AND st.status = 'active'
    WHERE sa.is_active = true
      AND (
          (sa.assignment_type = 'user' AND sa.target_id = ou.id)
          OR (sa.assignment_type = 'group' AND EXISTS (
              SELECT 1 FROM access_group_members agm
              WHERE agm.access_group_id = sa.target_id
                AND agm.user_id = ou.id
                AND agm.is_active = true
          ))
          OR (sa.assignment_type = 'dynamic_group' AND EXISTS (
              SELECT 1 FROM access_group_members agm
              WHERE agm.access_group_id = sa.target_id
                AND agm.user_id = ou.id
                AND agm.is_active = true
          ))
          OR (sa.assignment_type = 'department' AND sa.target_id = ou.department_id)
          OR (sa.assignment_type = 'ou' AND EXISTS (
              SELECT 1 FROM gw_synced_users gsu
              WHERE gsu.email = ou.email
                AND gsu.organization_id = ou.organization_id
                AND gsu.org_unit_path = sa.target_value
          ))
          OR (sa.assignment_type = 'organization')
      )
),
-- Campaigns win; regular assignments apply only when the user has no campaign.
all_assignments AS (
    SELECT
        user_id,
        organization_id,
        campaign_id::uuid AS assignment_id,
        template_id,
        banner_url,
        banner_link,
        banner_alt_text,
        source_type AS source,
        type_priority,
        1 AS rank
    FROM user_campaigns

    UNION ALL

    SELECT
        ra.user_id,
        ra.organization_id,
        ra.assignment_id,
        ra.template_id,
        ra.banner_url,
        ra.banner_link,
        ra.banner_alt_text,
        ra.source_type AS source,
        ra.type_priority,
        ra.rank
    FROM ranked_assignments ra
    WHERE ra.rank = 1
      AND NOT EXISTS (
          SELECT 1 FROM user_campaigns uc WHERE uc.user_id = ra.user_id
      )
)
SELECT
    user_id,
    organization_id,
    assignment_id,
    template_id,
    source,
    banner_url,
    banner_link,
    banner_alt_text
FROM all_assignments
WHERE rank = 1;

COMMENT ON VIEW public.user_effective_signatures IS
    'Resolves the effective signature template for each user.
     Priority order: Active Campaigns > User > Dynamic Group > Group > Department > OU > Organization.
     Recreated by migration 072 from archived_migrations/047 (the seed dump never captured it).';
