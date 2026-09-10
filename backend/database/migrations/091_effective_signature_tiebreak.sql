-- 091_effective_signature_tiebreak.sql
--
-- Found 2026-09-10 assigning a second template to the same person: the
-- user_effective_signatures view ranks with
--   row_number() OVER (PARTITION BY user ORDER BY type_priority, priority)
-- and nothing more, so two assignments of the same type and priority resolve
-- in whatever order Postgres happens to return. The new assignment silently
-- lost and the old signature stayed deployed, while the assignments LIST
-- (signature-assignment.service.ts) orders by priority ASC, created_at DESC,
-- i.e. the opposite answer. Same data, two different winners.
--
-- The tie-break is now created_at DESC in the view too: the most recent
-- assignment of equal standing wins, which is what an admin who just made one
-- expects, and it matches the list.

CREATE OR REPLACE VIEW user_effective_signatures AS
WITH user_campaigns AS (
         SELECT DISTINCT ou.id AS user_id,
            ou.organization_id,
            sc.id AS campaign_id,
            sc.template_id,
            sc.banner_url,
            sc.banner_link,
            sc.banner_alt_text,
            sc.start_date,
            'campaign'::text AS source_type,
            0 AS type_priority
           FROM organization_users ou
             CROSS JOIN signature_campaigns sc
             LEFT JOIN campaign_assignments ca ON ca.campaign_id = sc.id
          WHERE sc.organization_id = ou.organization_id AND sc.status::text = 'active'::text AND sc.start_date <= now() AND sc.end_date > now() AND ou.is_active = true AND (ca.id IS NULL OR ca.assignment_type::text = 'organization'::text OR ca.assignment_type::text = 'user'::text AND ca.target_id = ou.id OR (ca.assignment_type::text = ANY (ARRAY['group'::character varying, 'dynamic_group'::character varying]::text[])) AND (EXISTS ( SELECT 1
                   FROM access_group_members agm
                  WHERE agm.access_group_id = ca.target_id AND agm.user_id = ou.id AND agm.is_active = true)) OR ca.assignment_type::text = 'department'::text AND ca.target_id = ou.department_id OR ca.assignment_type::text = 'ou'::text AND (EXISTS ( SELECT 1
                   FROM gw_synced_users gsu
                  WHERE gsu.email::text = ou.email::text AND gsu.organization_id = ou.organization_id AND gsu.org_unit_path::text = ca.target_value::text)))
        ), ranked_assignments AS (
         SELECT ou.id AS user_id,
            ou.organization_id,
            sa.id AS assignment_id,
            sa.template_id,
            NULL::text AS banner_url,
            NULL::text AS banner_link,
            NULL::text AS banner_alt_text,
            sa.created_at AS effective_date,
            sa.assignment_type AS source_type,
                CASE sa.assignment_type
                    WHEN 'user'::text THEN 1
                    WHEN 'dynamic_group'::text THEN 2
                    WHEN 'group'::text THEN 3
                    WHEN 'department'::text THEN 4
                    WHEN 'ou'::text THEN 5
                    WHEN 'organization'::text THEN 6
                    ELSE 99
                END AS type_priority,
            sa.priority,
            row_number() OVER (PARTITION BY ou.id ORDER BY (
                CASE sa.assignment_type
                    WHEN 'user'::text THEN 1
                    WHEN 'dynamic_group'::text THEN 2
                    WHEN 'group'::text THEN 3
                    WHEN 'department'::text THEN 4
                    WHEN 'ou'::text THEN 5
                    WHEN 'organization'::text THEN 6
                    ELSE 99
                END), sa.priority, sa.created_at DESC) AS rank
           FROM organization_users ou
             JOIN signature_assignments sa ON sa.organization_id = ou.organization_id
             JOIN signature_templates st ON st.id = sa.template_id AND st.status::text = 'active'::text
          WHERE sa.is_active = true AND (sa.assignment_type::text = 'user'::text AND sa.target_id = ou.id OR sa.assignment_type::text = 'group'::text AND (EXISTS ( SELECT 1
                   FROM access_group_members agm
                  WHERE agm.access_group_id = sa.target_id AND agm.user_id = ou.id AND agm.is_active = true)) OR sa.assignment_type::text = 'dynamic_group'::text AND (EXISTS ( SELECT 1
                   FROM access_group_members agm
                  WHERE agm.access_group_id = sa.target_id AND agm.user_id = ou.id AND agm.is_active = true)) OR sa.assignment_type::text = 'department'::text AND sa.target_id = ou.department_id OR sa.assignment_type::text = 'ou'::text AND (EXISTS ( SELECT 1
                   FROM gw_synced_users gsu
                  WHERE gsu.email::text = ou.email::text AND gsu.organization_id = ou.organization_id AND gsu.org_unit_path::text = sa.target_value::text)) OR sa.assignment_type::text = 'organization'::text)
        ), all_assignments AS (
         SELECT user_campaigns.user_id,
            user_campaigns.organization_id,
            user_campaigns.campaign_id AS assignment_id,
            user_campaigns.template_id,
            user_campaigns.banner_url,
            user_campaigns.banner_link,
            user_campaigns.banner_alt_text,
            user_campaigns.source_type AS source,
            user_campaigns.type_priority,
            1 AS rank
           FROM user_campaigns
        UNION ALL
         SELECT ra.user_id,
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
          WHERE ra.rank = 1 AND NOT (EXISTS ( SELECT 1
                   FROM user_campaigns uc
                  WHERE uc.user_id = ra.user_id))
        )
 SELECT user_id,
    organization_id,
    assignment_id,
    template_id,
    source,
    banner_url,
    banner_link,
    banner_alt_text
   FROM all_assignments
  WHERE rank = 1;
