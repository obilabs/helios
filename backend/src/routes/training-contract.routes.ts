/**
 * Training contract v1 — the HTTP surface.
 *
 * Mounted at /api/v1/training/v1. The version appears twice on purpose: /api/v1 is this
 * installation's API generation, and the second is the TRAINING CONTRACT's own version,
 * which an integrator pins independently. They will diverge, and a customer's vendor
 * should not have to care that we reorganised something unrelated.
 *
 * Every route is inert until an admin enables the contract. See contract.ts for the
 * design and north-star/BUILD-WINDOW-2026.md for why this is our own contract.
 */
import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { authenticateApiKey, requirePermission } from '../middleware/api-key-auth.js';
import { trainingContractService } from '../services/training-contract.service.js';
import { parseCompletionStatement, StatementError } from '../lib/training/statement.js';
import {
  CONTRACT_STATEMENT,
  REQUIREMENT_REASONS,
  REQUIREMENT_STATUSES,
  TRAINING_SPEC_VERSION,
  TRAINING_VERBS,
  WEBHOOK_EVENTS,
} from '../lib/training/contract.js';

const router = Router();

/** 404, not 403: an installation that has not opted in should look like it has no such API. */
async function requireContractEnabled(
  req: Request,
  res: Response,
  next: () => void,
): Promise<void> {
  const organizationId = req.organizationId;
  if (!organizationId) {
    res.status(401).json({ error: { code: 'unauthenticated', message: 'No organization context' } });
    return;
  }
  if (!(await trainingContractService.isEnabled(organizationId))) {
    res.status(404).json({
      error: { code: 'not_enabled', message: 'The training contract is not enabled for this organization' },
    });
    return;
  }
  next();
}

/**
 * Machine-readable description of what this installation implements.
 *
 * Unauthenticated on purpose and carrying no tenant data: an integrator writing a
 * connector needs to know the spec version and the accepted vocabulary before they have
 * a key, and making them guess is how mismatched assumptions ship.
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    spec_version: TRAINING_SPEC_VERSION,
    statement: CONTRACT_STATEMENT,
    verbs: TRAINING_VERBS,
    requirement_reasons: REQUIREMENT_REASONS,
    requirement_statuses: REQUIREMENT_STATUSES,
    webhook_events: WEBHOOK_EVENTS,
    endpoints: {
      completions: 'POST /api/v1/training/v1/completions',
      records: 'GET /api/v1/training/v1/records',
    },
    is_learning_record_store: false,
  });
});

/**
 * Ingest a completion.
 *
 * `Idempotency-Key` is REQUIRED, not optional. Every vendor integration retries, and a
 * duplicate completion would show as a second satisfied requirement in an audit export.
 * Making the caller supply the key means WE decide what "the same call" is, rather than
 * hashing a body whose formatting we do not control.
 */
router.post(
  '/completions',
  authenticateApiKey,
  requirePermission('write:training-completions'),
  requireContractEnabled,
  async (req: Request, res: Response): Promise<void> => {
    const organizationId = req.organizationId!;
    const idempotencyKey = req.get('idempotency-key');

    if (!idempotencyKey || idempotencyKey.trim() === '') {
      res.status(400).json({
        error: {
          code: 'idempotency_key_required',
          message: 'An Idempotency-Key header is required so a retried delivery is not stored twice',
        },
      });
      return;
    }
    if (idempotencyKey.length > 255) {
      res.status(400).json({
        error: { code: 'idempotency_key_too_long', message: 'Idempotency-Key must be 255 characters or fewer' },
      });
      return;
    }

    try {
      const parsed = parseCompletionStatement(req.body);
      const result = await trainingContractService.ingestCompletion(organizationId, parsed, {
        idempotencyKey: idempotencyKey.trim(),
        apiKeyId: req.apiKey?.id ?? null,
        raw: req.body,
      });

      // 200 for a replay, 201 for new evidence. A retrying vendor sees a success either
      // way and stops; a human debugging can tell the two apart.
      res.status(result.duplicate ? 200 : 201).json({
        spec_version: TRAINING_SPEC_VERSION,
        completion_id: result.completionId,
        duplicate: result.duplicate,
        requirement_id: result.requirementId,
        matched: result.matched,
        satisfied: result.satisfied,
        // Said plainly rather than left to inference: an unmatched completion IS stored,
        // and the integrator should not retry it expecting a different outcome.
        note: result.matched
          ? undefined
          : 'Completion stored as evidence but not matched to any open requirement',
      });
    } catch (error) {
      if (error instanceof StatementError) {
        res.status(400).json({
          error: { code: error.code, message: error.message, field: error.field },
        });
        return;
      }
      logger.error('Training completion ingest failed', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: { code: 'ingest_failed', message: 'Could not store the completion' },
      });
    }
  },
);

/**
 * Read requirements as compliance records.
 *
 * Field names follow Vanta's TrainingRecord so a Vanta or Drata connector is a
 * projection rather than a translation.
 */
router.get(
  '/records',
  authenticateApiKey,
  requirePermission('read:training'),
  requireContractEnabled,
  async (req: Request, res: Response): Promise<void> => {
    const organizationId = req.organizationId!;
    try {
      const { records, total } = await trainingContractService.listRecords(organizationId, {
        userId: typeof req.query.user_id === 'string' ? req.query.user_id : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      });
      res.json({ spec_version: TRAINING_SPEC_VERSION, total, records });
    } catch (error) {
      logger.error('Training records read failed', {
        organizationId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({ error: { code: 'read_failed', message: 'Could not read training records' } });
    }
  },
);

export default router;
