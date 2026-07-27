-- Migration: Add manager relationships for org chart visualization
-- Purpose: Support hierarchical organization chart based on reporting relationships

-- Note: Column reporting_manager_id already exists in organization_users table
-- This migration focuses on creating the hierarchy functions

-- Add manager_email to Google Workspace synced users
ALTER TABLE gw_synced_users
ADD COLUMN IF NOT EXISTS manager_email VARCHAR(255);

-- Create index for efficient hierarchy queries
CREATE INDEX IF NOT EXISTS idx_users_manager ON organization_users(reporting_manager_id);

-- Create index for manager email lookups
CREATE INDEX IF NOT EXISTS idx_gw_users_manager_email ON gw_synced_users(manager_email);

-- Add circular reference check constraint
CREATE OR REPLACE FUNCTION check_manager_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
    current_id UUID;
    current_manager UUID;
    depth INT := 0;
BEGIN
    -- Check for self-reference
    IF NEW.id = NEW.reporting_manager_id THEN
        RAISE EXCEPTION 'User cannot be their own manager';
    END IF;

    -- Check for circular references (limit depth to prevent infinite loops)
    current_id := NEW.reporting_manager_id;
    WHILE current_id IS NOT NULL AND depth < 100 LOOP
        SELECT reporting_manager_id INTO current_manager
        FROM organization_users
        WHERE id = current_id;

        IF current_manager = NEW.id THEN
            RAISE EXCEPTION 'Circular manager reference detected';
        END IF;

        current_id := current_manager;
        depth := depth + 1;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for circular reference check
DROP TRIGGER IF EXISTS check_manager_hierarchy_trigger ON organization_users;
DROP TRIGGER IF EXISTS check_manager_hierarchy_trigger ON PLACEHOLDER;
CREATE TRIGGER check_manager_hierarchy_trigger
    BEFORE INSERT OR UPDATE OF reporting_manager_id ON organization_users
    FOR EACH ROW
    WHEN (NEW.reporting_manager_id IS NOT NULL)
    EXECUTE FUNCTION check_manager_hierarchy();

-- Add function to build org chart hierarchy
CREATE OR REPLACE FUNCTION get_org_hierarchy(root_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    user_id UUID,
    email VARCHAR(255),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    job_title VARCHAR(255),
    department VARCHAR(255),
    photo_data TEXT,
    reporting_manager_id UUID,
    level INT,
    path UUID[]
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE org_tree AS (
        -- Base case: top-level users (no manager or specific root)
        SELECT
            ou.id AS user_id,
            ou.email,
            ou.first_name,
            ou.last_name,
            ou.job_title,
            ou.department,
            ou.photo_data,
            ou.reporting_manager_id,
            0 AS level,
            ARRAY[ou.id] AS path
        FROM organization_users ou
        WHERE
            ou.is_active = true
            AND (
                (root_user_id IS NULL AND ou.reporting_manager_id IS NULL)
                OR ou.id = root_user_id
            )

        UNION ALL

        -- Recursive case: users reporting to the previous level
        SELECT
            ou.id AS user_id,
            ou.email,
            ou.first_name,
            ou.last_name,
            ou.job_title,
            ou.department,
            ou.photo_data,
            ou.reporting_manager_id,
            ot.level + 1 AS level,
            ot.path || ou.id AS path
        FROM organization_users ou
        INNER JOIN org_tree ot ON ou.reporting_manager_id = ot.user_id
        WHERE
            ou.is_active = true
            AND NOT (ou.id = ANY(ot.path)) -- Prevent cycles
    )
    SELECT * FROM org_tree
    ORDER BY level, last_name, first_name;
END;
$$ LANGUAGE plpgsql;

-- Add function to get direct reports count
CREATE OR REPLACE FUNCTION get_direct_reports_count(user_id UUID)
RETURNS INT AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM organization_users
        WHERE reporting_manager_id = user_id
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql;

-- Add function to get total reports count (including indirect)
CREATE OR REPLACE FUNCTION get_total_reports_count(user_id UUID)
RETURNS INT AS $$
BEGIN
    RETURN (
        WITH RECURSIVE subordinates AS (
            SELECT id FROM organization_users
            WHERE reporting_manager_id = user_id AND is_active = true

            UNION ALL

            SELECT ou.id
            FROM organization_users ou
            INNER JOIN subordinates s ON ou.reporting_manager_id = s.id
            WHERE ou.is_active = true
        )
        SELECT COUNT(*) FROM subordinates
    );
END;
$$ LANGUAGE plpgsql;

-- Add sample manager data for testing (if in development)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_settings WHERE name = 'application_name' AND setting LIKE '%development%') THEN
        -- Set Jack as CEO (no manager)
        UPDATE organization_users
        SET reporting_manager_id = NULL,
            job_title = COALESCE(job_title, 'CEO'),
            department = COALESCE(department, 'Executive')
        WHERE email = 'jack@gridworx.io';

        -- Set some sample reporting relationships if other users exist
        -- (This is just for testing - real data comes from Google Workspace sync)
    END IF;
END $$;