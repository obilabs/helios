/**
 * Phishing bones — contract tests (Build Window 2026, Phase 02).
 *
 * These pin the FROZEN surfaces of the phishing event stream so that a change to any of them
 * fails CI and has to be a deliberate, recorded decision (north-star/BUILD-WINDOW-2026.md):
 *   - the h1 token URL shape and the hash-only persistence rule
 *   - the closed sets stored as text (a value may be added, never renamed or removed)
 *   - the two Aegis wire events, their schema_version and minimum field set
 *   - credential values are NEVER stored (the security invariant enforced by a failing test)
 *   - IP minimisation for the durable column
 */
import { createHash } from 'crypto'
import {
  EVENT_TYPES, EVENT_SOURCES, VERDICTS, FAILING_VERDICT, FAILURE_STAGES,
  DISPOSITIONS, INGEST_SOURCES, DELIVERY_MODES, CAMPAIGN_STATUSES, OUTBOX_STATUSES,
  TOKEN_PREFIX_H1, TOKEN_H1_BODY_LENGTH, TRACKING_ROUTES,
  AEGIS_CONTRACT_SCHEMA_VERSION, AEGIS_CONTRACT_TYPES, AEGIS_CONTRACT_REQUIRED_FIELDS,
  REQUEST_META_TTL_KEYS,
  type PhishingRecipientFailedV1, type PhishingRecipientFailureRetractedV1,
} from '../lib/phishing/contract.js'
import { mintToken, hashToken, parseToken, base32NoPad } from '../lib/phishing/token.js'
import { buildRequestEvidence, buildSubmitEvidence, truncateIp } from '../lib/phishing/evidence.js'

// ---------------------------------------------------------------------------
// Frozen closed sets. A deliberate change to a set is a deliberate change to this literal.
// Values may be APPENDED; existing values must keep their position and meaning.
// ---------------------------------------------------------------------------
describe('frozen closed sets (text + app allowlist)', () => {
  it('event types', () => {
    expect(EVENT_TYPES).toEqual([
      'queued', 'injected', 'opened', 'clicked', 'page_viewed', 'submitted', 'reported', 'honeypot', 'errored',
    ])
  })
  it('event sources', () => {
    expect(EVENT_SOURCES).toEqual(['gmail_api', 'pixel', 'redirect', 'beacon', 'form', 'user_report', 'system'])
  })
  it('verdicts, and only human can fail a recipient', () => {
    expect(VERDICTS).toEqual(['human', 'bot_scanner', 'prefetch', 'link_preview', 'honeypot', 'unknown'])
    expect(FAILING_VERDICT).toBe('human')
    expect(FAILURE_STAGES).toEqual(['clicked', 'submitted'])
    // 'opened' is decorative: it must never be a failure stage.
    expect(FAILURE_STAGES as readonly string[]).not.toContain('opened')
  })
  it('workflow sets', () => {
    expect(DISPOSITIONS).toEqual(['unknown', 'clean', 'spam', 'threat', 'simulation'])
    expect(INGEST_SOURCES).toEqual(['addon_post', 'abuse_mailbox', 'gmail_native', 'manual'])
    expect(DELIVERY_MODES).toEqual(['insert', 'import'])
    expect(CAMPAIGN_STATUSES).toEqual(['draft', 'scheduled', 'running', 'closed', 'cancelled'])
    expect(OUTBOX_STATUSES).toEqual(['pending', 'delivered', 'failed', 'abandoned'])
  })
})

