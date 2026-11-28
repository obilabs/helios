/**
 * Revoking third-party app access is recorded in the audit log (D-072 tier 1).
 *
 * Found on a real tenant 2026-11-28: revoking an app from all users succeeded at
 * Google but left no audit record (the client id was written to a uuid column, so
 * the insert failed), and both revoke routes wrote "success" before acting.
 *
 * The act happens at Google, which a database transaction cannot include, so:
 *   1. a "revoke requested" row is written first and MUST succeed, or nothing is
 *      revoked (no act without a record);
 *   2. the revoke runs;
 *   3. an outcome row records success / partial / failure and the counts.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';

const log = jest.fn<(entry: any) => Promise<string | null>>();
const logRequired = jest.fn<(entry: any) => Promise<string>>();
const revokeAppFromAll = jest.fn<(org: string, clientId: string) => Promise<any>>();
const revokeToken = jest.fn<(org: string, email: string, clientId: string) => Promise<any>>();
const order: string[] = [];

jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { userId: '11111111-1111-4111-8111-111111111111', email: 'admin@corp.test', organizationId: 'org-1', role: 'admin' };
    next();
  },
  requireAdmin: (_req: any, _res: any, next: any) => next(),
}));
jest.unstable_mockModule('../services/oauth-token-sync.service.js', () => ({
  oauthTokenSyncService: { revokeAppFromAll, revokeToken },
}));
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log, logRequired },
  AuditActions: {
    SECURITY_TOKEN_REVOKE: 'security.token.revoke',
    SECURITY_BULK_REVOKE: 'security.bulk.revoke',
    SECURITY_TOKEN_REVOKE_REQUESTED: 'security.token.revoke.requested',
    SECURITY_BULK_REVOKE_REQUESTED: 'security.bulk.revoke.requested',
  },
}));

const { default: securityRoutes } = await import('../routes/security.routes.js');

const CLIENT_ID = '1008170693301-abc.apps.googleusercontent.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use('/api/v1/organization/security', securityRoutes);
  return a;
}

const allEntries = () => [...logRequired.mock.calls, ...log.mock.calls].map(([e]) => e);

beforeEach(() => {
  order.length = 0;
  log.mockReset().mockImplementation(async (e) => { order.push(`log:${e.action}`); return 'row'; });
  logRequired.mockReset().mockImplementation(async (e) => { order.push(`required:${e.action}`); return 'row'; });
  revokeAppFromAll.mockReset().mockImplementation(async () => {
    order.push('revoke');
    return { success: true, revokedCount: 2, failedCount: 0, errors: [] };
  });
  revokeToken.mockReset().mockImplementation(async () => { order.push('revoke'); return { success: true }; });
});

describe('revoke an app from all users', () => {
  const del = () => request(app()).delete(`/api/v1/organization/security/oauth-apps/${encodeURIComponent(CLIENT_ID)}`);

  it('records the request before revoking, naming the app by its client id', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(order).toEqual(['required:security.bulk.revoke.requested', 'revoke', 'log:security.bulk.revoke']);
    expect(logRequired.mock.calls[0][0]).toMatchObject({
      organizationId: 'org-1', actorEmail: 'admin@corp.test',
      targetType: 'oauth_app', targetIdentifier: CLIENT_ID,
    });
  });

  it('never puts a client id in the uuid target column', async () => {
    await del();
    for (const e of allEntries()) {
      if (e.targetId !== undefined && e.targetId !== null) expect(e.targetId).toMatch(UUID);
    }
  });

  it('refuses to revoke when the request cannot be recorded', async () => {
    logRequired.mockRejectedValueOnce(new Error('insert refused'));
    const res = await del();
    expect(res.status).toBe(500);
    expect(revokeAppFromAll).not.toHaveBeenCalled();
    expect(res.body.error?.message || res.body.message).toMatch(/not revoked/i);
  });

  it('records the real outcome and counts after revoking', async () => {
    await del();
    expect(log.mock.calls[0][0]).toMatchObject({
      action: 'security.bulk.revoke', outcome: 'success',
      targetType: 'oauth_app', targetIdentifier: CLIENT_ID,
      changesAfter: { revokedCount: 2, failedCount: 0 },
    });
  });

  it('records a partial revoke as partial, with who failed', async () => {
    revokeAppFromAll.mockResolvedValueOnce({ success: false, revokedCount: 1, failedCount: 1, errors: ['b@corp.test: denied'] });
    await del();
    expect(log.mock.calls[0][0]).toMatchObject({
      outcome: 'partial', changesAfter: { revokedCount: 1, failedCount: 1, errors: ['b@corp.test: denied'] },
    });
  });

  it('records a revoke where nobody was revoked as a failure', async () => {
    revokeAppFromAll.mockResolvedValueOnce({ success: false, revokedCount: 0, failedCount: 2, errors: ['x', 'y'] });
    await del();
    expect(log.mock.calls[0][0]).toMatchObject({ outcome: 'failure' });
  });

  it('keeps the response the frontend reads', async () => {
    const res = await del();
    expect(res.body.data).toMatchObject({ revokedCount: 2, failedCount: 0 });
  });
});

describe('revoke one person\'s access to an app', () => {
  const del = () => request(app()).delete(
    `/api/v1/organization/security/users/${encodeURIComponent('pat@corp.test')}/oauth-tokens/${encodeURIComponent(CLIENT_ID)}`
  );

  it('records the request first, including which app', async () => {
    const res = await del();
    expect(res.status).toBe(200);
    expect(order).toEqual(['required:security.token.revoke.requested', 'revoke', 'log:security.token.revoke']);
    expect(logRequired.mock.calls[0][0]).toMatchObject({
      targetType: 'oauth_token', targetIdentifier: 'pat@corp.test', changesBefore: { clientId: CLIENT_ID },
    });
  });

  it('refuses to revoke when the request cannot be recorded', async () => {
    logRequired.mockRejectedValueOnce(new Error('insert refused'));
    const res = await del();
    expect(res.status).toBe(500);
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it('records a failed revoke as a failure, not a success', async () => {
    revokeToken.mockResolvedValueOnce({ success: false, error: 'Google said no' });
    const res = await del();
    expect(res.status).toBe(500);
    expect(log.mock.calls[0][0]).toMatchObject({
      action: 'security.token.revoke', outcome: 'failure', errorMessage: 'Google said no',
      changesBefore: { clientId: CLIENT_ID },
    });
  });
});
