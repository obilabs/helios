import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../utils/response.js';
import { ErrorCode } from '../types/error-codes.js';

/**
 * CSRF protection for cookie-authenticated requests (double-submit token).
 *
 * The browser app authenticates with a session cookie, which the browser
 * attaches automatically. For state-changing requests that rely on that cookie,
 * the client must also echo a token in a header:
 *
 *   1. Every response to a request without the `helios_csrf` cookie sets one
 *      (random, readable by the page's own JavaScript, SameSite=Strict).
 *   2. POST / PUT / PATCH / DELETE carrying a session cookie must send
 *      `X-CSRF-Token` equal to that cookie. Another site can neither read the
 *      cookie nor add a custom header without passing CORS, so it cannot forge
 *      the pair.
 *
 * Not checked:
 *   - GET / HEAD / OPTIONS (must not change state);
 *   - requests without a session cookie (nothing ambient to ride on — setup
 *     wizard, sign-in, integrations);
 *   - requests carrying `Authorization` or `X-API-Key` (explicit credentials a
 *     browser never adds on its own);
 *   - machine routes (MTP pairing, training contract API), which authenticate
 *     with a bearer or API key only.
 *
 * The frontend adds the header for every same-origin state-changing fetch
 * (frontend/src/lib/csrf.ts).
 */

export const CSRF_COOKIE = 'helios_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

/** better-auth session cookies (cookiePrefix 'helios'; `__Secure-` in production). */
const SESSION_COOKIES = ['helios.session_token', '__Secure-helios.session_token'];

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Machine-to-machine routers: bearer / API-key authentication only. */
const MACHINE_ROUTE_PREFIXES = ['/api/v1/mtp/', '/api/mtp/', '/api/v1/training/v1/', '/api/training/v1/'];

function isMachineRoute(path: string): boolean {
  return MACHINE_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix) || `${path}/` === prefix);
}

function hasSessionCookie(req: Request): boolean {
  const cookies = req.cookies ?? {};
  return SESSION_COOKIES.some((name) => typeof cookies[name] === 'string' && cookies[name] !== '');
}

function hasExplicitCredentials(req: Request): boolean {
  return Boolean(req.headers.authorization || req.headers['x-api-key']);
}

/** Constant-time comparison of the cookie token and the header token. */
export function verifyCsrfToken(cookieToken: unknown, headerToken: unknown): boolean {
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
  if (cookieToken.length < 32 || cookieToken.length !== headerToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Requires cookie-parser to have run (index.ts mounts this right after it).
  const cookieToken = req.cookies.helios_csrf;

  if (typeof cookieToken !== 'string' || cookieToken.length < 32) {
    res.cookie(CSRF_COOKIE, crypto.randomBytes(32).toString('hex'), {
      httpOnly: false, // the page must read it to echo it back
      sameSite: 'strict',
      secure: process.env['NODE_ENV'] === 'production',
      path: '/',
    });
  }

  if (
    SAFE_METHODS.has(req.method) ||
    !hasSessionCookie(req) ||
    hasExplicitCredentials(req) ||
    isMachineRoute(req.path)
  ) {
    return next();
  }

  if (!verifyCsrfToken(cookieToken, req.get(CSRF_HEADER))) {
    return errorResponse(
      res,
      ErrorCode.FORBIDDEN,
      'Missing or invalid CSRF token. Reload the page and try again.'
    );
  }

  next();
}
