/**
 * Signature Campaigns Routes
 *
 * API endpoints for managing signature campaigns - time-limited
 * marketing campaigns that temporarily override user signatures
 * with promotional banners or special messaging.
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import {
  signatureCampaignService,
  CreateCampaignDTO,
  UpdateCampaignDTO,
  CampaignStatus,
} from '../services/signature-campaign.service.js';

const router = Router();

/**
 * @openapi
 * tags:
 *   - name: Signature Campaigns
 *     description: Time-limited signature marketing campaigns
 */

// =====================================================
// CAMPAIGN CRUD
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/campaigns:
 *   get:
 *     summary: List campaigns
 *     description: Get all signature campaigns for the organization.
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, scheduled, active, paused, completed, cancelled]
 *       - in: query
 *         name: template_id
 *         schema:
 *           type: string
 *       - in: query
 *         name: include_details
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: List of campaigns
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { status, template_id, include_details } = req.query;

    const campaigns = await signatureCampaignService.getCampaigns(organizationId, {
      status: status as CampaignStatus | undefined,
      templateId: template_id as string | undefined,
      includeDetails: include_details === 'true',
    });

    return res.json({
      success: true,
      data: campaigns,
    });
  } catch (error: unknown) {
    console.error('Error listing campaigns:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list campaigns',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}:
 *   get:
 *     summary: Get campaign by ID
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: include_details
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Campaign details
 *       404:
 *         description: Campaign not found
 */
router.get('/:campaignId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    const { include_details } = req.query;

    const campaign = await signatureCampaignService.getCampaign(
      campaignId,
      include_details === 'true'
    );

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    // Verify organization access
    if (campaign.organizationId !== req.user?.organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    return res.json({
      success: true,
      data: campaign,
    });
  } catch (error: unknown) {
    console.error('Error getting campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns:
 *   post:
 *     summary: Create campaign
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - template_id
 *               - start_date
 *               - end_date
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               template_id:
 *                 type: string
 *               banner_url:
 *                 type: string
 *               banner_link:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               timezone:
 *                 type: string
 *               tracking_enabled:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Campaign created
 *       400:
 *         description: Missing required fields
 */
router.post('/', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const {
      name,
      description,
      template_id,
      banner_url,
      banner_link,
      banner_alt_text,
      start_date,
      end_date,
      timezone,
      tracking_enabled,
      tracking_options,
      auto_revert,
    } = req.body;

    // Validate required fields
    if (!name || !template_id || !start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'name, template_id, start_date, and end_date are required',
      });
    }

    const campaignData: CreateCampaignDTO = {
      name,
      description,
      templateId: template_id,
      bannerUrl: banner_url,
      bannerLink: banner_link,
      bannerAltText: banner_alt_text,
      startDate: start_date,
      endDate: end_date,
      timezone,
      trackingEnabled: tracking_enabled,
      trackingOptions: tracking_options,
      autoRevert: auto_revert,
    };

    const campaign = await signatureCampaignService.createCampaign(
      organizationId,
      campaignData,
      userId
    );

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: campaign,
    });
  } catch (error: unknown) {
    console.error('Error creating campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}:
 *   put:
 *     summary: Update campaign
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               start_date:
 *                 type: string
 *                 format: date-time
 *               end_date:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *     responses:
 *       200:
 *         description: Campaign updated
 *       404:
 *         description: Campaign not found
 */
router.put('/:campaignId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    if (existing.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const {
      name,
      description,
      template_id,
      banner_url,
      banner_link,
      banner_alt_text,
      start_date,
      end_date,
      timezone,
      tracking_enabled,
      tracking_options,
      status,
      auto_revert,
    } = req.body;

    const updateData: UpdateCampaignDTO = {};

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (template_id !== undefined) updateData.templateId = template_id;
    if (banner_url !== undefined) updateData.bannerUrl = banner_url;
    if (banner_link !== undefined) updateData.bannerLink = banner_link;
    if (banner_alt_text !== undefined) updateData.bannerAltText = banner_alt_text;
    if (start_date !== undefined) updateData.startDate = start_date;
    if (end_date !== undefined) updateData.endDate = end_date;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (tracking_enabled !== undefined) updateData.trackingEnabled = tracking_enabled;
    if (tracking_options !== undefined) updateData.trackingOptions = tracking_options;
    if (status !== undefined) updateData.status = status;
    if (auto_revert !== undefined) updateData.autoRevert = auto_revert;

    const campaign = await signatureCampaignService.updateCampaign(campaignId, updateData);

    return res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: campaign,
    });
  } catch (error: unknown) {
    console.error('Error updating campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}:
 *   delete:
 *     summary: Delete campaign
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign deleted
 *       404:
 *         description: Campaign not found
 */
router.delete('/:campaignId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    if (existing.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
      });
    }

    const deleted = await signatureCampaignService.deleteCampaign(campaignId);

    if (!deleted) {
      return res.status(400).json({
        success: false,
        error: 'Failed to delete campaign',
      });
    }

    return res.json({
      success: true,
      message: 'Campaign deleted successfully',
    });
  } catch (error: unknown) {
    console.error('Error deleting campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete campaign',
    });
  }
});

// =====================================================
// CAMPAIGN LIFECYCLE ACTIONS
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/launch:
 *   post:
 *     summary: Launch campaign
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign launched
 *       404:
 *         description: Campaign not found
 */
