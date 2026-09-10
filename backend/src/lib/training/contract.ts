/**
 * Training contract v1 — the FROZEN wire contract (Build Window 2026, Phase 02).
 *
 * Helios owns the *requirement* and its *status*. It does not own the content, the
 * player, or the score. Any provider — Aegis first, a third-party awareness vendor
 * later, or a human ticking a box — reports a completion here, and Helios decides
 * whether the requirement is satisfied.
 *
 * WHY THIS IS OUR OWN CONTRACT AND NOT A STANDARD (researched 2026-09-10, recorded in
 * north-star/BUILD-WINDOW-2026.md):
 *
 *   No security-awareness vendor an SMB would own speaks xAPI or LTI as an integration
 *   protocol. Every one of them is bespoke REST or GraphQL. Where "xAPI/SCORM" appears
 *   on a datasheet it is content *packaging* — a zip a player runs — not a statement
 *   stream, and implementing it would make Helios a content player, which is precisely
 *   the role this design refuses. Half-adopting xAPI is worse than not adopting it: the
 *   only conformance programme is for Learning Record Stores and tests 1,300+ MUST
 *   requirements, so an endpoint named `/statements` invites integrators to assume LRS
 *   semantics (GET filtering, `stored` ordering, voiding) and to file bugs when they are
 *   absent. And no standard models the thing that makes this a security product: WHY a
 *   requirement exists, when it is due, and when it is overdue.
 *
 *   So we borrow xAPI's VOCABULARY and decline its machinery. The verb IRIs and the
 *   result semantics below are the real ADL/xAPI ones, unchanged. A future xAPI
 *   forwarder is then "strip the `helios` block and forward", not a redesign.
 *
 * The closest working precedent is not an LMS. It is Vanta and Drata: compliance systems
 * that own a requirement and ingest completion as evidence over plain REST, idempotent on
 * a caller-supplied key. `toTrainingRecord()` at the bottom of this file is that shape.
 *
 * FROZEN here (expensive or impossible to change once an installation is in the field):
 *   - the three verb IRIs and the fact that the verb set is CLOSED
 *   - the `result` field names and their ranges
 *   - the actor identification forms (mbox / account) and their canonical strings
 *   - `Idempotency-Key` being REQUIRED, and what makes two calls "the same call"
 *   - the requirement reason and status vocabularies
 *   - the webhook event names, the signature scheme, and the signed payload
 *   - `spec_version` appearing in every payload we accept and every payload we send
 *
 * ITERABLE (deliberately NOT frozen): retry schedule, page sizes, which providers exist,
 * how a due date is chosen, the local content player, anything with a UI.
 *
 * Storage is open (text + jsonb) so adding a value here is a code change with zero DDL.
 * The MEANING of an existing value is frozen. Renaming or removing one is a deliberate,
 * noted decision in north-star/BUILD-WINDOW-2026.md, never a refactor.
 */

/**
 * Bumped only for a BREAKING change to the wire shape. Additive fields do not bump it.
 * Sent in every payload we emit and echoed in every payload we accept, so a receiver can
 * branch without sniffing.
 */
export const TRAINING_SPEC_VERSION = 1;

// ---------------------------------------------------------------------------
// Verbs — real xAPI/ADL IRIs, closed set
// ---------------------------------------------------------------------------

/**
 * The only three outcomes Helios can act on. These IRIs are ADL's, unchanged, so a
 * statement we store maps to an xAPI system by copying the field.
 *
 * Deliberately absent: `experienced`, `attempted`, `launched`, `progressed`. They are
 * real xAPI verbs and they are noise for a compliance record — a requirement is not
 * satisfied because someone opened a video. Accepting them would mean storing events we
 * would never read, and a closed set is the thing that keeps this table evidence rather
 * than telemetry.
 */
export const TRAINING_VERBS = {
  completed: 'http://adlnet.gov/expapi/verbs/completed',
  passed: 'http://adlnet.gov/expapi/verbs/passed',
  failed: 'http://adlnet.gov/expapi/verbs/failed',
} as const;

export type TrainingVerb = keyof typeof TRAINING_VERBS;
export const TRAINING_VERB_NAMES = Object.keys(TRAINING_VERBS) as TrainingVerb[];

/** IRI -> short name. Unknown IRI returns null; the caller rejects the statement. */
export function verbFromIri(iri: string): TrainingVerb | null {
  const match = TRAINING_VERB_NAMES.find((name) => TRAINING_VERBS[name] === iri);
  return match ?? null;
}

/**
 * Which verbs satisfy a requirement.
 *
 * `failed` is stored and never satisfies: a failed attempt is evidence that the person
 * engaged, and an auditor asking "did they do the training" needs to see it. It is also
 * the signal a future policy could use to escalate. `completed` counts because plenty of
 * content has no score at all — a policy acknowledgement, a video, a signed document.
 */
export const SATISFYING_VERBS: readonly TrainingVerb[] = ['completed', 'passed'] as const;

