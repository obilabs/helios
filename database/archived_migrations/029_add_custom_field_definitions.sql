-- Custom Field Definitions System
-- Allows admins to define custom fields that users can fill out
-- These fields can be used in signatures, templates, and profiles

-- ============================================
-- Custom Field Definitions Table
-- ============================================
CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Field metadata
  field_key VARCHAR(100) NOT NULL, -- e.g., 'professional_designation'
  field_label VARCHAR(255) NOT NULL, -- e.g., 'Professional Designation'
  field_type VARCHAR(50) NOT NULL, -- text, email, url, phone, select, multiselect, image, badge
  field_category VARCHAR(50) DEFAULT 'general', -- general, professional, social, branding

  -- Field configuration
  is_required BOOLEAN DEFAULT false,
  is_visible_to_user BOOLEAN DEFAULT true, -- Can users see/edit this field
  is_visible_in_directory BOOLEAN DEFAULT true, -- Show in user directory
  is_visible_in_profile BOOLEAN DEFAULT true, -- Show in user profile
  is_used_in_signatures BOOLEAN DEFAULT false, -- Available for email signatures

  -- Field validation and options
  validation_rules JSONB DEFAULT '{}', -- regex, min/max length, allowed domains, etc.
  field_options JSONB DEFAULT '[]', -- For select/multiselect fields
  placeholder VARCHAR(255),
  help_text TEXT,
  default_value TEXT,

  -- Display configuration
  display_order INTEGER DEFAULT 0,
  icon_name VARCHAR(50), -- Lucide icon name

  -- For image/badge fields
  max_file_size INTEGER, -- in bytes
  allowed_file_types JSONB DEFAULT '["image/png", "image/jpeg", "image/svg+xml"]',
  image_dimensions JSONB, -- {"width": 200, "height": 50} for badges

  -- Metadata
  created_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,

  UNIQUE(organization_id, field_key)
);

-- ============================================
-- Default Custom Fields for Organizations
-- ============================================
CREATE TABLE IF NOT EXISTS default_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(100) NOT NULL UNIQUE,
  field_label VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  field_category VARCHAR(50) DEFAULT 'general',
  field_options JSONB DEFAULT '[]',
  placeholder VARCHAR(255),
  help_text TEXT,
  display_order INTEGER DEFAULT 0,
  icon_name VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Insert default custom fields that organizations can enable
INSERT INTO default_custom_fields (field_key, field_label, field_type, field_category, field_options, placeholder, help_text, display_order, icon_name) VALUES
-- Professional fields
('professional_designation', 'Professional Designation', 'text', 'professional', '[]', 'e.g., PMP, CPA, PhD', 'Professional certifications or designations', 10, 'Award'),
('pronouns', 'Pronouns', 'select', 'general', '["he/him", "she/her", "they/them", "he/they", "she/they", "other"]', 'Select pronouns', 'Your preferred pronouns', 20, 'User'),
('office_location', 'Office Location', 'text', 'professional', '[]', 'e.g., Building A, Floor 3', 'Physical office location', 30, 'Building'),
('time_zone', 'Time Zone', 'select', 'general', '["EST", "CST", "MST", "PST", "GMT", "CET", "JST", "AEST"]', 'Select time zone', 'Your primary time zone', 40, 'Clock'),
('bio', 'Bio', 'text', 'general', '[]', 'Brief professional bio', 'A short bio for your profile', 50, 'FileText'),

-- Communication preferences
('preferred_contact', 'Preferred Contact Method', 'select', 'general', '["Email", "Phone", "Slack", "Teams", "In-Person"]', 'Select preferred method', 'How you prefer to be contacted', 60, 'MessageSquare'),
('office_hours', 'Office Hours', 'text', 'professional', '[]', 'e.g., Mon-Fri 9am-5pm EST', 'When you are available', 70, 'Calendar'),
('emergency_contact', 'Emergency Contact', 'phone', 'general', '[]', '+1 (555) 123-4567', 'Emergency contact number', 80, 'Phone'),

