/**
 * Failed audit writes, counted.
 *
 * Routine audit writes are best-effort: a failed write must not fail the
 * request it describes. But a failed write must not be invisible either, so
 * every one is logged at error with the action and the actor, and counted here.
 * The count is reported by `GET /health`.
 *
 * In-process on purpose: the count is since this process started, and a restart
 * clears it. The error log line is the durable record.
 */

import { logger } from '../utils/logger.js';

export interface AuditWriteFailure {
  /** The audit action that was not recorded, e.g. `user.update`. */
  action: string;
  /** Who performed it: an email, a user id, or `anonymous`. */
  actor?: string | null;
  /** Where the write was attempted, e.g. `audit.middleware`. */
  source: string;
  error: unknown;
}

let failures = 0;
let lastFailureAt: string | null = null;
let lastAction: string | null = null;

export function recordAuditWriteFailure(failure: AuditWriteFailure): void {
  failures += 1;
  lastFailureAt = new Date().toISOString();
  lastAction = failure.action;

  const error = failure.error as { message?: string; code?: string } | undefined;
  logger.error('Audit write failed: this action was not recorded in the audit log', {
    action: failure.action,
    actor: failure.actor || 'unknown',
    source: failure.source,
    error: error?.message ?? String(failure.error),
    code: error?.code,
    failuresSinceStart: failures,
  });
}

export function getAuditWriteFailures(): {
  sinceStart: number;
  lastFailureAt: string | null;
  lastAction: string | null;
} {
  return { sinceStart: failures, lastFailureAt, lastAction };
}

/** Test helper. */
export function resetAuditWriteFailures(): void {
  failures = 0;
  lastFailureAt = null;
  lastAction = null;
}
