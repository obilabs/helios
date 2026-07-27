-- Migration: 034 - Add Admin User Separation
-- Description: Adds is_external_admin flag to distinguish external admins from internal admins
-- Author: Claude
-- Date: 2025-12-08

-- Add is_external_admin column to organization_users
-- External admins: Platform administrators who don't work at the organization (MSPs, consultants)
-- Internal admins: Employees who also have admin privileges
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS is_external_admin BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN organization_users.is_external_admin IS 'True for external admins (MSPs, consultants) who should not access employee-facing features like People Directory';

-- Create index for filtering external admins
CREATE INDEX IF NOT EXISTS idx_organization_users_external_admin
ON organization_users(is_external_admin)
WHERE is_external_admin = true;

-- Add default_view column to store user's preferred view
-- This supplements the user_preferences JSONB but allows faster querying
ALTER TABLE organization_users
ADD COLUMN IF NOT EXISTS default_view VARCHAR(10) DEFAULT NULL;

COMMENT ON COLUMN organization_users.default_view IS 'Preferred view on login: admin or user. NULL means use default based on role';

-- Constraint to validate default_view values
ALTER TABLE organization_users
ADD CONSTRAINT chk_default_view
CHECK (default_view IS NULL OR default_view IN ('admin', 'user'));
