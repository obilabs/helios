/**
 * The one place a successful sign-in records organization_users.last_login.
 *
 * Two sign-in paths exist: the session endpoints served by better-auth
 * (/api/auth/sign-in/email, two-factor and passkey, and the first-run setup
 * wizard, which signs the new admin in through the same form) and the older
 * JWT route POST /api/v1/auth/login. Only the JWT route used to write the
 * column, so anyone who signed in through the form showed "Never" on the
 * Users list and on Roles & Admins.
 *
 * better-auth reaches this through its session-create database hook (every
 * completed sign-in creates exactly one session); the JWT route calls it
 * directly. Best-effort: failing to stamp the time never refuses a sign-in.
 */
import { db } from '../database/connection.js';
import { logger } from '../utils/logger.js';

export async function recordLastLogin(userId: string | undefined | null): Promise<void> {
  if (!userId) return;
  try {
    await db.query('UPDATE organization_users SET last_login = NOW() WHERE id = $1', [userId]);
  } catch (error: any) {
    logger.warn('Could not record last login time', { userId, error: error?.message });
  }
}

/** better-auth databaseHooks.session.create.after */
export async function recordLastLoginForSession(session: { userId?: string | null }): Promise<void> {
  await recordLastLogin(session?.userId);
}
