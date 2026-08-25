/**
 * API Relay Authorization — admin authoring surface.
 *
 * These endpoints let an organization admin drive the least-privilege relay
 * gate from the product (Settings → Security → API Relay Access) instead of
 * seeding rows from tests. They are the missing half of the enforcement engine
 * that already lives in services/relay/{policy,store,scopes,enforce}.ts and is
 * wired into the transparent proxy behind the `api_relay` feature flag.
 *
 * Two independent gates decide whether the proxy enforces:
 *   1. The GLOBAL `api_relay` feature flag (dark-launch master switch). OFF =>
 *      the proxy passes every request through unchanged (legacy behavior).
 *   2. The per-org `relay_config.relay_enabled` toggle. With the flag ON but the
 *      relay disabled, the engine denies with `relay-disabled` (fail-closed).
 * `writes_enabled` is a third, separate toggle: enabling the relay never enables
 * writes/deletes.
 *
 * With BOTH gates on and at least one matching allow rule, enforce.ts applies
 * deny-by-default + per-capability minimal OAuth scopes. This file surfaces the
 * global flag state (read + toggle) alongside the org config so the whole thing
 * is operable from one panel.
 *
 * Every route is admin-guarded (requireAuth + requireAdmin) and strictly scoped
 * to the caller's own organization.
 */
import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import {
  loadRelayConfig,
  setRelayConfig,
  listRelayRules,
  createRelayRule,
  deleteRelayRule,
} from '../services/relay/store.js';
import { RELAY_FEATURE_FLAG } from '../services/relay/enforce.js';
import { featureFlagsService } from '../services/feature-flags.service.js';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import { logger } from '../utils/logger.js';

const router = Router();

/** Match pattern grammar accepted by the policy engine (policy.ts patternMatches):
 *  `*`                         — everything
 *  `resource`                  — implicit any-method
 *  `resource:METHOD`           — exact
 *  `resource.*` / `resource.*:METHOD` — resource-prefix wildcard
 *  `resource:*`                — any method
 *  Resource segments are lowercase dotted (e.g. admin.directory.users). */
const METHODS = ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE', '*'];

function validateMatchPattern(pattern: unknown): string | null {
  if (typeof pattern !== 'string' || pattern.trim() === '') {
    return 'match_pattern is required';
  }
  const p = pattern.trim();
  if (p === '*') return null;
  const idx = p.lastIndexOf(':');
  const resource = idx === -1 ? p : p.slice(0, idx);
  const method = idx === -1 ? '*' : p.slice(idx + 1);
  // Resource: lowercase dotted, optional trailing `.*` wildcard.
  if (!/^[a-z0-9_]+(\.[a-z0-9_]+)*(\.\*)?$/.test(resource)) {
    return `Invalid resource in match_pattern: "${resource}" (expected lowercase dotted path like admin.directory.users, optionally ending .*)`;
  }
  if (!METHODS.includes(method.toUpperCase())) {
    return `Invalid method in match_pattern: "${method}" (expected one of ${METHODS.join(', ')})`;
  }
  return null;
}

/**
 * @openapi
 * /organization/relay/config:
 *   get:
 *     summary: Get the relay authorization config for this organization
 *     description: |
 *       Returns the per-org relay toggles plus the state of the global
 *       `api_relay` feature flag. Enforcement is active only when BOTH the
 *       feature flag and relay_enabled are true. Admin only.
 *     tags: [API Relay]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Relay config }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/config', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'No organization context');
    }
    const [config, featureFlagEnabled] = await Promise.all([
      loadRelayConfig(organizationId),
      featureFlagsService.isEnabled(RELAY_FEATURE_FLAG),
    ]);
    return successResponse(res, {
      relay_enabled: config.relayEnabled,
      writes_enabled: config.writesEnabled,
      feature_flag_enabled: featureFlagEnabled,
      // Enforcement only bites when the master flag AND the org toggle are on.
      enforcement_active: featureFlagEnabled && config.relayEnabled,
    });
  } catch (error) {
    logger.error('Error loading relay config', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to load relay config');
  }
});

/**
 * @openapi
 * /organization/relay/config:
 *   put:
 *     summary: Update the relay authorization config
 *     description: |
 *       Toggle the per-org relay (`relay_enabled`), the write/delete gate
 *       (`writes_enabled`), and optionally the global `api_relay` feature flag
 *       (`feature_flag_enabled`) so the whole gate is operable from one panel.
 *       Any omitted field is left unchanged. Admin only.
 *     tags: [API Relay]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Updated relay config }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.put('/config', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'No organization context');
    }

    const { relay_enabled, writes_enabled, feature_flag_enabled } = req.body ?? {};

    for (const [field, value] of Object.entries({ relay_enabled, writes_enabled, feature_flag_enabled })) {
      if (value !== undefined && typeof value !== 'boolean') {
        return validationErrorResponse(res, [{ field, message: 'Must be a boolean' }]);
      }
    }

    // Merge over the current config so a partial PUT never clobbers the other
    // toggle. relay_config is a single row per org (single-tenant portal).
    const current = await loadRelayConfig(organizationId);
    const next = {
      relayEnabled: typeof relay_enabled === 'boolean' ? relay_enabled : current.relayEnabled,
      writesEnabled: typeof writes_enabled === 'boolean' ? writes_enabled : current.writesEnabled,
    };
    await setRelayConfig(organizationId, next);

    let featureFlagEnabled: boolean;
    if (typeof feature_flag_enabled === 'boolean') {
      await featureFlagsService.setFlag(RELAY_FEATURE_FLAG, feature_flag_enabled);
      featureFlagEnabled = feature_flag_enabled;
    } else {
      featureFlagEnabled = await featureFlagsService.isEnabled(RELAY_FEATURE_FLAG);
    }

    logger.info('Relay config updated', {
      organizationId,
      userId: req.user?.userId,
      relay_enabled: next.relayEnabled,
      writes_enabled: next.writesEnabled,
      feature_flag_enabled: featureFlagEnabled,
    });

    return successResponse(res, {
      relay_enabled: next.relayEnabled,
      writes_enabled: next.writesEnabled,
      feature_flag_enabled: featureFlagEnabled,
      enforcement_active: featureFlagEnabled && next.relayEnabled,
    });
  } catch (error) {
    logger.error('Error updating relay config', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to update relay config');
  }
});

/**
 * @openapi
 * /organization/relay/rules:
 *   get:
 *     summary: List the organization's relay rules
 *     tags: [API Relay]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200: { description: Array of relay rules }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.get('/rules', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'No organization context');
    }
    const rules = await listRelayRules(organizationId);
    return successResponse(res, rules);
  } catch (error) {
    logger.error('Error listing relay rules', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to list relay rules');
  }
});

/**
 * @openapi
 * /organization/relay/rules:
 *   post:
 *     summary: Create a relay rule
 *     description: |
 *       Author an allow/deny rule (`match_pattern` = `resource:METHOD`), with
 *       optional expiry, privileged-subject opt-in, and OU scoping. Deny rules
 *       are org-wide and beat any allow. Admin only.
 *     tags: [API Relay]
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       201: { description: Created rule }
 *       400: { $ref: '#/components/responses/ValidationError' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 */
