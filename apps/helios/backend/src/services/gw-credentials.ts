/**
 * Google Workspace service-account credential storage — encode/decode.
 *
 * The `gw_credentials.service_account_key` column holds a Google service-account
 * key, which CONTAINS A PRIVATE KEY. It must be encrypted at rest.
 *
 * Audit 2026-07-23/-25: it was being written as plaintext `JSON.stringify(creds)`
 * in google-workspace.service.ts, while the Microsoft path (ms_credentials) was
 * encrypted. Worse, modules.routes.ts wrote the SAME column ENCRYPTED using its
 * own local crypto, so two writers disagreed on the format and ~25 read sites
 * assumed plaintext `JSON.parse`. Whichever path wrote last decided whether the
 * others worked.
 *
 * This module is the ONE place that encodes/decodes that column. Every write goes
 * through `encodeServiceAccountKey`; every read through `decodeServiceAccountKey`.
 * Do not `JSON.stringify`/`JSON.parse` the column directly anywhere else.
 *
 *   Stored form is ALWAYS ciphertext going forward: `ivHex:cipherHex`
 *   (AES-256-CBC via encryptionService).
 *
 * Backward compatibility: `decodeServiceAccountKey` also accepts a legacy
 * PLAINTEXT row (a JSON string starting with `{`) and an already-parsed object
 * (some pg paths hand back parsed values). This lets an install with pre-existing
 * plaintext rows keep working while they are re-saved as ciphertext. Helios has
 * never been deployed, so there is no production data to migrate — the fallback
 * is defence-in-depth, not a migration path in use.
 */
import { encryptionService } from './encryption.service.js';
import { logger } from '../utils/logger.js';

/** Encrypt credentials for storage in `gw_credentials.service_account_key`. */
export function encodeServiceAccountKey(credentials: unknown): string {
  return encryptionService.encrypt(JSON.stringify(credentials));
}

/**
 * Decode a stored `service_account_key` back into the credentials object.
 *
 * Accepts three shapes, in order:
 *   1. an already-parsed object (pg jsonb path) — returned as-is
 *   2. legacy plaintext JSON (starts with `{`) — parsed directly
 *   3. ciphertext `ivHex:cipherHex` — decrypted then parsed
 *
 * Throws if the value cannot be decoded by any path. Never returns a partial or
 * silently-wrong result — a bad credential must fail loudly, not authenticate as
 * something unexpected.
 */
export function decodeServiceAccountKey<T = any>(stored: unknown): T {
  if (stored && typeof stored === 'object') {
    return stored as T;
  }

  const raw = String(stored ?? '').trim();
  if (!raw) {
    throw new Error('service_account_key is empty');
  }

  // Legacy plaintext row.
  if (raw.startsWith('{')) {
    return JSON.parse(raw) as T;
  }

  // Ciphertext.
  try {
    return JSON.parse(encryptionService.decrypt(raw)) as T;
  } catch (err) {
    logger.error('Failed to decode service_account_key', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error('Unable to decode stored service account credentials');
  }
}
