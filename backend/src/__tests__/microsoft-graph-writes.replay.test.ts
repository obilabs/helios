/**
 * Guards the recorded Microsoft 365 Graph WRITE fixtures.
 *
 * Captured against the LIVE tenant in two runs — the record script on 2026-09-03
 * (patch / manager / group CRUD / members) and a UI-driven run on 2026-09-07
 * (create user, usage location, license assign/remove, open extension, disable,
 * delete, plus two Graph REJECTIONS worth keeping: creating a user on a FEDERATED
 * domain, and assigning a license before the usageLocation patch replicated) —
 * so the write-back paths stay testable after the paid license is cancelled and
 * the tenant is gone. This suite asserts each fixture: (1) exists, (2) recorded
 * the expected method + expected status, and (3) is leak-free — every GUID anywhere in
 * the fixture is a sanitizer alias (00000000-0000-0000-0000-…), never a real
 * tenant/object id. A redaction regression or an accidental fixture deletion
 * therefore fails CI rather than silently shipping.
 */
import { describe, it, expect } from '@jest/globals';
import { loadGraphFixture } from '../testing/graph-replay.js';

const WRITE_FIXTURES: Array<{ family: string; name: string; method: string; okStatuses: number[] }> = [
  // --- 2026-09-03 record script ---
  { family: 'users', name: 'users.patch', method: 'PATCH', okStatuses: [200, 204] },
  { family: 'users', name: 'manager.$ref.put', method: 'PUT', okStatuses: [204] },
  { family: 'users', name: 'manager.$ref.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'groups', name: 'groups.post', method: 'POST', okStatuses: [201] },
  { family: 'groups', name: 'groups.patch', method: 'PATCH', okStatuses: [200, 204] },
  { family: 'groups', name: 'groups.delete', method: 'DELETE', okStatuses: [204] },
  { family: 'groups', name: 'members.$ref.post', method: 'POST', okStatuses: [204] },
  { family: 'groups', name: 'members.$ref.delete', method: 'DELETE', okStatuses: [204] },
  // --- 2026-09-07 UI-driven run: the user lifecycle end to end ---
  { family: 'users', name: 'users.post', method: 'POST', okStatuses: [201] },
  { family: 'users', name: 'users.patch.usageLocation', method: 'PATCH', okStatuses: [204] },
  { family: 'users', name: 'users.patch.profile', method: 'PATCH', okStatuses: [204] },
  { family: 'users', name: 'assignLicense.add.post', method: 'POST', okStatuses: [200] },
  { family: 'users', name: 'assignLicense.remove.post', method: 'POST', okStatuses: [200] },
  { family: 'users', name: 'extensions.post.create', method: 'POST', okStatuses: [201] },
  { family: 'users', name: 'extensions.post.again', method: 'POST', okStatuses: [201] },
  { family: 'users', name: 'users.patch.disable', method: 'PATCH', okStatuses: [204] },
  { family: 'users', name: 'users.delete', method: 'DELETE', okStatuses: [204] },
  // Graph rejections the code must handle (see PR notes): federated-domain create,
  // and license assignment racing the usageLocation replication.
  { family: 'users', name: 'users.post.federated-400', method: 'POST', okStatuses: [400] },
  { family: 'users', name: 'assignLicense.post.usagelocation-400', method: 'POST', okStatuses: [400] },
];

// Any GUID in a sanitized fixture must be an alias, which the Graph GUID-aliaser
// emits with an all-zero prefix. A real Entra id (e.g. 028e201e-6691-…) is not.
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ALIAS_PREFIX = /^00000000-0000-0000-0000-/i;
// Microsoft's PUBLISHED license SKU ids are the same in every tenant (see the
// "Product names and service plan identifiers for licensing" reference), so they
// identify a product, not a customer. Only these may appear un-aliased.
const PUBLIC_SKU_GUIDS = new Set<string>([
  'f245ecc8-75af-4f8e-b61f-27d8114de5f3', // O365_BUSINESS_PREMIUM (Microsoft 365 Business Standard)
]);

describe('M365 Graph write fixtures (recorded live, leak-free)', () => {
  for (const f of WRITE_FIXTURES) {
    it(`${f.family}/${f.name} — recorded ${f.method}, 2xx, no real identifiers`, () => {
      const fx = loadGraphFixture(f.family, f.name);
      expect(fx.request.method).toBe(f.method);
      expect(f.okStatuses).toContain(fx.response.status);

      const serialized = JSON.stringify(fx);
      const leakedGuids = (serialized.match(GUID) || [])
        .filter((g) => !ALIAS_PREFIX.test(g) && !PUBLIC_SKU_GUIDS.has(g.toLowerCase()));
      expect(leakedGuids).toEqual([]);
      expect(serialized).not.toMatch(/tmscanada|onmicrosoft\.com|gridworx|clockworx/i);
    });
  }

  it('the two rejection fixtures carry the exact Graph messages the code branches on', () => {
    const federated = loadGraphFixture('users', 'users.post.federated-400');
    expect(JSON.stringify(federated.response.data)).toMatch(/SourceAnchor is a required property for creation of a federated user/);
    const usage = loadGraphFixture('users', 'assignLicense.post.usagelocation-400');
    expect(JSON.stringify(usage.response.data)).toMatch(/invalid usage location/i);
  });

  it('the credential in the recorded create request was redacted', () => {
    const fx = loadGraphFixture('users', 'users.post');
    const body = fx.request.body as { passwordProfile?: { password?: string } } | null;
    expect(body?.passwordProfile?.password).toBe('REDACTED');
  });
});