// ---------------------------------------------------------------------------
// Token URL contract (h1)
// ---------------------------------------------------------------------------
describe('h1 token', () => {
  it('is h1_ + 26 lower-case base32 chars (16 CSPRNG bytes, no padding)', () => {
    const { token, tokenHash, format } = mintToken()
    expect(format).toBe('h1')
    expect(token.startsWith(TOKEN_PREFIX_H1)).toBe(true)
    expect(token).toMatch(/^h1_[a-z2-7]{26}$/)
    expect(token.length).toBe(TOKEN_PREFIX_H1.length + TOKEN_H1_BODY_LENGTH)
    expect(tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
  })
  it('two mints never collide and hashes differ', () => {
    const a = mintToken(); const b = mintToken()
    expect(a.token).not.toBe(b.token)
    expect(a.tokenHash).not.toBe(b.tokenHash)
  })
  it('base32 encodes 16 bytes to exactly 26 chars', () => {
    expect(base32NoPad(new Uint8Array(16))).toBe('a'.repeat(26))
    // 128 bits = 25 full 5-bit groups + 3 trailing bits (111 << 2 = 28 → '4')
    expect(base32NoPad(new Uint8Array(16).fill(0xff))).toBe('7'.repeat(25) + '4')
  })
  it('parses case-insensitively and rejects anything else uniformly', () => {
    const { token } = mintToken()
    expect(parseToken(token)?.token).toBe(token)
    expect(parseToken(token.toUpperCase().replace('H1_', 'h1_'))?.token).toBe(token)
    expect(hashToken(token.toUpperCase().replace('H1_', 'h1_'))).toBe(hashToken(token))
    for (const bad of ['', 'h1_', 'h1_abc', token + 'x', 'h2_' + token.slice(3), '?rid=' + token, token.replace('h1_', 'h9_')]) {
      expect(parseToken(bad)).toBeNull()
    }
  })
  it('routes carry the token in the PATH, never a query parameter', () => {
    for (const route of Object.values(TRACKING_ROUTES)) {
      expect(route).toContain('/:token')
      expect(route).not.toContain('?')
    }
  })
})

// ---------------------------------------------------------------------------
// Aegis wire contract v1 — additive-only
// ---------------------------------------------------------------------------
describe('Helios → Aegis wire contract v1', () => {
  it('schema_version 1, two event types, frozen minimum field sets', () => {
    expect(AEGIS_CONTRACT_SCHEMA_VERSION).toBe(1)
    expect(AEGIS_CONTRACT_TYPES).toEqual(['phishing.recipient.failed', 'phishing.recipient.failure_retracted'])
    expect(AEGIS_CONTRACT_REQUIRED_FIELDS).toEqual({
      'phishing.recipient.failed': [
        'schema_version', 'event_id', 'type', 'org_id', 'occurred_at',
        'recipient', 'campaign', 'failure', 'classifier_version', 'classified_at', 'recommended_training',
      ],
      'phishing.recipient.failure_retracted': [
        'schema_version', 'event_id', 'type', 'org_id', 'retracts_event_id',
        'reason', 'classifier_version', 'occurred_at',
      ],
    })
  })
  it('the golden v1 payloads satisfy their own required-field lists (and compile)', () => {
    const failed: PhishingRecipientFailedV1 = {
      schema_version: 1,
      event_id: '2f2a6d0e-4b0a-4d2e-9a1c-8f6f2a0c9e11',
      type: 'phishing.recipient.failed',
      org_id: '9a0e0b7b-1c9d-4a4e-8b7e-2d3f4a5b6c7d',
      occurred_at: '2026-09-04T15:04:05.123Z',
      recipient: { user_ref: 'ou-3f1c', email: 'jane@example.org' },
      campaign: { id: 'c2c1', name: 'Q4 baseline', difficulty: 'medium' },
      failure: { stage: 'clicked', is_automated: false },
      classifier_version: 'clf-2026.09',
      classified_at: '2026-09-04T15:06:00.000Z',
      recommended_training: { topic: 'credential-phishing', module_ref: null },
    }
    const retracted: PhishingRecipientFailureRetractedV1 = {
      schema_version: 1,
      event_id: '6c2b0d1e-7a8f-4c3d-9e2f-1a2b3c4d5e6f',
      type: 'phishing.recipient.failure_retracted',
      org_id: failed.org_id,
      retracts_event_id: failed.event_id,
      reason: 'reclassified_bot_scanner',
      classifier_version: 'clf-2026.10',
      occurred_at: '2026-09-05T09:00:00.000Z',
    }
    for (const f of AEGIS_CONTRACT_REQUIRED_FIELDS['phishing.recipient.failed']) expect(failed).toHaveProperty(f)
    for (const f of AEGIS_CONTRACT_REQUIRED_FIELDS['phishing.recipient.failure_retracted']) expect(retracted).toHaveProperty(f)
    // A failure is never emitted for an automated interaction.
    expect(failed.failure.is_automated).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// THE security invariant: submitted credential values are never stored.
// ---------------------------------------------------------------------------
describe('credential-never-stored invariant', () => {
  const req = {
    ip: '198.51.100.23',
    userAgent: 'Mozilla/5.0',
    headers: { 'sec-fetch-user': '?1', 'sec-fetch-mode': 'navigate', referer: 'https://mail.google.com/' },
  }
  it('a landing-form submit records field names and lengths, never values', () => {
    const body = { username: 'jane@example.org', password: 'hunter2', otp: '123456', remember: 'on' }
    const ev = buildSubmitEvidence(req, body)
    const serialized = JSON.stringify(ev)
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('123456')
    expect(serialized).not.toContain('jane@example.org')
    expect(ev.event_type).toBe('submitted')
    expect(ev.source).toBe('form')
    expect(ev.request_meta.form_fields).toEqual({
      username: { populated: true, length: 16 },
      password: { populated: true, length: 7 },
      otp: { populated: true, length: 6 },
      remember: { populated: true, length: 2 },
    })
  })
  it('an empty or missing body still produces a submitted event', () => {
    expect(buildSubmitEvidence(req, null).request_meta.form_fields).toEqual({})
    expect(buildSubmitEvidence(req, { password: '' }).request_meta.form_fields).toEqual({
      password: { populated: false, length: 0 },
    })
  })
})

// ---------------------------------------------------------------------------
// IP minimisation
// ---------------------------------------------------------------------------
describe('IP minimisation', () => {
  it('durable column is /24 (v4) or /48 (v6); full IP only under a TTL key', () => {
    expect(truncateIp('203.0.113.77')).toBe('203.0.113.0/24')
    expect(truncateIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:0db8:85a3::/48')
    expect(truncateIp('::1')).toBe('0000:0000:0000::/48')
    expect(truncateIp('not-an-ip')).toBeNull()
    expect(truncateIp('')).toBeNull()
    const ev = buildRequestEvidence('clicked', 'redirect', { ip: '203.0.113.77', userAgent: 'UA', headers: {} }, { linkSlug: 'cta' })
    expect(ev.request_ip_trunc).toBe('203.0.113.0/24')
    expect(ev.request_meta.ip_full).toBe('203.0.113.77')
    expect(REQUEST_META_TTL_KEYS).toContain('ip_full')
    expect(ev.link_slug).toBe('cta')
  })
  it('keeps only the classifier headers, with sec-fetch-user preserved', () => {
    const ev = buildRequestEvidence('clicked', 'redirect', {
      ip: null,
      headers: { 'sec-fetch-user': '?1', cookie: 'session=secret', authorization: 'Bearer x', via: '1.1 proxy' },
    })
    expect(ev.request_meta).toEqual({ h_sec_fetch_user: '?1', h_via: '1.1 proxy' })
    expect(ev.request_ip_trunc).toBeNull()
  })
})
