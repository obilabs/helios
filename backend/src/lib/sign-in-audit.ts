/**
 * Audit rows for sign-in through the session endpoints (/api/auth/sign-in/email).
 *
 * Those endpoints are served by the sign-in library, not by an Express route,
 * so neither the request audit middleware nor the route-level audit calls see
 * them. This records the outcome from the library's after-hook instead.
 *
 * Best-effort like every routine audit write: a failure here never changes the
 * answer the person signing in receives. It is logged and counted by
 * securityAudit.log().
 */
import { db } from '../database/connection.js';
import { securityAudit, AuditActions } from '../services/security-audit.service.js';

export interface SignInAttempt {
  /** The address typed into the form. */
  email?: string;
  /** True when the library refused the sign-in. */
  failed: boolean;
  /** The library's error code, e.g. INVALID_EMAIL_OR_PASSWORD. */
  errorCode?: string;
  ip?: string;
  userAgent?: string;
}

const MAX_EMAIL_LENGTH = 254;

export async function recordSignInAttempt(attempt: SignInAttempt): Promise<void> {
  const email = typeof attempt.email === 'string' ? attempt.email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH) : '';

  // Who it was, when the address belongs to an account. An unknown address is
  // still recorded: repeated attempts against addresses that do not exist are
  // exactly what an admin needs to be able to see.
  let userId: string | undefined;
  let organizationId: string | null = null;
  if (email) {
    const found = await db.query(
      'SELECT id, organization_id FROM organization_users WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );
    userId = found.rows[0]?.id;
    organizationId = found.rows[0]?.organization_id ?? null;
  }
  if (!organizationId) {
    const org = await db.query('SELECT id FROM organizations ORDER BY created_at NULLS LAST, id LIMIT 1');
    organizationId = org.rows[0]?.id ?? null;
  }

  await securityAudit.logAuth({
    action: attempt.failed ? AuditActions.AUTH_LOGIN_FAILURE : AuditActions.AUTH_LOGIN_SUCCESS,
    outcome: attempt.failed ? 'failure' : 'success',
    userId,
    email: email || undefined,
    // organization_id is nullable (migration 068); before first-run setup there is none.
    organizationId: organizationId as unknown as string,
    ip: attempt.ip,
    userAgent: attempt.userAgent,
    errorMessage: attempt.failed ? attempt.errorCode || 'sign-in refused' : undefined,
  });
}
