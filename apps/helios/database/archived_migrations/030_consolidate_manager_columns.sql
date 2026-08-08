-- Migration: Consolidate manager columns
-- Purpose: Remove duplicate manager columns and standardize on manager_id

-- Copy any data from reporting_manager_id to manager_id if manager_id is null
UPDATE organization_users
SET manager_id = reporting_manager_id
WHERE manager_id IS NULL AND reporting_manager_id IS NOT NULL;

-- Drop dependent views first
DROP VIEW IF EXISTS contacts CASCADE;
DROP VIEW IF EXISTS active_staff CASCADE;
DROP VIEW IF EXISTS active_guests CASCADE;

-- Drop the duplicate column
ALTER TABLE organization_users
DROP COLUMN IF EXISTS reporting_manager_id;

-- Recreate the views using manager_id instead
CREATE OR REPLACE VIEW contacts AS
SELECT * FROM organization_users
WHERE employee_type = 'Contact';

CREATE OR REPLACE VIEW active_staff AS
SELECT * FROM organization_users
WHERE employee_type IN ('Full Time', 'Part Time', 'Contractor')
AND is_active = true;

CREATE OR REPLACE VIEW active_guests AS
SELECT * FROM organization_users
WHERE employee_type = 'Guest'
AND is_active = true;

-- Ensure the manager_id column has proper constraints
-- (the foreign key constraint should already exist from migration 026)

-- Also consolidate job_title if needed (check what column exists)
-- The org chart expects 'title' but we have 'job_title'
-- Let's add title as an alias/copy if it doesn't exist

DO $$
BEGIN
    -- Check if title column exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'organization_users'
                   AND column_name = 'title') THEN
        -- Add title column
        ALTER TABLE organization_users ADD COLUMN title VARCHAR(255);

        -- Copy from job_title if it has data
        UPDATE organization_users SET title = job_title WHERE job_title IS NOT NULL;
    END IF;
END $$;

-- Similarly for department (org chart expects it, check if it exists)
-- It already exists in the schema, so we're good

-- Create index on manager_id if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_users_manager_id ON organization_users(manager_id);

COMMENT ON COLUMN organization_users.manager_id IS 'References the user who is this user''s direct manager';
COMMENT ON COLUMN organization_users.title IS 'Job title (copied from job_title for org chart compatibility)';
