/**
 * Training contract v1 — the freeze test.
 *
 * This file exists to make a promise enforceable. Once an installation is in the field,
 * a vendor's connector is written against these exact strings; changing one silently is
 * indistinguishable from breaking every integration at once, and nothing would fail
 * until a customer's completions stopped landing.
 *
 * So the frozen surface is pinned here by value. A change that trips these assertions is
 * not necessarily wrong — but it must be a deliberate, noted decision in
 * north-star/BUILD-WINDOW-2026.md, and updating this file is how you record having made
 * it. Do not adjust an expectation to make CI green.
 */
import { describe, it, expect } from '@jest/globals';
import crypto from 'crypto';
import {
  ACTOR_TYPES,
  DUE_SOON_LEAD_DAYS,
  REQUIREMENT_REASONS,
  REQUIREMENT_STATUSES,
  SATISFYING_VERBS,
  SIGNATURE_HEADER,
  STORED_REQUIREMENT_STATUSES,
  TRAINING_SPEC_VERSION,
  TRAINING_VERBS,
  WEBHOOK_EVENTS,
  canonicalAccount,
  canonicalMbox,
  durationToSeconds,
  effectiveStatus,
  emailFromMbox,
  formatSignatureHeader,
  parseSignatureHeader,
  toTrainingRecord,
  verbFromIri,
  verbSatisfies,
} from '../lib/training/contract.js';
import { parseCompletionStatement, StatementError } from '../lib/training/statement.js';
import { signWebhook, verifyWebhook, generateWebhookSecret } from '../lib/training/webhook.js';

describe('the frozen vocabulary', () => {
  it('pins the three verb IRIs exactly', () => {
    // These are ADL's published IRIs. A typo here is not a local bug: it silently makes
    // every statement we emit unmappable to any xAPI system, which is the entire reason
    // we borrowed the vocabulary.
    expect(TRAINING_VERBS).toEqual({
      completed: 'http://adlnet.gov/expapi/verbs/completed',
      passed: 'http://adlnet.gov/expapi/verbs/passed',
      failed: 'http://adlnet.gov/expapi/verbs/failed',
    });
  });

  it('keeps the verb set closed', () => {
    // `attempted` and `experienced` are valid xAPI and deliberately refused: a
    // requirement is not satisfied because someone opened a video.
    expect(verbFromIri('http://adlnet.gov/expapi/verbs/attempted')).toBeNull();
    expect(verbFromIri('http://adlnet.gov/expapi/verbs/experienced')).toBeNull();
    expect(verbFromIri('https://example.com/verbs/completed')).toBeNull();
  });

  it('satisfies on completed and passed, never on failed', () => {
    expect(SATISFYING_VERBS).toEqual(['completed', 'passed']);
    expect(verbSatisfies('failed')).toBe(false);
  });

  it('pins the requirement vocabularies', () => {
    expect(REQUIREMENT_REASONS).toEqual([
      'onboarding',
      'policy',
      'periodic',
      'phish_failure',
      'incident',
      'manual',
    ]);
    expect(REQUIREMENT_STATUSES).toEqual(['pending', 'satisfied', 'overdue', 'waived', 'cancelled']);
  });

  it('never stores overdue', () => {
    // Storing it would make correctness depend on a sweeper having run.
    expect(STORED_REQUIREMENT_STATUSES).not.toContain('overdue');
    expect(REQUIREMENT_STATUSES).toContain('overdue');
  });

  it('pins the webhook event names and the signature header', () => {
    expect(WEBHOOK_EVENTS).toEqual([
      'training.requirement.created',
      'training.requirement.due_soon',
      'training.requirement.overdue',
      'training.requirement.satisfied',
      'training.requirement.waived',
      'training.requirement.cancelled',
    ]);
    expect(SIGNATURE_HEADER).toBe('x-helios-signature');
    expect(TRAINING_SPEC_VERSION).toBe(1);
    expect(ACTOR_TYPES).toEqual(['mbox', 'account']);
    expect(DUE_SOON_LEAD_DAYS).toBe(3);
  });
});

