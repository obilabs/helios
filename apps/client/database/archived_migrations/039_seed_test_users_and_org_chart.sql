-- Migration 039: Seed Test Users for Org Chart Testing
-- Purpose: Create realistic test users with manager relationships, departments, and groups
-- Author: Claude (Development Aid)
-- Date: 2025-12-08
--
-- This creates a realistic org structure for testing:
-- - 28 users total across 6 departments
-- - Proper reporting chains (CEO -> VPs -> Managers -> Staff)
-- - 3 orphaned users (no manager) for testing edge cases
-- - Cross-functional team memberships
--
-- NOTE: This is for development/testing. Production should sync from Google Workspace.

DO $$
DECLARE
    v_org_id UUID;
    v_admin_id UUID;
    -- Bcrypt hash of 'test123!' - for test users only
    v_password_hash CONSTANT VARCHAR := '$2a$12$XMUxtUJ65EQN2oKZ1JI3hemmbphUSX9mhgo7zpZIBaHLySP.nqgc.';

    -- Executive team
    v_ceo_id UUID;
    v_cto_id UUID;
    v_cfo_id UUID;
    v_cmo_id UUID;
    v_coo_id UUID;

    -- VP/Director level
    v_vp_eng_id UUID;
    v_vp_product_id UUID;

    -- Manager level
    v_eng_mgr_1_id UUID;
    v_eng_mgr_2_id UUID;
    v_product_mgr_id UUID;
    v_finance_mgr_id UUID;
    v_marketing_mgr_id UUID;
    v_ops_mgr_id UUID;
    v_hr_mgr_id UUID;

    -- Department IDs
    v_dept_exec_id UUID;
    v_dept_eng_id UUID;
    v_dept_product_id UUID;
    v_dept_finance_id UUID;
    v_dept_marketing_id UUID;
    v_dept_ops_id UUID;
    v_dept_hr_id UUID;

    -- Groups
    v_group_all_staff_id UUID;
    v_group_leadership_id UUID;
    v_group_tech_id UUID;
    v_group_project_phoenix_id UUID;

