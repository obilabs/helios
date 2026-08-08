import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { db } from '../database/connection.js';

const router = Router();

/**
 * @openapi
 * /api/v1/organization/org-chart:
 *   get:
 *     summary: Get organization chart
 *     description: |
 *       Get the organization hierarchy as a tree structure with statistics.
 *       Includes orphaned users (those with invalid manager references).
 *     tags: [Organization Chart]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Organization chart data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     root:
 *                       type: object
 *                       description: Root of the org tree
 *                     orphans:
 *                       type: array
 *                       description: Users with invalid manager references
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalUsers:
 *                           type: integer
 *                         maxDepth:
 *                           type: integer
 *                         avgSpan:
 *                           type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/org-chart', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // First, check if we have any users and if the function exists
    const userCountResult = await db.query(
      'SELECT COUNT(*) as count FROM organization_users WHERE organization_id = $1 AND is_active = true',
      [organizationId]
    );
    const userCount = parseInt(userCountResult.rows[0]?.count || '0');

    // If no users or just 1 user (admin), return empty state
    if (userCount <= 1) {
      const singleUserQuery = `
        SELECT id, email, first_name, last_name, job_title, department, photo_data
        FROM organization_users
        WHERE organization_id = $1 AND is_active = true
        LIMIT 1
      `;
      const singleUserResult = await db.query(singleUserQuery, [organizationId]);
      const user = singleUserResult.rows[0];

      if (!user) {
        return res.json({
          success: true,
          data: {
            root: null,
            orphans: [],
            stats: { totalUsers: 0, maxDepth: 0, avgSpan: 0 },
            isEmpty: true,
            message: 'No users found. Sync with Google Workspace or add users to see the org chart.'
          }
        });
      }

      // Return single user as root
      return res.json({
        success: true,
        data: {
          root: {
            userId: user.id,
            name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
            email: user.email,
            title: user.job_title || '',
            department: user.department || '',
            photoUrl: user.photo_data,
            managerId: null,
            level: 0,
            directReports: [],
            totalReports: 0
          },
          orphans: [],
          stats: { totalUsers: 1, maxDepth: 0, avgSpan: 0 },
          isEmpty: false,
          message: userCount === 1 ? 'Only one user exists. Add more users or sync with Google Workspace to build your org chart.' : null
        }
      });
    }

    // Check if the get_org_hierarchy function exists
    const functionExistsQuery = `
      SELECT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'get_org_hierarchy'
      ) as exists
    `;
    const functionResult = await db.query(functionExistsQuery);
    const functionExists = functionResult.rows[0]?.exists;

    let hierarchyResult;

    if (functionExists) {
      // Get the hierarchy using the PostgreSQL function
      const hierarchyQuery = `
        SELECT * FROM get_org_hierarchy(NULL)
        WHERE user_id IN (
          SELECT id FROM organization_users
          WHERE organization_id = $1
        )
        ORDER BY level, last_name, first_name
      `;
      hierarchyResult = await db.query(hierarchyQuery, [organizationId]);
    } else {
      // Fallback: use simple query without the function
      const fallbackQuery = `
        WITH RECURSIVE org_tree AS (
          SELECT
            id AS user_id,
            email,
            first_name,
            last_name,
            job_title,
            department,
            photo_data,
            reporting_manager_id,
            0 AS level,
            ARRAY[id] AS path
          FROM organization_users
          WHERE organization_id = $1
            AND is_active = true
            AND reporting_manager_id IS NULL

          UNION ALL

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
          WHERE ou.organization_id = $1
            AND ou.is_active = true
            AND NOT (ou.id = ANY(ot.path))
        )
        SELECT * FROM org_tree
        ORDER BY level, last_name, first_name
      `;
      hierarchyResult = await db.query(fallbackQuery, [organizationId]);
    }

    // Get orphaned users (those with invalid manager references)
    const orphansQuery = `
      SELECT
        ou.id as user_id,
        ou.email,
        ou.first_name,
        ou.last_name,
        ou.job_title,
        ou.department,
        ou.photo_data,
        ou.reporting_manager_id
      FROM organization_users ou
      WHERE ou.organization_id = $1
        AND ou.is_active = true
        AND ou.reporting_manager_id IS NOT NULL
        AND ou.reporting_manager_id NOT IN (
          SELECT id FROM organization_users
          WHERE organization_id = $1 AND is_active = true
        )
    `;

    const orphansResult = await db.query(orphansQuery, [organizationId]);

    // Get organization statistics
    const statsQuery = `
      WITH hierarchy_stats AS (
        SELECT
          COUNT(DISTINCT user_id) as total_users,
          MAX(level) as max_depth
        FROM get_org_hierarchy(NULL)
        WHERE user_id IN (
          SELECT id FROM organization_users
          WHERE organization_id = $1
        )
      ),
      direct_reports_stats AS (
        SELECT
          AVG(report_count) as avg_span
        FROM (
          SELECT
            reporting_manager_id,
            COUNT(*) as report_count
          FROM organization_users
          WHERE organization_id = $1
            AND is_active = true
            AND reporting_manager_id IS NOT NULL
          GROUP BY reporting_manager_id
        ) as reports
      )
      SELECT
        h.total_users,
        h.max_depth,
        COALESCE(d.avg_span, 0) as avg_span
      FROM hierarchy_stats h
      CROSS JOIN direct_reports_stats d
    `;

    const statsResult = await db.query(statsQuery, [organizationId]);
    const stats = statsResult.rows[0] || { total_users: 0, max_depth: 0, avg_span: 0 };

    // Build the tree structure
    const buildTree = (nodes: any[], parentId: string | null = null): any[] => {
      const children = nodes.filter(node => node.reporting_manager_id === parentId);
      return children.map(child => ({
        userId: child.user_id,
        name: `${child.first_name || ''} ${child.last_name || ''}`.trim() || child.email,
        email: child.email,
        title: child.job_title,
        department: child.department,
        photoUrl: child.photo_data,
        managerId: child.reporting_manager_id,
        level: child.level || 0,
        directReports: buildTree(nodes, child.user_id),
        totalReports: 0 // Will be calculated on frontend if needed
      }));
    };

    // Find root nodes (users with no manager)
    const rootNodes = hierarchyResult.rows.filter((node: any) => !node.reporting_manager_id);
    const tree = rootNodes.map((root: any) => ({
      userId: root.user_id,
      name: `${root.first_name || ''} ${root.last_name || ''}`.trim() || root.email,
      email: root.email,
      title: root.job_title,
      department: root.department,
      photoUrl: root.photo_data,
      managerId: root.reporting_manager_id,
      level: 0,
      directReports: buildTree(hierarchyResult.rows, root.user_id),
      totalReports: 0
    }));

    // Build orphans list
    const orphans = orphansResult.rows.map((orphan: any) => ({
      userId: orphan.user_id,
      name: `${orphan.first_name || ''} ${orphan.last_name || ''}`.trim() || orphan.email,
      email: orphan.email,
      title: orphan.job_title,
      department: orphan.department,
      photoUrl: orphan.photo_data,
      managerId: orphan.reporting_manager_id,
      level: -1,
      directReports: new Array<any>(),
      totalReports: 0
    }));

    return res.json({
      success: true,
      data: {
        root: tree.length === 1 ? tree[0] : {
          userId: 'root',
          name: 'Organization',
          email: '',
          title: '',
          department: '',
          photoUrl: null,
          managerId: null,
          level: -1,
          directReports: tree,
          totalReports: stats.total_users
        },
        orphans,
        stats: {
          totalUsers: parseInt(stats.total_users) || 0,
          maxDepth: parseInt(stats.max_depth) || 0,
          avgSpan: parseFloat(stats.avg_span) || 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching org chart:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch organization chart'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/users/{userId}/manager:
 *   put:
 *     summary: Update user's manager
 *     description: |
 *       Change a user's reporting manager. Admin or manager role required.
 *       Validates against circular references.
 *     tags: [Organization Chart]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               managerId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *                 description: New manager ID (null to remove manager)
 *     responses:
 *       200:
 *         description: Manager updated
 *       400:
 *         description: Invalid request or circular reference
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
router.put('/users/:userId/manager', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { managerId } = req.body;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization not found'
      });
    }

    // Check if user has permission (must be admin or manager)
    if (!['admin', 'manager'].includes(req.user?.role || '')) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    // Validate that both users belong to the same organization
    const validationQuery = `
      SELECT id FROM organization_users
      WHERE organization_id = $1
        AND id = ANY($2::uuid[])
        AND is_active = true
    `;

    const usersToValidate = [userId];
    if (managerId) {
      usersToValidate.push(managerId);
    }

    const validationResult = await db.query(validationQuery, [
      organizationId,
      usersToValidate
    ]);

    if (validationResult.rows.length !== usersToValidate.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user or manager ID'
      });
    }

    // Update the manager relationship
    const updateQuery = `
      UPDATE organization_users
      SET reporting_manager_id = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2 AND organization_id = $3
      RETURNING id, email, first_name, last_name, reporting_manager_id
    `;

    const updateResult = await db.query(updateQuery, [
      managerId || null,
      userId,
      organizationId
    ]);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      data: updateResult.rows[0]
    });
  } catch (error: any) {
    console.error('Error updating manager:', error);

    // Check for circular reference error from trigger
    if (error.message?.includes('Circular manager reference')) {
      return res.status(400).json({
        success: false,
        error: 'Cannot set manager: this would create a circular reporting structure'
      });
    }

    if (error.message?.includes('cannot be their own manager')) {
      return res.status(400).json({
        success: false,
        error: 'A user cannot be their own manager'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to update manager relationship'
    });
  }
});

/**
 * @openapi
 * /api/v1/organization/users/{userId}/direct-reports:
 *   get:
 *     summary: Get direct reports
 *     description: Get list of users who report directly to the specified user.
 *     tags: [Organization Chart]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of direct reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       userId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       email:
 *                         type: string
 *                       title:
 *                         type: string
 *                       directReportsCount:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/users/:userId/direct-reports', requireAuth, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'Organization not found'
      });
    }

    const query = `
      SELECT
        id as user_id,
        email,
        first_name,
        last_name,
        job_title,
        department,
        photo_data,
        get_direct_reports_count(id) as direct_reports_count
      FROM organization_users
      WHERE organization_id = $1
        AND reporting_manager_id = $2
        AND is_active = true
      ORDER BY last_name, first_name
    `;

    const result = await db.query(query, [organizationId, userId]);

    const directReports = result.rows.map((user: any) => ({
      userId: user.user_id,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email,
      email: user.email,
      title: user.job_title,
      department: user.department,
      photoUrl: user.photo_data,
      directReportsCount: parseInt(user.direct_reports_count) || 0
    }));

    return res.json({
      success: true,
      data: directReports
    });
  } catch (error) {
    console.error('Error fetching direct reports:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch direct reports'
    });
  }
});

export default router;