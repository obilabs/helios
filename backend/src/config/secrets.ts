/**
 * Signing-secret loading — the ONE place the backend reads its token secrets.
 *
 * Every module that signs or verifies a JWT, and the better-auth instance, gets
 * its secret from here. Nothing else may read `process.env.JWT_SECRET` /
 * `BETTER_AUTH_SECRET` directly, and nothing may supply a literal fallback: a
 * fallback string in source is the same value on every installation.
 *
 * Behaviour:
 *   - NODE_ENV=test: a missing secret resolves to a fixed test-only value so unit
 *     tests can import auth modules without a configured environment. A secret
 *     that IS set is still returned as-is.
 *   - every other NODE_ENV (production, development, unset): the secret must be
 *     set, at least MIN_SECRET_LENGTH characters, and not a known placeholder.
 *     Otherwise `assertSecretsConfigured()` throws at boot and the getters throw
 *     on first use, so the server refuses to start rather than running with a
 *     guessable key.
 *
 * Local development gets explicit values from docker-compose.dev.yml and the
 * e2e stack from e2e/e2e-stack.env — both clearly marked as non-production.
 *
 * Generate a real value with:  openssl rand -hex 32
 */

export const MIN_SECRET_LENGTH = 32;

/**
 * Values that have shipped in templates, docs, compose files or historical
 * source fallbacks. Equal-to (case-insensitive, trimmed) is rejected even when
 * long enough.
 */
const KNOWN_PLACEHOLDER_SECRETS = new Set<string>([
  'your_super_secure_jwt_secret_key_here',
  'your-super-secret-jwt-key-change-this',
  'dev-jwt-secret-change-in-production',
  'dev-secret-change-in-production',
  'dev-secret-key-not-for-production',
  'default-secret',
  'test-secret-key',
  'changeme',
  'change-me',
  'change-this',
  'secret',
]);

/** Template phrasing that marks a value as "replace me". */
const PLACEHOLDER_PATTERN = /change[-_ ]?(me|this|in[-_ ]?prod)|your[-_ ]?(super|jwt|secret)/i;

/**
 * Only ever returned when NODE_ENV === 'test' and the variable is unset. It is
 * not a runtime fallback: every other environment throws instead.
 */
const TEST_ENV_SECRET = 'helios-unit-test-signing-secret-0123456789abcdef';

export class SecretConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretConfigError';
  }
}

function isTestEnv(): boolean {
  return process.env['NODE_ENV'] === 'test';
}

/**
 * Return why `value` is unacceptable as a signing secret, or null if it is fine.
 * Exported for tests and for env validation messages.
 */
export function describeSecretProblem(value: string | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return 'is not set';
  if (v.length < MIN_SECRET_LENGTH) {
    return `is too short (${v.length} characters; minimum ${MIN_SECRET_LENGTH})`;
  }
  if (KNOWN_PLACEHOLDER_SECRETS.has(v.toLowerCase()) || PLACEHOLDER_PATTERN.test(v)) {
    return 'is a placeholder value';
  }
  return null;
}

function resolve(name: string, raw: string | undefined): string {
  if (isTestEnv() && !(raw ?? '').trim()) {
    return TEST_ENV_SECRET;
  }
  if (isTestEnv()) {
    return raw!.trim();
  }
  const problem = describeSecretProblem(raw);
  if (problem) {
    throw new SecretConfigError(
      `[FATAL] ${name} ${problem}. Helios will not start without a real signing secret ` +
        `(NODE_ENV=${process.env['NODE_ENV'] || 'undefined'}).\n` +
        `Generate one with:  openssl rand -hex 32`,
    );
  }
  return raw!.trim();
}

/** Secret used to sign and verify Helios JWT access/refresh tokens. */
export function getJwtSecret(): string {
  return resolve('JWT_SECRET', process.env['JWT_SECRET']);
}

/**
 * Secret for better-auth session signing. BETTER_AUTH_SECRET if set, otherwise
 * JWT_SECRET (another configured secret, never a literal).
 */
export function getAuthSecret(): string {
  const own = process.env['BETTER_AUTH_SECRET'];
  if ((own ?? '').trim()) {
    return resolve('BETTER_AUTH_SECRET', own);
  }
  return resolve('JWT_SECRET', process.env['JWT_SECRET']);
}

/**
 * Boot-time check. Throws SecretConfigError listing every problem so an operator
 * can fix them in one pass.
 */
export function assertSecretsConfigured(): void {
  if (isTestEnv()) return;
  const problems: string[] = [];
  const jwtProblem = describeSecretProblem(process.env['JWT_SECRET']);
  if (jwtProblem) problems.push(`JWT_SECRET ${jwtProblem}`);
  const own = process.env['BETTER_AUTH_SECRET'];
  if ((own ?? '').trim()) {
    const authProblem = describeSecretProblem(own);
    if (authProblem) problems.push(`BETTER_AUTH_SECRET ${authProblem}`);
  }
  if (problems.length > 0) {
    throw new SecretConfigError(
      `[FATAL] Refusing to start: ${problems.join('; ')}. ` +
        `Set a random value of at least ${MIN_SECRET_LENGTH} characters ` +
        `(openssl rand -hex 32).`,
    );
  }
}