export function verbSatisfies(verb: TrainingVerb): boolean {
  return SATISFYING_VERBS.includes(verb);
}

// ---------------------------------------------------------------------------
// Actor identification
// ---------------------------------------------------------------------------

/**
 * How a provider names the person. xAPI's two usable inverse-functional identifiers.
 *
 *   mbox    — `mailto:` + email address. What almost every vendor has.
 *   account — a `{homePage, name}` pair, for providers whose user id is not an email.
 *
 * Excluded on purpose: `mbox_sha1sum` (we cannot resolve a hash to a Helios user, and
 * storing an unresolvable actor makes the record useless as evidence) and `openid`
 * (deprecated in practice, no vendor in this market emits it).
 */
export const ACTOR_TYPES = ['mbox', 'account'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/**
 * The canonical string stored in `training_completions.actor_identifier`.
 *
 * Lowercased because an email address's domain is case-insensitive and vendors are
 * inconsistent about the local part. Two providers naming the same person must produce
 * the same string, or matching a completion to a requirement silently fails — the exact
 * split-brain class this codebase keeps paying for.
 */
export function canonicalMbox(email: string): string {
  return `mailto:${email.trim().toLowerCase()}`;
}

export function canonicalAccount(homePage: string, name: string): string {
  return `${homePage.trim().replace(/\/+$/, '')}#${name.trim()}`;
}

/** Recover the email from a canonical mbox, for resolving the actor to a Helios user. */
export function emailFromMbox(identifier: string): string | null {
  if (!identifier.startsWith('mailto:')) return null;
  const email = identifier.slice('mailto:'.length);
  return email.includes('@') ? email : null;
}

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

/**
 * WHY the requirement exists. This is the field no learning standard has, and it is the
 * product: an auditor's question is never "did they watch it", it is "why was this person
 * required to, and did they do it in time".
 */
export const REQUIREMENT_REASONS = [
  'onboarding',    // new hire; typically created by the onboarding flow
  'policy',        // standing organisational policy
  'periodic',      // recurring refresh of a policy requirement
  'phish_failure', // a simulated phish was failed — pairs with the phishing bone's
                   // FAILURE_STAGES + 'human' verdict. Independent of it: this value is
                   // valid whether or not the phishing module is installed.
  'incident',      // assigned following a real security incident
  'manual',        // an admin assigned it, no automation involved
] as const;
export type RequirementReason = (typeof REQUIREMENT_REASONS)[number];

/**
 * Requirement lifecycle.
 *
 * `overdue` is DERIVED, never written by a caller: a requirement is overdue when it is
 * pending and its due date has passed. Storing it would mean correctness depended on a
 * sweeper having run, and a compliance record that is wrong until a cron fires is not a
 * compliance record. The sweeper exists only to emit the webhook.
 */
export const REQUIREMENT_STATUSES = [
  'pending',
  'satisfied',
  'overdue',
  'waived',
  'cancelled',
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

/** The stored statuses. `overdue` is computed from `pending` + `due_at`. */
export const STORED_REQUIREMENT_STATUSES: readonly RequirementStatus[] = [
  'pending',
  'satisfied',
  'waived',
  'cancelled',
] as const;

/**
 * The single definition of "is this person late". Mirrored exactly by the SQL function
 * `training_effective_status()` in migration 092 so the API and a direct query cannot
 * disagree.
 */
export function effectiveStatus(
  stored: RequirementStatus,
  dueAt: Date | string | null,
  now: Date = new Date(),
): RequirementStatus {
  if (stored !== 'pending') return stored;
  if (!dueAt) return 'pending';
  const due = dueAt instanceof Date ? dueAt : new Date(dueAt);
  return due.getTime() < now.getTime() ? 'overdue' : 'pending';
}

// ---------------------------------------------------------------------------
// Ingest payload
// ---------------------------------------------------------------------------

/**
 * The body of `POST /api/training/v1/completions`.
 *
 * An xAPI statement subset, plus a `helios` block that carries the two things xAPI has
 * no place for: which requirement this answers, and which provider is speaking.
 */
export interface CompletionStatement {
  spec_version?: number;
  actor: {
    mbox?: string;
    account?: { homePage: string; name: string };
  };
  verb: { id: string; display?: Record<string, string> };
  object: {
    id: string;
    definition?: { name?: Record<string, string>; description?: Record<string, string> };
  };
  result?: {
    completion?: boolean;
    success?: boolean;
    score?: { scaled?: number; raw?: number; min?: number; max?: number };
    duration?: string; // ISO 8601 duration
  };
  timestamp?: string;
  helios?: {
    requirement_id?: string;
    provider?: string;
  };
}

/** Maximum accepted clock skew for `timestamp`, in milliseconds. */
export const MAX_FUTURE_TIMESTAMP_MS = 5 * 60 * 1000;

/**
 * Parse an ISO 8601 duration to seconds. xAPI's `result.duration` is ISO 8601, and every
 * vendor that sends one sends a simple `PT#H#M#S`. Years and months are refused rather
 * than guessed — they have no fixed length, and a wrong guess here would silently
 * mis-state how long someone spent on required training.
 */
export function durationToSeconds(duration: string): number | null {
  const match = /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    duration.trim(),
  );
  if (!match) return null;
  const [, weeks, days, hours, minutes, seconds] = match;
  if (!weeks && !days && !hours && !minutes && !seconds) return null;
  const total =
    Number(weeks ?? 0) * 604800 +
    Number(days ?? 0) * 86400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0);
  return Math.round(total);
}

