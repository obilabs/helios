/**
 * Signing outbound training webhooks.
 *
 * The scheme is Stripe's, deliberately: it is the one every integrator has already
 * implemented at least once, there are verified library implementations in every
 * language, and inventing our own would mean asking a customer's developer to trust an
 * unreviewed MAC construction for compliance evidence.
 *
 *   header:  X-Helios-Signature: t=<unix seconds>,v1=<hex hmac-sha256>
 *   signed:  "<timestamp>.<raw request body>"
 *
 * The timestamp is inside the MAC, so a captured body cannot be replayed with a fresh
 * timestamp. Receivers reject anything outside SIGNATURE_TOLERANCE_SECONDS.
 */
import crypto from 'crypto';
import {
  SIGNATURE_TOLERANCE_SECONDS,
  formatSignatureHeader,
  parseSignatureHeader,
  signedPayload,
} from './contract.js';

/** Sign a raw body. `timestampSeconds` is injectable so tests can pin a value. */
export function signWebhook(
  rawBody: string,
  secret: string,
  timestampSeconds: number = Math.floor(Date.now() / 1000),
): { header: string; timestamp: number; signature: string } {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload(timestampSeconds, rawBody))
    .digest('hex');
  return {
    header: formatSignatureHeader(timestampSeconds, signature),
    timestamp: timestampSeconds,
    signature,
  };
}

/**
 * Verify a signature the way a correct receiver would.
 *
 * We ship this because we consume our own webhooks in tests, and because it is the
 * reference an integrator can read. Comparison is constant-time: a byte-by-byte compare
 * leaks how much of a forged MAC was right, which is enough to forge one.
 */
export function verifyWebhook(
  rawBody: string,
  secret: string,
  header: string,
  now: Date = new Date(),
): { valid: boolean; reason?: string } {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { valid: false, reason: 'malformed_signature_header' };

  const ageSeconds = Math.abs(Math.floor(now.getTime() / 1000) - parsed.timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
    return { valid: false, reason: 'timestamp_outside_tolerance' };
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(signedPayload(parsed.timestamp, rawBody))
    .digest('hex');

  const given = Buffer.from(parsed.signature, 'hex');
  const want = Buffer.from(expected, 'hex');
  if (given.length !== want.length) return { valid: false, reason: 'signature_mismatch' };
  if (!crypto.timingSafeEqual(given, want)) return { valid: false, reason: 'signature_mismatch' };

  return { valid: true };
}

/** A new endpoint secret. 32 bytes, prefixed so it is recognisable in a customer's vault. */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString('base64url')}`;
}
