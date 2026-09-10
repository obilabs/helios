-- 087_signature_assignments_and_user_tracking.sql
--
-- Found 2026-09-10 during the signature sync in the UI pass:
--   * "Error listing assignments: relation template_assignments does not exist"
--     (archived 010, the template-studio assignment table the signatures
--     routes read)
--   * "Failed to get token for user: column pixel_token does not exist"
--     (archived 048 named the per-user tracking token pixel_token with an
--     is_active flag; the seed carried an older shape with tracking_token)
-- Both non-fatal (the deploy itself succeeded) but noisy on every sync.
-- Additive and idempotent. The template_types foreign key from 010 is left
-- out: that table is not in the seed either and nothing reads it.

CREATE TABLE IF NOT EXISTS template_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,
  template_type VARCHAR(100),
  target_type VARCHAR(50) NOT NULL CHECK (target_type IN ('organization', 'user', 'department', 'google_group', 'org_unit', 'microsoft_group')),
  target_user_id UUID REFERENCES organization_users(id) ON DELETE CASCADE,
  target_department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  target_group_email VARCHAR(255),
  target_org_unit_path TEXT,
  priority INTEGER NOT NULL DEFAULT 5 CHECK (priority >= 1 AND priority <= 5),
  is_active BOOLEAN DEFAULT true,
  activation_date TIMESTAMP WITH TIME ZONE,
  expiration_date TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT check_single_target CHECK (
    (target_type = 'organization' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'user' AND target_user_id IS NOT NULL AND target_department_id IS NULL AND target_group_email IS NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'department' AND target_user_id IS NULL AND target_department_id IS NOT NULL AND target_group_email IS NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'google_group' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NOT NULL AND target_org_unit_path IS NULL) OR
    (target_type = 'org_unit' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NULL AND target_org_unit_path IS NOT NULL) OR
    (target_type = 'microsoft_group' AND target_user_id IS NULL AND target_department_id IS NULL AND target_group_email IS NOT NULL AND target_org_unit_path IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS idx_template_assignments_org ON template_assignments(organization_id);
CREATE INDEX IF NOT EXISTS idx_template_assignments_template ON template_assignments(template_id);
CREATE INDEX IF NOT EXISTS idx_template_assignments_user ON template_assignments(target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_template_assignments_department ON template_assignments(target_department_id) WHERE target_department_id IS NOT NULL;

ALTER TABLE signature_user_tracking
  ADD COLUMN IF NOT EXISTS pixel_token VARCHAR(64),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE signature_user_tracking SET pixel_token = tracking_token WHERE pixel_token IS NULL AND tracking_token IS NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'signature_user_tracking_pixel_token_key') THEN
    ALTER TABLE signature_user_tracking ADD CONSTRAINT signature_user_tracking_pixel_token_key UNIQUE (pixel_token);
  END IF;
END $$;
