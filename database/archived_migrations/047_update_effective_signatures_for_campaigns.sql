-- Migration: Update user_effective_signatures view to include campaign support
-- Campaigns take highest priority over all other assignment types

-- Drop and recreate the view to support campaigns
DROP VIEW IF EXISTS user_effective_signatures CASCADE;

CREATE VIEW user_effective_signatures AS
WITH
-- First, get active campaigns that match each user
user_campaigns AS (
    SELECT DISTINCT
        ou.id AS user_id,
        ou.organization_id,
        sc.id AS campaign_id,
        sc.template_id,
        sc.banner_url,
        sc.banner_link,
        sc.banner_alt_text,
        sc.start_date,
        'campaign'::text AS source_type,
        0 AS type_priority  -- Campaigns have highest priority
    FROM organization_users ou
    CROSS JOIN signature_campaigns sc
    LEFT JOIN campaign_assignments ca ON ca.campaign_id = sc.id
    WHERE sc.organization_id = ou.organization_id
      AND sc.status = 'active'
      AND sc.start_date <= NOW()
      AND sc.end_date > NOW()
      AND ou.is_active = true
      AND (
          -- Organization-wide campaign (no specific assignments means everyone)
          ca.id IS NULL
          OR ca.assignment_type = 'organization'
          -- User-specific assignment
          OR (ca.assignment_type = 'user' AND ca.target_id = ou.id)
          -- Group assignment
          OR (ca.assignment_type IN ('group', 'dynamic_group') AND EXISTS (
              SELECT 1 FROM access_group_members agm
              WHERE agm.access_group_id = ca.target_id
                AND agm.user_id = ou.id
                AND agm.is_active = true
          ))
          -- Department assignment
          OR (ca.assignment_type = 'department' AND ca.target_id = ou.department_id)
          -- OU assignment (based on Google Workspace OU path)
          OR (ca.assignment_type = 'ou' AND EXISTS (
              SELECT 1 FROM gw_synced_users gsu
              WHERE gsu.email = ou.email
                AND gsu.organization_id = ou.organization_id
                AND gsu.org_unit_path = ca.target_value
          ))
      )
),
-- Then get regular signature assignments (existing logic)
ranked_assignments AS (
    SELECT
        ou.id AS user_id,
        ou.organization_id,
        sa.id AS assignment_id,
        sa.template_id,
        NULL::text AS banner_url,
        NULL::text AS banner_link,
        NULL::text AS banner_alt_text,
        sa.created_at AS effective_date,
        sa.assignment_type AS source_type,
        CASE sa.assignment_type
            WHEN 'user' THEN 1
            WHEN 'dynamic_group' THEN 2
            WHEN 'group' THEN 3
            WHEN 'department' THEN 4
            WHEN 'ou' THEN 5
            WHEN 'organization' THEN 6
            ELSE 99
        END AS type_priority,
        sa.priority,
        ROW_NUMBER() OVER (
            PARTITION BY ou.id
            ORDER BY
                CASE sa.assignment_type
                    WHEN 'user' THEN 1
                    WHEN 'dynamic_group' THEN 2
                    WHEN 'group' THEN 3
                    WHEN 'department' THEN 4
                    WHEN 'ou' THEN 5
                    WHEN 'organization' THEN 6
                    ELSE 99
                END,
                sa.priority
        ) AS rank
    FROM organization_users ou
    JOIN signature_assignments sa ON sa.organization_id = ou.organization_id
    JOIN signature_templates st ON st.id = sa.template_id AND st.status = 'active'
    WHERE sa.is_active = true
      AND (
          (sa.assignment_type = 'user' AND sa.target_id = ou.id)
          OR (sa.assignment_type = 'group' AND EXISTS (
              SELECT 1 FROM access_group_members agm
              WHERE agm.access_group_id = sa.target_id
                AND agm.user_id = ou.id
                AND agm.is_active = true
          ))
          OR (sa.assignment_type = 'dynamic_group' AND EXISTS (
              SELECT 1 FROM access_group_members agm
              WHERE agm.access_group_id = sa.target_id
                AND agm.user_id = ou.id
                AND agm.is_active = true
          ))
          OR (sa.assignment_type = 'department' AND sa.target_id = ou.department_id)
          OR (sa.assignment_type = 'ou' AND EXISTS (
              SELECT 1 FROM gw_synced_users gsu
              WHERE gsu.email = ou.email
                AND gsu.organization_id = ou.organization_id
                AND gsu.org_unit_path = sa.target_value
          ))
          OR (sa.assignment_type = 'organization')
      )
),
-- Combine campaigns and regular assignments
all_assignments AS (
    -- Campaign assignments (highest priority)
    SELECT
        user_id,
        organization_id,
        campaign_id::uuid AS assignment_id,
        template_id,
        banner_url,
        banner_link,
        banner_alt_text,
        source_type AS source,
        type_priority,
        1 AS rank  -- All campaigns are rank 1 within their user
    FROM user_campaigns

    UNION ALL

    -- Regular assignments (only if no campaign)
    SELECT
        ra.user_id,
        ra.organization_id,
        ra.assignment_id,
        ra.template_id,
        ra.banner_url,
        ra.banner_link,
        ra.banner_alt_text,
        ra.source_type AS source,
        ra.type_priority,
        ra.rank
    FROM ranked_assignments ra
    WHERE ra.rank = 1
      AND NOT EXISTS (
          SELECT 1 FROM user_campaigns uc WHERE uc.user_id = ra.user_id
      )
)
SELECT
    user_id,
    organization_id,
    assignment_id,
    template_id,
    source,
    banner_url,
    banner_link,
    banner_alt_text
FROM all_assignments
WHERE rank = 1;

-- Add index hints comment for documentation
COMMENT ON VIEW user_effective_signatures IS
    'Resolves the effective signature template for each user.
     Priority order: Active Campaigns > User > Dynamic Group > Group > Department > OU > Organization.
     Campaigns always take precedence over regular assignments.
     Includes banner information for campaign overlays.';

-- Create a helper function to check if a user has an active campaign
CREATE OR REPLACE FUNCTION user_has_active_campaign(p_user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_effective_signatures ues
        WHERE ues.user_id = p_user_id
          AND ues.source = 'campaign'
    );
END;
$$ LANGUAGE plpgsql;

-- Create a function to get campaign banner HTML for a user
CREATE OR REPLACE FUNCTION get_user_campaign_banner(p_user_id UUID)
RETURNS TABLE (
    banner_url TEXT,
    banner_link TEXT,
    banner_alt_text TEXT,
    campaign_id UUID
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ues.banner_url,
        ues.banner_link,
        ues.banner_alt_text,
        ues.assignment_id AS campaign_id
    FROM user_effective_signatures ues
    WHERE ues.user_id = p_user_id
      AND ues.source = 'campaign'
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;
