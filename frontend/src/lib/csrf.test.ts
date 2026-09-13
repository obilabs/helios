import { describe, it, expect } from 'vitest';
import { readCookie, withCsrfHeader, CSRF_HEADER } from './csrf';

const TOKEN = 'f'.repeat(64);
const ctx = { cookie: `theme=dark; helios_csrf=${TOKEN}`, origin: 'https://helios.example.com' };

function header(init: RequestInit | undefined): string | null {
  return init?.headers ? new Headers(init.headers).get(CSRF_HEADER) : null;
}

describe('readCookie', () => {
  it('finds a cookie among several', () => {
    expect(readCookie(ctx.cookie, 'helios_csrf')).toBe(TOKEN);
    expect(readCookie(ctx.cookie, 'theme')).toBe('dark');
    expect(readCookie(ctx.cookie, 'missing')).toBeNull();
    expect(readCookie('', 'helios_csrf')).toBeNull();
  });
});

describe('withCsrfHeader', () => {
  it.each(['POST', 'put', 'PATCH', 'DELETE'])('adds the header to a same-origin %s', (method) => {
    expect(header(withCsrfHeader('/api/v1/users', { method }, ctx))).toBe(TOKEN);
  });

  it('keeps existing headers', () => {
    const init = withCsrfHeader('/api/v1/users', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, ctx);
    expect(new Headers(init!.headers).get('Content-Type')).toBe('application/json');
    expect(header(init)).toBe(TOKEN);
  });

  it('reads the method from a Request object', () => {
    const req = new Request('https://helios.example.com/api/v1/users', { method: 'DELETE' });
    expect(header(withCsrfHeader(req, undefined, ctx))).toBe(TOKEN);
  });

  it('leaves safe methods alone', () => {
    const init = { headers: { Accept: 'application/json' } };
    expect(withCsrfHeader('/api/v1/users', init, ctx)).toBe(init);
    expect(withCsrfHeader('/api/v1/users', undefined, ctx)).toBeUndefined();
  });

  it('never sends the token to another origin', () => {
    expect(header(withCsrfHeader('https://evil.example.net/x', { method: 'POST' }, ctx))).toBeNull();
  });

  it('sends it to a configured API origin', () => {
    const init = withCsrfHeader('http://localhost:3001/api/v1/users', { method: 'POST' }, { ...ctx, apiOrigins: ['http://localhost:3001'] });
    expect(header(init)).toBe(TOKEN);
  });

  it('does nothing when there is no token cookie', () => {
    const init = { method: 'POST' };
    expect(withCsrfHeader('/api/v1/users', init, { ...ctx, cookie: 'theme=dark' })).toBe(init);
  });

  it('does not override a header the caller set', () => {
    const init = { method: 'POST', headers: { [CSRF_HEADER]: 'explicit' } };
    expect(header(withCsrfHeader('/api/v1/users', init, ctx))).toBe('explicit');
  });
});
