/**
 * Sign-in attempts through the session endpoints are written to the security
 * audit log (lib/sign-in-audit.ts).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const query = jest.fn<(...args: any[]) => Promise<any>>();
const logAuth = jest.fn<(...args: any[]) => Promise<any>>();

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query } }));
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { logAuth },
  AuditActions: { AUTH_LOGIN_SUCCESS: 'auth.login.success', AUTH_LOGIN_FAILURE: 'auth.login.failure' },
}));

const { recordSignInAttempt } = await import('../lib/sign-in-audit.js');

const knownUser = () =>
  query.mockImplementation(async (sql: string) =>
    String(sql).includes('FROM organization_users')
      ? { rows: [{ id: 'u1', organization_id: 'org-1' }] }
      : { rows: [{ id: 'org-1' }] }
  );
const unknownUser = () =>
  query.mockImplementation(async (sql: string) =>
    String(sql).includes('FROM organization_users') ? { rows: [] } : { rows: [{ id: 'org-1' }] }
  );

describe('recordSignInAttempt', () => {
  beforeEach(() => {
    query.mockReset();
    logAuth.mockReset();
    logAuth.mockResolvedValue('row-1');
  });

  it('records a refused sign-in for a known account, with who and from where', async () => {
    knownUser();
    await recordSignInAttempt({
      email: '  Admin@Corp.test ',
      failed: true,
      errorCode: 'INVALID_EMAIL_OR_PASSWORD',
      ip: '203.0.113.9',
      userAgent: 'test-agent',
    });

    expect(logAuth).toHaveBeenCalledWith({
      action: 'auth.login.failure',
      outcome: 'failure',
      userId: 'u1',
      email: 'admin@corp.test',
      organizationId: 'org-1',
      ip: '203.0.113.9',
      userAgent: 'test-agent',
      errorMessage: 'INVALID_EMAIL_OR_PASSWORD',
    });
  });

  it('records a refused sign-in for an address with no account', async () => {
    unknownUser();
    await recordSignInAttempt({ email: 'nobody@corp.test', failed: true });

    const row = logAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({
      action: 'auth.login.failure',
      outcome: 'failure',
      email: 'nobody@corp.test',
      organizationId: 'org-1',
      errorMessage: 'sign-in refused',
    });
    expect(row.userId).toBeUndefined();
  });

  it('records a successful sign-in without an error message', async () => {
    knownUser();
    await recordSignInAttempt({ email: 'admin@corp.test', failed: false });

    const row = logAuth.mock.calls[0][0] as Record<string, unknown>;
    expect(row).toMatchObject({ action: 'auth.login.success', outcome: 'success', userId: 'u1' });
    expect(row.errorMessage).toBeUndefined();
  });

  it('still records when no address was sent, and caps a very long one', async () => {
    unknownUser();
    await recordSignInAttempt({ failed: true });
    expect((logAuth.mock.calls[0][0] as any).email).toBeUndefined();

    await recordSignInAttempt({ email: 'a'.repeat(400) + '@corp.test', failed: true });
    expect(((logAuth.mock.calls[1][0] as any).email as string).length).toBe(254);
  });

  it('never receives or stores a password', async () => {
    knownUser();
    await recordSignInAttempt({ email: 'admin@corp.test', failed: true, ...( { password: 'should-not-appear' } as object) });
    expect(JSON.stringify(logAuth.mock.calls)).not.toContain('should-not-appear');
    expect(JSON.stringify(query.mock.calls)).not.toContain('should-not-appear');
  });
});
