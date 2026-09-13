/**
 * CSRF double-submit token for the browser app (backend: middleware/csrf.ts).
 *
 * The backend sets a readable `helios_csrf` cookie. State-changing requests that
 * ride the session cookie must echo it in `X-CSRF-Token`. Rather than touching
 * every call site, `installCsrfFetch()` wraps `window.fetch` once at startup and
 * adds the header to same-origin (or configured API origin) POST/PUT/PATCH/DELETE
 * requests. Axios instances use `CSRF_COOKIE` / `CSRF_HEADER` via their own
 * xsrf options.
 */

export const CSRF_COOKIE = 'helios_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Read a cookie value from a `document.cookie`-style string. */
export function readCookie(cookieString: string, name: string): string | null {
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

interface CsrfContext {
  cookie: string;
  /** window.location.origin */
  origin: string;
  /** Extra origins the app sends credentials to (API_BASE_URL when set). */
  apiOrigins?: string[];
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input === 'object' && !(input instanceof URL) && input.method) return input.method.toUpperCase();
  return 'GET';
}

/**
 * Returns `init` with the CSRF header added when the request needs it, or the
 * original `init` unchanged.
 */
export function withCsrfHeader(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ctx: CsrfContext
): RequestInit | undefined {
  if (SAFE_METHODS.has(requestMethod(input, init))) return init;

  let target: URL;
  try {
    target = new URL(requestUrl(input), ctx.origin);
  } catch {
    return init;
  }
  const allowed = [ctx.origin, ...(ctx.apiOrigins ?? [])];
  if (!allowed.includes(target.origin)) return init;

  const token = readCookie(ctx.cookie, CSRF_COOKIE);
  if (!token) return init;

  const headers = new Headers(
    init?.headers ?? (typeof input === 'object' && !(input instanceof URL) ? input.headers : undefined)
  );
  if (headers.has(CSRF_HEADER)) return init;
  headers.set(CSRF_HEADER, token);
  return { ...init, headers };
}

/** Wrap window.fetch once so every state-changing API call carries the token. */
export function installCsrfFetch(apiBaseUrl: string): void {
  if (typeof window === 'undefined' || (window.fetch as { csrf?: boolean }).csrf) return;
  const original = window.fetch.bind(window);
  const apiOrigins: string[] = [];
  if (apiBaseUrl) {
    try {
      apiOrigins.push(new URL(apiBaseUrl).origin);
    } catch {
      /* relative base: same origin */
    }
  }
  const wrapped = (input: RequestInfo | URL, init?: RequestInit) =>
    original(input, withCsrfHeader(input, init, { cookie: document.cookie, origin: window.location.origin, apiOrigins }));
  (wrapped as { csrf?: boolean }).csrf = true;
  window.fetch = wrapped as typeof window.fetch;
}
