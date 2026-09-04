/**
 * Guards the recorded Microsoft 365 Graph WRITE fixtures.
 *
 * These were captured against the LIVE tmscanada tenant on 2026-09-03 (after the
 * app was granted User.ReadWrite.All + Group.ReadWrite.All admin consent), so the
 * write-back paths stay testable after the paid license is cancelled and the
 * tenant is gone. This suite asserts each fixture: (1) exists, (2) recorded the
 * expected method + a 2xx status, and (3) is leak-free — every GUID anywhere in
 * the fixture is a sanitizer alias (00000000-0000-0000-0000-…), never a real
 * tenant/object id. A redaction regression or an accidental fixture deletion
 * therefore fails CI rather than silently shipping.
 */
import { describe, it, expect } from '@jest/globals';
import { loadGraphFixture } from '../testing/graph-replay.js';

const WRITE_FIXTURES: Array<{ family: string; name: string; method: string; okStatuses: number[] }> = [
  { family: 'users', name: 'users.patch', method: 'PATCH', okStatuses: [200, 204] },
  { family: 'users', name: 'manager.$ref.put', method: 'PUT', okStatuses: [204] },
  { family: 'users', name: 'manager.$ref.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'groups', name: 'groups.post', method: 'POST', okStatuses: [201] },
  { family: 'groups', name: 'groups.patch', method: 'PATCH', okStatuses: [200, 204] },
  { family: 'groups', name: 'groups.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'groups', name: 'members.$ref.post', method: 'POST', okStatuses: [204] },
  { family: 'groups', name: 'members.$ref.delete', method: 'DELETE', okStatuses: [204] },
];

// Any GUID in a sanitized fixture must be an alias, which the Graph GUID-aliaser
// emits with an all-zero prefix. A real Entra id (e.g. 028e201e-6691-…) is not.
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ALIAS_PREFIX = /^00000000-0000-0000-0000-/i;

describe('M365 Graph write fixtures (recorded live, leak-free)', () => {
  for (const f of WRITE_FIXTURES) {
    it(`${f.family}/${f.name} — recorded ${f.method}, 2xx, no real identifiers`, () => {
      const fx = loadGraphFixture(f.family, f.name);
      expect(fx.request.method).toBe(f.method);
      expect(f.okStatuses).toContain(fx.response.status);

      const serialized = JSON.stringify(fx);
      const leakedGuids = (serialized.match(GUID) || []).filter((g) => !ALIAS_PREFIX.test(g));
      expect(leakedGuids).toEqual([]);
      expect(serialized).not.toMatch(/tmscanada|onmicrosoft\.com/i);
    });
  }
});
