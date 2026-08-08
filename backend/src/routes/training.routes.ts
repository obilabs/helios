/**
 * Training Routes
 *
 * API endpoints for training content management and user progress tracking.
 */

import { Router, type Request, type Response } from 'express';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';
import { trainingService, type ContentType } from '../services/training.service.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// ===== Content Management (Admin only) =====

/**
 * List training content
 * GET /api/v1/training/content
 */
router.get('/content', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const { content_type, category, is_active, is_mandatory, search, limit, offset } = req.query;

    const result = await trainingService.listContent(organizationId, {
      content_type: content_type as ContentType,
      category: category as string,
      is_active: is_active === 'true' ? true : is_active === 'false' ? false : undefined,
      is_mandatory: is_mandatory === 'true' ? true : is_mandatory === 'false' ? false : undefined,
      search: search as string,
      limit: limit ? parseInt(limit as string, 10) : 50,
      offset: offset ? parseInt(offset as string, 10) : 0,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get content by ID
 * GET /api/v1/training/content/:id
 */
router.get('/content/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const content = await trainingService.getContent(req.params.id, organizationId);
    if (!content) {
      return res.status(404).json({ success: false, error: 'Content not found' });
    }

    // If it's a quiz, include questions
    let questions = undefined;
    if (content.content_type === 'quiz') {
      questions = await trainingService.getQuizQuestions(content.id);
    }

    res.json({
      success: true,
      data: { ...content, questions },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Create training content (Admin only)
 * POST /api/v1/training/content
 */
router.post('/content', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const content = await trainingService.createContent({
      ...req.body,
      organization_id: organizationId,
      created_by: userId,
    });

    res.status(201).json({
      success: true,
      data: content,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update training content (Admin only)
 * PUT /api/v1/training/content/:id
 */
router.put('/content/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const content = await trainingService.updateContent(req.params.id, organizationId, req.body);
    if (!content) {
      return res.status(404).json({ success: false, error: 'Content not found' });
    }

    res.json({
      success: true,
      data: content,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete training content (Admin only)
 * DELETE /api/v1/training/content/:id
 */
router.delete('/content/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const deleted = await trainingService.deleteContent(req.params.id, organizationId);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Content not found' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== Quiz Management =====

/**
 * Add quiz question
 * POST /api/v1/training/content/:id/questions
 */
router.post('/content/:id/questions', requireAdmin, async (req: Request, res: Response) => {
  try {
    const question = await trainingService.addQuizQuestion(req.params.id, req.body);
    res.status(201).json({ success: true, data: question });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get quiz questions
 * GET /api/v1/training/content/:id/questions
 */
router.get('/content/:id/questions', async (req: Request, res: Response) => {
  try {
    const questions = await trainingService.getQuizQuestions(req.params.id);
    res.json({ success: true, data: questions });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update quiz question
 * PUT /api/v1/training/questions/:id
 */
router.put('/questions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const question = await trainingService.updateQuizQuestion(req.params.id, req.body);
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }
    res.json({ success: true, data: question });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete quiz question
 * DELETE /api/v1/training/questions/:id
 */
router.delete('/questions/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const deleted = await trainingService.deleteQuizQuestion(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== User Progress =====

/**
 * Get my training progress
 * GET /api/v1/training/my-progress
 */
router.get('/my-progress', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId || !userId) {
      return res.status(400).json({ success: false, error: 'User context required' });
    }

    const { status, request_id } = req.query;

    const progress = await trainingService.getUserAllProgress(organizationId, userId, {
      status: status as any,
      requestId: request_id as string,
    });

    const summary = await trainingService.getUserSummary(organizationId, userId);

    res.json({
      success: true,
      data: { progress, summary },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Assign content to user (Admin only)
 * POST /api/v1/training/assign
 */
router.post('/assign', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const assignedBy = req.user?.userId;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const { userId, contentId, dueDate, requestId } = req.body;

    const progress = await trainingService.assignToUser(organizationId, userId, contentId, {
      assignedBy,
      dueDate,
      requestId,
    });

    res.status(201).json({ success: true, data: progress });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Start training
 * POST /api/v1/training/progress/:contentId/start
 */
router.post('/progress/:contentId/start', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const progress = await trainingService.startProgress(userId, req.params.contentId);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'Progress not found' });
    }

    res.json({ success: true, data: progress });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Update progress
 * POST /api/v1/training/progress/:contentId/update
 */
router.post('/progress/:contentId/update', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const { progressPercent, timeSpentSeconds } = req.body;

    const progress = await trainingService.updateProgress(
      userId,
      req.params.contentId,
      progressPercent,
      timeSpentSeconds
    );

    if (!progress) {
      return res.status(404).json({ success: false, error: 'Progress not found' });
    }

    res.json({ success: true, data: progress });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Complete training
 * POST /api/v1/training/progress/:contentId/complete
 */
router.post('/progress/:contentId/complete', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const progress = await trainingService.completeProgress(userId, req.params.contentId);
    if (!progress) {
      return res.status(404).json({ success: false, error: 'Progress not found' });
    }

    res.json({ success: true, data: progress });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Acknowledge/sign terms
 * POST /api/v1/training/progress/:contentId/acknowledge
 */
router.post('/progress/:contentId/acknowledge', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const { signatureData } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const progress = await trainingService.recordAcknowledgment(
      userId,
      req.params.contentId,
      signatureData,
      ipAddress,
      userAgent
    );

    if (!progress) {
      return res.status(404).json({ success: false, error: 'Progress not found' });
    }

    res.json({ success: true, data: progress });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Submit quiz
 * POST /api/v1/training/progress/:contentId/submit-quiz
 */
router.post('/progress/:contentId/submit-quiz', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ success: false, error: 'User ID required' });
    }

    const { answers } = req.body;
    const result = await trainingService.submitQuiz(userId, req.params.contentId, answers);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== Reporting =====

/**
 * Get content statistics (Admin only)
 * GET /api/v1/training/content/:id/stats
 */
router.get('/content/:id/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    const stats = await trainingService.getContentStats(req.params.id, organizationId);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get user's training summary (for dashboards)
 * GET /api/v1/training/users/:userId/summary
 */
router.get('/users/:userId/summary', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const currentUserId = req.user?.userId;
    const targetUserId = req.params.userId;

    if (!organizationId) {
      return res.status(400).json({ success: false, error: 'Organization ID required' });
    }

    // Users can only see their own summary, admins can see anyone's
    if (targetUserId !== currentUserId && req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const summary = await trainingService.getUserSummary(organizationId, targetUserId);
    res.json({ success: true, data: summary });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
