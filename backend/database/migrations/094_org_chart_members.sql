-- 094_org_chart_members.sql
--
-- One definition of who belongs on the org chart.
--
-- The org chart asked "is_active = true" and nothing else, in six places: the
-- get_org_hierarchy() function below and five queries in routes/org-chart.routes.ts.
-- None of them excluded guests or contacts. On the obilabs.dev trial the chart showed
-- eight people at the top of the organization, and six were Microsoft 365 guests and
-- contacts from outside the organization, with no place in the reporting structure.
--
-- The rule now lives here, once. Everything that draws the chart reads this view.
--
-- Who belongs: staff (platform-backed employees) and local users (Helios-only
-- employees, e.g. a contractor with no platform account, who can still have a manager
-- and reports). Who does not: guests and contacts, who are outside the organization.
-- Soft-deleted rows are excluded explicitly rather than relying on is_active alone.

CREATE OR REPLACE VIEW org_chart_members AS
SELECT *
  FROM organization_users
 WHERE is_active = true
   AND deleted_at IS NULL
   AND user_type IN ('staff', 'local');

COMMENT ON VIEW org_chart_members IS
  'Who appears on the org chart: active, not deleted, staff or local. Guests and contacts are outside the organization. The single definition; do not re-state it in queries.';

-- Same signature and output as migration 083; only the source changes.
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
        SELECT
            ou.id AS user_id, ou.email, ou.first_name, ou.last_name, ou.job_title,
            ou.department, ou.photo_data, ou.reporting_manager_id,
            0 AS level, ARRAY[ou.id] AS path
        FROM org_chart_members ou
        WHERE (root_user_id IS NULL AND ou.reporting_manager_id IS NULL)
           OR ou.id = root_user_id

        UNION ALL

        SELECT
            ou.id AS user_id, ou.email, ou.first_name, ou.last_name, ou.job_title,
            ou.department, ou.photo_data, ou.reporting_manager_id,
            ot.level + 1 AS level, ot.path || ou.id AS path
        FROM org_chart_members ou
        INNER JOIN org_tree ot ON ou.reporting_manager_id = ot.user_id
        WHERE NOT (ou.id = ANY(ot.path))
    )
    SELECT * FROM org_tree
    ORDER BY level, last_name, first_name;
END;
$$ LANGUAGE plpgsql;
