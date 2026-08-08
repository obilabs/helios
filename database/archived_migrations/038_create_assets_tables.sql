-- Migration: 038_create_assets_tables.sql
-- Description: Create tables for Google Drive asset proxy feature
-- This allows organizations to host media assets in Google Shared Drives with direct embeddable URLs
-- NOTE: Using 'media_assets' to avoid conflict with existing 'assets' table (for IT asset management)

-- ============================================================================
-- Helper function for updating timestamps (if not exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Media Asset Settings (per organization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS media_asset_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  storage_backend VARCHAR(20) NOT NULL DEFAULT 'google_drive', -- 'google_drive', 'minio'
  drive_shared_drive_id VARCHAR(100), -- Google Shared Drive ID
  drive_root_folder_id VARCHAR(100), -- Root folder for assets in Drive
  cache_ttl_seconds INTEGER DEFAULT 3600, -- 1 hour default
  max_file_size_mb INTEGER DEFAULT 10,
  allowed_mime_types TEXT[] DEFAULT ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/x-icon'],
  is_configured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Media Asset Folders (virtual organization for UI)
-- ============================================================================
CREATE TABLE IF NOT EXISTS media_asset_folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  path VARCHAR(500) NOT NULL, -- e.g., '/brand', '/signatures/banners'
  parent_id UUID REFERENCES media_asset_folders(id) ON DELETE CASCADE,
  drive_folder_id VARCHAR(100), -- Google Drive folder ID
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, path)
);

-- ============================================================================
-- Media Assets (file registry with public tokens)
-- ============================================================================
CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Storage location
  storage_type VARCHAR(20) NOT NULL DEFAULT 'google_drive', -- 'google_drive', 'minio', 's3'
  storage_path VARCHAR(500) NOT NULL, -- Drive file ID or MinIO/S3 path

  -- Asset metadata
  name VARCHAR(255) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT,

  -- Organization in UI
  folder_id UUID REFERENCES media_asset_folders(id) ON DELETE SET NULL,
  category VARCHAR(50), -- 'brand', 'signature', 'profile', 'campaign'

  -- Access control
  access_token VARCHAR(100) NOT NULL UNIQUE, -- Token for public URL (e.g., /a/{token})
  is_public BOOLEAN DEFAULT true, -- Can be accessed without auth

  -- Tracking
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,

  -- Audit
  created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_media_assets_org ON media_assets(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_assets_token ON media_assets(access_token);
CREATE INDEX IF NOT EXISTS idx_media_assets_category ON media_assets(organization_id, category);
CREATE INDEX IF NOT EXISTS idx_media_assets_folder ON media_assets(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_asset_folders_org ON media_asset_folders(organization_id);
CREATE INDEX IF NOT EXISTS idx_media_asset_folders_parent ON media_asset_folders(parent_id);

-- ============================================================================
-- Insert default folders for existing organizations
-- ============================================================================
DO $$
DECLARE
  org RECORD;
  sig_id UUID;
BEGIN
  FOR org IN SELECT id FROM organizations
  LOOP
    -- Create root folders
    INSERT INTO media_asset_folders (organization_id, name, path, parent_id)
    VALUES
      (org.id, 'Brand', '/brand', NULL),
      (org.id, 'Signatures', '/signatures', NULL),
      (org.id, 'Profiles', '/profiles', NULL),
      (org.id, 'Campaigns', '/campaigns', NULL)
    ON CONFLICT (organization_id, path) DO NOTHING;

    -- Get signatures folder ID for subfolders
    SELECT id INTO sig_id FROM media_asset_folders
    WHERE organization_id = org.id AND path = '/signatures';

    IF sig_id IS NOT NULL THEN
      INSERT INTO media_asset_folders (organization_id, name, path, parent_id)
      VALUES
        (org.id, 'Banners', '/signatures/banners', sig_id),
        (org.id, 'Social Icons', '/signatures/social-icons', sig_id)
      ON CONFLICT (organization_id, path) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ============================================================================
-- Function to generate URL-safe access tokens
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_media_asset_token()
RETURNS VARCHAR(100) AS $$
DECLARE
  new_token VARCHAR(100);
  token_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a URL-safe token (22 chars from base64url UUID)
    new_token := replace(replace(encode(uuid_generate_v4()::text::bytea, 'base64'), '+', '-'), '/', '_');
    new_token := substring(new_token, 1, 22);

    SELECT EXISTS (SELECT 1 FROM media_assets WHERE access_token = new_token) INTO token_exists;
    EXIT WHEN NOT token_exists;
  END LOOP;
  RETURN new_token;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Trigger to auto-generate access token on insert
-- ============================================================================
CREATE OR REPLACE FUNCTION set_media_asset_access_token()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.access_token IS NULL OR NEW.access_token = '' THEN
    NEW.access_token := generate_media_asset_token();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_media_assets_set_token ON media_assets;
DROP TRIGGER IF EXISTS tr_media_assets_set_token ON PLACEHOLDER;
CREATE TRIGGER tr_media_assets_set_token
  BEFORE INSERT ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION set_media_asset_access_token();

-- ============================================================================
-- Triggers to update updated_at timestamp
-- ============================================================================
DROP TRIGGER IF EXISTS tr_media_assets_updated_at ON media_assets;
DROP TRIGGER IF EXISTS tr_media_assets_updated_at ON PLACEHOLDER;
CREATE TRIGGER tr_media_assets_updated_at
  BEFORE UPDATE ON media_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_media_asset_folders_updated_at ON media_asset_folders;
DROP TRIGGER IF EXISTS tr_media_asset_folders_updated_at ON PLACEHOLDER;
CREATE TRIGGER tr_media_asset_folders_updated_at
  BEFORE UPDATE ON media_asset_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_media_asset_settings_updated_at ON media_asset_settings;
DROP TRIGGER IF EXISTS tr_media_asset_settings_updated_at ON PLACEHOLDER;
CREATE TRIGGER tr_media_asset_settings_updated_at
  BEFORE UPDATE ON media_asset_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE media_assets IS 'Registry of media files (images, etc.) that can be accessed via public URLs for email signatures';
COMMENT ON TABLE media_asset_folders IS 'Virtual folder structure for organizing media assets in the UI';
COMMENT ON TABLE media_asset_settings IS 'Per-organization media asset storage configuration';
COMMENT ON COLUMN media_assets.access_token IS 'URL-safe token for public access (e.g., /a/{token}/logo.png)';
COMMENT ON COLUMN media_assets.storage_path IS 'Google Drive file ID or MinIO object path';
COMMENT ON COLUMN media_asset_settings.drive_shared_drive_id IS 'Google Shared Drive ID where assets are stored';
