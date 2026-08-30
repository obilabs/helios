import crypto from 'crypto';
import { resolveEncryptionKey } from '../config/encryption-key.js';

// Encryption key for sensitive data (service account credentials, API secrets, etc.).
// Fails fast in production if unset/weak; uses a stable dev key otherwise (never a
// per-process random key, which silently destroyed stored secrets on restart).
const ENCRYPTION_KEY = resolveEncryptionKey('ENCRYPTION_KEY');
const IV_LENGTH = 16;

/**
 * Encryption service for handling sensitive data
 */
class EncryptionService {
  private key: Buffer;

  constructor() {
    // Ensure key is 32 bytes for AES-256
    this.key = Buffer.from(ENCRYPTION_KEY, 'hex');
    if (this.key.length !== 32) {
      // If key is not 32 bytes, hash it to get consistent 32 bytes
      this.key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
    }
  }

  /**
   * Encrypt a string using AES-256-CBC
   */
  encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Decrypt a string encrypted with encrypt()
   */
  decrypt(text: string): string {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift()!, 'hex');
    const encryptedText = textParts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Hash a string using SHA-256
   */
  hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Generate a random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();
