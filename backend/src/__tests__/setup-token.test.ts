/**
 * First-run setup token (services/setup-token.service.ts) and its enforcement on
 * POST /organization/setup.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ---- mocks for the route test (registered before dynamic imports) ----
type QueryResult = { rows: any[]; rowCount?: number };
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<QueryResult>>();
jest.unstable_mockModule('../database/connection.js', () => ({ db: { query: mockQuery } }));
jest.unstable_mockModule('../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.unstable_mockModule('../middleware/auth.js', () => ({
  authenticateToken: (_req: any, res: any) => res.status(401).json({ success: false }),
  optionalAuth: (_req: any, _res: any, next: any) => next(),
  requireAdmin: (_req: any, res: any) => res.status(403).json({ success: false }),
}));
jest.unstable_mockModule('../services/auth.service.js', () => ({
  authService: { generateAccessToken: jest.fn(() => 'minted-token') },
}));
jest.unstable_mockModule('../services/security-audit.service.js', () => ({
  securityAudit: { log: jest.fn(async () => 'audit-id') },
  AuditActions: {},
}));

const { SetupTokenStore, presentedSetupToken, setupTokenStore, SETUP_TOKEN_HEADER } = await import(
  '../services/setup-token.service.js'
);
const { default: organizationRouter } = await import('../routes/organization.routes.js');

const silent = { info: (): void => undefined, warn: (): void => undefined };

describe('SetupTokenStore', () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'helios-setup-token-'));
    file = join(dir, 'nested', 'setup-token');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('arms a random token when setup is required, logs it and writes the file', () => {
    const lines: string[] = [];
    const store = new SetupTokenStore({ filePath: file, presetToken: '', info: (m) => lines.push(m), warn: () => undefined });
    const token = store.initialize(true)!;

    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(store.isActive()).toBe(true);
    expect(lines.join('\n')).toContain(`Helios setup token: ${token}`);
    expect(readFileSync(file, 'utf8').trim()).toBe(token);
    if (process.platform !== 'win32') {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it('does not arm a token (and removes a stale file) when setup is not required', () => {
    writeFileSync(join(dir, 'stale'), 'x');
    const staleFile = join(dir, 'stale');
    const store = new SetupTokenStore({ filePath: staleFile, presetToken: '', ...silent });
    expect(store.initialize(false)).toBeNull();
    expect(store.isActive()).toBe(false);
    expect(existsSync(staleFile)).toBe(false);
    expect(store.verify('anything')).toBe(false);
  });

  it('reuses the token file across restarts', () => {
    const first = new SetupTokenStore({ filePath: file, presetToken: '', ...silent }).initialize(true);
    const second = new SetupTokenStore({ filePath: file, presetToken: '', ...silent }).initialize(true);
    expect(second).toBe(first);
  });

  it('HELIOS_SETUP_TOKEN presets the value and must be long enough', () => {
    const store = new SetupTokenStore({ filePath: file, presetToken: 'preset-token-0123456789', ...silent });
    expect(store.initialize(true)).toBe('preset-token-0123456789');
    expect(() => new SetupTokenStore({ filePath: file, presetToken: 'short', ...silent }).initialize(true)).toThrow(
      /at least 16/,
    );
  });

  it('verifies only the exact token, and destroy() makes it unusable and deletes the file', () => {
    const store = new SetupTokenStore({ filePath: file, presetToken: '', ...silent });
    const token = store.initialize(true)!;

    expect(store.verify(token)).toBe(true);
    expect(store.verify(` ${token} `)).toBe(true);
    expect(store.verify(token.slice(0, -1))).toBe(false);
    expect(store.verify(`${token}x`)).toBe(false);
    expect(store.verify('')).toBe(false);
    expect(store.verify(undefined)).toBe(false);
    expect(store.verify(123)).toBe(false);

    store.destroy();
    expect(store.verify(token)).toBe(false);
    expect(existsSync(file)).toBe(false);
  });

  it('reads the presented token from the header first, then the body', () => {
    expect(presentedSetupToken({ [SETUP_TOKEN_HEADER]: 'from-header' }, { setupToken: 'from-body' })).toBe('from-header');
    expect(presentedSetupToken({}, { setupToken: 'from-body' })).toBe('from-body');
    expect(presentedSetupToken({}, {})).toBeUndefined();
  });
});

describe('POST /organization/setup requires the setup token', () => {
  const VALID_BODY = {
    organizationName: 'Acme',
    organizationDomain: 'acme.test',
    adminEmail: 'admin@acme.test',
    adminPassword: 'correct-horse-battery',
    adminFirstName: 'Ada',
    adminLastName: 'Admin',
  };
  let app: Express;
  let orgExists: boolean;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'helios-setup-route-'));
    process.env.HELIOS_SETUP_TOKEN_FILE = join(dir, 'setup-token');
    delete process.env.HELIOS_SETUP_TOKEN;
    orgExists = false;
    mockQuery.mockReset();
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('SELECT id FROM organizations LIMIT 1')) {
        return { rows: orgExists ? [{ id: 'org-1' }] : [] };
      }
      if (text.includes('INSERT INTO organizations')) {
        orgExists = true;
        return { rows: [{ id: 'org-1', name: 'Acme', domain: 'acme.test' }] };
      }
      if (text.includes('INSERT INTO organization_users')) {
        return { rows: [{ id: 'user-1', email: 'admin@acme.test', first_name: 'Ada', last_name: 'Admin', role: 'admin' }] };
      }
      return { rows: [] };
    });
    app = express();
    app.use(express.json());
    app.use('/organization', organizationRouter);
  });

  afterEach(() => {
    setupTokenStore.destroy();
    delete process.env.HELIOS_SETUP_TOKEN_FILE;
    rmSync(dir, { recursive: true, force: true });
  });

  function arm(): string {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      return setupTokenStore.initialize(true)!;
    } finally {
      logSpy.mockRestore();
    }
  }

  it('rejects a request with no token (403) and creates nothing', async () => {
    arm();
    const res = await request(app).post('/organization/setup').send(VALID_BODY);
    expect(res.status).toBe(403);
    expect(mockQuery.mock.calls.some(([t]) => String(t).includes('INSERT'))).toBe(false);
  });

  it('rejects a wrong token (403)', async () => {
    arm();
    const res = await request(app)
      .post('/organization/setup')
      .set('X-Helios-Setup-Token', 'not-the-token-0123456789')
      .send(VALID_BODY);
    expect(res.status).toBe(403);
  });

  it('rejects every token when none is armed (403)', async () => {
    const res = await request(app).post('/organization/setup').send({ ...VALID_BODY, setupToken: 'guess-guess-guess-guess' });
    expect(res.status).toBe(403);
  });

  it('accepts the armed token, then destroys it; the endpoint is closed (409) afterwards', async () => {
    const token = arm();

    const ok = await request(app).post('/organization/setup').send({ ...VALID_BODY, setupToken: token });
    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);
    expect(setupTokenStore.isActive()).toBe(false);
    expect(existsSync(process.env.HELIOS_SETUP_TOKEN_FILE!)).toBe(false);

    const again = await request(app).post('/organization/setup').send({ ...VALID_BODY, setupToken: token });
    expect(again.status).toBe(409);
  });

  it('answers 409 once an organization exists, even with a valid token', async () => {
    const token = arm();
    orgExists = true;
    const res = await request(app).post('/organization/setup').set('X-Helios-Setup-Token', token).send(VALID_BODY);
    expect(res.status).toBe(409);
  });
});