describe('actor identity is canonical', () => {
  it('lowercases an mbox so two providers naming one person agree', () => {
    // If these differed, a completion from vendor A would not match a requirement
    // created from vendor B's spelling, and nothing would look broken.
    expect(canonicalMbox('Alice.Smith@Example.COM')).toBe('mailto:alice.smith@example.com');
    expect(canonicalMbox('  bob@example.com  ')).toBe('mailto:bob@example.com');
  });

  it('round-trips an email through the mbox form', () => {
    expect(emailFromMbox(canonicalMbox('carol@example.com'))).toBe('carol@example.com');
    expect(emailFromMbox('not-an-mbox')).toBeNull();
  });

  it('normalises an account homePage trailing slash', () => {
    expect(canonicalAccount('https://vendor.example/', 'u-123')).toBe('https://vendor.example#u-123');
    expect(canonicalAccount('https://vendor.example', 'u-123')).toBe('https://vendor.example#u-123');
  });
});

describe('overdue is derived, and derived the same way everywhere', () => {
  const past = new Date('2026-01-01T00:00:00Z');
  const future = new Date('2027-01-01T00:00:00Z');
  const now = new Date('2026-06-01T00:00:00Z');

  it('is pending before the due date and overdue after it', () => {
    expect(effectiveStatus('pending', future, now)).toBe('pending');
    expect(effectiveStatus('pending', past, now)).toBe('overdue');
  });

  it('never overrides a settled status', () => {
    // A satisfied requirement whose due date has passed is satisfied, not overdue.
    expect(effectiveStatus('satisfied', past, now)).toBe('satisfied');
    expect(effectiveStatus('waived', past, now)).toBe('waived');
    expect(effectiveStatus('cancelled', past, now)).toBe('cancelled');
  });

  it('treats a requirement with no due date as never overdue', () => {
    expect(effectiveStatus('pending', null, now)).toBe('pending');
  });
});

describe('ISO 8601 durations', () => {
  it('parses the forms vendors actually send', () => {
    expect(durationToSeconds('PT1H30M')).toBe(5400);
    expect(durationToSeconds('PT45S')).toBe(45);
    expect(durationToSeconds('P1DT2H')).toBe(93600);
    expect(durationToSeconds('PT10M30.5S')).toBe(631);
  });

  it('refuses years and months rather than guessing their length', () => {
    // A month is not a fixed number of seconds. Guessing would silently misstate how
    // long someone spent on required training.
    expect(durationToSeconds('P1Y')).toBeNull();
    expect(durationToSeconds('P2M')).toBeNull();
    expect(durationToSeconds('')).toBeNull();
    expect(durationToSeconds('90 minutes')).toBeNull();
  });
});

