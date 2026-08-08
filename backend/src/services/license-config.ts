/**
 * Licence client configuration helpers — kept dependency-light (no DB, no winston)
 * so they are trivially unit-testable in isolation.
 */

/**
 * Control-plane base URL. Prefer HELIOS_LICENSE_BASE_URL (a bare origin — the
 * @obilabs/licensing client appends /api/instances/validate). Gracefully accept
 * the deprecated HELIOS_LICENSE_URL (a full endpoint) by stripping the path +
 * warning, so old .env files keep working. Same graceful-derive posture as
 * Aegis's deriveValidateUrl().
 */
export function deriveBaseUrl(): string {
  const base = process.env.HELIOS_LICENSE_BASE_URL;
  if (base) return base.replace(/\/$/, '');

  const legacy = process.env.HELIOS_LICENSE_URL;
  if (legacy) {
    // eslint-disable-next-line no-console
    console.warn(
      '[License] HELIOS_LICENSE_URL is deprecated — set HELIOS_LICENSE_BASE_URL ' +
        '(a base origin with no path). Deriving the base from it for now.',
    );
    return legacy.replace(/\/api\/instances\/validate\/?$/, '').replace(/\/$/, '');
  }
  return 'https://api.obilabs.dev';
}