router.post('/rules', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'No organization context');
    }

    const {
      effect,
      match_pattern,
      subject_allow_privileged,
      subject_org_units,
      expires_at,
    } = req.body ?? {};

    const errors: { field: string; message: string }[] = [];

    if (effect !== 'allow' && effect !== 'deny') {
      errors.push({ field: 'effect', message: "Must be 'allow' or 'deny'" });
    }

    const patternError = validateMatchPattern(match_pattern);
    if (patternError) {
      errors.push({ field: 'match_pattern', message: patternError });
    }

    if (subject_allow_privileged !== undefined && typeof subject_allow_privileged !== 'boolean') {
      errors.push({ field: 'subject_allow_privileged', message: 'Must be a boolean' });
    }

    let orgUnits: string[] | null = null;
    if (subject_org_units !== undefined && subject_org_units !== null) {
      if (
        !Array.isArray(subject_org_units) ||
        !subject_org_units.every((o) => typeof o === 'string' && o.trim() !== '')
      ) {
        errors.push({ field: 'subject_org_units', message: 'Must be an array of non-empty strings' });
      } else {
        orgUnits = subject_org_units.map((o: string) => o.trim());
      }
    }

    let expiresAt: string | null = null;
    if (expires_at !== undefined && expires_at !== null && expires_at !== '') {
      const parsed = new Date(expires_at);
      if (Number.isNaN(parsed.getTime())) {
        errors.push({ field: 'expires_at', message: 'Must be a valid ISO-8601 date-time' });
      } else {
        expiresAt = parsed.toISOString();
      }
    }

    if (errors.length > 0) {
      return validationErrorResponse(res, errors);
    }

    const rule = await createRelayRule(
      organizationId,
      {
        effect,
        matchPattern: (match_pattern as string).trim(),
        subjectAllowPrivileged: subject_allow_privileged === true,
        subjectOrgUnits: orgUnits,
        expiresAt,
      },
      req.user?.userId ?? null,
    );

    logger.info('Relay rule created', {
      organizationId,
      userId: req.user?.userId,
      ruleId: rule.id,
      effect: rule.effect,
      matchPattern: rule.matchPattern,
    });

    return res.status(201).json({ success: true, data: rule });
  } catch (error) {
    logger.error('Error creating relay rule', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to create relay rule');
  }
});

/**
 * @openapi
 * /organization/relay/rules/{id}:
 *   delete:
 *     summary: Delete a relay rule
 *     tags: [API Relay]
 *     security: [{ BearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Rule deleted }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       404: { $ref: '#/components/responses/NotFound' }
 */
router.delete('/rules/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = req.user?.organizationId;
    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'No organization context');
    }
    const deleted = await deleteRelayRule(organizationId, req.params.id);
    if (!deleted) {
      return errorResponse(res, ErrorCode.NOT_FOUND, 'Relay rule not found');
    }
    logger.info('Relay rule deleted', {
      organizationId,
      userId: req.user?.userId,
      ruleId: req.params.id,
    });
    return successResponse(res, { message: 'Relay rule deleted' });
  } catch (error) {
    logger.error('Error deleting relay rule', { error });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, 'Failed to delete relay rule');
  }
});

export default router;