describe('statement parsing refuses rather than guesses', () => {
  const valid = () => ({
    actor: { mbox: 'mailto:alice@example.com' },
    verb: { id: TRAINING_VERBS.passed },
    object: { id: 'https://vendor.example/courses/phishing-101', definition: { name: { 'en-US': 'Phishing 101' } } },
    result: { completion: true, success: true, score: { scaled: 0.92 }, duration: 'PT12M' },
    timestamp: '2026-06-01T10:00:00Z',
  });

  it('accepts a well-formed statement', () => {
    const parsed = parseCompletionStatement(valid());
    expect(parsed.verb).toBe('passed');
    expect(parsed.actorIdentifier).toBe('mailto:alice@example.com');
    expect(parsed.actorEmail).toBe('alice@example.com');
    expect(parsed.objectName).toBe('Phishing 101');
    expect(parsed.resultScoreScaled).toBe(0.92);
    expect(parsed.resultDurationSeconds).toBe(720);
  });

  it('refuses a score outside 0..1 instead of assuming a percentage', () => {
    // A vendor sending 85 means 85%. Accepting it would record a pass for someone who
    // scored 0.85% under another vendor's convention.
    const body = { ...valid(), result: { score: { scaled: 85 } } };
    expect(() => parseCompletionStatement(body)).toThrow(StatementError);
    try {
      parseCompletionStatement(body);
    } catch (error) {
      expect((error as StatementError).code).toBe('invalid_score');
    }
  });

  it('refuses an actor carrying two identifiers', () => {
    // Two identifiers means two possible people; picking one silently attributes
    // training to the wrong employee.
    const body = {
      ...valid(),
      actor: { mbox: 'mailto:alice@example.com', account: { homePage: 'https://v.example', name: 'x' } },
    };
    try {
      parseCompletionStatement(body);
      throw new Error('should have refused');
    } catch (error) {
      expect((error as StatementError).code).toBe('ambiguous_actor');
    }
  });

  it('refuses an unsupported verb and names what it accepts', () => {
    const body = { ...valid(), verb: { id: 'http://adlnet.gov/expapi/verbs/attempted' } };
    try {
      parseCompletionStatement(body);
      throw new Error('should have refused');
    } catch (error) {
      expect((error as StatementError).code).toBe('unsupported_verb');
    }
  });

  it('refuses a completion dated in the future', () => {
    // Otherwise a misconfigured integration could satisfy a requirement before the
    // training happened, and the wrong date would persist in the audit trail.
    const body = { ...valid(), timestamp: '2030-01-01T00:00:00Z' };
    try {
      parseCompletionStatement(body, new Date('2026-06-01T00:00:00Z'));
      throw new Error('should have refused');
    } catch (error) {
      expect((error as StatementError).code).toBe('invalid_timestamp');
    }
  });

  it('accepts small clock skew, because vendor clocks drift', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const skewed = new Date(now.getTime() + 60_000).toISOString();
    expect(parseCompletionStatement({ ...valid(), timestamp: skewed }, now).occurredAt).toBeInstanceOf(Date);
  });

  it('refuses a spec_version newer than this installation implements', () => {
    const body = { ...valid(), spec_version: TRAINING_SPEC_VERSION + 1 };
    try {
      parseCompletionStatement(body);
      throw new Error('should have refused');
    } catch (error) {
      expect((error as StatementError).code).toBe('unsupported_spec_version');
    }
  });

  it('refuses a requirement id that is not a UUID', () => {
    const body = { ...valid(), helios: { requirement_id: 'course-42' } };
    expect(() => parseCompletionStatement(body)).toThrow(StatementError);
  });

  it('defaults the timestamp rather than refusing a statement without one', () => {
    const body = valid() as Record<string, unknown>;
    delete body.timestamp;
    const now = new Date('2026-06-01T00:00:00Z');
    expect(parseCompletionStatement(body, now).occurredAt.getTime()).toBe(now.getTime());
  });
});

