/**
 * Group scenarios API (D-048). Admin only, behind the `directory.group_scenarios`
 * feature flag (preview until every built-in scenario is verified live).
 *
 *   GET    /group-scenarios                    every scenario (built-in + custom) with its drill-in
 *   GET    /group-scenarios/status             Google connected? Groups Settings scope authorised?
 *   GET    /group-scenarios/setting-fields     the Groups Settings fields and values a scenario may use
 *   GET    /group-scenarios/:key               one scenario
 *   POST   /group-scenarios                    create a custom scenario (from a built-in base or from scratch)
 *   PATCH  /group-scenarios/:key               built-in: { disabled } only; custom: any field but key
 *   DELETE /group-scenarios/:key               custom only (built-ins: 409, disable instead)
 *   POST   /group-scenarios/:key/groups        create a group from the scenario and verify it
 *
 * Status codes for POST /:key/groups, so a caller can never mistake a partial
 * result for success:
 *   201  group created, every step ok, read-back matches (outcome "verified")
 *   207  group created, but a step failed or the read-back differs
 *        (outcome "partial" or "mismatch"; body lists steps and mismatches)
 *   400  invalid request (nothing created)
 *   404  unknown scenario, or the feature is off
 *   409  scenario disabled, Google not connected, Groups Settings scope not
 *        authorised, or the address already exists (nothing created)
 *   502  Google refused or failed before the group existed (nothing created)
 */
import { Router, Request, Response, NextFunction } from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import { successResponse, createdResponse, errorResponse, noContentResponse } from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import { featureFlagsService } from '../services/feature-flags.service.js';
import { securityAudit, AuditActions } from '../services/security-audit.service.js';
import { GROUP_SETTING_FIELDS, MEMBER_DELIVERY_VALUES, MAX_GROUP_ALIASES } from '../config/group-scenarios.js';
import { GroupScenarioService, ScenarioError } from '../services/group-scenarios/group-scenario.service.js';
import { gatewayForOrganization } from '../services/group-scenarios/google-groups.gateway.js';

export const GROUP_SCENARIOS_FLAG = 'directory.group_scenarios';

const router = Router();

const service = new GroupScenarioService({ db, gatewayFor: gatewayForOrganization });

router.use(requireAdmin);

router.use(async (_req: Request, res: Response, next: NextFunction) => {
  try {
    if (!(await featureFlagsService.isEnabled(GROUP_SCENARIOS_FLAG))) {
      return errorResponse(res, ErrorCode.NOT_FOUND, 'Group scenarios are not enabled for this organization');
    }
    next();
  } catch (error) {
    next(error);
  }
});

function orgId(req: Request): string {
  return (req as any).user?.organizationId;
}

function actor(req: Request) {
  const user = (req as any).user || {};
  return {
    actorId: user.userId || user.id || undefined,
    actorEmail: user.email || undefined,
    actorIp: req.ip || undefined,
    actorUserAgent: req.get('User-Agent') || undefined,
  };
}

function handleError(res: Response, error: unknown, what: string): Response {
  if (error instanceof ScenarioError) {
    return errorResponse(res, error.code, error.message, error.details ?? null, error.status);
  }
  logger.error(`Group scenarios: failed to ${what}`, { error: (error as Error)?.message });
  return errorResponse(res, ErrorCode.INTERNAL_ERROR, `Failed to ${what}`);
}

router.get('/', async (req: Request, res: Response) => {
  try {
    return successResponse(res, await service.list(orgId(req)));
  } catch (error) {
    return handleError(res, error, 'list group scenarios');
  }
});

router.get('/status', async (req: Request, res: Response) => {
  try {
    return successResponse(res, await service.settingsScopeStatus(orgId(req)));
  } catch (error) {
    return handleError(res, error, 'check the Groups Settings scope');
  }
});

router.get('/setting-fields', async (_req: Request, res: Response) => {
  return successResponse(res, {
    settings: GROUP_SETTING_FIELDS,
    memberDelivery: MEMBER_DELIVERY_VALUES,
    maxAliases: MAX_GROUP_ALIASES,
  });
});

