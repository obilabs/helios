/**
 * API Relay Authorization — enforcement orchestration for the transparent proxy.
 *
 * This is the seam between the live proxy (middleware/transparent-proxy.ts) and
 * the pure policy engine (policy.ts / batch.ts). One entry point:
 *
 *   enforceRelayAuthorization(input) =>
 *     { mode: 'passthrough' }               feature flag OFF — legacy behavior,
 *                                           byte-for-byte identical to today
 *     { mode: 'deny', reason, audit }       flag ON and the engine denied —
 *                                           the proxy MUST NOT forward
 *     { mode: 'forward', scopes, audit }    flag ON and allowed — forward with
 *                                           ONLY these OAuth scopes minted
 *
 * Fail-closed properties:
 *   - Unknown/missing org under the flag  => deny (default-deny).
 *   - Unparseable batch                   => deny (never passed through).
 *   - Resource with no scope mapping      => deny (never mint broad scopes).
 *   - A DB error while loading rules propagates; the proxy's error handler
 *     returns 500 WITHOUT forwarding.
 */
import { featureFlagsService } from '../feature-flags.service.js';
import {
  callerCeiling,
  descriptorFromPath,
  evaluate,
  type Decision,
} from './policy.js';
import { authorizeGoogleBatch, parseGoogleBatch, type BatchDecision } from './batch.js';
import { selectScopesForRequest, selectScopesForBatch } from './scopes.js';
import { loadRelayAuthorization } from './store.js';

/** The feature flag gating the WHOLE enforcement path. OFF by default. */
export const RELAY_FEATURE_FLAG = 'api_relay';

export interface RelayCallerInput {
  /** Derived from the API key's actual permissions / the user's role — never
   *  hardcoded. Admin => full ceiling; otherwise `patterns` is the ceiling. */
  isAdmin: boolean;
  /** Relay match patterns representing a non-admin caller's maximum authority
   *  (e.g. an API key's issued permissions). Empty => the caller can reach
   *  nothing through the relay (narrow-never-widen). */
  patterns: string[];
}

/** What gets recorded to the audit trail for every enforced decision. */
export interface RelayAuditRecord {
  enforced: true;
  allowed: boolean;
  reason: string;
  matchedRuleId?: string;
  resource?: string;
  method?: string;
  batch?: {
    subCount: number;
    deniedIndex?: number;
    subReasons?: string[];
  };
}

export type RelayVerdict =
  | { mode: 'passthrough' }
  | { mode: 'deny'; reason: string; audit: RelayAuditRecord }
  | { mode: 'forward'; scopes: string[]; audit: RelayAuditRecord };

export interface RelayEnforcementInput {
  organizationId: string | undefined;
  /** Google API path with the /api/google/ prefix already stripped,
   *  e.g. 'admin/directory/v1/users/x@e.com'. */
  path: string;
  method: string;
  contentType?: string;
  /** The request body as express delivered it. Batch bodies must be a raw
   *  string (or Buffer) to be parseable; anything else is deny-on-unparseable. */
  body?: unknown;
  caller: RelayCallerInput;
  now?: number;
}

/** A request is a batch if Google's batch path or a multipart/mixed body. */
export function isBatchRequest(path: string, contentType?: string): boolean {
  const firstSegment = path.split('?')[0].split('/').filter(Boolean)[0];
  if (firstSegment && firstSegment.toLowerCase() === 'batch') return true;
  return typeof contentType === 'string' && contentType.toLowerCase().startsWith('multipart/mixed');
}

function extractBoundary(contentType?: string): string {
  if (!contentType) return '';
  const m = contentType.match(/boundary="?([^";]+)"?/i);
  return m ? m[1] : '';
}

function bodyAsString(body: unknown): string {
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  return '';
}

function denyVerdict(
  reason: string,
  extra: Partial<RelayAuditRecord> = {},
): RelayVerdict {
  return {
    mode: 'deny',
    reason,
    audit: { enforced: true, allowed: false, reason, ...extra },
  };
}

/**
 * Authorize one proxy request. See the module docblock for the contract.
 */
export async function enforceRelayAuthorization(
  input: RelayEnforcementInput,
): Promise<RelayVerdict> {
  // Dark launch: with the flag OFF the proxy behaves exactly as before.
  const flagOn = await featureFlagsService.isEnabled(RELAY_FEATURE_FLAG);
  if (!flagOn) {
    return { mode: 'passthrough' };
  }

  // From here on, deny-by-default applies.
  if (!input.organizationId) {
    return denyVerdict('default-deny');
  }

  const { config, ruleSet } = await loadRelayAuthorization(input.organizationId);
  const caller = callerCeiling(input.caller.isAdmin === true, input.caller.patterns);
  const now = input.now ?? Date.now();

  if (isBatchRequest(input.path, input.contentType)) {
    const boundary = extractBoundary(input.contentType);
    const body = bodyAsString(input.body);
    const batchDecision: BatchDecision = authorizeGoogleBatch(
      body,
      boundary,
      'google',
      ruleSet,
      config,
      now,
      caller,
    );
    const batchAudit = {
      subCount: batchDecision.subDecisions?.length ?? 0,
      deniedIndex: batchDecision.deniedIndex,
      subReasons: batchDecision.subDecisions?.map((s) => s.decision.reason),
    };
    if (!batchDecision.allow) {
      return denyVerdict(batchDecision.reason, { batch: batchAudit });
    }
    // Minimal scopes = union across sub-requests; any unmapped sub denies all.
    const subs = parseGoogleBatch(body, boundary).map((s) => ({
      resource: descriptorFromPath('google', s.path, s.method).resource,
      method: s.method,
    }));
    const scopes = selectScopesForBatch(subs);
    if (scopes === null) {
      return denyVerdict('no-scope-mapping', { batch: batchAudit });
    }
    return {
      mode: 'forward',
      scopes,
      audit: { enforced: true, allowed: true, reason: 'allow', batch: batchAudit },
    };
  }

  // Single request.
  const descriptor = descriptorFromPath('google', '/' + input.path, input.method);
  const decision: Decision = evaluate(descriptor, ruleSet, config, now, caller);
  const base = {
    resource: descriptor.resource,
    method: input.method.toUpperCase(),
    matchedRuleId: decision.matchedRuleId,
  };
  if (!decision.allow) {
    return denyVerdict(decision.reason, base);
  }
  const scopes = selectScopesForRequest(descriptor.resource, input.method);
  if (scopes.length === 0) {
    // Allowed by rules but we cannot mint a MINIMAL token for it — refuse
    // rather than fall back to broad scopes.
    return denyVerdict('no-scope-mapping', base);
  }
  return {
    mode: 'forward',
    scopes,
    audit: { enforced: true, allowed: true, reason: 'allow', ...base },
  };
}
