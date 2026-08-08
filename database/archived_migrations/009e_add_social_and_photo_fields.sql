-- Add social media and photo fields for templates
-- This migration adds user social links, company social links, and user photos

-- User social media fields
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS user_linkedin_url VARCHAR(500);
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS user_twitter_url VARCHAR(500);
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS user_github_url VARCHAR(500);
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS user_portfolio_url VARCHAR(500);
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS user_instagram_url VARCHAR(500);
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS user_facebook_url VARCHAR(500);

-- User photo (already exists as avatar_url, but add asset reference)
ALTER TABLE organization_users ADD COLUMN IF NOT EXISTS avatar_asset_id UUID REFERENCES public_assets(id) ON DELETE SET NULL;

-- Company/Organization social media fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_linkedin_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_twitter_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_facebook_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_instagram_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_youtube_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_tiktok_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_website_url VARCHAR(500);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_blog_url VARCHAR(500);

-- Organization branding fields
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_logo_asset_id UUID REFERENCES public_assets(id) ON DELETE SET NULL;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_tagline TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_address TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_phone VARCHAR(50);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS company_email VARCHAR(255);

-- Add indexes for lookups
CREATE INDEX IF NOT EXISTS idx_users_avatar_asset ON organization_users(avatar_asset_id);
CREATE INDEX IF NOT EXISTS idx_orgs_logo_asset ON organizations(company_logo_asset_id);

COMMENT ON COLUMN organization_users.user_linkedin_url IS 'User personal LinkedIn profile URL';
COMMENT ON COLUMN organization_users.user_twitter_url IS 'User personal Twitter/X profile URL';
COMMENT ON COLUMN organization_users.user_github_url IS 'User personal GitHub profile URL';
COMMENT ON COLUMN organization_users.avatar_asset_id IS 'Reference to user photo in public_assets';

COMMENT ON COLUMN organizations.company_linkedin_url IS 'Company LinkedIn page URL';
COMMENT ON COLUMN organizations.company_website_url IS 'Company main website URL';
COMMENT ON COLUMN organizations.company_logo_asset_id IS 'Reference to company logo in public_assets';
