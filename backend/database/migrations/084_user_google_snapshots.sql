-- 084_user_google_snapshots.sql
--
-- Phase 02 bone: a point-in-time copy of a user's Google Workspace state
-- (profile, groups, licences, mail settings, signature) taken BEFORE Helios
-- suspends, offboards or deletes the account. Google keeps a deleted user for
-- 20 days; after that users.undelete fails and, until now, Helios could only
-- say so. With a snapshot, Restore re-creates the account from this record.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS user_google_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  google_workspace_id VARCHAR(255),
  primary_email VARCHAR(255) NOT NULL,
  reason VARCHAR(32) NOT NULL CHECK (reason IN ('offboard', 'suspend', 'delete', 'manual')),
  -- { profile: users.get(projection=full), groups: [{id,email,name}], licenses: [{productId,skuId,skuName}],
  --   mail: {forwarding, vacation, delegates: []}, signature: string|null, partial: [step names that failed] }
  snapshot JSONB NOT NULL,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  taken_by UUID,
  restored_at TIMESTAMPTZ,
  restored_google_workspace_id VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_user_google_snapshots_user
  ON user_google_snapshots (organization_id, user_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_google_snapshots_email
  ON user_google_snapshots (organization_id, primary_email, taken_at DESC);

COMMENT ON TABLE user_google_snapshots IS 'Pre-change copy of a Google user (profile, groups, licences, mail settings) used to re-create the account after Google''s 20-day undelete window';
