-- Migration 010: Icon Library and Multi-Size Photo Storage
-- Adds icon library for social media and enhanced photo storage with multiple sizes

-- =====================================================
-- 1. ICON LIBRARY TABLE
-- =====================================================
-- Stores social media icons and other reusable icons
CREATE TABLE IF NOT EXISTS icon_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Icon identification
  icon_key VARCHAR(100) UNIQUE NOT NULL, -- e.g., 'linkedin.square', 'twitter.round'
  icon_category VARCHAR(50) NOT NULL, -- 'social', 'general', 'brand'
  icon_name VARCHAR(100) NOT NULL, -- 'LinkedIn', 'Twitter', etc.

  -- Icon variations
  icon_style VARCHAR(50) NOT NULL, -- 'square', 'round', 'brand', 'mono', 'color'

  -- File details
  file_path VARCHAR(500) NOT NULL,
  public_url VARCHAR(500) NOT NULL,
  cdn_url VARCHAR(500),

  -- File metadata
  file_format VARCHAR(20) NOT NULL, -- 'svg', 'png', 'webp'
  file_size_bytes BIGINT,
  width INTEGER,
  height INTEGER,

  -- Icon properties
  is_system_icon BOOLEAN DEFAULT true, -- System-provided vs custom
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,

  -- Additional metadata
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_icon_library_key ON icon_library(icon_key);
CREATE INDEX IF NOT EXISTS idx_icon_library_category ON icon_library(icon_category);
CREATE INDEX IF NOT EXISTS idx_icon_library_style ON icon_library(icon_style);
CREATE INDEX IF NOT EXISTS idx_icon_library_active ON icon_library(is_active) WHERE is_active = true;

-- =====================================================
-- 2. PHOTO SIZES TABLE
-- =====================================================
-- Stores multiple sizes for each photo (user avatars, company logos)
CREATE TABLE IF NOT EXISTS photo_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link to original asset
  original_asset_id UUID NOT NULL REFERENCES public_assets(id) ON DELETE CASCADE,

  -- Size information
  size_key VARCHAR(50) NOT NULL, -- '50', '100', '200', '400', 'original'
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,

  -- File details
  file_path VARCHAR(500) NOT NULL,
  public_url VARCHAR(500) NOT NULL,
  cdn_url VARCHAR(500),

  -- File metadata
  file_format VARCHAR(20) NOT NULL, -- 'webp', 'jpg', 'png'
  file_size_bytes BIGINT NOT NULL,

  -- Processing info
  is_optimized BOOLEAN DEFAULT false,
  quality INTEGER, -- Compression quality 1-100

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(original_asset_id, size_key)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_photo_sizes_asset ON photo_sizes(original_asset_id);
CREATE INDEX IF NOT EXISTS idx_photo_sizes_size_key ON photo_sizes(size_key);

-- =====================================================
-- 3. UPDATE PUBLIC_ASSETS TABLE
-- =====================================================
-- Add fields for tracking photo sizes and icon references
ALTER TABLE public_assets
  ADD COLUMN IF NOT EXISTS has_sizes BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_size_key VARCHAR(50) DEFAULT '200',
  ADD COLUMN IF NOT EXISTS is_profile_photo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_company_logo BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS aspect_ratio DECIMAL(5,2); -- e.g., 1.00 for square

-- =====================================================
-- 4. UPDATE ORGANIZATION_USERS TABLE
-- =====================================================
-- Add columns for storing different photo size URLs (for quick access)
ALTER TABLE organization_users
  ADD COLUMN IF NOT EXISTS avatar_url_50 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS avatar_url_100 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS avatar_url_200 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS avatar_url_400 VARCHAR(500);

-- =====================================================
-- 5. UPDATE ORGANIZATIONS TABLE
-- =====================================================
-- Add columns for storing different logo size URLs
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS company_logo_url_50 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS company_logo_url_100 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS company_logo_url_200 VARCHAR(500),
  ADD COLUMN IF NOT EXISTS company_logo_url_400 VARCHAR(500);

