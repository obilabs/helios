-- File Drop Module: Secure external file receiving
-- Allows admins and users to create secure drop zones for receiving files from external parties

-- File drop zones (links that external parties can use to upload files)
CREATE TABLE IF NOT EXISTS file_drop_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Zone details
    zone_name VARCHAR(255) NOT NULL,
    description TEXT,
    public_token VARCHAR(64) UNIQUE NOT NULL, -- Public URL token

    -- Owner (can be admin-created org-wide or user-specific)
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,
    is_organization_wide BOOLEAN DEFAULT false,

    -- Security
    password_hash VARCHAR(255), -- Optional password protection
    requires_email BOOLEAN DEFAULT true, -- Require sender email
    allowed_file_types TEXT[], -- Array of allowed MIME types (NULL = all types)
    max_file_size_mb INTEGER DEFAULT 100,
    max_files_per_upload INTEGER DEFAULT 10,

    -- Status and expiration
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP,
    upload_count INTEGER DEFAULT 0,
    max_uploads INTEGER, -- NULL = unlimited

    -- Google Drive integration
    google_drive_enabled BOOLEAN DEFAULT false,
    google_drive_folder_id VARCHAR(255), -- Target Drive folder ID
    google_shared_drive_id VARCHAR(255), -- If using Shared Drive

    -- Notifications
    notify_on_upload BOOLEAN DEFAULT true,
    notification_emails TEXT[], -- Additional emails to notify

    -- Custom branding
    custom_message TEXT, -- Message shown to uploaders
    custom_button_text VARCHAR(100),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_upload_at TIMESTAMP
);

-- Files received through drop zones
CREATE TABLE IF NOT EXISTS file_drop_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_zone_id UUID NOT NULL REFERENCES file_drop_zones(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- File details
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL, -- UUID-based internal filename
    file_path TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size_bytes BIGINT NOT NULL,

    -- Sender information
    sender_email VARCHAR(255),
    sender_name VARCHAR(255),
    sender_ip VARCHAR(45), -- IPv4 or IPv6
    sender_message TEXT, -- Optional message from sender

    -- Processing status
    status VARCHAR(50) DEFAULT 'pending', -- pending, processed, archived, deleted
    google_drive_file_id VARCHAR(255), -- If uploaded to Drive
    google_drive_url TEXT,

    -- Security scanning
    virus_scan_status VARCHAR(50), -- not_scanned, clean, infected, error
    virus_scan_details TEXT,

    -- Download tracking
    downloaded_by UUID REFERENCES organization_users(id),
    downloaded_at TIMESTAMP,
    download_count INTEGER DEFAULT 0,

    -- Timestamps
    uploaded_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    expires_at TIMESTAMP, -- Auto-delete after this date
    deleted_at TIMESTAMP
);

-- File drop activity log
CREATE TABLE IF NOT EXISTS file_drop_activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drop_zone_id UUID REFERENCES file_drop_zones(id) ON DELETE CASCADE,
    upload_id UUID REFERENCES file_drop_uploads(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Activity details
    activity_type VARCHAR(50) NOT NULL, -- zone_created, zone_accessed, file_uploaded, file_downloaded, file_deleted, zone_disabled
    actor_type VARCHAR(50) NOT NULL, -- external, user, admin, system
    actor_email VARCHAR(255),
    actor_ip VARCHAR(45),

    -- Details
    details JSONB,

    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_file_drop_zones_org ON file_drop_zones(organization_id);
CREATE INDEX IF NOT EXISTS idx_file_drop_zones_token ON file_drop_zones(public_token);
CREATE INDEX IF NOT EXISTS idx_file_drop_zones_created_by ON file_drop_zones(created_by);
CREATE INDEX IF NOT EXISTS idx_file_drop_zones_active ON file_drop_zones(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_file_drop_uploads_zone ON file_drop_uploads(drop_zone_id);
CREATE INDEX IF NOT EXISTS idx_file_drop_uploads_org ON file_drop_uploads(organization_id);
CREATE INDEX IF NOT EXISTS idx_file_drop_uploads_status ON file_drop_uploads(status);
CREATE INDEX IF NOT EXISTS idx_file_drop_uploads_uploaded_at ON file_drop_uploads(uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_file_drop_activity_zone ON file_drop_activity(drop_zone_id);
CREATE INDEX IF NOT EXISTS idx_file_drop_activity_org ON file_drop_activity(organization_id);
CREATE INDEX IF NOT EXISTS idx_file_drop_activity_created_at ON file_drop_activity(created_at DESC);

-- Add File Drop module to available_modules
INSERT INTO available_modules (id, module_key, module_name, module_type, description, version, is_core, config_schema)
VALUES (
    gen_random_uuid(),
    'file-drop',
    'File Drop',
    'productivity',
    'Secure file receiving from external parties without granting access',
    '1.0.0',
    false,
    '{
        "max_zones_per_user": 10,
        "default_max_file_size_mb": 100,
        "default_expiration_days": 30,
        "allow_password_protection": true,
        "allow_google_drive_integration": true,
        "virus_scanning_enabled": false
    }'::jsonb
)
ON CONFLICT (module_key) DO NOTHING;

-- Add Template Studio module to available_modules
INSERT INTO available_modules (id, module_key, module_name, module_type, description, version, is_core, config_schema)
VALUES (
    gen_random_uuid(),
    'template-studio',
    'Template Studio',
    'productivity',
    'Create and manage email signature templates and campaigns',
    '1.0.0',
    false,
    '{
        "max_templates": 100,
        "allow_campaigns": true,
        "allow_assignments": true,
        "available_variables": ["firstName", "lastName", "email", "jobTitle", "department", "mobilePhone", "workPhone"]
    }'::jsonb
)
ON CONFLICT (module_key) DO NOTHING;

-- Add Public Assets module to available_modules
INSERT INTO available_modules (id, module_key, module_name, module_type, description, version, is_core, config_schema)
VALUES (
    gen_random_uuid(),
    'public-assets',
    'Public Assets',
    'productivity',
    'Manage images, logos, and files used across templates',
    '1.0.0',
    false,
    '{
        "max_storage_mb": 1024,
        "allowed_file_types": ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml", "application/pdf"],
        "max_file_size_mb": 10
    }'::jsonb
)
ON CONFLICT (module_key) DO NOTHING;

COMMENT ON TABLE file_drop_zones IS 'Secure zones for receiving files from external parties';
COMMENT ON TABLE file_drop_uploads IS 'Files uploaded by external parties through drop zones';
COMMENT ON TABLE file_drop_activity IS 'Audit trail for file drop zone activities';

-- Enable modules by default for existing organizations
-- This will auto-enable the three new modules for any organization
INSERT INTO organization_modules (organization_id, module_id, is_enabled, is_configured, config)
SELECT
    o.id as organization_id,
    m.id as module_id,
    true as is_enabled,
    false as is_configured,
    m.config_schema as config
FROM organizations o
CROSS JOIN available_modules m
WHERE m.module_key IN ('file-drop', 'template-studio', 'public-assets')
ON CONFLICT (organization_id, module_id) DO NOTHING;