-- Social/Personal
('birthday', 'Birthday', 'text', 'general', '[]', 'MM/DD', 'Month and day only (for celebrations)', 90, 'Cake'),
('interests', 'Interests', 'text', 'general', '[]', 'e.g., Photography, Hiking', 'Personal interests or hobbies', 100, 'Heart'),
('dietary_preferences', 'Dietary Preferences', 'text', 'general', '[]', 'e.g., Vegetarian, Gluten-free', 'For team events and catering', 110, 'Coffee'),

-- Signature badges/images
('certification_badge', 'Certification Badge', 'image', 'branding', '[]', '', 'Upload certification badge image', 120, 'Shield'),
('company_badge', 'Company Badge', 'image', 'branding', '[]', '', 'Secondary company logo or badge', 130, 'Building2'),
('achievement_badge', 'Achievement Badge', 'image', 'branding', '[]', '', 'Special achievement or award badge', 140, 'Trophy'),
('partner_logo', 'Partner Logo', 'image', 'branding', '[]', '', 'Partner or affiliate logo', 150, 'Handshake')
ON CONFLICT (field_key) DO NOTHING;

-- ============================================
-- Custom Field Values (User Data)
-- ============================================
-- Note: We're already storing this in organization_users.custom_fields as JSONB
-- But we could have a separate table for better querying if needed

CREATE TABLE IF NOT EXISTS custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  field_definition_id UUID NOT NULL REFERENCES custom_field_definitions(id) ON DELETE CASCADE,

  -- Value storage (use appropriate column based on field type)
  text_value TEXT,
  number_value NUMERIC,
  date_value DATE,
  datetime_value TIMESTAMP,
  boolean_value BOOLEAN,
  json_value JSONB, -- For multiselect or complex data

  -- For image/file fields
  asset_id UUID REFERENCES public_assets(id) ON DELETE SET NULL,
  file_url VARCHAR(500),

  -- Metadata
  updated_by UUID REFERENCES organization_users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(user_id, field_definition_id)
);

-- ============================================
-- Helper function to initialize custom fields for an organization
-- ============================================
CREATE OR REPLACE FUNCTION initialize_default_custom_fields(org_id UUID, created_by_id UUID)
RETURNS void AS $$
BEGIN
  -- Copy default fields to organization
  INSERT INTO custom_field_definitions (
    organization_id, field_key, field_label, field_type, field_category,
    field_options, placeholder, help_text, display_order, icon_name,
    created_by, is_active
  )
  SELECT
    org_id, field_key, field_label, field_type, field_category,
    field_options, placeholder, help_text, display_order, icon_name,
    created_by_id, true
  FROM default_custom_fields
  WHERE field_key IN (
    'professional_designation', 'pronouns', 'office_location',
    'time_zone', 'bio', 'preferred_contact', 'office_hours'
  ) -- Start with essential fields
  ON CONFLICT (organization_id, field_key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_org ON custom_field_definitions(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_category ON custom_field_definitions(field_category);
CREATE INDEX IF NOT EXISTS idx_custom_field_defs_active ON custom_field_definitions(is_active);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_user ON custom_field_values(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_field ON custom_field_values(field_definition_id);

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE custom_field_definitions IS 'Admin-defined custom fields for user profiles';
COMMENT ON TABLE default_custom_fields IS 'Template custom fields available to all organizations';
COMMENT ON TABLE custom_field_values IS 'Stores user values for custom fields (alternative to JSONB storage)';

COMMENT ON COLUMN custom_field_definitions.field_type IS 'Field types: text, email, url, phone, select, multiselect, date, image, badge';
COMMENT ON COLUMN custom_field_definitions.field_category IS 'Categories: general, professional, social, branding';
COMMENT ON COLUMN custom_field_definitions.is_used_in_signatures IS 'Whether this field can be used in email signature templates';