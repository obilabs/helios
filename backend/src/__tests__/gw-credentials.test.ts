/**
 * Tests for the gw_credentials service-account-key encode/decode accessor.
 *
 * A fixed 32-byte-hex ENCRYPTION_KEY is set before importing the modules so the
 * encryption service and this test agree on the key.
 */
import { describe, it, expect, beforeAll } from '@jest/globals';

process.env.ENCRYPTION_KEY =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'; // 32 bytes hex

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let encode: (c: unknown) => string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let decode: <T = any>(s: unknown) => T;

beforeAll(async () => {
  const mod = await import('../services/gw-credentials.js');
  encode = mod.encodeServiceAccountKey;
  decode = mod.decodeServiceAccountKey;
});

const SAMPLE = {
  type: 'service_account',
  project_id: 'helios-test',
  private_key_id: 'abc123',
  private_key: '-----BEGIN PRIVATE KEY-----\nMIIE...FAKE...\n-----END PRIVATE KEY-----\n',
  client_email: 'sa@helios-test.iam.gserviceaccount.com',
  client_id: '1234567890',
};

describe('gw-credentials encode/decode', () => {
  it('round-trips credentials through encrypt/decrypt', () => {
    const stored = encode(SAMPLE);
    expect(decode(stored)).toEqual(SAMPLE);
  });

  it('stores CIPHERTEXT, not plaintext — the whole point of the fix', () => {
    const stored = encode(SAMPLE);
    // Must not contain the private key or be JSON.
    expect(stored).not.toContain('private_key');
    expect(stored).not.toContain('BEGIN PRIVATE KEY');
    expect(stored.startsWith('{')).toBe(false);
    // Must be the ivHex:cipherHex shape.
    expect(stored).toMatch(/^[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it('produces a different ciphertext each call (random IV)', () => {
    expect(encode(SAMPLE)).not.toEqual(encode(SAMPLE));
  });

  it('decodes a LEGACY PLAINTEXT row (backward compatibility)', () => {
    const plaintext = JSON.stringify(SAMPLE);
    expect(decode(plaintext)).toEqual(SAMPLE);
  });

  it('decodes an already-parsed object (pg jsonb path)', () => {
    expect(decode(SAMPLE)).toEqual(SAMPLE);
  });

  it('throws loudly on an empty value rather than returning garbage', () => {
    expect(() => decode('')).toThrow();
    expect(() => decode(null)).toThrow();
    expect(() => decode(undefined)).toThrow();
  });

  it('throws on ciphertext-shaped garbage rather than silently mis-decoding', () => {
    expect(() => decode('deadbeef:not-real-ciphertext')).toThrow();
  });
});