BEGIN
    -- Get the organization
    SELECT id INTO v_org_id FROM organizations LIMIT 1;

    IF v_org_id IS NULL THEN
        RAISE NOTICE 'No organization found. Skipping seed data.';
        RETURN;
    END IF;

    -- Get admin user for created_by references
    SELECT id INTO v_admin_id FROM organization_users WHERE role = 'admin' LIMIT 1;

    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Seeding test users for org: %', v_org_id;
    RAISE NOTICE '=========================================';

    -- =====================================================
    -- 1. CREATE/UPDATE DEPARTMENTS
    -- =====================================================

    -- Executive
    INSERT INTO departments (id, organization_id, name, description, is_active)
    VALUES (gen_random_uuid(), v_org_id, 'Executive', 'C-Suite and executive leadership', true)
    ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_dept_exec_id;

    IF v_dept_exec_id IS NULL THEN
        SELECT id INTO v_dept_exec_id FROM departments WHERE organization_id = v_org_id AND name = 'Executive';
    END IF;

    -- Engineering
    INSERT INTO departments (id, organization_id, name, description, is_active)
    VALUES (gen_random_uuid(), v_org_id, 'Engineering', 'Software development and engineering', true)
    ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_dept_eng_id;

    IF v_dept_eng_id IS NULL THEN
        SELECT id INTO v_dept_eng_id FROM departments WHERE organization_id = v_org_id AND name = 'Engineering';
    END IF;

    -- Product
    INSERT INTO departments (id, organization_id, name, description, is_active)
    VALUES (gen_random_uuid(), v_org_id, 'Product', 'Product management and design', true)
    ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_dept_product_id;

    IF v_dept_product_id IS NULL THEN
        SELECT id INTO v_dept_product_id FROM departments WHERE organization_id = v_org_id AND name = 'Product';
    END IF;

    -- Finance
    INSERT INTO departments (id, organization_id, name, description, is_active)
    VALUES (gen_random_uuid(), v_org_id, 'Finance', 'Finance and accounting', true)
    ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_dept_finance_id;

    IF v_dept_finance_id IS NULL THEN
        SELECT id INTO v_dept_finance_id FROM departments WHERE organization_id = v_org_id AND name = 'Finance';
    END IF;

    -- Marketing
    INSERT INTO departments (id, organization_id, name, description, is_active)
    VALUES (gen_random_uuid(), v_org_id, 'Marketing', 'Marketing and communications', true)
    ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_dept_marketing_id;

    IF v_dept_marketing_id IS NULL THEN
        SELECT id INTO v_dept_marketing_id FROM departments WHERE organization_id = v_org_id AND name = 'Marketing';
    END IF;

    -- Operations
    INSERT INTO departments (id, organization_id, name, description, is_active)
    VALUES (gen_random_uuid(), v_org_id, 'Operations', 'Business operations and administration', true)
    ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_dept_ops_id;

    IF v_dept_ops_id IS NULL THEN
        SELECT id INTO v_dept_ops_id FROM departments WHERE organization_id = v_org_id AND name = 'Operations';
    END IF;

    -- Human Resources
    INSERT INTO departments (id, organization_id, name, description, is_active)
    VALUES (gen_random_uuid(), v_org_id, 'Human Resources', 'HR and people operations', true)
    ON CONFLICT (organization_id, name) DO UPDATE SET description = EXCLUDED.description
    RETURNING id INTO v_dept_hr_id;

    IF v_dept_hr_id IS NULL THEN
        SELECT id INTO v_dept_hr_id FROM departments WHERE organization_id = v_org_id AND name = 'Human Resources';
    END IF;

    RAISE NOTICE 'Departments created/updated';

    -- =====================================================
    -- 2. CREATE EXECUTIVE TEAM (Level 0-1)
    -- =====================================================

    -- CEO - Jack Chen (top of hierarchy, no manager)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'jack.chen@gridworx.io', v_password_hash, 'Jack', 'Chen',
        'Chief Executive Officer', 'Executive', v_dept_exec_id,
        'admin', 'active', true, 'Full Time', NULL
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, department = EXCLUDED.department,
        department_id = EXCLUDED.department_id, reporting_manager_id = NULL
    RETURNING id INTO v_ceo_id;

    IF v_ceo_id IS NULL THEN
        SELECT id INTO v_ceo_id FROM organization_users WHERE email = 'jack.chen@gridworx.io';
    END IF;

    -- CTO - Sarah Chen (reports to CEO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'sarah.chen@gridworx.io', v_password_hash, 'Sarah', 'Chen',
        'Chief Technology Officer', 'Executive', v_dept_exec_id,
        'admin', 'active', true, 'Full Time', v_ceo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_ceo_id
    RETURNING id INTO v_cto_id;

    IF v_cto_id IS NULL THEN
        SELECT id INTO v_cto_id FROM organization_users WHERE email = 'sarah.chen@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_ceo_id WHERE id = v_cto_id;
    END IF;

    -- CFO - Robert Taylor (reports to CEO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'robert.taylor@gridworx.io', v_password_hash, 'Robert', 'Taylor',
        'Chief Financial Officer', 'Executive', v_dept_exec_id,
        'admin', 'active', true, 'Full Time', v_ceo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_ceo_id
    RETURNING id INTO v_cfo_id;

    IF v_cfo_id IS NULL THEN
        SELECT id INTO v_cfo_id FROM organization_users WHERE email = 'robert.taylor@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_ceo_id WHERE id = v_cfo_id;
    END IF;

    -- CMO - Amanda White (reports to CEO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'amanda.white@gridworx.io', v_password_hash, 'Amanda', 'White',
        'Chief Marketing Officer', 'Executive', v_dept_exec_id,
        'admin', 'active', true, 'Full Time', v_ceo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_ceo_id
    RETURNING id INTO v_cmo_id;

    IF v_cmo_id IS NULL THEN
        SELECT id INTO v_cmo_id FROM organization_users WHERE email = 'amanda.white@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_ceo_id WHERE id = v_cmo_id;
    END IF;

    -- COO - Thomas Anderson (reports to CEO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'thomas.anderson@gridworx.io', v_password_hash, 'Thomas', 'Anderson',
        'Chief Operating Officer', 'Executive', v_dept_exec_id,
        'admin', 'active', true, 'Full Time', v_ceo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_ceo_id
    RETURNING id INTO v_coo_id;

    IF v_coo_id IS NULL THEN
        SELECT id INTO v_coo_id FROM organization_users WHERE email = 'thomas.anderson@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_ceo_id WHERE id = v_coo_id;
    END IF;

    RAISE NOTICE 'Executive team created (5 users)';

    -- =====================================================
    -- 3. CREATE VP/DIRECTOR LEVEL (Level 2)
    -- =====================================================

    -- VP Engineering - Michael Rodriguez (reports to CTO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'michael.rodriguez@gridworx.io', v_password_hash, 'Michael', 'Rodriguez',
        'VP of Engineering', 'Engineering', v_dept_eng_id,
        'manager', 'active', true, 'Full Time', v_cto_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_cto_id
    RETURNING id INTO v_vp_eng_id;

    IF v_vp_eng_id IS NULL THEN
        SELECT id INTO v_vp_eng_id FROM organization_users WHERE email = 'michael.rodriguez@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_cto_id WHERE id = v_vp_eng_id;
    END IF;

    -- VP Product - Jennifer Lee (reports to CTO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'jennifer.lee@gridworx.io', v_password_hash, 'Jennifer', 'Lee',
        'VP of Product', 'Product', v_dept_product_id,
        'manager', 'active', true, 'Full Time', v_cto_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_cto_id
    RETURNING id INTO v_vp_product_id;

    IF v_vp_product_id IS NULL THEN
        SELECT id INTO v_vp_product_id FROM organization_users WHERE email = 'jennifer.lee@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_cto_id WHERE id = v_vp_product_id;
    END IF;

    RAISE NOTICE 'VP level created (2 users)';

    -- =====================================================
    -- 4. CREATE MANAGER LEVEL (Level 3)
    -- =====================================================

    -- Engineering Manager 1 - David Kim (reports to VP Engineering)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'david.kim@gridworx.io', v_password_hash, 'David', 'Kim',
        'Engineering Manager', 'Engineering', v_dept_eng_id,
        'manager', 'active', true, 'Full Time', v_vp_eng_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_vp_eng_id
    RETURNING id INTO v_eng_mgr_1_id;

    IF v_eng_mgr_1_id IS NULL THEN
        SELECT id INTO v_eng_mgr_1_id FROM organization_users WHERE email = 'david.kim@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_vp_eng_id WHERE id = v_eng_mgr_1_id;
    END IF;

    -- Engineering Manager 2 - Rachel Green (reports to VP Engineering)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'rachel.green@gridworx.io', v_password_hash, 'Rachel', 'Green',
        'Engineering Manager', 'Engineering', v_dept_eng_id,
        'manager', 'active', true, 'Full Time', v_vp_eng_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_vp_eng_id
    RETURNING id INTO v_eng_mgr_2_id;

    IF v_eng_mgr_2_id IS NULL THEN
        SELECT id INTO v_eng_mgr_2_id FROM organization_users WHERE email = 'rachel.green@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_vp_eng_id WHERE id = v_eng_mgr_2_id;
    END IF;

    -- Product Manager - Nathan Brown (reports to VP Product)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'nathan.brown@gridworx.io', v_password_hash, 'Nathan', 'Brown',
        'Product Manager', 'Product', v_dept_product_id,
        'manager', 'active', true, 'Full Time', v_vp_product_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_vp_product_id
    RETURNING id INTO v_product_mgr_id;

    IF v_product_mgr_id IS NULL THEN
        SELECT id INTO v_product_mgr_id FROM organization_users WHERE email = 'nathan.brown@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_vp_product_id WHERE id = v_product_mgr_id;
    END IF;

    -- Finance Manager - Michelle Wang (reports to CFO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'michelle.wang@gridworx.io', v_password_hash, 'Michelle', 'Wang',
        'Finance Manager', 'Finance', v_dept_finance_id,
        'manager', 'active', true, 'Full Time', v_cfo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_cfo_id
    RETURNING id INTO v_finance_mgr_id;

    IF v_finance_mgr_id IS NULL THEN
        SELECT id INTO v_finance_mgr_id FROM organization_users WHERE email = 'michelle.wang@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_cfo_id WHERE id = v_finance_mgr_id;
    END IF;

    -- Marketing Manager - Kevin Lee (reports to CMO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'kevin.lee@gridworx.io', v_password_hash, 'Kevin', 'Lee',
        'Marketing Manager', 'Marketing', v_dept_marketing_id,
        'manager', 'active', true, 'Full Time', v_cmo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_cmo_id
    RETURNING id INTO v_marketing_mgr_id;

    IF v_marketing_mgr_id IS NULL THEN
        SELECT id INTO v_marketing_mgr_id FROM organization_users WHERE email = 'kevin.lee@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_cmo_id WHERE id = v_marketing_mgr_id;
    END IF;

    -- Operations Manager - Stephanie Davis (reports to COO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'stephanie.davis@gridworx.io', v_password_hash, 'Stephanie', 'Davis',
        'Operations Manager', 'Operations', v_dept_ops_id,
        'manager', 'active', true, 'Full Time', v_coo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_coo_id
    RETURNING id INTO v_ops_mgr_id;

    IF v_ops_mgr_id IS NULL THEN
        SELECT id INTO v_ops_mgr_id FROM organization_users WHERE email = 'stephanie.davis@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_coo_id WHERE id = v_ops_mgr_id;
    END IF;

    -- HR Manager - Nicole Baker (reports to COO)
    INSERT INTO organization_users (
        id, organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES (
        gen_random_uuid(), v_org_id, 'nicole.baker@gridworx.io', v_password_hash, 'Nicole', 'Baker',
        'HR Manager', 'Human Resources', v_dept_hr_id,
        'manager', 'active', true, 'Full Time', v_coo_id
    ) ON CONFLICT (email) DO UPDATE SET
        job_title = EXCLUDED.job_title, reporting_manager_id = v_coo_id
    RETURNING id INTO v_hr_mgr_id;

    IF v_hr_mgr_id IS NULL THEN
        SELECT id INTO v_hr_mgr_id FROM organization_users WHERE email = 'nicole.baker@gridworx.io';
        UPDATE organization_users SET reporting_manager_id = v_coo_id WHERE id = v_hr_mgr_id;
    END IF;

    RAISE NOTICE 'Manager level created (7 users)';

    -- =====================================================
    -- 5. CREATE STAFF LEVEL (Level 4)
    -- =====================================================

    -- Engineering Staff under David Kim
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'emily.watson@gridworx.io', v_password_hash, 'Emily', 'Watson', 'Senior Software Engineer', 'Engineering', v_dept_eng_id, 'user', 'active', true, 'Full Time', v_eng_mgr_1_id),
    (v_org_id, 'james.chen@gridworx.io', v_password_hash, 'James', 'Chen', 'Software Engineer', 'Engineering', v_dept_eng_id, 'user', 'active', true, 'Full Time', v_eng_mgr_1_id),
    (v_org_id, 'lisa.park@gridworx.io', v_password_hash, 'Lisa', 'Park', 'Software Engineer', 'Engineering', v_dept_eng_id, 'user', 'active', true, 'Full Time', v_eng_mgr_1_id)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = EXCLUDED.reporting_manager_id, job_title = EXCLUDED.job_title;

    -- Engineering Staff under Rachel Green
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'chris.martinez@gridworx.io', v_password_hash, 'Chris', 'Martinez', 'Software Engineer', 'Engineering', v_dept_eng_id, 'user', 'active', true, 'Full Time', v_eng_mgr_2_id),
    (v_org_id, 'amy.thompson@gridworx.io', v_password_hash, 'Amy', 'Thompson', 'Junior Software Engineer', 'Engineering', v_dept_eng_id, 'user', 'active', true, 'Full Time', v_eng_mgr_2_id)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = EXCLUDED.reporting_manager_id, job_title = EXCLUDED.job_title;

    -- Product Staff under Nathan Brown
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'sophia.garcia@gridworx.io', v_password_hash, 'Sophia', 'Garcia', 'Senior UX Designer', 'Product', v_dept_product_id, 'user', 'active', true, 'Full Time', v_product_mgr_id),
    (v_org_id, 'oliver.smith@gridworx.io', v_password_hash, 'Oliver', 'Smith', 'UX Designer', 'Product', v_dept_product_id, 'user', 'active', true, 'Full Time', v_product_mgr_id)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = EXCLUDED.reporting_manager_id, job_title = EXCLUDED.job_title;

    -- Finance Staff under Michelle Wang
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'daniel.johnson@gridworx.io', v_password_hash, 'Daniel', 'Johnson', 'Senior Accountant', 'Finance', v_dept_finance_id, 'user', 'active', true, 'Full Time', v_finance_mgr_id),
    (v_org_id, 'ashley.williams@gridworx.io', v_password_hash, 'Ashley', 'Williams', 'Accountant', 'Finance', v_dept_finance_id, 'user', 'active', true, 'Full Time', v_finance_mgr_id)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = EXCLUDED.reporting_manager_id, job_title = EXCLUDED.job_title;

    -- Marketing Staff under Kevin Lee
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'jessica.chen@gridworx.io', v_password_hash, 'Jessica', 'Chen', 'Marketing Specialist', 'Marketing', v_dept_marketing_id, 'user', 'active', true, 'Full Time', v_marketing_mgr_id),
    (v_org_id, 'brandon.miller@gridworx.io', v_password_hash, 'Brandon', 'Miller', 'Content Writer', 'Marketing', v_dept_marketing_id, 'user', 'active', true, 'Full Time', v_marketing_mgr_id)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = EXCLUDED.reporting_manager_id, job_title = EXCLUDED.job_title;

    -- Operations Staff under Stephanie Davis
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'ryan.cooper@gridworx.io', v_password_hash, 'Ryan', 'Cooper', 'Operations Analyst', 'Operations', v_dept_ops_id, 'user', 'active', true, 'Full Time', v_ops_mgr_id)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = EXCLUDED.reporting_manager_id, job_title = EXCLUDED.job_title;

    -- HR Staff under Nicole Baker
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'eric.wilson@gridworx.io', v_password_hash, 'Eric', 'Wilson', 'HR Specialist', 'Human Resources', v_dept_hr_id, 'user', 'active', true, 'Full Time', v_hr_mgr_id)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = EXCLUDED.reporting_manager_id, job_title = EXCLUDED.job_title;

    RAISE NOTICE 'Staff level created (11 users)';

    -- =====================================================
    -- 6. CREATE ORPHANED USERS (No manager - edge cases)
    -- =====================================================

    -- Contractor - No manager assigned (external consultant)
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'frank.thompson@contractor.com', v_password_hash, 'Frank', 'Thompson', 'Security Consultant', 'Engineering', v_dept_eng_id, 'user', 'active', true, 'Contractor', NULL)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = NULL, employee_type = 'Contractor';

    -- New Hire - Just started, not yet assigned to manager
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'grace.liu@gridworx.io', v_password_hash, 'Grace', 'Liu', 'Data Analyst', 'Operations', v_dept_ops_id, 'user', 'active', true, 'Full Time', NULL)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = NULL;

    -- Intern - Temporary, not in formal structure
    INSERT INTO organization_users (
        organization_id, email, password_hash, first_name, last_name, job_title, department, department_id,
        role, user_status, is_active, employee_type, reporting_manager_id
    ) VALUES
    (v_org_id, 'jake.roberts@gridworx.io', v_password_hash, 'Jake', 'Roberts', 'Marketing Intern', 'Marketing', v_dept_marketing_id, 'user', 'active', true, 'Intern', NULL)
    ON CONFLICT (email) DO UPDATE SET
        reporting_manager_id = NULL, employee_type = 'Intern';

    RAISE NOTICE 'Orphaned users created (3 users)';

    -- =====================================================
    -- 7. CREATE GROUPS (Static and Cross-functional)
    -- =====================================================

    -- All Staff group (everyone)
    SELECT id INTO v_group_all_staff_id FROM access_groups WHERE organization_id = v_org_id AND name = 'All Staff';
    IF v_group_all_staff_id IS NULL THEN
        INSERT INTO access_groups (id, organization_id, name, description, platform, group_type, membership_type, external_id)
        VALUES (gen_random_uuid(), v_org_id, 'All Staff', 'All active employees', 'helios', 'team', 'dynamic', 'all-staff')
        RETURNING id INTO v_group_all_staff_id;
    ELSE
        UPDATE access_groups SET description = 'All active employees' WHERE id = v_group_all_staff_id;
    END IF;

    -- Leadership Team (C-suite + VPs)
    SELECT id INTO v_group_leadership_id FROM access_groups WHERE organization_id = v_org_id AND name = 'Leadership Team';
    IF v_group_leadership_id IS NULL THEN
        INSERT INTO access_groups (id, organization_id, name, description, platform, group_type, membership_type, external_id)
        VALUES (gen_random_uuid(), v_org_id, 'Leadership Team', 'Executive and VP leadership', 'helios', 'team', 'static', 'leadership')
        RETURNING id INTO v_group_leadership_id;
    ELSE
        UPDATE access_groups SET description = 'Executive and VP leadership' WHERE id = v_group_leadership_id;
    END IF;

    -- Tech Team (Engineering + Product - cross-functional)
    SELECT id INTO v_group_tech_id FROM access_groups WHERE organization_id = v_org_id AND name = 'Tech Team';
    IF v_group_tech_id IS NULL THEN
        INSERT INTO access_groups (id, organization_id, name, description, platform, group_type, membership_type, external_id)
        VALUES (gen_random_uuid(), v_org_id, 'Tech Team', 'Engineering and Product combined', 'helios', 'team', 'dynamic', 'tech-team')
        RETURNING id INTO v_group_tech_id;
    ELSE
        UPDATE access_groups SET description = 'Engineering and Product combined' WHERE id = v_group_tech_id;
    END IF;

    -- Project Phoenix (cross-functional project team)
    SELECT id INTO v_group_project_phoenix_id FROM access_groups WHERE organization_id = v_org_id AND name = 'Project Phoenix';
    IF v_group_project_phoenix_id IS NULL THEN
        INSERT INTO access_groups (id, organization_id, name, description, platform, group_type, membership_type, external_id)
        VALUES (gen_random_uuid(), v_org_id, 'Project Phoenix', 'Cross-functional product launch team', 'helios', 'project', 'static', 'project-phoenix')
        RETURNING id INTO v_group_project_phoenix_id;
    ELSE
        UPDATE access_groups SET description = 'Cross-functional product launch team' WHERE id = v_group_project_phoenix_id;
    END IF;

    RAISE NOTICE 'Groups created (4 groups)';

    -- =====================================================
    -- 8. ADD GROUP MEMBERSHIPS
    -- =====================================================

    -- Leadership Team members
    INSERT INTO access_group_members (access_group_id, user_id, membership_source)
    SELECT v_group_leadership_id, id, 'manual'
    FROM organization_users
    WHERE organization_id = v_org_id
    AND (job_title LIKE 'Chief%' OR job_title LIKE 'VP %')
    ON CONFLICT (access_group_id, user_id) DO NOTHING;

    -- Project Phoenix - mixed team from different departments
    INSERT INTO access_group_members (access_group_id, user_id, membership_source)
    SELECT v_group_project_phoenix_id, id, 'manual'
    FROM organization_users
    WHERE organization_id = v_org_id
    AND email IN (
        'emily.watson@gridworx.io',      -- Senior Engineer
        'sophia.garcia@gridworx.io',     -- UX Designer
        'jessica.chen@gridworx.io',      -- Marketing
        'nathan.brown@gridworx.io'       -- Product Manager (lead)
    )
    ON CONFLICT (access_group_id, user_id) DO NOTHING;

    -- Dynamic rule for Tech Team (Engineering OR Product department)
    INSERT INTO dynamic_group_rules (access_group_id, field, operator, value, sort_order)
    VALUES
    (v_group_tech_id, 'department', 'equals', 'Engineering', 1),
    (v_group_tech_id, 'department', 'equals', 'Product', 2)
    ON CONFLICT DO NOTHING;

    -- Update Tech Team to use OR logic
    UPDATE access_groups SET rule_logic = 'OR' WHERE id = v_group_tech_id;

    -- Dynamic rule for All Staff (is active)
    DELETE FROM dynamic_group_rules WHERE access_group_id = v_group_all_staff_id;
    INSERT INTO dynamic_group_rules (access_group_id, field, operator, value, sort_order)
    VALUES (v_group_all_staff_id, 'department', 'is_not_empty', '', 1);

    RAISE NOTICE 'Group memberships configured';

    -- =====================================================
    -- 9. SUMMARY
    -- =====================================================

    RAISE NOTICE '';
    RAISE NOTICE '=========================================';
    RAISE NOTICE 'Seed data migration completed!';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Organization Structure:';
    RAISE NOTICE '  Level 0: CEO (1 user)';
    RAISE NOTICE '  Level 1: C-Suite (4 users: CTO, CFO, CMO, COO)';
    RAISE NOTICE '  Level 2: VPs (2 users)';
    RAISE NOTICE '  Level 3: Managers (7 users)';
    RAISE NOTICE '  Level 4: Staff (11 users)';
    RAISE NOTICE '  Orphans: 3 users (contractor, new hire, intern)';
    RAISE NOTICE '  ─────────────────────────────────';
    RAISE NOTICE '  TOTAL: 28 users';
    RAISE NOTICE '';
    RAISE NOTICE 'Departments: 7 (Executive, Engineering, Product, Finance, Marketing, Operations, HR)';
    RAISE NOTICE '';
    RAISE NOTICE 'Groups: 4';
    RAISE NOTICE '  - All Staff (dynamic)';
    RAISE NOTICE '  - Leadership Team (static)';
    RAISE NOTICE '  - Tech Team (dynamic - Eng OR Product)';
    RAISE NOTICE '  - Project Phoenix (static cross-functional)';
    RAISE NOTICE '';
    RAISE NOTICE 'Orphaned users (no manager):';
    RAISE NOTICE '  - Frank Thompson (contractor)';
    RAISE NOTICE '  - Grace Liu (new hire)';
    RAISE NOTICE '  - Jake Roberts (intern)';
    RAISE NOTICE '=========================================';

END $$;
