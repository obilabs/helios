/**
 * API Relay Authorization — discovery classifier (pure, offline-testable).
 *
 * A denied call is NOT automatically a "please enable this" suggestion. If it
 * were, any caller with a valid session could flood the admin's review queue by
 * guessing endpoints, and the real attack signal (probing) would be buried under
 * noise. So the denial log feeds a classifier, and validity + reason are the fork:
 *
 *   - Denied call to a VALID (known-to-the-catalogue) endpoint, because no rule
 *     enables it yet → a promotable **library hint** ("enable Groups → Delete?").
 *   - Denied call to a NONEXISTENT endpoint, or a caller probing many of them →
 *     an **anomaly** (security signal, never promotable).
 *   - Deliberate denials (org kill switch), caller-authority (ceiling), and
 *     subject constraints are neither — enabling an endpoint wouldn't change them.
 *
 * Pure functions over denial events. The catalogue lookup (is this endpoint real?)
 * is resolved by the caller and passed in as `known` — see design §8 and §4b.
 */

/** One denied relay call, as recorded for discovery. */
export interface DenialEvent {
  /** Dotted resource, e.g. 'admin.directory.users'. */
  resource: string
  method: string
  /** Who was denied — for attribution and probing detection. */
  callerId: string
  timestamp: number
  /** Resolved from the endpoint catalogue: is this a real endpoint? */
  known: boolean
  /** The Decision.reason from evaluate(). */
  reason: string
}

export type DenialClass = 'library-hint' | 'anomaly' | 'ignore'

/**
 * Denial reasons that mean "a real endpoint/action simply isn't enabled yet" —
 * the only reasons that become a promotable library hint. delete-requires-explicit
 * -rule maps to "enable the Delete action for this entry."
 */
const HINT_REASONS = new Set(['default-deny', 'delete-requires-explicit-rule'])

/** Classify a single denial. */
export function classifyDenial(event: DenialEvent): DenialClass {
  // Unknown endpoint → anomaly, never promotable (garbage / probing).
  if (!event.known) return 'anomaly'
  // Known endpoint denied only because nothing enables it → promotable hint.
  if (HINT_REASONS.has(event.reason)) return 'library-hint'
  // org-deny (deliberate), ceiling-exceeded (caller authority), writes-disabled
  // (global toggle), subject constraints — enabling an endpoint wouldn't help.
  return 'ignore'
}

/** A promotable suggestion pointing INTO the endpoint library. The (resource,
 *  method) pair is the pointer: the library entry is the resource, the action is
 *  the method. */
export interface LibraryHint {
  resource: string
  method: string
  count: number
  /** Distinct callers who reached for it. */
  callers: string[]
}

export interface Anomaly {
  kind: 'unknown-endpoint' | 'probing'
  /** Set for unknown-endpoint. */
  resource?: string
  method?: string
  /** Set for probing. */
  callerId?: string
  /** Hit count (unknown-endpoint) or distinct-endpoint count (probing). */
  count: number
  detail: string
}

export interface DiscoverySummary {
  hints: LibraryHint[]
  anomalies: Anomaly[]
}

export interface SummarizeOptions {
  /** A caller hitting at least this many DISTINCT nonexistent endpoints is flagged
   *  as probing. Default 5. */
  probingDistinctEndpointThreshold?: number
}

function keyOf(resource: string, method: string): string {
  return `${resource}:${method.toUpperCase()}`
}

/**
 * Aggregate a batch of denial events into promotable hints and anomalies.
 * Deduplicates hints by (resource, method) with a count and distinct callers;
 * garbage never enters the hint queue; a caller probing many nonexistent
 * endpoints is flagged.
 */
export function summarizeDenials(
  events: DenialEvent[],
  opts: SummarizeOptions = {},
): DiscoverySummary {
  const probingThreshold = opts.probingDistinctEndpointThreshold ?? 5

  const hintMap = new Map<string, LibraryHint>()
  const unknownAgg = new Map<string, { resource: string; method: string; count: number }>()
  const unknownByCaller = new Map<string, Set<string>>()

  for (const e of events) {
    const cls = classifyDenial(e)
    const method = e.method.toUpperCase()
    const key = keyOf(e.resource, method)

    if (cls === 'library-hint') {
      const h = hintMap.get(key) ?? { resource: e.resource, method, count: 0, callers: [] }
      h.count++
      if (!h.callers.includes(e.callerId)) h.callers.push(e.callerId)
      hintMap.set(key, h)
    } else if (cls === 'anomaly') {
      const agg = unknownAgg.get(key) ?? { resource: e.resource, method, count: 0 }
      agg.count++
      unknownAgg.set(key, agg)
      const set = unknownByCaller.get(e.callerId) ?? new Set<string>()
      set.add(key)
      unknownByCaller.set(e.callerId, set)
    }
    // 'ignore' contributes to neither.
  }

  const hints = [...hintMap.values()].sort((a, b) => b.count - a.count)

  const anomalies: Anomaly[] = []
  for (const agg of unknownAgg.values()) {
    anomalies.push({
      kind: 'unknown-endpoint',
      resource: agg.resource,
      method: agg.method,
      count: agg.count,
      detail: `denied call to nonexistent endpoint ${keyOf(agg.resource, agg.method)}`,
    })
  }
  for (const [callerId, set] of unknownByCaller) {
    if (set.size >= probingThreshold) {
      anomalies.push({
        kind: 'probing',
        callerId,
        count: set.size,
        detail: `caller ${callerId} probed ${set.size} distinct nonexistent endpoints`,
      })
    }
  }

  return { hints, anomalies }
}

/**
 * Catalogue self-heal (design §4b): repeated hits to the SAME unknown endpoint
 * are the signal that a real endpoint may have been added but our catalogue is
 * stale — worth an on-demand refresh. This distinguishes a real new endpoint
 * (repeated, same endpoint) from scattered garbage (many different endpoints).
 *
 * Returns the `resource:METHOD` keys that have crossed `minHits`. The actual
 * (debounced) refresh + re-classification is a transport/stateful concern.
 */
export function endpointsNeedingRefresh(events: DenialEvent[], minHits = 3): string[] {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.known) continue
    const key = keyOf(e.resource, e.method)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].filter(([, c]) => c >= minHits).map(([k]) => k)
}
