/**
 * Operator password reset (lib/admin-password-reset.ts).
 */
import { jest, describe, it, expect } from '@jest/globals';
import { resetAdminPassword } from '../lib/admin-password-reset.js';

type Row = { id: string; email: string; organization_id: string | null };

function fakeClient(admins: Row[], accountRows = 1) {
  const calls: Array<{ sql: string; params?: any[] }> = [];
  const query = jest.fn(async (sql: string, params?: any[]) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    if (sql.includes('FROM organization_users')) return { rows: admins, rowCount: admins.length };
    if (sql.includes('UPDATE auth_accounts')) return { rows: [], rowCount: accountRows };
    return { rows: [], rowCount: 1 };
  });
  return { client: { query } as any, calls };
}

const one: Row = { id: 'u1', email: 'admin@corp.test', organization_id: 'org-1' };
const two: Row = { id: 'u2', email: 'second@corp.test', organization_id: 'org-1' };
const strong = 'a-long-enough-value';

describe('resetAdminPassword', () => {
  it('refuses a short password before touching the database', async () => {
    const { client, calls } = fakeClient([one]);
    const out = await resetAdminPassword(client, { password: 'short' });
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('refuses when there is no active admin', async () => {
    const { client } = fakeClient([]);
    expect((await resetAdminPassword(client, { password: strong })).ok).toBe(false);
  });

  it('asks which admin when there are several and none is named', async () => {
    const { client, calls } = fakeClient([one, two]);
    const out = await resetAdminPassword(client, { password: strong });
    expect(out.ok).toBe(false);
    expect(calls.some((c) => c.sql.startsWith('BEGIN'))).toBe(false);
  });

  it('refuses an address that is not an active admin', async () => {
    const { client } = fakeClient([one, two]);
    expect((await resetAdminPassword(client, { email: 'user@corp.test', password: strong })).ok).toBe(false);
  });

  it('changes the password, signs sessions out and writes the audit row in one transaction', async () => {
    const { client, calls } = fakeClient([one, two]);
    const out = await resetAdminPassword(client, { email: 'SECOND@corp.test', password: strong });
    expect(out).toMatchObject({ ok: true, email: 'second@corp.test' });

    const order = calls.map((c) => c.sql.split(' ').slice(0, 3).join(' '));
    expect(order).toEqual([
      'SELECT id, email,',
      'BEGIN',
      'UPDATE auth_accounts SET',
      'UPDATE organization_users SET',
      'DELETE FROM auth_sessions',
      'INSERT INTO security_audit_logs',
      'COMMIT',
    ]);
    const stored = calls[2].params![0] as string;
    expect(stored).not.toContain(strong);
    expect(stored.startsWith('$2')).toBe(true);
    expect(calls[2].params![1]).toBe('u2');
    expect(JSON.stringify(calls[5])).not.toContain(strong);
  });

  it('rolls back when the password record is missing', async () => {
    const { client, calls } = fakeClient([one], 0);
    const out = await resetAdminPassword(client, { password: strong });
    expect(out.ok).toBe(false);
    expect(calls.at(-1)!.sql).toBe('ROLLBACK');
  });
});
