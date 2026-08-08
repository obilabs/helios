/**
 * API Relay Authorization — policy engine (pure, offline-testable).
 *
 * Implements the core of the OpenSpec change
 * `secure-api-relay-authorization`: deny-by-default evaluation with
 * deny-beats-allow precedence and a read / write / delete asymmetry.
 *
 * This is a PURE FUNCTION over a request descriptor + a rule set + config.
 * No network, no database, no cloud calls — which is exactly why it can be
 * exhaustively unit-tested with no Google/Microsoft access. The transport
 * (token minting, forwarding) sits on top of it and is tested separately with
 * recorded fixtures.
 *
 * NOT YET implemented here (compose on top of evaluate() in later phases — see
 * the spec's tasks.md):
 *   - OAuth-scope + caller-role/API-key CEILINGS (evaluate() decides the rule
 *     verdict; the ceiling intersect happens around it)
 *   - Batch unwrapping (authorize each sub-request, deny-on-unparseable)
 *   - Impersonation SUBJECT constraints (descriptor.subject is carried but not
 *     yet evaluated)
 *   - The discovery classifier (valid-endpoint -> queue; garbage -> anomaly)
 */

export type Cloud = 'google' | 'microsoft'

export interface RelayDescriptor {
  cloud: Cloud
  /** Dotted resource path, e.g. 'admin.directory.users' (mirrors the extraction
   *  already done in transparent-proxy.ts). */
  resource: string
  /** HTTP method. Case-insensitive; normalized internally. */
  method: string
  /** The impersonated / acted-upon subject (email or id), if any. */
  subject?: string
  /** Whether that subject is privileged (e.g. a super-admin). Resolved by the
   *  transport before evaluation — the pure engine trusts what it's told. When
   *  true, a rule must EXPLICITLY permit privileged subjects or the request is
   *  denied. */
  subjectPrivileged?: boolean
  /** The subject's organizational unit, if known. Only consulted when a matched
   *  rule scopes to specific OUs. */
  subjectOrgUnit?: string
}

export type MethodClass = 'read' | 'write' | 'delete'

/**
 * Classify an HTTP method. Unknown/exotic methods are treated as `write` — the
 * stricter gate — never as a read, so an unexpected method can't slip through
 * the read path.
 */
export function classifyMethod(method: string): MethodClass {
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'read'
    case 'DELETE':
      return 'delete'
    default:
      return 'write' // POST/PUT/PATCH and anything unrecognized
  }
}

/**
 * Build a descriptor from a raw API path, mirroring the extraction already done
 * in transparent-proxy.ts: drop version segments (`v1`, `v2`…), take the first
 * three remaining segments joined with `.` as the dotted resource. e.g.
 * `/admin/directory/v1/users/x@e.com` → resource `admin.directory.users`.
 */
export function descriptorFromPath(cloud: Cloud, path: string, method: string): RelayDescriptor {
  const parts = path.split('/').filter((p) => p && !/^v\d+$/i.test(p))
  return { cloud, resource: parts.slice(0, 3).join('.'), method }
}

export interface Rule {
  effect: 'allow' | 'deny'
  /** Match pattern `resource:METHOD`. Wildcards: `a.b.*:GET`, `a.b.c:*`, or `*`. */
  match: string
  /** Optional expiry (epoch ms). An expired rule does not match. */
  expiresAt?: number
  /** Optional constraint on the subject acted upon. Absent = the rule does NOT
   *  authorize acting on a privileged subject, and applies no OU scoping. */
  subject?: {
    /** Opt in to acting on privileged (e.g. super-admin) subjects. Default: no. */
    allowPrivileged?: boolean
    /** If set, the subject's OU must be one of these; unknown OU is denied. */
    orgUnits?: string[]
  }
  /** Optional id for audit/provenance. */
  id?: string
}

export interface RuleSet {
  /** Absolute, organization-wide denies. The kill switch — beats any allow. */
  orgDenies: Rule[]
  /** Union of the caller's groups' allow rules. */
  groupAllows: Rule[]
}

export interface RelayConfig {
  /** Feature flag: is the relay enabled for this organization at all? */
  relayEnabled: boolean
  /** Separate toggle: are write/delete operations permitted at all? Enabling
   *  the relay does NOT enable writes. */
  writesEnabled: boolean
}

export interface Decision {
  allow: boolean
  /** Machine-readable reason; never parse it into behavior beyond logging. */
  reason:
    | 'allow'
    | 'relay-disabled'
    | 'org-deny'
    | 'writes-disabled'
    | 'ceiling-exceeded'
    | 'default-deny'
    | 'delete-requires-explicit-rule'
    | 'privileged-subject-requires-explicit-rule'
    | 'subject-out-of-scope'
  matchedRuleId?: string
}

/**
 * The caller's maximum authority, derived from their Helios role / API-key
 * permissions. A request must fall within this IN ADDITION to matching a
 * configured org allow rule. The relay can only ever NARROW authority — a
 * configured rule can never grant a caller more than their own ceiling.
 *
 * This is the pure-policy half of the two ceilings in the spec. The other half
 * (minting an OAuth token scoped to only what the matched capability needs) is
 * transport-side.
 */
