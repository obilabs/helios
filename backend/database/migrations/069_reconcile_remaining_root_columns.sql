-- 069_reconcile_remaining_root_columns.sql
--
-- The REST of the deprecated root database/migrations/ set. 067 reconciled the
-- missing TABLES and 068 the organization_users columns needed for login and
-- user creation; a UI survey on 2026-08-21 then found `column
-- st.thumbnail_asset_id does not exist` rendered raw in the signatures admin.
--
-- Sweeping every ALTER TABLE ... ADD COLUMN in root 001-007 against the live
-- database found EIGHTEEN missing columns, not one. Fixing only the column named
-- in the bug report would have left the other seventeen to surface one at a time.
--
-- Three of the survey's findings plausibly share this single cause:
--   * signatures admin 500s                 -> signature_templates (7 columns)
--   * audit logs 500 + "no logs" empty state -> activity_logs (10 columns)
--   * user classification                    -> organization_users.email_domain
--
-- Idempotent: ADD COLUMN IF NOT EXISTS throughout.

BEGIN;

-- signature_templates — source: database/migrations/002_add_thumbnail_asset_id.sql
ALTER TABLE public.signature_templates
  ADD COLUMN IF NOT EXISTS thumbnail_asset_id uuid,
  ADD COLUMN IF NOT EXISTS template_type character varying(20) DEFAULT 'signature'::character varying,
  ADD COLUMN IF NOT EXISTS subject character varying(500),
  ADD COLUMN IF NOT EXISTS css_content text,
  ADD COLUMN IF NOT EXISTS category character varying(100),
  ADD COLUMN IF NOT EXISTS variables_used jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- activity_logs — source: database/migrations/003_add_audit_log_columns.sql
--
-- These carry MSP/vendor attribution on an audit row (who acted, under which
-- pairing, against which ticket). Their absence is why the audit surface fails.
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS actor_type character varying(20) DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS api_key_id uuid,
  ADD COLUMN IF NOT EXISTS api_key_name character varying(255),
  ADD COLUMN IF NOT EXISTS vendor_name character varying(255),
  ADD COLUMN IF NOT EXISTS vendor_technician_name character varying(255),
  ADD COLUMN IF NOT EXISTS vendor_technician_email character varying(255),
  ADD COLUMN IF NOT EXISTS ticket_reference character varying(255),
  ADD COLUMN IF NOT EXISTS service_name character varying(255),
  ADD COLUMN IF NOT EXISTS service_owner character varying(255),
  ADD COLUMN IF NOT EXISTS result character varying(20) DEFAULT 'success';

-- organization_users — source: database/migrations/006_update_user_classification.sql
ALTER TABLE public.organization_users
  ADD COLUMN IF NOT EXISTS email_domain VARCHAR(255);

COMMIT;

-- ---------------------------------------------------------------------------
-- Found by testing the fix rather than trusting it.
--
-- After the columns above landed, /api/v1/organization/audit-logs recovered
-- (500 -> 200) but signatures and security-events still 500d — so the column
-- sweep was necessary and not sufficient. Two more objects, same class again:
-- referenced by running code, defined only in database/archived_migrations/.

BEGIN;

