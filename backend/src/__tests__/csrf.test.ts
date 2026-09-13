/**
 * CSRF double-submit protection (middleware/csrf.ts).
 *
 * Cookie-authenticated state-changing requests must echo the `helios_csrf`
 * cookie in `X-CSRF-Token`; everything else passes through untouched.
 */
import { describe, it, expect } from '@jest/globals';
import express, { Express } from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { csrfProtection, verifyCsrfToken, CSRF_COOKIE, CSRF_HEADER } from '../middleware/csrf.js';

const TOKEN = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
const SESSION = 'helios.session_token=sess-123';

function buildApp(): Express {
  const app = express();
  app.use(rateLimit({ windowMs: 60_000, max: 10_000 }));
  // Minimal stand-in for cookie-parser: req.cookies from the Cookie header.
  app.use((req, _res, next) => {
    req.cookies = Object.fromEntries(
      (req.headers.cookie ?? '')
        .split(';')
        .map((part) => part.trim().split('='))
        .filter(([name]) => name)
        .map(([name, ...rest]) => [name, rest.join('=')])
    );
    next();
  });
  app.use(csrfProtection);
  app.all('*', (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
}

describe('csrfProtection', () => {
  const app = buildApp();

  it('issues a readable SameSite=Strict token cookie when none is present', async () => {
    const res = await request(app).get('/api/v1/organization/current');
    expect(res.status).toBe(200);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    const csrf = setCookie.find((c) => c.startsWith(`${CSRF_COOKIE}=`));
    expect(csrf).toBeDefined();
    expect(csrf).toMatch(/SameSite=Strict/i);
    expect(csrf).not.toMatch(/HttpOnly/i);
    expect(csrf!.split(';')[0].split('=')[1]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not reissue the cookie when a valid one is present', async () => {
    const res = await request(app).get('/api/v1/x').set('Cookie', `${CSRF_COOKIE}=${TOKEN}`);
    const setCookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(setCookie.some((c) => c.startsWith(`${CSRF_COOKIE}=`))).toBe(false);
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'rejects a cookie-authenticated %s without the header',
    async (method) => {
      const res = await request(app)[method]('/api/v1/organization/settings')
        .set('Cookie', `${SESSION}; ${CSRF_COOKIE}=${TOKEN}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    }
  );

  it('rejects a mismatched header token', async () => {
    const res = await request(app)
      .post('/api/v1/organization/settings')
      .set('Cookie', `${SESSION}; ${CSRF_COOKIE}=${TOKEN}`)
      .set(CSRF_HEADER, OTHER);
    expect(res.status).toBe(403);
  });

  it('rejects a header token when the token cookie is missing', async () => {
    const res = await request(app)
      .post('/api/v1/organization/settings')
      .set('Cookie', SESSION)
      .set(CSRF_HEADER, TOKEN);
    expect(res.status).toBe(403);
  });

  it('accepts a cookie-authenticated request with the matching header', async () => {
    const res = await request(app)
      .post('/api/v1/organization/settings')
      .set('Cookie', `${SESSION}; ${CSRF_COOKIE}=${TOKEN}`)
      .set(CSRF_HEADER, TOKEN);
    expect(res.status).toBe(200);
  });

  it('checks the production (__Secure-) session cookie too', async () => {
    const res = await request(app)
      .delete('/api/v1/users/1')
      .set('Cookie', `__Secure-helios.session_token=s; ${CSRF_COOKIE}=${TOKEN}`);
    expect(res.status).toBe(403);
  });

  it('lets safe methods through with a session cookie', async () => {
    const res = await request(app).get('/api/v1/users').set('Cookie', SESSION);
    expect(res.status).toBe(200);
  });

  it('lets requests without a session cookie through (setup wizard, sign-in)', async () => {
    const res = await request(app).post('/api/v1/organization/setup').send({});
    expect(res.status).toBe(200);
  });

  it('lets requests with explicit credentials through', async () => {
    const bearer = await request(app)
      .post('/api/v1/users')
      .set('Cookie', SESSION)
      .set('Authorization', 'Bearer abc');
    expect(bearer.status).toBe(200);

    const apiKey = await request(app)
      .post('/api/v1/users')
      .set('Cookie', SESSION)
      .set('X-API-Key', 'helios_key');
    expect(apiKey.status).toBe(200);
  });

  it.each(['/api/v1/mtp/sync', '/api/mtp/sync', '/api/v1/training/v1/results', '/api/training/v1/results'])(
    'exempts machine route %s',
    async (path) => {
      const res = await request(app).post(path).set('Cookie', SESSION);
      expect(res.status).toBe(200);
    }
  );

  it('does not exempt look-alike paths', async () => {
    const res = await request(app).post('/api/v1/mtp-admin/x').set('Cookie', SESSION);
    expect(res.status).toBe(403);
  });
});

describe('verifyCsrfToken', () => {
  it('requires two equal strings of sufficient length', () => {
    expect(verifyCsrfToken(TOKEN, TOKEN)).toBe(true);
    expect(verifyCsrfToken(TOKEN, OTHER)).toBe(false);
    expect(verifyCsrfToken('short', 'short')).toBe(false);
    expect(verifyCsrfToken(TOKEN, TOKEN.slice(1))).toBe(false);
    expect(verifyCsrfToken(undefined, TOKEN)).toBe(false);
    expect(verifyCsrfToken(TOKEN, ['x'])).toBe(false);
  });
});

describe('index.ts wiring', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'), 'utf8');

  it('mounts csrfProtection after cookie-parser and before any API router', () => {
    const cookie = src.indexOf('app.use(cookieParser());');
    const csrf = src.indexOf('app.use(csrfProtection);');
    const api = src.indexOf("app.use('/api/v1', apiRouter);");
    expect(cookie).toBeGreaterThan(-1);
    expect(csrf).toBeGreaterThan(cookie);
    expect(api).toBeGreaterThan(csrf);
  });

  it('allows the CSRF header through CORS', () => {
    expect(src).toMatch(/allowedHeaders:[\s\S]*CSRF_HEADER/);
  });
});
