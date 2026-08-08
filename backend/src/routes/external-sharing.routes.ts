import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { driveSharingAuditService, type RiskLevel, type ExternalShare } from '../services/drive-sharing-audit.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @openapi
 * /api/v1/external-sharing/scan:
 *   post:
 *     summary: Scan for externally shared files
 *     description: |
 *       Scans Google Drive for files shared outside the organization.
 *       Identifies files shared with external users, personal accounts, or anyone with a link.
 *     tags: [External Sharing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               folderId:
 *                 type: string
 *                 description: Specific folder ID to scan (optional)
 *               sharedDriveId:
 *                 type: string
 *                 description: Specific Shared Drive ID to scan (optional)
 *               maxFiles:
 *                 type: number
 *                 description: Maximum number of files to scan (default 1000)
 *                 default: 1000
 *     responses:
 *       200:
 *         description: Scan results with external shares found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 shares:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExternalShare'
 *                 summary:
 *                   $ref: '#/components/schemas/AuditSummary'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalError'
 */
router.post('/scan', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { folderId, sharedDriveId, maxFiles } = req.body;

    logger.info('Starting external sharing scan', {
      organizationId,
      folderId,
      sharedDriveId,
      maxFiles,
      requestId: req.headers['x-request-id'],
    });

    const result = await driveSharingAuditService.scanForExternalSharing(organizationId, {
      folderId,
      sharedDriveId,
      maxFiles: maxFiles || 1000,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      shares: result.shares,
      summary: result.summary,
    });
  } catch (error: any) {
    logger.error('Scan request failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to scan for external sharing',
    });
  }
});

/**
 * @openapi
 * /api/v1/external-sharing/summary:
 *   get:
 *     summary: Get external sharing summary
 *     description: Quick scan to get summary statistics of external sharing
 *     tags: [External Sharing]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Summary statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 summary:
 *                   $ref: '#/components/schemas/AuditSummary'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/summary', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;

    // Quick scan with smaller limit for summary
    const result = await driveSharingAuditService.scanForExternalSharing(organizationId, {
      maxFiles: 500,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      summary: result.summary,
    });
  } catch (error: any) {
    logger.error('Summary request failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to get external sharing summary',
    });
  }
});

/**
 * @openapi
 * /api/v1/external-sharing/risk/{level}:
 *   get:
 *     summary: Get shares by risk level
 *     description: Get externally shared files filtered by risk level
 *     tags: [External Sharing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: level
 *         required: true
 *         schema:
 *           type: string
 *           enum: [high, medium, low]
 *         description: Risk level to filter by
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 100
 *         description: Maximum number of shares to return
 *     responses:
 *       200:
 *         description: Shares at the specified risk level
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 shares:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExternalShare'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/risk/:level', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const level = req.params.level as RiskLevel;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!['high', 'medium', 'low'].includes(level)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid risk level. Must be high, medium, or low.',
      });
    }

    const result = await driveSharingAuditService.getSharesByRiskLevel(organizationId, level, limit);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      shares: result.shares,
      count: result.shares?.length || 0,
    });
  } catch (error: any) {
    logger.error('Risk level query failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to get shares by risk level',
    });
  }
});

/**
 * @openapi
 * /api/v1/external-sharing/file/{fileId}:
 *   get:
 *     summary: Get sharing details for a file
 *     description: Get detailed sharing information for a specific file
 *     tags: [External Sharing]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: Google Drive file ID
 *     responses:
 *       200:
 *         description: File sharing details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 file:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
router.get('/file/:fileId', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { fileId } = req.params;

    const result = await driveSharingAuditService.getFileSharing(organizationId, fileId);

    if (!result.success) {
      const status = result.error?.includes('not found') ? 404 : 400;
      return res.status(status).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      file: result.file,
    });
  } catch (error: any) {
    logger.error('Get file sharing failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to get file sharing details',
    });
  }
});

/**
 * @openapi
 * /api/v1/external-sharing/revoke:
 *   post:
 *     summary: Revoke external access
 *     description: Revoke external sharing access for a specific file
 *     tags: [External Sharing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fileId
 *               - permissionId
 *             properties:
 *               fileId:
 *                 type: string
 *                 description: Google Drive file ID
 *               permissionId:
 *                 type: string
 *                 description: Permission ID to revoke
 *     responses:
 *       200:
 *         description: Access revoked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 */
router.post('/revoke', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { fileId, permissionId } = req.body;

    if (!fileId || !permissionId) {
      return res.status(400).json({
        success: false,
        error: 'fileId and permissionId are required',
      });
    }

    logger.info('Revoking external access', {
      organizationId,
      fileId,
      permissionId,
      requestId: req.headers['x-request-id'],
    });

    const result = await driveSharingAuditService.revokeAccess(organizationId, fileId, permissionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: 'External access revoked successfully',
    });
  } catch (error: any) {
    logger.error('Revoke access failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to revoke external access',
    });
  }
});

/**
 * @openapi
 * /api/v1/external-sharing/bulk-revoke:
 *   post:
 *     summary: Bulk revoke external access
 *     description: Revoke external sharing access for multiple files at once
 *     tags: [External Sharing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shares
 *             properties:
 *               shares:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - fileId
 *                     - permissionId
 *                   properties:
 *                     fileId:
 *                       type: string
 *                     permissionId:
 *                       type: string
 *     responses:
 *       200:
 *         description: Bulk revoke results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 successCount:
 *                   type: number
 *                 failureCount:
 *                   type: number
 *                 results:
 *                   type: array
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/bulk-revoke', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { shares } = req.body;

    if (!shares || !Array.isArray(shares) || shares.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'shares array is required and must not be empty',
      });
    }

    // Validate all shares have required fields
    for (const share of shares) {
      if (!share.fileId || !share.permissionId) {
        return res.status(400).json({
          success: false,
          error: 'Each share must have fileId and permissionId',
        });
      }
    }

    // Limit bulk operations
    if (shares.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 shares can be revoked at once',
      });
    }

    logger.info('Bulk revoking external access', {
      organizationId,
      count: shares.length,
      requestId: req.headers['x-request-id'],
    });

    const result = await driveSharingAuditService.bulkRevokeAccess(organizationId, shares);

    return res.json({
      success: result.success,
      successCount: result.successCount,
      failureCount: result.failureCount,
      results: result.results,
    });
  } catch (error: any) {
    logger.error('Bulk revoke failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk revoke external access',
    });
  }
});

/**
 * @openapi
 * /api/v1/external-sharing/export:
 *   post:
 *     summary: Export sharing report
 *     description: Export external sharing audit results as CSV
 *     tags: [External Sharing]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               riskLevel:
 *                 type: string
 *                 enum: [all, high, medium, low]
 *                 description: Filter by risk level (default all)
 *               maxFiles:
 *                 type: number
 *                 description: Maximum files to include in export
 *     responses:
 *       200:
 *         description: CSV report
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.post('/export', async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { riskLevel, maxFiles } = req.body;

    // Scan for shares
    const result = await driveSharingAuditService.scanForExternalSharing(organizationId, {
      maxFiles: maxFiles || 1000,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error,
      });
    }

    let shares = result.shares || [];

    // Filter by risk level if specified
    if (riskLevel && riskLevel !== 'all') {
      shares = shares.filter(s => s.riskLevel === riskLevel);
    }

    // Generate CSV
    const csv = driveSharingAuditService.generateCsvReport(shares);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="external-sharing-report-${new Date().toISOString().split('T')[0]}.csv"`);

    return res.send(csv);
  } catch (error: any) {
    logger.error('Export failed', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to export sharing report',
    });
  }
});

export default router;
