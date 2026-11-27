/**
 * A setting documented in .env.example that the backend reads must be passed to
 * the backend container by docker-compose.yml.
 *
 * The compose file names each variable it hands to the backend. A setting that
 * is documented and read by the code but missing from that list can be edited
 * in .env forever with no effect and no error: the address settings (fixed
 * 2026-11-26), outgoing mail, and the usage-reporting switch and licence key
 * (fixed 2026-11-27) were all like that.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

/**
 * Documented settings that are deliberately NOT passed, each with the reason.
 * Adding a name here is a decision; say why.
 */
const NOT_PASSED_ON_PURPOSE: Record<string, string> = {
  NODE_ENV: 'fixed by the compose file you start (production or development)',
  PORT: 'fixed inside the container; the proxy publishes the port',
  DB_HOST: 'fixed to the database container',
  DB_PORT: 'fixed to the database container',
  REDIS_HOST: 'fixed to the Redis container',
  REDIS_PORT: 'fixed to the Redis container',
  S3_ENDPOINT: 'fixed to the bundled file store',
  S3_USE_SSL: 'fixed for the bundled file store',
  S3_PUBLIC_URL: 'not used: the backend serves stored files itself',
  RATE_LIMIT_ENABLED: 'always on in the production compose file',
  LOG_FILE: 'a path inside the container',
  NPM_TOKEN: 'build-time only',
  HTTP_PORT: 'read by the proxy service, not the backend',
  HTTPS_PORT: 'read by the proxy service, not the backend',
  NGINX_CONFIG: 'read by the proxy service, not the backend',
  HELIOS_VERSION: 'selects the image tag',
  VITE_DEFAULT_THEME: 'a frontend build setting',
  INITIAL_PASSWORD_KEY: 'optional; falls back to ENCRYPTION_KEY. Not yet passed: an empty value must first be shown to mean unset',
};

function documentedSettings(): string[] {
  const names = new Set<string>();
  for (const line of read('.env.example').split('\n')) {
    const m = line.match(/^#?\s?([A-Z][A-Z0-9_]+)=/);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

function backendEnvironment(): Set<string> {
  const compose = read('docker-compose.yml');
  const start = compose.indexOf('container_name: helios_backend');
  const end = compose.indexOf('container_name: helios_frontend');
  if (start < 0 || end < 0) throw new Error('could not find the backend service in docker-compose.yml');
  const names = new Set<string>();
  for (const line of compose.slice(start, end).split('\n')) {
    const m = line.match(/^ {6}([A-Z][A-Z0-9_]+):/);
    if (m) names.add(m[1]);
  }
  return names;
}

function backendSource(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === '__tests__' || name === 'node_modules') continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.ts')) out.push(readFileSync(full, 'utf8'));
    }
  };
  walk(join(REPO, 'backend', 'src'));
  return out.join('\n');
}

describe('documented settings reach the backend', () => {
  const passed = backendEnvironment();
  const source = backendSource();
  const readByCode = (name: string) => new RegExp(`\\b${name}\\b`).test(source);

  it('finds the backend service and a sensible number of settings', () => {
    expect(passed.size).toBeGreaterThan(30);
    expect(documentedSettings().length).toBeGreaterThan(40);
  });

  it('passes every documented setting the backend reads, or says why not', () => {
    const missing = documentedSettings().filter(
      (name) => readByCode(name) && !passed.has(name) && !(name in NOT_PASSED_ON_PURPOSE)
    );
    expect(missing).toEqual([]);
  });

  it('passes the usage-reporting switch and the licence key', () => {
    for (const name of ['HELIOS_TELEMETRY_ENABLED', 'HELIOS_TELEMETRY_URL', 'HELIOS_LICENSE_KEY', 'HELIOS_LICENSE_BASE_URL']) {
      expect(passed.has(name)).toBe(true);
    }
  });

  it('keeps usage reporting off unless it is switched on', () => {
    expect(read('docker-compose.yml')).toMatch(/HELIOS_TELEMETRY_ENABLED: \$\{HELIOS_TELEMETRY_ENABLED:-false\}/);
    expect(read('.env.example')).toMatch(/^HELIOS_TELEMETRY_ENABLED=false$/m);
  });
});