router.get('/:key', async (req: Request, res: Response) => {
  try {
    return successResponse(res, await service.get(orgId(req), req.params.key));
  } catch (error) {
    return handleError(res, error, 'load the group scenario');
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const a = actor(req);
    const scenario = await service.createCustom(orgId(req), a.actorId ?? null, req.body || {});
    await securityAudit.log({
      action: 'group_scenario.create',
      actionCategory: 'admin',
      ...a,
      targetType: 'group_scenario',
      targetIdentifier: scenario.key,
      organizationId: orgId(req),
      outcome: 'success',
      changesAfter: { key: scenario.key, baseKey: scenario.baseKey, settings: scenario.settings },
    });
    return createdResponse(res, scenario);
  } catch (error) {
    return handleError(res, error, 'create the group scenario');
  }
});

router.patch('/:key', async (req: Request, res: Response) => {
  try {
    const a = actor(req);
    const scenario = await service.update(orgId(req), a.actorId ?? null, req.params.key, req.body || {});
    await securityAudit.log({
      action: 'group_scenario.update',
      actionCategory: 'admin',
      ...a,
      targetType: 'group_scenario',
      targetIdentifier: scenario.key,
      organizationId: orgId(req),
      outcome: 'success',
      changesAfter: req.body || {},
    });
    return successResponse(res, scenario);
  } catch (error) {
    return handleError(res, error, 'update the group scenario');
  }
});

router.delete('/:key', async (req: Request, res: Response) => {
  try {
    await service.deleteCustom(orgId(req), req.params.key);
    await securityAudit.log({
      action: 'group_scenario.delete',
      actionCategory: 'admin',
      ...actor(req),
      targetType: 'group_scenario',
      targetIdentifier: req.params.key,
      organizationId: orgId(req),
      outcome: 'success',
    });
    return noContentResponse(res);
  } catch (error) {
    return handleError(res, error, 'delete the group scenario');
  }
});

router.post('/:key/groups', async (req: Request, res: Response) => {
  const organizationId = orgId(req);
  const body = req.body || {};
  try {
    const result = await service.createFromScenario(organizationId, req.params.key, {
      email: body.email,
      name: body.name,
      description: body.description,
      aliases: body.aliases,
      members: body.members,
    });

    // The Groups page lists the local copy; without a sync the new group is
    // invisible in Helios until the next scheduled one.
    try {
      const { googleWorkspaceService } = await import('../services/google-workspace.service.js');
      const synced = await googleWorkspaceService.syncGroups(organizationId);
      if (synced && synced.success === false) throw new Error(synced.error || 'sync failed');
    } catch (syncError: any) {
      result.warnings.push('The group exists in Google but the Helios group list could not be refreshed; it appears after the next sync.');
      logger.warn('Group created from scenario but local sync failed', { error: syncError?.message });
    }

    await securityAudit.log({
      action: AuditActions.GROUP_CREATE,
      actionCategory: 'admin',
      ...actor(req),
      targetType: 'group',
      targetId: result.group.id,
      targetIdentifier: result.group.email,
      organizationId,
      outcome: result.outcome === 'verified' ? 'success' : 'partial',
      changesAfter: {
        scenario: result.scenarioKey,
        outcome: result.outcome,
        steps: result.steps,
        mismatches: result.mismatches,
      },
    });

    if (result.outcome === 'verified') return createdResponse(res, result);
    // 207: the group exists but is not what the scenario asked for. `success` is
    // false so no client can read this as a clean create.
    return res.status(207).json({
      success: false,
      data: result,
      error: {
        code: result.outcome === 'mismatch' ? 'GROUP_SETTINGS_MISMATCH' : 'GROUP_PARTIALLY_CONFIGURED',
        message: result.outcome === 'mismatch'
          ? `The group was created, but ${result.mismatches.length} value(s) read back from Google differ from the scenario.`
          : 'The group was created, but at least one step failed. See steps for details.',
      },
      meta: { requestId: (req as any).requestId },
    });
  } catch (error) {
    return handleError(res, error, 'create the group from the scenario');
  }
});

export default router;
