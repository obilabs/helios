/**
 * Operator password reset for an admin who cannot sign in.
 *
 * Authority comes from shell access to the server, the same place the first-run
 * setup token is read from. There is deliberately no HTTP route for this.
 *
 * The password change, the sign-out of existing sessions and the audit row are
 * one transaction: either all three happen or none does.
 */
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';

export const MIN_PASSWORD_LENGTH = 12;

export interface ResetOutcome {
  ok: boolean;
  message: string;
  email?: string;
}

export async function resetAdminPassword(
  client: Pick<PoolClient, 'query'>,
  options: { email?: string; password: string }
): Promise<ResetOutcome> {
  if (options.password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `The password must be at least ${MIN_PASSWORD_LENGTH} characters. Nothing was changed.`,
    };
  }

  const admins = (
    await client.query(
      `SELECT id, email, organization_id FROM organization_users
        WHERE role = 'admin' AND is_active = true
        ORDER BY created_at`
    )
  ).rows as Array<{ id: string; email: string; organization_id: string | null }>;

  if (admins.length === 0) {
    return { ok: false, message: 'No active admin account exists. Nothing was changed.' };
  }

  let admin = admins[0];
  if (options.email) {
    const wanted = options.email.toLowerCase();
    const match = admins.find((a) => a.email.toLowerCase() === wanted);
    if (!match) {
      return { ok: false, message: `${options.email} is not an active admin. Nothing was changed.` };
    }
    admin = match;
  } else if (admins.length > 1) {
    return {
      ok: false,
      message: `There are ${admins.length} active admins. Add the email address of the one to reset to the command. Nothing was changed.`,
    };
  }

  const hash = await bcrypt.hash(options.password, 12);

  await client.query('BEGIN');
  try {
    const account = await client.query(
      `UPDATE auth_accounts SET password = $1, updated_at = NOW()
        WHERE user_id = $2 AND provider_id = 'credential'`,
      [hash, admin.id]
    );
    if (account.rowCount !== 1) {
      throw new Error(`expected one password record for ${admin.email}, found ${account.rowCount}`);
    }
    await client.query('UPDATE organization_users SET password_hash = $1 WHERE id = $2', [hash, admin.id]);
    await client.query('DELETE FROM auth_sessions WHERE user_id = $1', [admin.id]);
    await client.query(
      `INSERT INTO security_audit_logs (
         actor_type, action, action_category, target_type, target_id, target_identifier,
         organization_id, outcome
       ) VALUES ('system', 'auth.password.reset.operator', 'auth', 'user', $1, $2, $3, 'success')`,
      [admin.id, admin.email, admin.organization_id]
    );
    await client.query('COMMIT');
  } catch (error: any) {
    await client.query('ROLLBACK');
    return { ok: false, message: `Failed, nothing was changed: ${error.message}` };
  }

  return {
    ok: true,
    email: admin.email,
    message: `Password changed for ${admin.email}. Existing sessions were signed out.`,
  };
}
