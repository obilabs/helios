-- Migration 009b: Fix Indexes for Module System
-- Date: 2025-10-08
-- Description: Add proper CREATE INDEX statements that were missing from 009

-- =====================================================
-- PUBLIC_ASSETS INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_public_assets_org_type
  ON public_assets(organization_id, asset_type);

CREATE INDEX IF NOT EXISTS idx_public_assets_org_module
  ON public_assets(organization_id, module_source);

CREATE INDEX IF NOT EXISTS idx_public_assets_cdn_url
  ON public_assets(cdn_url);

CREATE INDEX IF NOT EXISTS idx_public_assets_public_url
  ON public_assets(public_url);

-- =====================================================
-- ASSET_USAGE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_asset_usage_asset
  ON asset_usage(asset_id);

CREATE INDEX IF NOT EXISTS idx_asset_usage_resource
  ON asset_usage(organization_id, resource_type, resource_id);

-- =====================================================
-- ASSET_ACCESS_LOGS INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_asset_access_asset_time
  ON asset_access_logs(asset_id, accessed_at);

CREATE INDEX IF NOT EXISTS idx_asset_access_org_time
  ON asset_access_logs(organization_id, accessed_at);

CREATE INDEX IF NOT EXISTS idx_asset_access_tracking
  ON asset_access_logs(tracking_result_id);

-- =====================================================
-- SIGNATURE_ASSIGNMENTS INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_signature_assignments_assignment
  ON signature_assignments(organization_id, assignment_type, assignment_value);

CREATE INDEX IF NOT EXISTS idx_signature_assignments_template
  ON signature_assignments(template_id);

-- =====================================================
-- SIGNATURE_CAMPAIGNS INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_signature_campaigns_org_status
  ON signature_campaigns(organization_id, status);

CREATE INDEX IF NOT EXISTS idx_signature_campaigns_dates
  ON signature_campaigns(start_date, end_date);

-- =====================================================
-- TRACKING_RESULTS INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tracking_results_campaign_status
  ON tracking_results(campaign_id, status);

CREATE INDEX IF NOT EXISTS idx_tracking_results_rid
  ON tracking_results(rid);

-- =====================================================
-- TRACKING_EVENTS INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_tracking_events_campaign_type_time
  ON tracking_events(campaign_id, event_type, occurred_at);

CREATE INDEX IF NOT EXISTS idx_tracking_events_result_time
  ON tracking_events(result_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_tracking_events_user_time
  ON tracking_events(user_id, occurred_at);

-- =====================================================
-- Verification
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 009b completed - All indexes created successfully!';
END $$;
