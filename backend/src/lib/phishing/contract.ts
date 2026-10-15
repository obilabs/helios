/**
 * Phishing bones — the FROZEN contract (Build Window 2026, Phase 02).
 *
 * This module is the single source of truth for the closed sets the schema stores as
 * `text` (migration 075) and for the versioned wire contracts. Storage is open (text +
 * jsonb) so adding a value here is a code change with zero DDL; the MEANING of every
 * existing value is frozen. Renaming or removing a value is a deliberate, noted decision
 * in north-star/BUILD-WINDOW-2026.md, never a refactor.
 *
 * Source: openspec/changes/add-phishing-reports-module/research/tracking-decision-v0.1.md
 * Spec:   openspec/changes/freeze-phishing-bones/specs/phishing-event-stream/spec.md
 *
 * Frozen (expensive/impossible to change after release):
 *   - token URL shape (h1_ opaque, path-based, per (campaign, recipient))
 *   - phish_event as append-only immutable evidence + its identity/type/timing columns
 *   - the semantics of the core event types and verdicts
 *   - the two Aegis event names, their schema_version, and the minimum required fields
 *   - credential-never-stored and no-PII-in-URLs
 *   - the derived-verdict + classifier_version indirection
 *
 * Iterable (deliberately NOT here): ASN/UA lists, timing thresholds, honeypot markup,
 * scoring, route names, difficulty taxonomy, training-topic mapping.
 */

// ---------------------------------------------------------------------------
// Closed sets stored as TEXT (app-level allowlists)
// ---------------------------------------------------------------------------

/** What happened. The endpoint decides the event type; the token decides the recipient. */
export const EVENT_TYPES = [
  'queued',      // campaign scheduled the injection
  'injected',    // users.messages.insert returned 2xx (authoritative "landed")
  'opened',      // tracking pixel hit — DECORATIVE, never a pass/fail or training trigger
  'clicked',     // lure link GET — PROVISIONAL until a classification says 'human'
  'page_viewed', // JS beacon on the landing page (second interaction)
  'submitted',   // landing form POST — the event only; field VALUES are never stored
  'reported',    // the positive signal: user reported it (real phish OR simulation)
  'honeypot',    // hidden decoy link hit — that client's scanner is active
  'errored',     // delivery/tracking error, recorded as evidence
] as const
export type EventType = (typeof EVENT_TYPES)[number]

/** Which surface produced the evidence. */
export const EVENT_SOURCES = [
  'gmail_api',    // injection / delivery path
  'pixel',        // open pixel
  'redirect',     // lure click endpoint
  'beacon',       // landing-page JS beacon
  'form',         // landing-page submit
  'user_report',  // Phish Check button / abuse mailbox / Gmail-native report
  'system',       // Helios itself (queued, errored)
] as const
export type EventSource = (typeof EVENT_SOURCES)[number]

/** Derived, versioned verdict on a single event. Only 'human' can fail a recipient. */
export const VERDICTS = [
  'human',
  'bot_scanner',
  'prefetch',
  'link_preview',
  'honeypot',
  'unknown',
] as const
export type Verdict = (typeof VERDICTS)[number]

/** The only verdict that may trigger training. Never 'opened', never provisional clicks. */
export const FAILING_VERDICT: Verdict = 'human'
/** The stages whose 'human' verdict counts as a failure (policy may narrow to 'submitted'). */
export const FAILURE_STAGES = ['clicked', 'submitted'] as const satisfies readonly EventType[]
export type FailureStage = (typeof FAILURE_STAGES)[number]

export const CAMPAIGN_KINDS = ['simulation'] as const
export const CAMPAIGN_STATUSES = ['draft', 'scheduled', 'running', 'closed', 'cancelled'] as const
export const DELIVERY_MODES = ['insert', 'import'] as const
export type DeliveryMode = (typeof DELIVERY_MODES)[number]

/** Triage disposition of a real report — the one mutable workflow state. */
export const DISPOSITIONS = ['unknown', 'clean', 'spam', 'threat', 'simulation'] as const
export type Disposition = (typeof DISPOSITIONS)[number]

/** How a real report reached Helios. */
export const INGEST_SOURCES = ['addon_post', 'abuse_mailbox', 'gmail_native', 'manual'] as const
export type IngestSource = (typeof INGEST_SOURCES)[number]

export const OUTBOX_STATUSES = ['pending', 'delivered', 'failed', 'abandoned'] as const

// ---------------------------------------------------------------------------
// Token (URL) contract — v1 opaque, path-based
// ---------------------------------------------------------------------------

