-- Migration 009c: Create Remaining Module Tables
-- Date: 2025-10-08
-- Description: Create signature management and tracking tables (without inline INDEX syntax)

-- =====================================================
-- 1. PUBLIC ASSET HOSTING MODULE TABLES
-- =====================================================

-- Asset storage table
CREATE TABLE IF NOT EXISTS public_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Asset identification
  asset_key VARCHAR(255) NOT NULL,
  asset_type VARCHAR(50) NOT NULL,
  module_source VARCHAR(100),

  -- File details
  file_name VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(255),
  file_path VARCHAR(500) NOT NULL,
  cdn_url VARCHAR(500),
  public_url VARCHAR(500) NOT NULL,

  -- File metadata
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  width INTEGER,
  height INTEGER,

  -- Usage tracking
  usage_count INTEGER DEFAULT 0,
  download_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMP,

  -- Asset management
  is_active BOOLEAN DEFAULT true,
  tags JSONB,

  -- Audit
  uploaded_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(organization_id, asset_key)
);

-- Asset usage tracking
CREATE TABLE IF NOT EXISTS asset_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public_assets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- What is using this asset?
  resource_type VARCHAR(100) NOT NULL,
  resource_id UUID NOT NULL,

  -- Usage context
  usage_context JSONB,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asset access logs
CREATE TABLE IF NOT EXISTS asset_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public_assets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Access details
  access_type VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  referrer TEXT,

  -- Tracking-specific
  tracking_result_id UUID,

  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. EMAIL SIGNATURE MANAGEMENT TABLES
-- =====================================================

-- Signature templates
CREATE TABLE IF NOT EXISTS signature_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Template info
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Template content
  html_content TEXT NOT NULL,
  mobile_html_content TEXT,
  plain_text_content TEXT,

  -- Template metadata
  thumbnail_asset_id UUID REFERENCES public_assets(id),
  category VARCHAR(100),

  -- Template variables used
  variables_used JSONB,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,

  -- Audit
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(organization_id, name)
);

-- Signature assignments
CREATE TABLE IF NOT EXISTS signature_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE CASCADE,

  -- Assignment target
  assignment_type VARCHAR(50) NOT NULL,
  assignment_value VARCHAR(255),

  -- Assignment priority
  priority INTEGER DEFAULT 0,

  -- Flags
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User signature settings
CREATE TABLE IF NOT EXISTS user_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Active signature
  current_template_id UUID REFERENCES signature_templates(id),

  -- Deployment status
  deployment_status VARCHAR(50),
  last_deployed_at TIMESTAMP,
  deployment_error TEXT,

  -- Platform-specific deployment IDs
  google_workspace_signature_id VARCHAR(255),
  microsoft_365_signature_id VARCHAR(255),

  -- User preferences
  allow_user_selection BOOLEAN DEFAULT true,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(user_id, organization_id)
);

-- Signature campaigns
CREATE TABLE IF NOT EXISTS signature_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Campaign info
  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Campaign template
  template_id UUID NOT NULL REFERENCES signature_templates(id) ON DELETE RESTRICT,

  -- Campaign schedule
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,

  -- Target users
  target_type VARCHAR(50) NOT NULL,
  target_value JSONB,

  -- Campaign status
  status VARCHAR(50) DEFAULT 'draft',

  -- Approval workflow
  created_by UUID REFERENCES organization_users(id),
  approved_by UUID REFERENCES organization_users(id),
  approved_at TIMESTAMP,
  approval_notes TEXT,

  -- Deployment tracking
  deployed_at TIMESTAMP,
  reverted_at TIMESTAMP,

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CHECK (end_date > start_date)
);

-- =====================================================
-- 3. TRACKING SYSTEM TABLES
-- =====================================================

-- Tracking results
CREATE TABLE IF NOT EXISTS tracking_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Campaign & User
  campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,

  -- Unique Result ID (RID)
  rid VARCHAR(7) NOT NULL UNIQUE,

  -- Tracking URLs
  pixel_url VARCHAR(500) NOT NULL,
  link_token VARCHAR(255) NOT NULL,

  -- Status
  status VARCHAR(50) DEFAULT 'sent',

  -- Deployment
  deployed_at TIMESTAMP,
  reverted_at TIMESTAMP,
  deployment_status VARCHAR(50),

  -- Last activity
  last_event_at TIMESTAMP,

  -- GeoIP data
  ip_address VARCHAR(45),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  city VARCHAR(255),
  country VARCHAR(2),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE (campaign_id, user_id)
);

-- Tracking events
CREATE TABLE IF NOT EXISTS tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Related records
  campaign_id UUID NOT NULL REFERENCES signature_campaigns(id) ON DELETE CASCADE,
  result_id UUID NOT NULL REFERENCES tracking_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id),

  -- Event type
  event_type VARCHAR(50) NOT NULL,

  -- Event details
  details JSONB,

  -- GeoIP data
  ip_address VARCHAR(45),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  city VARCHAR(255),
  country VARCHAR(2),

  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campaign analytics
CREATE TABLE IF NOT EXISTS campaign_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL UNIQUE REFERENCES signature_campaigns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Counts
  total_users INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  links_clicked INTEGER DEFAULT 0,
  unique_openers INTEGER DEFAULT 0,
  unique_clickers INTEGER DEFAULT 0,

  -- Rates
  open_rate DECIMAL(5, 2),
  click_rate DECIMAL(5, 2),
  click_to_open_rate DECIMAL(5, 2),

  -- Breakdowns
  geo_distribution JSONB,
  email_client_stats JSONB,
  device_stats JSONB,

  -- Timestamps
  first_event_at TIMESTAMP,
  last_event_at TIMESTAMP,
  last_aggregated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- Completion Notice
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE 'Migration 009c completed - All tables created successfully!';
END $$;
