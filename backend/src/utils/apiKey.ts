import crypto from 'crypto';

/**
 * API Key Utilities
 *
 * Generates and hashes API keys following the format:
 * helios_{env}_{random}
 *
 * Keys are hashed using SHA-256 before storage. Plaintext keys
 * are shown only once on creation and never retrievable.
 */

export interface GeneratedApiKey {
  /** Full plaintext key - SHOW ONCE, never store */
  key: string;
  /** SHA-256 hash for database storage */
  hash: string;
  /** Prefix for UI display (e.g., "helios_prod_a9k3...") */
  prefix: string;
  /** Environment identifier */
  env: string;
}

/**
 * Generate a new API key with cryptographically secure randomness
 *
 * Format: helios_{env}_{random}
 * - env: "prod" in production, "dev" otherwise
 * - random: 32 bytes of crypto-random data, base64url encoded
 *
 * @returns GeneratedApiKey object with key, hash, and prefix
 */
export function generateApiKey(): GeneratedApiKey {
  // Determine environment
  const env = process.env['NODE_ENV'] === 'production' ? 'prod' : 'dev';

  // Generate 32 bytes of cryptographically secure random data
  // base64url encoding: URL-safe, no padding, 43 characters
  const random = crypto.randomBytes(32).toString('base64url');

  // Construct full key: helios_prod_a9k3f8ds7fg2h5j1k4l9m3n8p2q7r5t6w9x2...
  const key = `helios_${env}_${random}`;

  // Hash for storage (never store plaintext)
  const hash = hashApiKey(key);

  // Create prefix for UI display
  const prefix = `${key.substring(0, 20)}...`;

  return {
    key,
    hash,
    prefix,
    env,
  };
}

/**
 * Hash an API key using SHA-256
 *
 * Used for:
 * 1. Storing key hashes in database
 * 2. Looking up keys during authentication
 *
 * @param key - Plaintext API key
 * @returns SHA-256 hash as hex string
 */
export function hashApiKey(key: string): string {
  return crypto
    .createHash('sha256')
    .update(key)
    .digest('hex');
}

/**
 * Validate API key format
 *
 * Checks that key matches expected format: helios_{env}_{random}
 * Note: The random part uses base64url encoding which can include underscores,
 * so we split into exactly 3 parts: first two are separated, rest is the random part.
 *
 * @param key - API key to validate
 * @returns true if valid format, false otherwise
 */
export function validateApiKeyFormat(key: string): boolean {
  // Must start with helios_
  if (!key.startsWith('helios_')) {
    return false;
  }

  // Split into exactly 3 parts: prefix, env, and everything else (random)
  // Using split with limit doesn't work well with multiple underscores,
  // so we extract manually
  const firstUnderscore = key.indexOf('_');
  const secondUnderscore = key.indexOf('_', firstUnderscore + 1);

  if (firstUnderscore === -1 || secondUnderscore === -1) {
    return false;
  }

  const prefix = key.substring(0, firstUnderscore);
  const env = key.substring(firstUnderscore + 1, secondUnderscore);
  const random = key.substring(secondUnderscore + 1);

  // Validate prefix
  if (prefix !== 'helios') {
    return false;
  }

  // Validate environment (prod or dev)
  if (env !== 'prod' && env !== 'dev') {
    return false;
  }

  // Validate random part (base64url is alphanumeric + - and _)
  // Should be 43 characters for 32 bytes
  const base64urlPattern = /^[A-Za-z0-9_-]{43}$/;
  if (!base64urlPattern.test(random)) {
    return false;
  }

  return true;
}

/**
 * Extract environment from API key
 *
 * @param key - API key
 * @returns Environment ('prod' or 'dev') or null if invalid
 */
export function extractEnvironment(key: string): 'prod' | 'dev' | null {
  if (!validateApiKeyFormat(key)) {
    return null;
  }

  const parts = key.split('_');
  return parts[1] as 'prod' | 'dev';
}

/**
 * Create display prefix from full key
 *
 * Shows first ~20 characters + ellipsis for UI
 *
 * @param key - Full API key
 * @returns Display prefix (e.g., "helios_prod_a9k3...")
 */
export function createKeyPrefix(key: string): string {
  return `${key.substring(0, 20)}...`;
}

/**
 * Compare a plaintext API key with a stored hash using timing-safe comparison.
 *
 * @param plaintext - The plaintext API key from request header
 * @param storedHash - The stored SHA-256 hash from database
 * @returns true if the key matches
 */
export function verifyApiKey(plaintext: string, storedHash: string): boolean {
  const hashedInput = hashApiKey(plaintext);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hashedInput, 'hex'),
      Buffer.from(storedHash, 'hex')
    );
  } catch {
    return false;
  }
}

// Available API permission scopes
export const API_SCOPES = {
  // Users
  'read:users': 'View users and their profiles',
  'write:users': 'Create and update users',
  'delete:users': 'Delete users',

  // Groups
  'read:groups': 'View groups and memberships',
  'write:groups': 'Create and update groups',
  'delete:groups': 'Delete groups',
  'manage:group-members': 'Add and remove group members',

  // Organization
  'read:organization': 'View organization settings',
  'write:organization': 'Update organization settings',

  // Sync
  'sync:google-workspace': 'Sync with Google Workspace',

  // Audit
  'read:audit-logs': 'View audit logs',

  // Bulk operations
  'bulk:users': 'Perform bulk user operations',
  'bulk:groups': 'Perform bulk group operations',

  // Admin
  'admin:full': 'Full administrative access (all permissions)',
} as const;

export type ApiScope = keyof typeof API_SCOPES;

/**
 * Check if a permission scope is valid.
 *
 * @param scope - The scope to validate
 * @returns true if valid scope
 */
export function isValidScope(scope: string): scope is ApiScope {
  return scope in API_SCOPES;
}

/**
 * Check if a key's permissions include a required scope.
 *
 * @param permissions - The key's permission array
 * @param requiredScope - The scope needed for the operation
 * @returns true if permission is granted
 */
export function hasPermission(permissions: string[], requiredScope: ApiScope): boolean {
  // admin:full grants all permissions
  if (permissions.includes('admin:full')) {
    return true;
  }
  return permissions.includes(requiredScope);
}

/**
 * Expand permissions array, resolving admin:full to all scopes.
 *
 * @param permissions - The key's permission array
 * @returns Expanded list of effective permissions
 */
export function expandPermissions(permissions: string[]): ApiScope[] {
  if (permissions.includes('admin:full')) {
    return Object.keys(API_SCOPES) as ApiScope[];
  }
  return permissions.filter(isValidScope) as ApiScope[];
}
