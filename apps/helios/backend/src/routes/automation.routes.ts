/**
 * Automation Routes
 *
 * API endpoints for the unified rules engine:
 * - Named conditions CRUD
 * - Automation rules CRUD
 * - Rule testing and evaluation
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { rulesEngineService, RuleType, ConditionGroup } from '../services/rules-engine.service.js';
import { logger } from '../utils/logger.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Helper middleware to require specific roles
const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: `This action requires one of these roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

// =====================
// Named Conditions
// =====================

/**
 * GET /api/v1/automation/conditions
 * List all named conditions for the organization
 */
router.get('/conditions', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const conditions = await rulesEngineService.listNamedConditions(organizationId);

    res.json({
      success: true,
      data: {
        conditions,
        count: conditions.length
      }
    });
  } catch (error: any) {
    logger.error('Error listing named conditions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list named conditions' });
  }
});

/**
 * GET /api/v1/automation/conditions/:id
 * Get a single named condition
 */
router.get('/conditions/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const condition = await rulesEngineService.getNamedCondition(organizationId, req.params.id);

    if (!condition) {
      return res.status(404).json({ success: false, error: 'Named condition not found' });
    }

    res.json({
      success: true,
      data: { condition }
    });
  } catch (error: any) {
    logger.error('Error getting named condition', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to get named condition' });
  }
});

/**
 * POST /api/v1/automation/conditions
 * Create a new named condition
 */
router.post('/conditions', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { name, displayName, description, conditions } = req.body;

    if (!name || !displayName || !conditions) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, displayName, conditions'
      });
    }

    // Validate name format (slug-like)
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Name must start with a letter and contain only lowercase letters, numbers, and underscores'
      });
    }

    const result = await rulesEngineService.createNamedCondition(
      organizationId,
      { name, displayName, description, conditions },
      userId
    );

    res.status(201).json({
      success: true,
      data: {
        condition: result.condition,
        validation: result.validation
      }
    });
  } catch (error: any) {
    logger.error('Error creating named condition', { error: error.message });

    if (error.message.includes('Invalid conditions')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    if (error.message.includes('duplicate key')) {
      return res.status(409).json({ success: false, error: 'A condition with this name already exists' });
    }

    res.status(500).json({ success: false, error: 'Failed to create named condition' });
  }
});

/**
 * PUT /api/v1/automation/conditions/:id
 * Update a named condition
 */
router.put('/conditions/:id', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { name, displayName, description, conditions } = req.body;

    // Validate name format if provided
    if (name && !/^[a-z][a-z0-9_]*$/.test(name)) {
      return res.status(400).json({
        success: false,
        error: 'Name must start with a letter and contain only lowercase letters, numbers, and underscores'
      });
    }

    const result = await rulesEngineService.updateNamedCondition(
      organizationId,
      req.params.id,
      { name, displayName, description, conditions },
      userId
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Named condition not found' });
    }

    res.json({
      success: true,
      data: {
        condition: result.condition,
        validation: result.validation
      }
    });
  } catch (error: any) {
    logger.error('Error updating named condition', { error: error.message, id: req.params.id });

    if (error.message.includes('Invalid conditions')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Failed to update named condition' });
  }
});

/**
 * DELETE /api/v1/automation/conditions/:id
 * Delete a named condition
 */
router.delete('/conditions/:id', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const deleted = await rulesEngineService.deleteNamedCondition(organizationId, req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Named condition not found' });
    }

    res.json({
      success: true,
      message: 'Named condition deleted'
    });
  } catch (error: any) {
    logger.error('Error deleting named condition', { error: error.message, id: req.params.id });

    if (error.message.includes('in use')) {
      return res.status(409).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Failed to delete named condition' });
  }
});

/**
 * GET /api/v1/automation/conditions/:id/usage
 * Get rules that use this named condition
 */
router.get('/conditions/:id/usage', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const rules = await rulesEngineService.getConditionUsage(organizationId, req.params.id);

    res.json({
      success: true,
      data: {
        rules,
        count: rules.length
      }
    });
  } catch (error: any) {
    logger.error('Error getting condition usage', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to get condition usage' });
  }
});

// =====================
// Automation Rules
// =====================

/**
 * GET /api/v1/automation/rules
 * List automation rules
 */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { ruleType, isEnabled } = req.query;

    const rules = await rulesEngineService.listRules(organizationId, {
      ruleType: ruleType as RuleType | undefined,
      isEnabled: isEnabled === undefined ? undefined : isEnabled === 'true'
    });

    res.json({
      success: true,
      data: {
        rules,
        count: rules.length
      }
    });
  } catch (error: any) {
    logger.error('Error listing automation rules', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list automation rules' });
  }
});

/**
 * GET /api/v1/automation/rules/:id
 * Get a single rule
 */
router.get('/rules/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const rule = await rulesEngineService.getRule(organizationId, req.params.id);

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({
      success: true,
      data: { rule }
    });
  } catch (error: any) {
    logger.error('Error getting rule', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to get rule' });
  }
});

/**
 * POST /api/v1/automation/rules
 * Create a new automation rule
 */
router.post('/rules', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { name, description, ruleType, conditions, priority, isEnabled, config } = req.body;

    if (!name || !ruleType || !conditions) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, ruleType, conditions'
      });
    }

    // Validate rule type
    const validTypes: RuleType[] = ['dynamic_group', 'template_match', 'training_assign', 'notification', 'workflow'];
    if (!validTypes.includes(ruleType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid rule type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const result = await rulesEngineService.createRule(
      organizationId,
      { name, description, ruleType, conditions, priority, isEnabled, config },
      userId
    );

    res.status(201).json({
      success: true,
      data: {
        rule: result.rule,
        validation: result.validation
      }
    });
  } catch (error: any) {
    logger.error('Error creating rule', { error: error.message });

    if (error.message.includes('Invalid conditions')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Failed to create rule' });
  }
});

