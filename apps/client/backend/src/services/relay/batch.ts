/**
 * API Relay Authorization — batch unwrapping.
 *
 * Google's batch API wraps N sub-requests in one multipart/mixed HTTP call.
 * Authorizing the OUTER call would authorize everything inside it, so a batch
 * could smuggle a DELETE past a per-call check. This module unwraps the batch
 * and authorizes each sub-request independently.
 *
 * Two hard rules from the spec:
 *   1. The batch is allowed only if EVERY sub-request is allowed.
 *   2. A batch we cannot parse is DENIED, never passed through.
 *
 * Pure and offline: string parsing + policy evaluation, no network. The
 * transport layer hands us the raw multipart body and the boundary; everything
 * here is unit-testable.
 */
import {
  evaluate,
  descriptorFromPath,
  type Cloud,
  type RuleSet,
  type RelayConfig,
  type CallerAuthority,
  type Decision,
} from './policy.js'

export interface BatchSubRequest {
  method: string
  path: string
}

export class BatchParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BatchParseError'
  }
}

/** A request line inside a batch part: `METHOD /path[ HTTP/1.1]`. The path must
 *  be absolute (start with `/`) so header lines can't be mistaken for it. */
const REQUEST_LINE = /^([A-Z]+)\s+(\/\S*)/

function findRequestLine(part: string): RegExpMatchArray | null {
  for (const raw of part.split('\n')) {
    const m = raw.trim().match(REQUEST_LINE)
    if (m) return m
  }
  return null
}

/**
 * Parse a Google multipart/mixed batch body into its sub-requests.
 * Throws BatchParseError on anything malformed — the caller must treat that as a
 * denial, not a pass-through.
 */
export function parseGoogleBatch(body: string, boundary: string): BatchSubRequest[] {
  if (!boundary) throw new BatchParseError('missing multipart boundary')
  if (!body) throw new BatchParseError('empty batch body')

  const segments = body
    .split(`--${boundary}`)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '--') // drop preamble/epilogue + closing marker

  if (segments.length === 0) throw new BatchParseError('batch contains no parts')

  const subs: BatchSubRequest[] = []
  for (const seg of segments) {
    const line = findRequestLine(seg)
    if (!line) throw new BatchParseError('batch part has no request line')
    subs.push({ method: line[1], path: line[2] })
  }
  if (subs.length === 0) throw new BatchParseError('batch has no sub-requests')
  return subs
}

export interface BatchDecision {
  allow: boolean
  reason: 'allow' | 'batch-unparseable' | 'batch-empty' | 'sub-denied'
  /** Per-sub decisions when the batch was parseable. */
  subDecisions?: Array<{ sub: BatchSubRequest; decision: Decision }>
  /** Index of the first denied sub-request, when reason is 'sub-denied'. */
  deniedIndex?: number
}

/**
 * Authorize an already-parsed list of batch sub-requests. Allowed only if every
 * sub-request is allowed; the first denial short-circuits the verdict but all
 * decisions are still reported for audit.
 */
export function evaluateBatch(
  cloud: Cloud,
  subRequests: BatchSubRequest[],
  ruleSet: RuleSet,
  config: RelayConfig,
  now: number = Date.now(),
  caller?: CallerAuthority,
): BatchDecision {
  if (subRequests.length === 0) {
    return { allow: false, reason: 'batch-empty' }
  }

  const subDecisions = subRequests.map((sub) => ({
    sub,
    decision: evaluate(descriptorFromPath(cloud, sub.path, sub.method), ruleSet, config, now, caller),
  }))

  const deniedIndex = subDecisions.findIndex((s) => !s.decision.allow)
  if (deniedIndex >= 0) {
    return { allow: false, reason: 'sub-denied', subDecisions, deniedIndex }
  }
  return { allow: true, reason: 'allow', subDecisions }
}

/**
 * Parse + authorize a raw Google batch body in one step. An unparseable body is
 * DENIED — never forwarded. This is the security boundary the transport must
 * call for any batch request.
 */
export function authorizeGoogleBatch(
  body: string,
  boundary: string,
  cloud: Cloud,
  ruleSet: RuleSet,
  config: RelayConfig,
  now: number = Date.now(),
  caller?: CallerAuthority,
): BatchDecision {
  let subs: BatchSubRequest[]
  try {
    subs = parseGoogleBatch(body, boundary)
  } catch {
    return { allow: false, reason: 'batch-unparseable' }
  }
  return evaluateBatch(cloud, subs, ruleSet, config, now, caller)
}
