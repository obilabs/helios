/**
 * A failed audit write is best-effort for the caller, but never silent: it is
 * logged with the action and the actor, and counted (lib/audit-write-failures.ts).
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const query = jest.fn<(...args: any[]) => Promise<any>>();
const error = jest.fn();

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error },
}));

const { getAuditWriteFailures, resetAuditWriteFailures } = await import('../lib/audit-write-failures.js');
const { securityAudit } = await import('../services/security-audit.service.js');

describe('failed audit writes', () => {
  beforeEach(() => {
    query.mockReset();
    error.mockReset();
    resetAuditWriteFailures();
  });

  it('starts at zero', () => {
    expect(getAuditWriteFailures()).toEqual({ sinceStart: 0, lastFailureAt: null, lastAction: null });
  });

  it('a successful write is not counted', async () => {
    query.mockResolvedValue({ rows: [{ id: 'row-1' }] });
    const id = await securityAudit.log({
      action: 'user.update', actorEmail: 'admin@corp.test', organizationId: 'org-1', outcome: 'success',
    } as any);
    expect(id).toBe('row-1');
    expect(getAuditWriteFailures().sinceStart).toBe(0);
    expect(error).not.toHaveBeenCalled();
  });

  it('a failed write returns null, is counted, and is logged with the action and the actor', async () => {
    query.mockRejectedValue(Object.assign(new Error('insert refused'), { code: '22P02' }));
    const id = await securityAudit.log({
      action: 'user.delete', actorEmail: 'admin@corp.test', organizationId: 'org-1', outcome: 'success',
    } as any);

    expect(id).toBeNull();
    const state = getAuditWriteFailures();
    expect(state.sinceStart).toBe(1);
    expect(state.lastAction).toBe('user.delete');
    expect(state.lastFailureAt).not.toBeNull();

    expect(error).toHaveBeenCalledTimes(1);
    const [, meta] = error.mock.calls[0] as [string, Record<string, unknown>];
    expect(meta).toMatchObject({
      action: 'user.delete', actor: 'admin@corp.test', source: 'security-audit.service',
      error: 'insert refused', code: '22P02', failuresSinceStart: 1,
    });
  });

  it('keeps counting', async () => {
    query.mockRejectedValue(new Error('nope'));
    await securityAudit.log({ action: 'a.one', organizationId: 'org-1', outcome: 'success' } as any);
    await securityAudit.log({ action: 'a.two', organizationId: 'org-1', outcome: 'success' } as any);
    expect(getAuditWriteFailures().sinceStart).toBe(2);
    expect(getAuditWriteFailures().lastAction).toBe('a.two');
  });
});

describe('required audit writes (D-072 tier 1)', () => {
  beforeEach(() => {
    query.mockReset();
    error.mockReset();
    resetAuditWriteFailures();
  });

  it('returns the row id when the write succeeds', async () => {
    query.mockResolvedValue({ rows: [{ id: 'row-9' }] });
    await expect(securityAudit.logRequired({
      action: 'security.bulk.revoke.requested', organizationId: 'org-1', outcome: 'success',
    } as any)).resolves.toBe('row-9');
  });

  it('throws when the write fails, so the caller can refuse the act, and still counts it', async () => {
    query.mockRejectedValue(new Error('insert refused'));
    await expect(securityAudit.logRequired({
      action: 'security.bulk.revoke.requested', actorEmail: 'admin@corp.test', organizationId: 'org-1', outcome: 'success',
    } as any)).rejects.toThrow('insert refused');
    expect(getAuditWriteFailures().sinceStart).toBe(1);
    const [, meta] = error.mock.calls[0] as [string, Record<string, unknown>];
    expect(meta).toMatchObject({ action: 'security.bulk.revoke.requested', source: 'security-audit.service (required)' });
  });

  it('throws when the insert returns no row', async () => {
    query.mockResolvedValue({ rows: [] });
    await expect(securityAudit.logRequired({
      action: 'security.token.revoke.requested', organizationId: 'org-1', outcome: 'success',
    } as any)).rejects.toThrow();
  });
});
