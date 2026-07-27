-- Migration: 060 - Create Job Titles Master Data Table
-- Description: Creates master data table for job titles to enable dropdown selection
-- Author: Claude (Autonomous Agent)
-- Date: 2025-12-20

-- =====================================================
-- 1. JOB TITLES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS job_titles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Basic Info
    name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Optional Links
    department_id UUID REFERENCES departments(id) ON DELETE SET NULL,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES organization_users(id) ON DELETE SET NULL,

    -- Constraints
    UNIQUE(organization_id, name)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_job_titles_organization ON job_titles(organization_id);
CREATE INDEX IF NOT EXISTS idx_job_titles_department ON job_titles(department_id);
CREATE INDEX IF NOT EXISTS idx_job_titles_active ON job_titles(is_active);
CREATE INDEX IF NOT EXISTS idx_job_titles_name ON job_titles(name);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_job_titles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_job_titles_updated_at ON job_titles;
DROP TRIGGER IF EXISTS trigger_job_titles_updated_at ON PLACEHOLDER;
CREATE TRIGGER trigger_job_titles_updated_at
    BEFORE UPDATE ON job_titles
    FOR EACH ROW
    EXECUTE FUNCTION update_job_titles_updated_at();

-- Comments
COMMENT ON TABLE job_titles IS 'Master data for job titles used for consistent user data entry';
COMMENT ON COLUMN job_titles.name IS 'Job title name (e.g., Software Engineer, Product Manager)';
COMMENT ON COLUMN job_titles.department_id IS 'Optional link to department for job title categorization';

-- =====================================================
-- 2. SEED DEFAULT JOB TITLES FOR EXISTING ORGS
-- =====================================================

DO $$
DECLARE
    v_org_id UUID;
BEGIN
    -- Get the first organization ID
    SELECT id INTO v_org_id FROM organizations LIMIT 1;

    IF v_org_id IS NOT NULL THEN
        -- Insert default job titles only if none exist
        INSERT INTO job_titles (organization_id, name, description, is_active)
        SELECT
            v_org_id,
            jt.name,
            jt.description,
            true
        FROM (VALUES
            ('Software Engineer', 'Develops and maintains software applications'),
            ('Senior Software Engineer', 'Senior developer with technical leadership responsibilities'),
            ('Staff Engineer', 'Technical lead with cross-team impact'),
            ('Principal Engineer', 'Senior technical leader with company-wide influence'),
            ('Engineering Manager', 'Manages engineering teams and projects'),
            ('Product Manager', 'Defines product strategy and roadmap'),
            ('Senior Product Manager', 'Senior product leadership role'),
            ('Designer', 'Creates user interfaces and experiences'),
            ('Senior Designer', 'Senior design role with mentoring responsibilities'),
            ('Data Analyst', 'Analyzes data to derive business insights'),
            ('Data Scientist', 'Applies statistical methods to solve problems'),
            ('DevOps Engineer', 'Manages infrastructure and deployment pipelines'),
            ('QA Engineer', 'Ensures software quality through testing'),
            ('Technical Writer', 'Creates technical documentation'),
            ('Project Manager', 'Manages project timelines and resources'),
            ('Scrum Master', 'Facilitates agile processes'),
            ('HR Manager', 'Manages human resources functions'),
            ('Recruiter', 'Sources and hires talent'),
            ('Marketing Manager', 'Leads marketing initiatives'),
            ('Sales Representative', 'Manages sales activities'),
            ('Account Manager', 'Manages client relationships'),
            ('Customer Success Manager', 'Ensures customer satisfaction'),
            ('Support Specialist', 'Provides technical support'),
            ('IT Administrator', 'Manages IT infrastructure'),
            ('Finance Manager', 'Manages financial operations'),
            ('Accountant', 'Handles accounting duties'),
            ('Operations Manager', 'Manages day-to-day operations'),
            ('Executive Assistant', 'Supports executive leadership'),
            ('Office Manager', 'Manages office operations'),
            ('Intern', 'Entry-level learning position')
        ) AS jt(name, description)
        WHERE NOT EXISTS (
            SELECT 1 FROM job_titles WHERE organization_id = v_org_id
        );
    END IF;
END $$;

-- =====================================================
-- 3. VERIFICATION
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Migration 060 completed successfully!';
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Created table: job_titles';
    RAISE NOTICE 'Seeded default job titles for existing organization';
    RAISE NOTICE '=========================================';
END $$;