router.post('/:campaignId/launch', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const campaign = await signatureCampaignService.launchCampaign(campaignId);

    return res.json({
      success: true,
      message: 'Campaign launched successfully',
      data: campaign,
    });
  } catch (error: unknown) {
    console.error('Error launching campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to launch campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/pause:
 *   post:
 *     summary: Pause campaign
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign paused
 *       404:
 *         description: Campaign not found
 */
router.post('/:campaignId/pause', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const campaign = await signatureCampaignService.pauseCampaign(campaignId);

    return res.json({
      success: true,
      message: 'Campaign paused successfully',
      data: campaign,
    });
  } catch (error: unknown) {
    console.error('Error pausing campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to pause campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/resume:
 *   post:
 *     summary: Resume campaign
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign resumed
 *       404:
 *         description: Campaign not found
 */
router.post('/:campaignId/resume', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const campaign = await signatureCampaignService.resumeCampaign(campaignId);

    return res.json({
      success: true,
      message: 'Campaign resumed successfully',
      data: campaign,
    });
  } catch (error: unknown) {
    console.error('Error resuming campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to resume campaign',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/cancel:
 *   post:
 *     summary: Cancel campaign
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign cancelled
 *       404:
 *         description: Campaign not found
 */
router.post('/:campaignId/cancel', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const campaign = await signatureCampaignService.cancelCampaign(campaignId);

    return res.json({
      success: true,
      message: 'Campaign cancelled successfully',
      data: campaign,
    });
  } catch (error: unknown) {
    console.error('Error cancelling campaign:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel campaign',
    });
  }
});

// =====================================================
// CAMPAIGN ASSIGNMENTS
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/assignments:
 *   get:
 *     summary: Get campaign assignments
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign assignments
 *       404:
 *         description: Campaign not found
 */
router.get('/:campaignId/assignments', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const assignments = await signatureCampaignService.getCampaignAssignments(campaignId);

    return res.json({
      success: true,
      data: assignments,
    });
  } catch (error: unknown) {
    console.error('Error getting campaign assignments:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get campaign assignments',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/assignments:
 *   post:
 *     summary: Add campaign assignment
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assignment_type
 *             properties:
 *               assignment_type:
 *                 type: string
 *               target_id:
 *                 type: string
 *               target_value:
 *                 type: string
 *     responses:
 *       201:
 *         description: Assignment added
 *       404:
 *         description: Campaign not found
 */
router.post('/:campaignId/assignments', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const { assignment_type, target_id, target_value } = req.body;

    if (!assignment_type) {
      return res.status(400).json({
        success: false,
        error: 'assignment_type is required',
      });
    }

    const validTypes = ['user', 'group', 'dynamic_group', 'department', 'ou', 'organization'];
    if (!validTypes.includes(assignment_type)) {
      return res.status(400).json({
        success: false,
        error: `Invalid assignment_type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const assignment = await signatureCampaignService.addCampaignAssignment(
      campaignId,
      assignment_type,
      target_id,
      target_value
    );

    return res.status(201).json({
      success: true,
      message: 'Assignment added successfully',
      data: assignment,
    });
  } catch (error: unknown) {
    console.error('Error adding campaign assignment:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add campaign assignment',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/assignments/{assignmentId}:
 *   delete:
 *     summary: Remove campaign assignment
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: assignmentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Assignment removed
 *       404:
 *         description: Not found
 */
router.delete('/:campaignId/assignments/:assignmentId', requireAuth, requirePermission('admin'), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId, assignmentId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const deleted = await signatureCampaignService.removeCampaignAssignment(assignmentId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Assignment not found',
      });
    }

    return res.json({
      success: true,
      message: 'Assignment removed successfully',
    });
  } catch (error: unknown) {
    console.error('Error removing campaign assignment:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove campaign assignment',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/affected-users:
 *   get:
 *     summary: Get affected users
 *     description: Get users who would be affected by this campaign.
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Affected users list
 *       404:
 *         description: Campaign not found
 */
router.get('/:campaignId/affected-users', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const users = await signatureCampaignService.getCampaignAffectedUsers(campaignId);

    return res.json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error: unknown) {
    console.error('Error getting affected users:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get affected users',
    });
  }
});

// =====================================================
// CAMPAIGN ANALYTICS
// =====================================================

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/stats:
 *   get:
 *     summary: Get campaign statistics
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Campaign statistics
 *       404:
 *         description: Campaign not found
 */
router.get('/:campaignId/stats', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const stats = await signatureCampaignService.getCampaignStats(campaignId);

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: unknown) {
    console.error('Error getting campaign stats:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get campaign stats',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/opens-by-day:
 *   get:
 *     summary: Get opens by day
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: start_date
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Daily opens data
 *       404:
 *         description: Campaign not found
 */
router.get('/:campaignId/opens-by-day', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;
    const { start_date, end_date } = req.query;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const opens = await signatureCampaignService.getCampaignOpensByDay(
      campaignId,
      start_date ? new Date(start_date as string) : undefined,
      end_date ? new Date(end_date as string) : undefined
    );

    return res.json({
      success: true,
      data: opens,
    });
  } catch (error: unknown) {
    console.error('Error getting campaign opens by day:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get campaign opens',
    });
  }
});

/**
 * @openapi
 * /api/v1/signatures/campaigns/{campaignId}/geo-distribution:
 *   get:
 *     summary: Get geographic distribution
 *     tags: [Signature Campaigns]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: campaignId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Geographic distribution data
 *       404:
 *         description: Campaign not found
 */
router.get('/:campaignId/geo-distribution', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const { campaignId } = req.params;

    // Verify campaign belongs to organization
    const existing = await signatureCampaignService.getCampaign(campaignId);
    if (!existing || existing.organizationId !== organizationId) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found',
      });
    }

    const distribution = await signatureCampaignService.getCampaignGeoDistribution(campaignId);

    return res.json({
      success: true,
      data: distribution,
    });
  } catch (error: unknown) {
    console.error('Error getting campaign geo distribution:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get geo distribution',
    });
  }
});

export default router;
