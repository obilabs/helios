/**
 * The audit middleware records a request once and reads the full request path,
 * whichever prefix it is mounted under.
 */
import { jest, describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: jest.fn() } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { auditMiddleware, requestPath } = await import('../middleware/audit.middleware.js');

function request(originalUrl: string, mountRelativePath: string, method = 'POST') {
  return {
    method,
    originalUrl,
    path: mountRelativePath,
    params: {},
    body: {},
    headers: {},
    get: (): undefined => undefined,
    ip: '127.0.0.1',
    socket: {},
  } as any;
}

function response() {
  const on = jest.fn<(...args: any[]) => any>();
  return { on, statusCode: 200, getHeader: (): undefined => undefined } as any;
}

describe('audit middleware', () => {
  it('reads the full path, not the mount-relative one', () => {
    expect(requestPath({ originalUrl: '/api/v1/users?limit=5', path: '/users' } as any)).toBe('/api/v1/users');
    expect(requestPath({ originalUrl: '', path: '/users' } as any)).toBe('/users');
  });

  it('attaches one record to a request that passes through it twice', async () => {
    const req = request('/api/v1/lifecycle/offboard', '/lifecycle/offboard');
    const res = response();
    const next = jest.fn<(...args: any[]) => any>();

    await auditMiddleware(req, res, next);
    await auditMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.on.mock.calls.filter((c: any[]) => c[0] === 'finish')).toHaveLength(1);
  });

  it('does not record reads or excluded paths', async () => {
    const read = response();
    await auditMiddleware(request('/api/v1/organization/users', '/organization/users', 'GET'), read, jest.fn());
    expect(read.on).not.toHaveBeenCalled();

    const health = response();
    await auditMiddleware(request('/api/v1/health', '/health'), health, jest.fn());
    expect(health.on).not.toHaveBeenCalled();
  });

  it('is mounted once in the application', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const index = fs.readFileSync(path.join(here, '..', 'index.ts'), 'utf8');
    const mounts = index.match(/app\.use\([^)]*auditMiddleware\)/g) || [];
    expect(mounts).toEqual(["app.use('/api', auditMiddleware)"]);
  });
});