/** Token format identifiers. 'h1' = opaque CSPRNG; 'h2' reserved for a future signed, DB-less token. */
export const TOKEN_FORMATS = ['h1', 'h2'] as const
export type TokenFormat = (typeof TOKEN_FORMATS)[number]
export const TOKEN_PREFIX_H1 = 'h1_'
/** 16 CSPRNG bytes → 26 chars of base32 (no padding). ~128 bits. */
export const TOKEN_H1_RANDOM_BYTES = 16
export const TOKEN_H1_BODY_LENGTH = 26
/** Lower-case RFC 4648 alphabet: URL-safe, case-insensitive on parse. */
export const TOKEN_BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

/**
 * Route shapes. The token is ALWAYS in the path, NEVER a query parameter (no PII in query
 * strings; query strings are mangled/inspected by scanners). Route PREFIXES are org-configurable
 * (anti-fingerprinting); the position of the token within them is frozen.
 */
export const TRACKING_ROUTES = {
  click: '/c/:token{/:link_slug}',
  beacon: '/c/:token/seen',
  submit: '/c/:token',        // POST — body dropped before any write
  open: '/o/:token.gif',
  report: '/r/:token',
} as const

// ---------------------------------------------------------------------------
// Helios → Aegis wire contract — v1, additive-only
// ---------------------------------------------------------------------------

export const AEGIS_CONTRACT_SCHEMA_VERSION = 1 as const

export const AEGIS_CONTRACT_TYPES = [
  'phishing.recipient.failed',
  'phishing.recipient.failure_retracted',
] as const
export type AegisContractType = (typeof AEGIS_CONTRACT_TYPES)[number]

/** Emitted only when a `clicked`/`submitted` event's LATEST verdict is `human`. */
export interface PhishingRecipientFailedV1 {
  schema_version: 1
  /** Idempotency / dedupe key. Aegis must treat a repeat as a no-op. */
  event_id: string
  type: 'phishing.recipient.failed'
  org_id: string
  occurred_at: string // ISO-8601, ms precision
  recipient: { user_ref: string; email: string }
  campaign: { id: string; name: string; difficulty: string | null }
  failure: { stage: FailureStage; is_automated: false }
  classifier_version: string
  classified_at: string
  /** Helios suggests; Aegis decides the module. module_ref is null until Aegis maps it. */
  recommended_training: { topic: string; module_ref: string | null }
}

/** Verdicts are re-runnable, so a late-caught false positive MUST be walk-back-able. */
export interface PhishingRecipientFailureRetractedV1 {
  schema_version: 1
  /** A NEW id for the retraction itself. */
  event_id: string
  type: 'phishing.recipient.failure_retracted'
  org_id: string
  /** The original `phishing.recipient.failed` event_id. */
  retracts_event_id: string
  reason: string
  classifier_version: string
  occurred_at: string
}

export type AegisPhishingEventV1 = PhishingRecipientFailedV1 | PhishingRecipientFailureRetractedV1

/**
 * Minimum required top-level fields per contract type. FROZEN for v1: a field may be added
 * to the payload, never removed from this list. The contract test pins this literal.
 */
export const AEGIS_CONTRACT_REQUIRED_FIELDS: Readonly<Record<AegisContractType, readonly string[]>> = {
  'phishing.recipient.failed': [
    'schema_version', 'event_id', 'type', 'org_id', 'occurred_at',
    'recipient', 'campaign', 'failure', 'classifier_version', 'classified_at',
    'recommended_training',
  ],
  'phishing.recipient.failure_retracted': [
    'schema_version', 'event_id', 'type', 'org_id', 'retracts_event_id',
    'reason', 'classifier_version', 'occurred_at',
  ],
}

// ---------------------------------------------------------------------------
// Row schema versions (what `schema_ver` columns mean today)
// ---------------------------------------------------------------------------
export const ROW_SCHEMA_VERSION = {
  phish_campaign: 1,
  phish_campaign_recipient: 1,
  phish_report: 1,
  phish_event: 1,
} as const

// ---------------------------------------------------------------------------
// Privacy invariants (enforced by evidence.ts + tests)
// ---------------------------------------------------------------------------
/** Durable IP is truncated to these prefixes; the full IP lives only in request_meta under TTL. */
export const IP_TRUNCATION = { v4PrefixBits: 24, v6PrefixBits: 48 } as const
/** Names under which a full IP may be kept in request_meta (retention job redacts these keys). */
export const REQUEST_META_TTL_KEYS = ['ip_full'] as const

export function isEventType(v: string): v is EventType {
  return (EVENT_TYPES as readonly string[]).includes(v)
}
export function isVerdict(v: string): v is Verdict {
  return (VERDICTS as readonly string[]).includes(v)
}
export function isAegisContractType(v: string): v is AegisContractType {
  return (AEGIS_CONTRACT_TYPES as readonly string[]).includes(v)
}