-- user_signatures — source: database/archived_migrations/009c_create_remaining_tables.sql
-- The signatures list query does `(SELECT COUNT(*) FROM user_signatures us
-- WHERE us.current_template_id = st.id) as usage_count`, so a missing table
-- 42P01s the whole endpoint.
CREATE TABLE IF NOT EXISTS public.user_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  current_template_id UUID REFERENCES signature_templates(id),
  deployment_status VARCHAR(50),
  last_deployed_at TIMESTAMP,
  deployment_error TEXT,
  google_workspace_signature_id VARCHAR(255),
  microsoft_365_signature_id VARCHAR(255),
  allow_user_selection BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_signatures_user ON public.user_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_user_signatures_org ON public.user_signatures(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_signatures_template ON public.user_signatures(current_template_id);

-- security_events — source: database/archived_migrations/022_create_security_events.sql
-- The list query selects all of these; six were absent.
ALTER TABLE public.security_events
  ADD COLUMN IF NOT EXISTS user_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS acknowledged BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS acknowledged_note TEXT;

COMMIT;

-- ---------------------------------------------------------------------------
-- Third round, again found by retesting rather than by reading.
--
-- /api/v1/me/profile still 500d with `column "pronouns" does not exist`, which
-- is the survey's "My Profile page is dead" BLOCKER. Four more columns, sources
-- archived_migrations/007b and /033.

BEGIN;

ALTER TABLE public.organization_users
  ADD COLUMN IF NOT EXISTS pronouns VARCHAR(50),
  ADD COLUMN IF NOT EXISTS current_status TEXT,
  ADD COLUMN IF NOT EXISTS profile_completeness INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMP WITH TIME ZONE;

COMMIT;

-- ---------------------------------------------------------------------------
-- user_fun_facts is a SCHEMA CONFLICT, not a missing column.
--
--   live table:  id, user_id, fact, sort_order, is_visible, created_at
--   code query:  id, emoji, content, display_order
--
-- Two incompatible definitions of the same table. The seed created one shape;
-- archived_migrations/033 and every query in backend/src use the other. Nothing
-- in backend/src reads `fact`, `sort_order` or `is_visible` — verified by grep,
-- the apparent "fact" hits are the table NAME.
--
-- Adding the columns the code actually uses. The orphaned three are left in
-- place rather than dropped: the table is empty today, but dropping columns is
-- irreversible and this migration's job is to unblock /api/v1/me/profile, not to
-- reshape a table. Removing them is a follow-up worth doing deliberately.

BEGIN;

ALTER TABLE public.user_fun_facts
  ADD COLUMN IF NOT EXISTS emoji VARCHAR(10),
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

COMMIT;

-- ---------------------------------------------------------------------------
-- The whole people-directory family, ported at once.
--
-- After five rounds of "fix the column named in the error, retest, get a new
-- column name", I stopped and diffed the entire source migration
-- (archived_migrations/033_add_people_directory_tables.sql) against the live
-- schema. It found ten more missing columns across three tables.
--
-- Chasing them one error at a time would have taken five more rounds and left
-- whichever ones the profile endpoint happens not to touch still broken.
--
-- organization_id is added NULLABLE here, unlike the source, which declares it
-- NOT NULL. user_media already exists with rows possible; adding a NOT NULL
-- column without a default would fail on a non-empty table, and back-filling an
-- organization id is a data decision, not a schema one.

BEGIN;

ALTER TABLE public.user_media
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS storage_bucket VARCHAR(100) NOT NULL DEFAULT 'user-media',
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS transcription TEXT,
  ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(50) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS thumbnail_path VARCHAR(500);
CREATE INDEX IF NOT EXISTS idx_user_media_organization_id ON public.user_media(organization_id);

ALTER TABLE public.user_fun_facts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE public.user_expertise_topics
  ADD COLUMN IF NOT EXISTS skill_level VARCHAR(50);

COMMIT;

-- ---------------------------------------------------------------------------
-- organization_users.user_preferences
--
-- `SELECT user_preferences FROM organization_users` powers the view-preference
-- endpoint, which fires on EVERY page load — so this 500 was in the log
-- constantly. The live table has `preferences` and `preferred_language`, but not
-- `user_preferences`; the column is defined in archived_migrations/025 and again
-- in /049. Adding the name the code actually asks for.
--
-- NOT merging it with the existing `preferences` column: they may hold different
-- things, and collapsing two preference stores is a data decision.

BEGIN;
ALTER TABLE public.organization_users
  ADD COLUMN IF NOT EXISTS user_preferences JSONB DEFAULT '{}'::jsonb;
COMMIT;
