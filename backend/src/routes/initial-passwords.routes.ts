import { Router } from 'express';
import { requireAuth, requirePermission } from '../middleware/auth.js';
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';
import {
  successResponse,
  errorResponse,
  notFoundResponse
} from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';
import crypto from 'crypto';

const router = Router();

// Simple encryption for initial passwords (in production, use a proper key management system)
const ENCRYPTION_KEY = process.env.INITIAL_PASSWORD_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const IV_LENGTH = 16;

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts.shift()!, 'hex');
  const encryptedText = Buffer.from(parts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

/**
 * Store an initial password for a newly created user
 */
router.post('/', requirePermission('admin'), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { email, password } = req.body;

    if (!organizationId || !email || !password) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Email and password required');
    }

    const encryptedPassword = encrypt(password);

    // Upsert - replace if exists
    await db.query(`
      INSERT INTO user_initial_passwords (organization_id, user_email, encrypted_password, created_by)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (organization_id, user_email)
      DO UPDATE SET
        encrypted_password = EXCLUDED.encrypted_password,
        created_by = EXCLUDED.created_by,
        created_at = NOW(),
        revealed_at = NULL,
        revealed_by = NULL,
        cleared_at = NULL,
        cleared_by = NULL
    `, [organizationId, email.toLowerCase(), encryptedPassword, userId]);

    logger.info('Initial password stored', { organizationId, email, createdBy: userId });

    return successResponse(res, { stored: true, email });

  } catch (error: any) {
    logger.error('Failed to store initial password', { error: error.message });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message);
  }
});

/**
 * Reveal an initial password for a user
 */
router.get('/:email', requirePermission('admin'), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { email } = req.params;

    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID required');
    }

    const result = await db.query(`
      SELECT id, encrypted_password, created_at, revealed_at, cleared_at
      FROM user_initial_passwords
      WHERE organization_id = $1 AND user_email = $2
    `, [organizationId, email.toLowerCase()]);

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'Initial password');
    }

    const record = result.rows[0];

    // Check if already cleared
    if (record.cleared_at) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Initial password has been cleared (user likely changed their password)');
    }

    // Decrypt and return
    const password = decrypt(record.encrypted_password);

    // Mark as revealed
    await db.query(`
      UPDATE user_initial_passwords
      SET revealed_at = NOW(), revealed_by = $3
      WHERE organization_id = $1 AND user_email = $2
    `, [organizationId, email.toLowerCase(), userId]);

    logger.info('Initial password revealed', { organizationId, email, revealedBy: userId });

    return successResponse(res, {
      email,
      password,
      createdAt: record.created_at,
      previouslyRevealed: !!record.revealed_at
    });

  } catch (error: any) {
    logger.error('Failed to reveal initial password', { error: error.message });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message);
  }
});

/**
 * Clear an initial password (after user changes their password)
 */
router.delete('/:email', requirePermission('admin'), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;
    const { email } = req.params;

    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID required');
    }

    // Soft delete - mark as cleared but keep record for audit
    const result = await db.query(`
      UPDATE user_initial_passwords
      SET cleared_at = NOW(), cleared_by = $3
      WHERE organization_id = $1 AND user_email = $2 AND cleared_at IS NULL
      RETURNING id
    `, [organizationId, email.toLowerCase(), userId]);

    if (result.rows.length === 0) {
      return notFoundResponse(res, 'Initial password');
    }

    logger.info('Initial password cleared', { organizationId, email, clearedBy: userId });

    return successResponse(res, { cleared: true, email });

  } catch (error: any) {
    logger.error('Failed to clear initial password', { error: error.message });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message);
  }
});

/**
 * List all initial passwords (metadata only, not the actual passwords)
 */
router.get('/', requirePermission('admin'), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const { includeCleared } = req.query;

    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID required');
    }

    let query = `
      SELECT
        user_email as email,
        created_at,
        revealed_at,
        cleared_at
      FROM user_initial_passwords
      WHERE organization_id = $1
    `;

    if (includeCleared !== 'true') {
      query += ` AND cleared_at IS NULL`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await db.query(query, [organizationId]);

    return successResponse(res, {
      passwords: result.rows,
      total: result.rows.length
    });

  } catch (error: any) {
    logger.error('Failed to list initial passwords', { error: error.message });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message);
  }
});

/**
 * Clear all initial passwords
 */
router.delete('/', requirePermission('admin'), async (req, res) => {
  try {
    const organizationId = req.user?.organizationId;
    const userId = req.user?.userId;

    if (!organizationId) {
      return errorResponse(res, ErrorCode.VALIDATION_ERROR, 'Organization ID required');
    }

    const result = await db.query(`
      UPDATE user_initial_passwords
      SET cleared_at = NOW(), cleared_by = $2
      WHERE organization_id = $1 AND cleared_at IS NULL
    `, [organizationId, userId]);

    logger.info('All initial passwords cleared', { organizationId, clearedBy: userId, count: result.rowCount });

    return successResponse(res, { cleared: true, count: result.rowCount });

  } catch (error: any) {
    logger.error('Failed to clear all initial passwords', { error: error.message });
    return errorResponse(res, ErrorCode.INTERNAL_ERROR, error.message);
  }
});

export default router;
