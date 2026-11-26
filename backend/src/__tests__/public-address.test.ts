import { describe, it, expect } from '@jest/globals';
import {
  publicAddress,
  appUrl,
  useSecureCookies,
  servedOverPlainHttp,
  trustProxySetting,
  passkeyRpId,
  passkeyOrigin,
} from '../config/public-address.js';

const prod = (extra: Record<string, string> = {}) => ({ NODE_ENV: 'production', ...extra });

describe('public address', () => {
  it('takes PUBLIC_URL first and drops a trailing slash', () => {
    expect(publicAddress({ PUBLIC_URL: 'https://helios.example.com/', FRONTEND_URL: 'http://localhost:8083' })).toBe(
      'https://helios.example.com'
    );
  });

  it('falls back to the older names, and treats an empty value as unset', () => {
    expect(publicAddress({ PUBLIC_URL: '', FRONTEND_URL: 'http://localhost:8083' })).toBe('http://localhost:8083');
    expect(publicAddress({})).toBeUndefined();
  });

  it('lets APP_URL override the base for email links only when it is set', () => {
    expect(appUrl({ PUBLIC_URL: 'https://helios.example.com', APP_URL: '' })).toBe('https://helios.example.com');
    expect(appUrl({ PUBLIC_URL: 'https://helios.example.com', APP_URL: 'https://links.example.com' })).toBe(
      'https://links.example.com'
    );
  });
});

describe('useSecureCookies', () => {
  it.each([
    ['no address configured', {}],
    ['an https address', { PUBLIC_URL: 'https://helios.example.com' }],
    ['http on this machine', { PUBLIC_URL: 'http://localhost:8083' }],
    ['http on 127.0.0.1', { FRONTEND_URL: 'http://127.0.0.1:8083' }],
    ['an address that does not parse', { PUBLIC_URL: 'not a url' }],
  ])('stays on in production with %s', (_label, env) => {
    expect(useSecureCookies(prod(env))).toBe(true);
  });

  it.each([
    ['an IP address over http', { PUBLIC_URL: 'http://192.168.1.20' }],
    ['a host name over http', { PUBLIC_URL: 'http://helios.lan:8080' }],
  ])('is off in production with %s, where a browser would drop the cookie', (_label, env) => {
    expect(useSecureCookies(prod(env))).toBe(false);
    expect(servedOverPlainHttp(env)).toBe(true);
  });

  it('is off outside production, as before', () => {
    expect(useSecureCookies({ NODE_ENV: 'development', PUBLIC_URL: 'https://helios.example.com' })).toBe(false);
  });
});

describe('trustProxySetting', () => {
  it('trusts one hop, the bundled proxy, when unset', () => {
    expect(trustProxySetting({})).toBe(1);
    expect(trustProxySetting({ TRUST_PROXY: '' })).toBe(1);
  });

  it('reads a hop count', () => {
    expect(trustProxySetting({ TRUST_PROXY: '2' })).toBe(2);
    expect(trustProxySetting({ TRUST_PROXY: '0' })).toBe(0);
  });

  it('never trusts every hop', () => {
    expect(trustProxySetting({ TRUST_PROXY: 'true' })).toBe(1);
    expect(trustProxySetting({ TRUST_PROXY: 'false' })).toBe(false);
  });

  it('passes an address list through', () => {
    expect(trustProxySetting({ TRUST_PROXY: 'loopback, 10.0.0.0/8' })).toBe('loopback, 10.0.0.0/8');
  });
});

describe('passkey settings', () => {
  it('come from the public address when not set', () => {
    const env = { PUBLIC_URL: 'https://helios.example.com' };
    expect(passkeyRpId(env)).toBe('helios.example.com');
    expect(passkeyOrigin(env)).toBe('https://helios.example.com');
  });

  it('keep the port in the origin and leave it out of the id', () => {
    const env = { PUBLIC_URL: 'http://localhost:8083' };
    expect(passkeyRpId(env)).toBe('localhost');
    expect(passkeyOrigin(env)).toBe('http://localhost:8083');
  });

  it('can be set outright', () => {
    const env = { PUBLIC_URL: 'https://helios.example.com', PASSKEY_RP_ID: 'example.com', PASSKEY_ORIGIN: 'https://sso.example.com/' };
    expect(passkeyRpId(env)).toBe('example.com');
    expect(passkeyOrigin(env)).toBe('https://sso.example.com');
  });

  it('default to this machine with nothing configured', () => {
    expect(passkeyRpId({})).toBe('localhost');
    expect(passkeyOrigin({})).toBe('http://localhost:3000');
  });
});