// ---------------------------------------------------------------------------
// Outbound webhooks
// ---------------------------------------------------------------------------

/**
 * Requirement lifecycle events. A receiver subscribes to names, not to a firehose.
 *
 * There is no `completion.received` event. A completion that does not change a
 * requirement's state is not news, and emitting one would tempt a receiver to treat our
 * webhook as an event bus rather than a status feed.
 */
export const WEBHOOK_EVENTS = [
  'training.requirement.created',
  'training.requirement.due_soon',
  'training.requirement.overdue',
  'training.requirement.satisfied',
  'training.requirement.waived',
  'training.requirement.cancelled',
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** How long before `due_at` the `due_soon` event fires. Iterable; the event name is not. */
export const DUE_SOON_LEAD_DAYS = 3;

/**
 * The signature header, Stripe's scheme: `t=<unix seconds>,v1=<hex hmac>`.
 *
 * Signed value is `${timestamp}.${rawBody}` — the timestamp is inside the MAC, so an
 * attacker cannot replay yesterday's body with today's timestamp. Receivers should
 * reject a timestamp outside a few minutes and compare in constant time.
 */
export const SIGNATURE_HEADER = 'x-helios-signature';
export const SIGNATURE_VERSION = 'v1';
export const EVENT_ID_HEADER = 'x-helios-event-id';
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export function signedPayload(timestampSeconds: number, rawBody: string): string {
  return `${timestampSeconds}.${rawBody}`;
}

export function formatSignatureHeader(timestampSeconds: number, hexMac: string): string {
  return `t=${timestampSeconds},${SIGNATURE_VERSION}=${hexMac}`;
}

export function parseSignatureHeader(
  header: string,
): { timestamp: number; signature: string } | null {
  const parts = header.split(',').map((p) => p.trim());
  let timestamp: number | null = null;
  let signature: string | null = null;
  for (const part of parts) {
    const [key, value] = part.split('=', 2);
    if (key === 't' && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === SIGNATURE_VERSION && value) signature = value;
  }
  if (timestamp === null || signature === null) return null;
  return { timestamp, signature };
}

/** The envelope every webhook body carries. `id` doubles as the receiver's dedupe key. */
export interface WebhookEnvelope {
  id: string;
  spec_version: number;
  event: WebhookEvent;
  occurred_at: string;
  organization_id: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Read projection
// ---------------------------------------------------------------------------

/**
 * The resource a compliance platform reads. Field names follow Vanta's `TrainingRecord`
 * so a Vanta or Drata connector is a projection rather than a translation — that product
 * is the one solving this exact evidence problem commercially today, and matching its
 * nouns costs nothing now and saves a mapping layer later.
 *
 * `uniqueId` is the requirement id: Vanta's upsert is idempotent on it, so re-sending a
 * record updates rather than duplicates.
 */
export interface TrainingRecord {
  uniqueId: string;
  displayName: string;
  personEmail: string;
  completionDate: string | null;
  dueDate: string | null;
  status: RequirementStatus;
  reason: RequirementReason;
  provider: string;
  score: number | null;
  specVersion: number;
}

export interface RequirementRow {
  id: string;
  title: string;
  primary_email: string;
  due_at: Date | string | null;
  satisfied_at: Date | string | null;
  status: RequirementStatus;
  reason: RequirementReason;
  provider: string;
  score_scaled: number | string | null;
}

export function toTrainingRecord(row: RequirementRow, now: Date = new Date()): TrainingRecord {
  const toIso = (value: Date | string | null): string | null => {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  };
  return {
    uniqueId: row.id,
    displayName: row.title,
    personEmail: row.primary_email,
    completionDate: toIso(row.satisfied_at),
    dueDate: toIso(row.due_at),
    status: effectiveStatus(row.status, row.due_at, now),
    reason: row.reason,
    provider: row.provider,
    score: row.score_scaled === null ? null : Number(row.score_scaled),
    specVersion: TRAINING_SPEC_VERSION,
  };
}

/**
 * The public description of what this contract is. Kept in code so the README, the
 * OpenAPI summary and any marketing copy quote one string rather than three drifting
 * paraphrases — and so nobody upgrades "maps cleanly to" into "supports xAPI".
 */
export const CONTRACT_STATEMENT =
  'Helios records training requirements and completions over a documented, versioned ' +
  'REST/webhook contract. It uses xAPI (IEEE 9274.1.1) verb identifiers and result ' +
  'semantics so records map cleanly to xAPI-based systems. Helios is not a Learning ' +
  'Record Store.';
