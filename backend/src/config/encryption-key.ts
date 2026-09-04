import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * Resolve an at-rest encryption key from the environment — safely.
 *
 * Background (why this exists):
 *   Several modules used to derive their AES key like this:
 *
 *       const KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
 *
 *   When the env var was unset, that fell back to a NEW RANDOM KEY on every
 *   process start. Anything encrypted under one process (Google service-account
 *   keys, the Microsoft 365 client secret, LLM provider API keys, SMTP
 *   passwords) became permanently undecryptable after the next container
 *   restart — silent, unrecoverable data loss that looks exactly like success
 *   until a restart happens.
 *
 * This resolver replaces that footgun with two explicit behaviours:
 *   - production (NODE_ENV=production): FAIL FAST. A missing or placeholder key
 *     throws and the process refuses to start, rather than silently encrypting
 *     real secrets under a throwaway key.
 *   - anything else (development / test / unset): use a STABLE, deterministic,
 *     well-known development key and log a loud warning. Stable means locally
 *     encrypted data survives a restart (the old random fallback did not), and
 *     because it is deterministic it is NOT confidential — the warning says so.
 *
 * The resolver only produces the key STRING. Each call site keeps its own
 * existing key-derivation (hex-vs-passphrase, padding, sha256, ...) so that no
 * previously-stored ciphertext format changes.
 */

/** Minimum acceptable key length. Mirrors the Joi env schema (min 32). */
const MIN_KEY_LENGTH = 32;

/**
 * Exact placeholder values shipped in `.env.example`, `docker-compose.dev.yml`,
 * the Joi dev defaults, and the historical hardcoded fallbacks. A key equal to
 * any of these is never a real secret, so it is rejected in production even
 * though some are long enough to pass the length check.
 */
const KNOWN_PLACEHOLDERS = new Set<string>([
  'your-32-character-encryption-key-here-change-this',
  'your-32-character-email-encryption-key-change-this',
  'your-32-character-encryption-key!!',
  'dev-encryption-key-change-in-prod',
  'dev-email-encryption-key-change',
  'changeme',
  'change-this',
]);

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function isWeak(value: string): boolean {
  const v = value.trim();
  return v.length < MIN_KEY_LENGTH || KNOWN_PLACEHOLDERS.has(v);
}

/**
 * Deterministic development key. Stable across restarts (unlike the previous
 * crypto.randomBytes fallback) so local data stays decryptable, and namespaced
 * by env-var so the different key slots do not collide. Returned as 64 hex
 * chars (32 bytes) — a valid AES-256 key for every call site's derivation.
 */
function developmentFallbackKey(envVar: string): string {
  return crypto
    .createHash('sha256')
    .update(`helios-insecure-development-key:${envVar}`)
    .digest('hex');
}

export interface ResolveKeyOptions {
  /**
   * If the primary env var is unset/blank, fall back to this env var before
   * applying the production/development logic. Used so INITIAL_PASSWORD_KEY can
   * inherit ENCRYPTION_KEY instead of introducing another required secret.
   */
  fallbackEnv?: string;
}

/**
 * Resolve an encryption key from `envVar` (optionally falling back to another
 * env var), failing fast in production and using a stable dev key otherwise.
 *
 * @throws in production when the resolved value is missing or a weak placeholder.
 */
export function resolveEncryptionKey(envVar: string, opts: ResolveKeyOptions = {}): string {
  let raw = process.env[envVar];

  if ((!raw || !raw.trim()) && opts.fallbackEnv) {
    raw = process.env[opts.fallbackEnv];
  }

  const missingOrWeak = !raw || !raw.trim() || isWeak(raw);

  if (!missingOrWeak) {
    return raw!.trim();
  }

  if (isProduction()) {
    const reason = !raw || !raw.trim()
      ? 'is not set'
      : `is too weak (must be >= ${MIN_KEY_LENGTH} characters and not a placeholder)`;
    throw new Error(
      `[FATAL] ${envVar} ${reason}. Refusing to start in production.\n` +
      `Encrypting stored secrets (Google/Microsoft credentials, SMTP passwords, ` +
      `LLM API keys) under a missing or placeholder key would cause silent, ` +
      `unrecoverable data loss on the next restart.\n` +
      `Generate a key with:  openssl rand -hex 32`
    );
  }

  logger.warn(
    `[SECURITY] ${envVar} is not set or too weak — falling back to an INSECURE, ` +
    `well-known DEVELOPMENT key. Data encrypted with it is NOT confidential. ` +
    `Set ${envVar} (e.g. \`openssl rand -hex 32\`) before storing anything real. ` +
    `(NODE_ENV=${process.env.NODE_ENV || 'undefined'})`
  );
  return developmentFallbackKey(envVar);
}