describe('webhook signing', () => {
  const secret = 'whsec_test_value';
  const body = JSON.stringify({ id: 'evt_1', event: 'training.requirement.satisfied' });

  it('verifies a signature it produced', () => {
    const signed = signWebhook(body, secret, 1780000000);
    expect(verifyWebhook(body, secret, signed.header, new Date(1780000000 * 1000)).valid).toBe(true);
  });

  it('rejects a tampered body', () => {
    const signed = signWebhook(body, secret, 1780000000);
    const tampered = body.replace('satisfied', 'waived');
    const result = verifyWebhook(tampered, secret, signed.header, new Date(1780000000 * 1000));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('signature_mismatch');
  });

  it('rejects a replay outside the tolerance window', () => {
    // The timestamp is inside the MAC, so an old body cannot be re-sent with a fresh one.
    const signed = signWebhook(body, secret, 1780000000);
    const muchLater = new Date((1780000000 + 3600) * 1000);
    expect(verifyWebhook(body, secret, signed.header, muchLater).reason).toBe('timestamp_outside_tolerance');
  });

  it('rejects a signature made with a different secret', () => {
    const signed = signWebhook(body, 'someone-elses-secret', 1780000000);
    expect(verifyWebhook(body, secret, signed.header, new Date(1780000000 * 1000)).valid).toBe(false);
  });

  it('round-trips the header format', () => {
    const parsed = parseSignatureHeader(formatSignatureHeader(1780000000, 'abc123'));
    expect(parsed).toEqual({ timestamp: 1780000000, signature: 'abc123' });
    expect(parseSignatureHeader('garbage')).toBeNull();
  });

  it('generates a recognisable, high-entropy secret', () => {
    const secrets = new Set(Array.from({ length: 50 }, () => generateWebhookSecret()));
    expect(secrets.size).toBe(50);
    expect([...secrets][0]).toMatch(/^whsec_[A-Za-z0-9_-]{40,}$/);
  });

  it('signs the exact bytes, not a re-serialisation', () => {
    // Two JSON encodings of the same object differ in key order; signing an object and
    // sending a different encoding would produce a valid-looking payload with an
    // invalid signature, for every delivery.
    const a = JSON.stringify({ x: 1, y: 2 });
    const b = JSON.stringify({ y: 2, x: 1 });
    const signed = signWebhook(a, secret, 1780000000);
    expect(verifyWebhook(b, secret, signed.header, new Date(1780000000 * 1000)).valid).toBe(false);
  });
});

describe('the read projection matches Vanta TrainingRecord naming', () => {
  const row = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Security Awareness 2026',
    primary_email: 'alice@example.com',
    due_at: '2026-01-01T00:00:00.000Z',
    satisfied_at: null as string | null,
    status: 'pending' as const,
    reason: 'policy' as const,
    provider: 'aegis',
    score_scaled: null as string | null,
  };

  it('projects the field names a compliance connector expects', () => {
    const record = toTrainingRecord(row, new Date('2026-06-01T00:00:00Z'));
    expect(Object.keys(record).sort()).toEqual(
      [
        'completionDate',
        'displayName',
        'dueDate',
        'personEmail',
        'provider',
        'reason',
        'score',
        'specVersion',
        'status',
        'uniqueId',
      ].sort(),
    );
    // uniqueId is the requirement id: Vanta's upsert is idempotent on it, so re-sending
    // a record updates rather than duplicates.
    expect(record.uniqueId).toBe(row.id);
  });

  it('reports derived status, not the stored one', () => {
    const record = toTrainingRecord(row, new Date('2026-06-01T00:00:00Z'));
    expect(record.status).toBe('overdue');
  });

  it('returns a numeric score, never a string from the driver', () => {
    // node-postgres returns NUMERIC as a string. Shipping "0.920" where a consumer
    // expects 0.92 breaks their comparison silently.
    const record = toTrainingRecord({ ...row, score_scaled: '0.920' });
    expect(record.score).toBe(0.92);
    expect(typeof record.score).toBe('number');
  });
});

describe('the whole contract surface is hash-pinned', () => {
  it('has not drifted without a deliberate decision', () => {
    // One value over everything an integrator depends on. If this fails and you did not
    // mean to change the wire contract, you changed it by accident.
    const surface = JSON.stringify({
      spec_version: TRAINING_SPEC_VERSION,
      verbs: TRAINING_VERBS,
      satisfying: SATISFYING_VERBS,
      actor_types: ACTOR_TYPES,
      reasons: REQUIREMENT_REASONS,
      statuses: REQUIREMENT_STATUSES,
      stored_statuses: STORED_REQUIREMENT_STATUSES,
      events: WEBHOOK_EVENTS,
      signature_header: SIGNATURE_HEADER,
    });
    const digest = crypto.createHash('sha256').update(surface).digest('hex');
    expect(digest).toBe('f9a65bc7d213f57061354dd945f4ab4fd3048986ae90236a8eaaad8fcba9336f');
  });
});