/**
 * PUT /api/v1/automation/rules/:id
 * Update an automation rule
 */
router.put('/rules/:id', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { name, description, conditions, priority, isEnabled, config } = req.body;

    const result = await rulesEngineService.updateRule(
      organizationId,
      req.params.id,
      { name, description, conditions, priority, isEnabled, config },
      userId
    );

    if (!result) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({
      success: true,
      data: {
        rule: result.rule,
        validation: result.validation
      }
    });
  } catch (error: any) {
    logger.error('Error updating rule', { error: error.message, id: req.params.id });

    if (error.message.includes('Invalid conditions')) {
      return res.status(400).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Failed to update rule' });
  }
});

/**
 * DELETE /api/v1/automation/rules/:id
 * Delete an automation rule
 */
router.delete('/rules/:id', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const deleted = await rulesEngineService.deleteRule(organizationId, req.params.id);

    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    res.json({
      success: true,
      message: 'Rule deleted'
    });
  } catch (error: any) {
    logger.error('Error deleting rule', { error: error.message, id: req.params.id });
    res.status(500).json({ success: false, error: 'Failed to delete rule' });
  }
});

/**
 * POST /api/v1/automation/rules/:id/test
 * Test a rule with sample facts
 */
router.post('/rules/:id/test', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { facts } = req.body;

    if (!facts || typeof facts !== 'object') {
      return res.status(400).json({ success: false, error: 'Facts object is required' });
    }

    const result = await rulesEngineService.evaluateRule(
      organizationId,
      req.params.id,
      facts,
      {
        organizationId,
        triggeredBy: 'manual_test',
        userId: req.user?.userId
      }
    );

    res.json({
      success: true,
      data: {
        matched: result.matched,
        evaluationTimeMs: result.evaluationTimeMs,
        events: result.events
      }
    });
  } catch (error: any) {
    logger.error('Error testing rule', { error: error.message, id: req.params.id });

    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Failed to test rule' });
  }
});

/**
 * POST /api/v1/automation/rules/evaluate
 * Evaluate all rules of a type with given facts
 */
router.post('/rules/evaluate', requireRole(['admin', 'hr_admin']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { ruleType, facts } = req.body;

    if (!ruleType || !facts) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ruleType, facts'
      });
    }

    const result = await rulesEngineService.evaluateRulesByType(
      organizationId,
      ruleType as RuleType,
      facts,
      {
        organizationId,
        triggeredBy: 'manual_evaluate',
        userId: req.user?.userId
      }
    );

    res.json({
      success: true,
      data: {
        matchedRules: result.matchedRules.map(r => ({
          id: r.id,
          name: r.name,
          priority: r.priority,
          config: r.config
        })),
        matchCount: result.matchedRules.length,
        evaluationTimeMs: result.evaluationTimeMs
      }
    });
  } catch (error: any) {
    logger.error('Error evaluating rules', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to evaluate rules' });
  }
});

/**
 * POST /api/v1/automation/validate
 * Validate conditions without creating a rule
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { conditions } = req.body;

    if (!conditions) {
      return res.status(400).json({ success: false, error: 'Conditions are required' });
    }

    const validation = await rulesEngineService.validateConditions(organizationId, conditions);

    res.json({
      success: true,
      data: { validation }
    });
  } catch (error: any) {
    logger.error('Error validating conditions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to validate conditions' });
  }
});

/**
 * POST /api/v1/automation/test
 * Test conditions without creating a rule
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const { conditions, facts } = req.body;

    if (!conditions || !facts) {
      return res.status(400).json({ success: false, error: 'Conditions and facts are required' });
    }

    const result = await rulesEngineService.testRule(organizationId, conditions, facts);

    res.json({
      success: true,
      data: {
        matched: result.matched,
        errors: result.errors
      }
    });
  } catch (error: any) {
    logger.error('Error testing conditions', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to test conditions' });
  }
});

/**
 * GET /api/v1/automation/facts
 * Get available facts/fields for rule building
 */
router.get('/facts', (_req: Request, res: Response) => {
  try {
    const facts = rulesEngineService.getAvailableFacts();

    // Group by category
    const grouped = facts.reduce((acc, fact) => {
      if (!acc[fact.category]) {
        acc[fact.category] = [];
      }
      acc[fact.category].push(fact);
      return acc;
    }, {} as Record<string, typeof facts>);

    res.json({
      success: true,
      data: {
        facts,
        grouped,
        categories: Object.keys(grouped)
      }
    });
  } catch (error: any) {
    logger.error('Error getting available facts', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get available facts' });
  }
});

/**
 * POST /api/v1/automation/user-facts/:userId
 * Build facts for a specific user (for testing/preview)
 */
router.post('/user-facts/:userId', requireRole(['admin', 'hr_admin', 'manager']), async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;

    if (!organizationId) {
      return res.status(401).json({ success: false, error: 'Organization not found' });
    }

    const facts = await rulesEngineService.buildUserFacts(organizationId, req.params.userId);

    res.json({
      success: true,
      data: { facts }
    });
  } catch (error: any) {
    logger.error('Error building user facts', { error: error.message, userId: req.params.userId });

    if (error.message.includes('not found')) {
      return res.status(404).json({ success: false, error: error.message });
    }

    res.status(500).json({ success: false, error: 'Failed to build user facts' });
  }
});

export default router;
