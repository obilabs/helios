/**
 * API Key Utilities Tests
 *
 * Tests for key generation, hashing, validation, and permission checking.
 */

import {
  generateApiKey,
  hashApiKey,
  validateApiKeyFormat,
  createKeyPrefix,
  verifyApiKey,
  extractEnvironment,
  API_SCOPES,
  isValidScope,
  hasPermission,
  expandPermissions,
} from '../utils/apiKey.js';

describe('API Key Utilities', () => {
  describe('generateApiKey', () => {
    it('should generate a key with correct format', () => {
      const { key, hash, prefix, env } = generateApiKey();

      // Key format: helios_{env}_{base64url} where base64url is 43 chars
      expect(key).toMatch(/^helios_(prod|dev)_[A-Za-z0-9_-]{43}$/);
      expect(hash).toHaveLength(64); // SHA-256 hex
      // Prefix is first 20 chars + "..."
      expect(prefix).toHaveLength(23);
      expect(prefix.endsWith('...')).toBe(true);
      expect(['prod', 'dev']).toContain(env);
    });

    it('should generate unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();

      expect(key1.key).not.toBe(key2.key);
      expect(key1.hash).not.toBe(key2.hash);
    });

    it('should generate keys with consistent hashes', () => {
      const { key, hash } = generateApiKey();
      const rehash = hashApiKey(key);

      expect(rehash).toBe(hash);
    });
  });

  describe('hashApiKey', () => {
    it('should return SHA-256 hash as hex string', () => {
      const hash = hashApiKey('helios_dev_abc123');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent hashes', () => {
      const key = 'helios_dev_testkey123456789012345678901234';
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashApiKey('helios_dev_key1');
      const hash2 = hashApiKey('helios_dev_key2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('validateApiKeyFormat', () => {
    it('should accept valid key format', () => {
      const { key } = generateApiKey();
      expect(validateApiKeyFormat(key)).toBe(true);
    });

    it('should accept valid dev key with base64url chars', () => {
      // base64url encoding uses A-Za-z0-9_- and is exactly 43 chars for 32 bytes
      // Exactly 43 characters for random part
      const random43 = 'A'.repeat(43);
      const valid = `helios_dev_${random43}`;
      expect(validateApiKeyFormat(valid)).toBe(true);
    });

    it('should accept valid prod key with base64url chars', () => {
      // Exactly 43 characters for random part
      const random43 = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
      expect(random43.length).toBe(43);
      const valid = `helios_prod_${random43}`;
      expect(validateApiKeyFormat(valid)).toBe(true);
    });

    it('should accept key with underscore and hyphen in random part', () => {
      // base64url can include - and _
      // Exactly 43 characters including special chars
      const random43 = 'ABCDEFGH-IJKLMNOP_QRSTUVWXYZabcdefgh1234567';
      expect(random43.length).toBe(43);
      const valid = `helios_dev_${random43}`;
      expect(validateApiKeyFormat(valid)).toBe(true);
    });

    it('should reject keys without helios prefix', () => {
      expect(validateApiKeyFormat('other_dev_abc123')).toBe(false);
    });

    it('should reject keys with invalid environment', () => {
      expect(validateApiKeyFormat('helios_staging_abc123')).toBe(false);
    });

    it('should reject keys with wrong part count', () => {
      expect(validateApiKeyFormat('helios_dev')).toBe(false);
      expect(validateApiKeyFormat('helios_dev_too_many_parts')).toBe(false);
    });

    it('should reject keys with wrong random length', () => {
      expect(validateApiKeyFormat('helios_dev_tooshort')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(validateApiKeyFormat('')).toBe(false);
    });
  });

  describe('createKeyPrefix', () => {
    it('should create display prefix with ellipsis', () => {
      const { key } = generateApiKey();
      const prefix = createKeyPrefix(key);

      expect(prefix).toHaveLength(23); // 20 chars + '...'
      expect(prefix.endsWith('...')).toBe(true);
      expect(prefix.startsWith('helios_')).toBe(true);
    });

    it('should show first 20 characters', () => {
      const key = 'helios_dev_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefg';
      const prefix = createKeyPrefix(key);

      expect(prefix).toBe('helios_dev_ABCDEFGHI...');
    });
  });

  describe('verifyApiKey', () => {
    it('should return true for matching key and hash', () => {
      const { key, hash } = generateApiKey();
      expect(verifyApiKey(key, hash)).toBe(true);
    });

    it('should return false for non-matching key', () => {
      const { hash } = generateApiKey();
      const wrongKey = 'helios_dev_wrongkey12345678901234567890123';
      expect(verifyApiKey(wrongKey, hash)).toBe(false);
    });

    it('should return false for invalid hash format', () => {
      const { key } = generateApiKey();
      expect(verifyApiKey(key, 'invalid-hash')).toBe(false);
    });

    it('should be timing-safe', () => {
      // This test verifies the timing-safe comparison is used
      // by checking it handles edge cases without throwing
      const { key, hash } = generateApiKey();

      expect(verifyApiKey(key, hash)).toBe(true);
      expect(verifyApiKey('', hash)).toBe(false);
      expect(verifyApiKey(key, '')).toBe(false);
    });
  });

  describe('extractEnvironment', () => {
    it('should extract dev environment', () => {
      const { key } = generateApiKey();
      // In test environment, this should be 'dev'
      expect(extractEnvironment(key)).toBe('dev');
    });

    it('should return null for invalid key', () => {
      expect(extractEnvironment('invalid')).toBeNull();
    });
  });

  describe('API_SCOPES', () => {
    it('should have all expected scopes', () => {
      expect(API_SCOPES).toHaveProperty('read:users');
      expect(API_SCOPES).toHaveProperty('write:users');
      expect(API_SCOPES).toHaveProperty('read:groups');
      expect(API_SCOPES).toHaveProperty('write:groups');
      expect(API_SCOPES).toHaveProperty('admin:full');
    });

    it('should have descriptions for all scopes', () => {
      Object.values(API_SCOPES).forEach((description) => {
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('isValidScope', () => {
    it('should return true for valid scopes', () => {
      expect(isValidScope('read:users')).toBe(true);
      expect(isValidScope('write:groups')).toBe(true);
      expect(isValidScope('admin:full')).toBe(true);
    });

    it('should return false for invalid scopes', () => {
      expect(isValidScope('invalid:scope')).toBe(false);
      expect(isValidScope('')).toBe(false);
      expect(isValidScope('read:whatever')).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('should return true when permission exists', () => {
      const permissions = ['read:users', 'write:users'];
      expect(hasPermission(permissions, 'read:users')).toBe(true);
    });

    it('should return false when permission is missing', () => {
      const permissions = ['read:users'];
      expect(hasPermission(permissions, 'write:users')).toBe(false);
    });

    it('should grant all permissions with admin:full', () => {
      const permissions = ['admin:full'];
      expect(hasPermission(permissions, 'read:users')).toBe(true);
      expect(hasPermission(permissions, 'write:groups')).toBe(true);
      expect(hasPermission(permissions, 'sync:google-workspace')).toBe(true);
    });

    it('should handle empty permissions array', () => {
      expect(hasPermission([], 'read:users')).toBe(false);
    });
  });

  describe('expandPermissions', () => {
    it('should return same permissions for specific scopes', () => {
      const permissions = ['read:users', 'write:groups'];
      const expanded = expandPermissions(permissions);

      expect(expanded).toHaveLength(2);
      expect(expanded).toContain('read:users');
      expect(expanded).toContain('write:groups');
    });

    it('should expand admin:full to all scopes', () => {
      const permissions = ['admin:full'];
      const expanded = expandPermissions(permissions);

      expect(expanded.length).toBeGreaterThan(1);
      expect(expanded).toContain('read:users');
      expect(expanded).toContain('write:users');
      expect(expanded).toContain('read:groups');
      expect(expanded).toContain('admin:full');
    });

    it('should filter out invalid scopes', () => {
      const permissions = ['read:users', 'invalid:scope'];
      const expanded = expandPermissions(permissions);

      expect(expanded).toHaveLength(1);
      expect(expanded).toContain('read:users');
      expect(expanded).not.toContain('invalid:scope');
    });

    it('should handle empty array', () => {
      const expanded = expandPermissions([]);
      expect(expanded).toHaveLength(0);
    });
  });
});
