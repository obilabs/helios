/**
 * The address people use to reach this install, and what follows from it.
 *
 * PUBLIC_URL is the one setting an admin has to get right. FRONTEND_URL and
 * APP_URL are older names kept as overrides; when they are empty they take the
 * value of PUBLIC_URL (docker-compose.yml does the same for the containers).
 */

type Env = Record<string, string | undefined>;

function firstSet(env: Env, names: string[]): string | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return value.replace(/\/+$/, '');
  }
  return undefined;
}

/** The address in the browser's address bar, without a trailing slash. */
export function publicAddress(env: Env = process.env): string | undefined {
  return firstSet(env, ['PUBLIC_URL', 'FRONTEND_URL', 'APP_URL']);
}

/** Base for links sent by email and for the sign-in library. */
export function appUrl(env: Env = process.env): string | undefined {
  return firstSet(env, ['APP_URL', 'PUBLIC_URL', 'FRONTEND_URL']);
}

function parse(url: string | undefined): URL | undefined {
  if (!url) return undefined;
  try {
    return new URL(url);
  } catch {
    return undefined;
  }
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

/**
 * Whether sign-in cookies carry the Secure flag.
 *
 * A browser drops a Secure cookie that arrives over plain http from anything
 * but this machine, so an install reached as http://192.168.1.20 would accept
 * the password and then show the sign-in form again. Secure stays on unless
 * the configured address says the install is deliberately served over http
 * from another machine.
 */
export function useSecureCookies(env: Env = process.env): boolean {
  if (env['NODE_ENV'] !== 'production') return false;
  const url = parse(publicAddress(env));
  if (!url) return true;
  return !(url.protocol === 'http:' && !isLoopback(url.hostname));
}

/** True when the configured address is plain http on another machine. */
export function servedOverPlainHttp(env: Env = process.env): boolean {
  const url = parse(publicAddress(env));
  return !!url && url.protocol === 'http:' && !isLoopback(url.hostname);
}

/**
 * Express "trust proxy" value from TRUST_PROXY.
 *
 * Unset means 1: the proxy shipped with Helios sits in front of the backend,
 * so the visitor's address is one hop back. Each further proxy or tunnel in
 * front of that adds one. `false` trusts nothing; anything else is passed to
 * Express as written (an address or subnet list).
 */
export function trustProxySetting(env: Env = process.env): number | boolean | string {
  const raw = env['TRUST_PROXY']?.trim();
  if (!raw) return 1;
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  if (raw.toLowerCase() === 'false') return false;
  if (raw.toLowerCase() === 'true') return 1; // never trust every hop
  return raw;
}

/** Passkey relying-party id: the host name people sign in at. */
export function passkeyRpId(env: Env = process.env): string {
  const explicit = env['PASSKEY_RP_ID']?.trim();
  if (explicit) return explicit;
  return parse(publicAddress(env))?.hostname || 'localhost';
}

/** Passkey origin: scheme, host and port people sign in at. */
export function passkeyOrigin(env: Env = process.env): string {
  const explicit = env['PASSKEY_ORIGIN']?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  return parse(publicAddress(env))?.origin || 'http://localhost:3000';
}
