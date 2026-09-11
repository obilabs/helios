/**
 * The rate-limit budget is stated in three places: the code default, the
 * docker-compose default, and .env.example. They drifted: the code was raised to
 * 2000 after an admin lockout on 2026-09-07, but docker-compose.yml still
 * defaulted to 100, so every compose installation kept the lockout. On
 * 2026-09-11 it tripped again during a UI test and the app showed the sign-in
 * page to a signed-in admin.
 *
 * A fix that only changes one of three copies is not a fix. This test makes the
 * copies agree, and refuses a budget small enough to lock out one admin.
 */
import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const read = (p: string) => readFileSync(join(REPO, p), 'utf8');

/** An admin page load makes 10-15 requests and the budget is shared by the whole org. */
const FLOOR = 1000;

function codeDefault(): number {
  const m = read('backend/src/index.ts').match(/RATE_LIMIT_MAX_REQUESTS'\]\s*\|\|\s*'(\d+)'/);
  if (!m) throw new Error('could not find the RATE_LIMIT_MAX_REQUESTS default in index.ts');
  return Number(m[1]);
}

describe('rate-limit defaults agree and are survivable', () => {
  const code = codeDefault();

  it('docker-compose passes the same default as the code', () => {
    const m = read('docker-compose.yml').match(/RATE_LIMIT_MAX_REQUESTS:\s*\$\{RATE_LIMIT_MAX_REQUESTS:-(\d+)\}/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(code);
  });

  it('.env.example suggests the same value as the code', () => {
    const m = read('.env.example').match(/^RATE_LIMIT_MAX_REQUESTS=(\d+)/m);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(code);
  });

  it('the default is large enough for an organization sharing one proxy address', () => {
    expect(code).toBeGreaterThanOrEqual(FLOOR);
  });
});
