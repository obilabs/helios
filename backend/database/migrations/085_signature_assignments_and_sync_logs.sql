-- 085_signature_assignments_and_sync_logs.sql
--
-- Found 2026-09-10 in the UI pass: the signature scheduler fails on every run
-- with  relation "signature_sync_logs" does not exist , and the per-user
-- assignment table it writes to is missing as well. Both come from archived
-- migration 027 (signature campaigns) that never made it into the seed.
-- Additive and idempotent.

CREATE TABLE IF NOT EXISTS user_signature_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_applied_at TIMESTAMP,
    apply_status VARCHAR(20) DEFAULT 'pending', -- pending, applied, failed, opted_out
    apply_error TEXT,
    user_opted_out BOOLEAN DEFAULT false,
    opt_out_reason TEXT,
    gmail_signature_id VARCHAR(255),
    UNIQUE(user_id, campaign_id)
);
CREATE INDEX IF NOT EXISTS idx_user_assignments_user ON user_signature_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_assignments_campaign ON user_signature_assignments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_user_assignments_status ON user_signature_assignments(apply_status);

CREATE TABLE IF NOT EXISTS signature_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sync_type VARCHAR(20) NOT NULL, -- 'scheduled', 'manual', 'campaign_launch'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    users_processed INTEGER DEFAULT 0,
    users_succeeded INTEGER DEFAULT 0,
    users_failed INTEGER DEFAULT 0,
    users_skipped INTEGER DEFAULT 0,
    error_summary TEXT,
    detailed_errors JSONB,
    triggered_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    campaign_id UUID REFERENCES signature_campaigns(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_signature_sync_logs_org ON signature_sync_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_signature_sync_logs_campaign ON signature_sync_logs(campaign_id);