export interface CallerAuthority {
  /** Match patterns representing the caller's max authority. `['*']` = admin
   *  (full capacity, including delete capacity). */
  ceiling: string[]
}

/**
 * Build a caller ceiling from the API-key admin flag — mirrors the isAdmin
 * derivation already applied in transparent-proxy.ts (a key carries only the
 * authority it was issued). Admin ⇒ full capacity; otherwise the given patterns.
 */
export function callerCeiling(isAdmin: boolean, patterns: string[] = []): CallerAuthority {
  return { ceiling: isAdmin ? ['*'] : patterns }
}

/** Split a `resource:method` key. A bare `*` yields ['*', undefined]. */
function splitKey(key: string): [string, string | undefined] {
  if (key === '*') return ['*', undefined]
  const idx = key.lastIndexOf(':')
  if (idx === -1) return [key, undefined]
  return [key.slice(0, idx), key.slice(idx + 1)]
}

function resourceMatches(pattern: string, resource: string): boolean {
  if (pattern === '*') return true
  if (pattern === resource) return true
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -2) // drop the trailing '.*'
    return resource === prefix || resource.startsWith(prefix + '.')
  }
  return false
}

function ruleActive(rule: Rule, now: number): boolean {
  return rule.expiresAt === undefined || rule.expiresAt > now
}

function patternMatches(pattern: string, resource: string, method: string): boolean {
  if (pattern === '*') return true
  const [pRes, pMethodRaw] = splitKey(pattern)
  const pMethod = (pMethodRaw ?? '*').toUpperCase()
  if (pMethod !== '*' && pMethod !== method) return false
  return resourceMatches(pRes, resource)
}

/**
 * Evaluate a relay request against the rule set and config. Deny-by-default.
 *
 * `now` is injectable for deterministic testing of rule expiry.
 */
export function evaluate(
  descriptor: RelayDescriptor,
  ruleSet: RuleSet,
  config: RelayConfig,
  now: number = Date.now(),
  caller?: CallerAuthority,
): Decision {
  if (!config.relayEnabled) {
    return { allow: false, reason: 'relay-disabled' }
  }

  const resource = descriptor.resource
  const method = descriptor.method.toUpperCase()
  const cls = classifyMethod(method)

  // 1. Organization denies are absolute and beat any allow.
  const deny = ruleSet.orgDenies.find(
    (r) => r.effect === 'deny' && ruleActive(r, now) && patternMatches(r.match, resource, method),
  )
  if (deny) {
    return { allow: false, reason: 'org-deny', matchedRuleId: deny.id }
  }

  // 2. Writes and deletes require the separate writes toggle, regardless of rules.
  if ((cls === 'write' || cls === 'delete') && !config.writesEnabled) {
    return { allow: false, reason: 'writes-disabled' }
  }

  // 3. Caller ceiling: the request must fall within the caller's own maximum
  //    authority. The relay narrows, never widens — a configured org allow can
  //    never grant more than the caller's role/API-key permits. (Skipped when no
  //    caller authority is supplied.)
  if (caller && !caller.ceiling.some((p) => patternMatches(p, resource, method))) {
    return { allow: false, reason: 'ceiling-exceeded' }
  }

  // 4. Need a matching, active allow rule. Empty rule set => default deny.
  const allow = ruleSet.groupAllows.find(
    (r) => r.effect === 'allow' && ruleActive(r, now) && patternMatches(r.match, resource, method),
  )
  if (!allow) {
    return { allow: false, reason: 'default-deny' }
  }

  // 5. Deletes need an EXPLICIT delete rule. A wildcard-method allow (or `*`)
  //    grants reads/writes but never a delete — the strongest gate.
  if (cls === 'delete') {
    const [, pMethod] = splitKey(allow.match)
    if ((pMethod ?? '*').toUpperCase() !== 'DELETE') {
      return { allow: false, reason: 'delete-requires-explicit-rule' }
    }
  }

  // 6. Subject constraints (impersonation target). With domain-wide delegation the
  //    subject is a parameter, not the path, so `users:GET` on a super-admin looks
  //    identical to any user read. A resource grant must NOT implicitly authorize
  //    acting on a privileged subject — the rule has to opt in.
  if (descriptor.subjectPrivileged === true && !allow.subject?.allowPrivileged) {
    return { allow: false, reason: 'privileged-subject-requires-explicit-rule' }
  }
  //    If the rule scopes to specific OUs, the subject must be in one of them.
  //    An unknown OU under an OU-scoped rule is denied (can't confirm in-scope).
  if (allow.subject?.orgUnits) {
    if (
      descriptor.subjectOrgUnit === undefined ||
      !allow.subject.orgUnits.includes(descriptor.subjectOrgUnit)
    ) {
      return { allow: false, reason: 'subject-out-of-scope' }
    }
  }

  return { allow: true, reason: 'allow', matchedRuleId: allow.id }
}