-- =====================================================
-- 6. INSERT SYSTEM SOCIAL MEDIA ICONS
-- =====================================================
-- Insert pre-defined social media icons (placeholders - will be replaced with actual files)
INSERT INTO icon_library (icon_key, icon_category, icon_name, icon_style, file_path, public_url, file_format, width, height, description) VALUES
  -- LinkedIn
  ('linkedin.square', 'social', 'LinkedIn', 'square', '/icons/social/linkedin-square.svg', '/icons/social/linkedin-square.svg', 'svg', 24, 24, 'LinkedIn square icon'),
  ('linkedin.round', 'social', 'LinkedIn', 'round', '/icons/social/linkedin-round.svg', '/icons/social/linkedin-round.svg', 'svg', 24, 24, 'LinkedIn round icon'),
  ('linkedin.brand', 'social', 'LinkedIn', 'brand', '/icons/social/linkedin-brand.svg', '/icons/social/linkedin-brand.svg', 'svg', 24, 24, 'LinkedIn brand colored icon'),

  -- Twitter/X
  ('twitter.square', 'social', 'Twitter', 'square', '/icons/social/twitter-square.svg', '/icons/social/twitter-square.svg', 'svg', 24, 24, 'Twitter square icon'),
  ('twitter.round', 'social', 'Twitter', 'round', '/icons/social/twitter-round.svg', '/icons/social/twitter-round.svg', 'svg', 24, 24, 'Twitter round icon'),
  ('twitter.brand', 'social', 'Twitter', 'brand', '/icons/social/twitter-brand.svg', '/icons/social/twitter-brand.svg', 'svg', 24, 24, 'Twitter brand colored icon'),

  -- GitHub
  ('github.square', 'social', 'GitHub', 'square', '/icons/social/github-square.svg', '/icons/social/github-square.svg', 'svg', 24, 24, 'GitHub square icon'),
  ('github.round', 'social', 'GitHub', 'round', '/icons/social/github-round.svg', '/icons/social/github-round.svg', 'svg', 24, 24, 'GitHub round icon'),
  ('github.brand', 'social', 'GitHub', 'brand', '/icons/social/github-brand.svg', '/icons/social/github-brand.svg', 'svg', 24, 24, 'GitHub brand colored icon'),

  -- Facebook
  ('facebook.square', 'social', 'Facebook', 'square', '/icons/social/facebook-square.svg', '/icons/social/facebook-square.svg', 'svg', 24, 24, 'Facebook square icon'),
  ('facebook.round', 'social', 'Facebook', 'round', '/icons/social/facebook-round.svg', '/icons/social/facebook-round.svg', 'svg', 24, 24, 'Facebook round icon'),
  ('facebook.brand', 'social', 'Facebook', 'brand', '/icons/social/facebook-brand.svg', '/icons/social/facebook-brand.svg', 'svg', 24, 24, 'Facebook brand colored icon'),

  -- Instagram
  ('instagram.square', 'social', 'Instagram', 'square', '/icons/social/instagram-square.svg', '/icons/social/instagram-square.svg', 'svg', 24, 24, 'Instagram square icon'),
  ('instagram.round', 'social', 'Instagram', 'round', '/icons/social/instagram-round.svg', '/icons/social/instagram-round.svg', 'svg', 24, 24, 'Instagram round icon'),
  ('instagram.brand', 'social', 'Instagram', 'brand', '/icons/social/instagram-brand.svg', '/icons/social/instagram-brand.svg', 'svg', 24, 24, 'Instagram brand colored icon'),

  -- YouTube
  ('youtube.square', 'social', 'YouTube', 'square', '/icons/social/youtube-square.svg', '/icons/social/youtube-square.svg', 'svg', 24, 24, 'YouTube square icon'),
  ('youtube.round', 'social', 'YouTube', 'round', '/icons/social/youtube-round.svg', '/icons/social/youtube-round.svg', 'svg', 24, 24, 'YouTube round icon'),
  ('youtube.brand', 'social', 'YouTube', 'brand', '/icons/social/youtube-brand.svg', '/icons/social/youtube-brand.svg', 'svg', 24, 24, 'YouTube brand colored icon'),

  -- TikTok
  ('tiktok.square', 'social', 'TikTok', 'square', '/icons/social/tiktok-square.svg', '/icons/social/tiktok-square.svg', 'svg', 24, 24, 'TikTok square icon'),
  ('tiktok.round', 'social', 'TikTok', 'round', '/icons/social/tiktok-round.svg', '/icons/social/tiktok-round.svg', 'svg', 24, 24, 'TikTok round icon'),
  ('tiktok.brand', 'social', 'TikTok', 'brand', '/icons/social/tiktok-brand.svg', '/icons/social/tiktok-brand.svg', 'svg', 24, 24, 'TikTok brand colored icon'),

  -- Portfolio/Website
  ('website.square', 'social', 'Website', 'square', '/icons/social/website-square.svg', '/icons/social/website-square.svg', 'svg', 24, 24, 'Website square icon'),
  ('website.round', 'social', 'Website', 'round', '/icons/social/website-round.svg', '/icons/social/website-round.svg', 'svg', 24, 24, 'Website round icon'),
  ('website.brand', 'social', 'Website', 'brand', '/icons/social/website-brand.svg', '/icons/social/website-brand.svg', 'svg', 24, 24, 'Website brand colored icon')
ON CONFLICT (icon_key) DO NOTHING;

-- =====================================================
-- 7. COMMENTS
-- =====================================================
COMMENT ON TABLE icon_library IS 'Library of reusable icons including social media icons';
COMMENT ON TABLE photo_sizes IS 'Multiple size variations for photos (avatars, logos)';

COMMENT ON COLUMN icon_library.icon_key IS 'Unique identifier like "linkedin.square" or "twitter.round"';
COMMENT ON COLUMN icon_library.icon_style IS 'Visual style: square, round, brand, mono, color';
COMMENT ON COLUMN icon_library.is_system_icon IS 'True for system-provided icons, false for custom uploads';

COMMENT ON COLUMN photo_sizes.size_key IS 'Size identifier: 50, 100, 200, 400, or original';
COMMENT ON COLUMN photo_sizes.is_optimized IS 'True if image has been optimized/compressed';

COMMENT ON COLUMN public_assets.has_sizes IS 'True if photo has multiple size variations in photo_sizes table';
COMMENT ON COLUMN public_assets.aspect_ratio IS 'Width/height ratio (1.00 for square)';

COMMENT ON COLUMN organization_users.avatar_url_50 IS '50x50 avatar for lists and small UI elements';
COMMENT ON COLUMN organization_users.avatar_url_100 IS '100x100 avatar for cards and medium elements';
COMMENT ON COLUMN organization_users.avatar_url_200 IS '200x200 avatar for signatures and profiles';
COMMENT ON COLUMN organization_users.avatar_url_400 IS '400x400 avatar for large profile displays';
