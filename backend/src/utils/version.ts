/**
 * Helios backend version, resolved robustly under ESM.
 *
 * The old inline `require('../../package.json')` throws under `"type":"module"`
 * (`require` is not defined in an ES module), so the catch swallowed it and every
 * deploy reported `0.0.0`. `createRequire(import.meta.url)` works under both tsx
 * (dev, from src/) and the compiled output (prod, from dist/) — in both, `../../`
 * lands at the app root where package.json sits next to dist/.
 *
 * `HELIOS_VERSION` overrides everything, for deploys that want to report the
 * Docker image tag instead of the package.json semver.
 */
import { createRequire } from 'module';

let cached: string | null = null;

export function getHeliosVersion(): string {
  if (cached) return cached;

  if (process.env.HELIOS_VERSION) {
    cached = process.env.HELIOS_VERSION;
    return cached;
  }

  try {
    const require = createRequire(import.meta.url);
    const pkg = require('../../package.json') as { version?: string };
    cached = pkg.version || '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached;
}
